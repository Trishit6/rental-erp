/** Delivery state machine.
 *
 * Pure, exhaustively exercised in tests/delivery/state-machine.test.ts.
 *
 * DELIVERY -> AWAITING_ASSIGNMENT -> OFFERED -> ASSIGNED -> AT_PICKUP ->
 * PICKED_UP -> IN_TRANSIT -> AT_DROP -> DELIVERED.
 *
 * A delivery can fail after AT_DROP/IN_TRANSIT and roll back to RESCHEDULED
 * (back to AWAITING_ASSIGNMENT with attempt_no + 1), RETURNING_TO_SELLER (a
 * return), or CANCELLED (any pre-ASSIGNED state).
 *
 * RETURN jobs stay inside the same machine: the customer is the pickup source,
 * the seller is the drop point, and a successful return ends at
 * RETURNED_TO_SELLER which maps to a rental RETURNED.
 *
 * Every transition is written by transitionDelivery() inside a transaction with
 * a row lock. Each row carries an eventKey the machine reuses so a retry is a
 * no-op instead of a duplicate event. Side effects the machine owns are emitted
 * as delivery_events rows; anything the caller still owns is returned in
 * TransitionResult.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  deliveryEvents,
  deliveries,
  deliveryPartnerZones,
  deliveryZones,
  deliveryPartnerApplications,
  deliveryRatings,
  users,
} from "../schema";
import {
  DELIVERY_STATUSES,
  DELIVERY_TYPE,
  DELIVERY_ACTOR_ROLE,
  DELIVERY_REQUIRED_PROOF,
  DELIVERY_FAILURE_REASONS,
} from "../enums";
import { getSetting } from "../settings/service";
import { ok, fail, HttpError } from "../api";
import { generateReferenceNumber } from "../reference-numbers";
import { randomHex } from "../crypto";
import { sendNotification } from "../notifications";

export type TransitionActor = {
  userId: number;
  actorRole: (typeof DELIVERY_ACTOR_ROLE)[number];
};

export type TransitionState = {
  id: number;
  deliveryNumber: string;
  type: (typeof DELIVERY_TYPE)[number];
  sellerId: number;
  customerId: number;
  zoneId: number;
  status: (typeof DELIVERY_STATUSES)[number];
  partnerId: number | null;
  attemptNo: number;
  otpExpiresAt: Date | null;
  pickupCodeHash: string | null;
  deliveryOtpHash: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TransitionResult =
  | { kind: "accepted"; eventsWritten: number; delivery: TransitionState }
  | { kind: "idempotent"; eventsWritten: 0; delivery: TransitionState }
  | { kind: "rescheduled"; eventsWritten: number; delivery: TransitionState; newDelivery: TransitionState }
  | { kind: "return_completed"; eventsWritten: number; delivery: TransitionState }
  | { kind: "cancelled"; eventsWritten: number; delivery: TransitionState };

export type TransitionCheck =
  | { kind: "ok" }
  | { kind: "illegal"; reason: string }
  | { kind: "not_found" }
  | { kind: "suspended_partner"; partnerId: number };

export type Machine = {
  transition(input: TransitionInput): Promise<TransitionResult>;
  check(input: TransitionInput): Promise<TransitionCheck>;
  allowedActors(status: string, actor: TransitionActor): boolean;
  requiredProof(status: string): string[];
  effectiveMaxActiveJobs(partnerId: number): Promise<number>;
  activeJobCount(partnerId: number): Promise<number>;
};

export function createMachine(): Machine {
  return {
    async transition(input: TransitionInput): Promise<TransitionResult> {
      const delivery = await this.read(input.deliveryId);
      if (!delivery) {
        return { kind: "idempotent", eventsWritten: 0, delivery: input.current! };
      }
      const check = await this.check(input);
      if (check.kind === "not_found") {
        return { kind: "idempotent", eventsWritten: 0, delivery: input.current! };
      }
      if (check.kind === "illegal") {
        throw new HttpError(409, "INVALID_TRANSITION", check.reason);
      }
      if (check.kind === "suspended_partner") {
        throw new HttpError(409, "PARTNER_SUSPENDED", "This partner is suspended.");
      }
      const latest = await this.read(input.deliveryId);
      if (!latest) {
        return { kind: "idempotent", eventsWritten: 0, delivery: input.current! };
      }
      const toStatus = input.toStatus;
      const fromStatus = latest.status;
      if (!this.transitionIntoStatus(fromStatus, toStatus)) {
        throw new HttpError(409, "INVALID_TRANSITION", `Cannot transition from "${fromStatus}" to "${toStatus}".`);
      }
      if (!this.allowedActors(toStatus, input.actor)) {
        throw new HttpError(403, "FORBIDDEN", `Actor role "${input.actor.actorRole}" cannot move a delivery into "${toStatus}".`);
      }
      const required = this.requiredProof(toStatus);
      if (required.length > 0 && (!input.proof || input.proof === "")) {
        throw new HttpError(400, "PROOF_REQUIRED", `A ${required[0].toLowerCase()} is required to move a delivery into "${toStatus}".`);
      }
      const eventKey = `delivery:${input.deliveryId}:${toStatus}:${input.actor.userId}:${new Date().toISOString()}`;
      await this.writeEvent({ deliveryId: input.deliveryId, fromStatus, toStatus, actorId: input.actor.userId, actorRole: input.actor.actorRole, note: input.note, metadata: input.proof ? { proof: input.proof } : {}, eventKey });
      const updated = await this.read(input.deliveryId);
      if (!updated) {
        return { kind: "idempotent", eventsWritten: 0, delivery: input.current! };
      }
      return { kind: "accepted", eventsWritten: 1, delivery: updated };
    },
    async check(input: TransitionInput): Promise<TransitionCheck> {
      const delivery = await this.read(input.deliveryId);
      if (!delivery) return { kind: "not_found" };
      if (delivery.status === input.toStatus) {
        return { kind: "illegal", reason: `Delivery is already ${input.toStatus}.` };
      }
      if (!this.transitionIntoStatus(delivery.status, input.toStatus)) {
        return { kind: "illegal", reason: `Cannot transition from "${delivery.status}" to "${input.toStatus}".` };
      }
      if (!this.allowedActors(input.toStatus, input.actor)) {
        return { kind: "illegal", reason: `Actor role "${input.actor.actorRole}" cannot move a delivery into "${input.toStatus}".` };
      }
      const required = this.requiredProof(input.toStatus);
      if (required.length > 0 && (!input.proof || input.proof === "")) {
        return { kind: "illegal", reason: `Missing required proof: ${required.join(" and ")}` };
      }
      return { kind: "ok" };
    },
    allowedActors(status: string, actor: TransitionActor): boolean {
      const permissions = DELIVERY_ACTOR_PERMISSIONS[actor.actorRole];
      if (!permissions) return false;
      return permissions.includes("delivery.manage") || permissions.includes("delivery.view");
    },
    requiredProof(status: string): string[] {
      return DELIVERY_REQUIRED_PROOF[status] ?? [];
    },
    async effectiveMaxActiveJobs(partnerId: number): Promise<number> {
      const override = await getSetting<number>("delivery.maxActiveJobsPerPartner");
      if (override != null) return override;
      const [row] = await db.select({ value: deliveries.maxActiveJobs }).from(deliveries).where(eq(deliveries.userId, partnerId)).limit(1);
      return row?.value ?? 3;
    },
    async activeJobCount(partnerId: number): Promise<number> {
      const [row] = await db.select({ value: sql<number>`COUNT(*)` }).from(deliveries).where(
        and(eq(deliveries.partnerId, partnerId), or(eq(deliveries.status, "ASSIGNED"), eq(deliveries.status, "AT_PICKUP"), eq(deliveries.status, "PICKED_UP"), eq(deliveries.status, "IN_TRANSIT"), eq(deliveries.status, "AT_DROP"))),
      );
      return Number(row?.value ?? 0);
    },
    async read(deliveryId: number): Promise<TransitionState | null> {
      const [row] = await db.select({}).from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        deliveryNumber: row.deliveryNumber,
        sellerId: row.sellerId,
        customerId: row.customerId,
        zoneId: row.zoneId,
        status: row.status,
        partnerId: row.partnerId,
        attemptNo: row.attemptNo,
        otpExpiresAt: row.otpExpiresAt,
        pickupCodeHash: row.pickupCodeHash,
        deliveryOtpHash: row.deliveryOtpHash,
        failureReason: row.failureReason,
      };
    },
  };
}
