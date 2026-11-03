import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { DeliveryEstimate, DeliveryPriceQuote } from "./types";

/**
 * Delivery eligibility check.
 *
 * The server validates address, product, seller and method eligibility
 * and returns whether delivery is available along with a reason if not.
 */
export function useDeliveryEligibility(params: {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP" | "RENTER_RETURN";
  addressId?: number | null;
}) {
  return useQuery({
    queryKey: queryKeys.deliveryEligibility(params),
    queryFn: async () => {
      const result = await api.post<{
        isEligible: boolean;
        reason?: string;
      }>("/api/delivery/eligibility", params);
      return result.data;
    },
    enabled: !!params.addressId && !!params.deliveryMethod,
  });
}

/**
 * Delivery pricing calculation.
 *
 * The server calculates the authoritative delivery fee based on method,
 * address, and product constraints. This is the source of truth —
 * clients must never submit arbitrary delivery fees.
 */
export function useDeliveryPrice(params: {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP" | "RENTER_RETURN";
  addressId?: number | null;
}) {
  return useQuery({
    queryKey: queryKeys.deliveryPrice(params),
    queryFn: async () => {
      const result = await api.post<DeliveryPriceQuote>("/api/delivery/price", params);
      return result.data;
    },
    enabled: !!params.addressId && !!params.deliveryMethod,
  });
}

/**
 * Delivery estimate generation.
 *
 * The server provides an estimated delivery date/window based on
 * method, handling time, and serviceable area.
 */
export function useDeliveryEstimate(params: {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP" | "RENTER_RETURN";
  addressId?: number | null;
}) {
  return useQuery({
    queryKey: queryKeys.deliveryEstimate(params),
    queryFn: async () => {
      const result = await api.post<DeliveryEstimate>("/api/delivery/estimate", params);
      return result.data;
    },
    enabled: !!params.addressId && !!params.deliveryMethod,
  });
}