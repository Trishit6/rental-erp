/**
 * Delivery feature types.
 *
 * Mirrors the server-side schema where possible. The client mirrors server
 * shapes so the UI can render types directly without re-deriving them.
 */

export type DeliveryMethod =
  | "STANDARD"
  | "EXPRESS"
  | "SCHEDULED"
  | "PICKUP"
  | "RENTER_RETURN";

export type DeliveryStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "RETURN_TO_SENDER"
  | "CANCELLED";

export type DeliveryAddress = {
  id: number;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type DeliveryMethodInfo = {
  key: DeliveryMethod;
  label: string;
  description: string | null;
  baseFeePaise: number;
  estimatedHandlingDays: number;
  isAvailable: (address: DeliveryAddress, productSellerId: number) => boolean | Promise<boolean>;
};

export type DeliveryEstimate = {
  /** ISO date string for the start of the delivery window. */
  estimatedDeliveryStart: string | null;
  /** ISO date string for the end of the delivery window. */
  estimatedDeliveryEnd: string | null;
  /** ISO date string for a scheduled date, if applicable. */
  scheduledDate: string | null;
  /** The delivery slot, if scheduling is active. */
  scheduledSlot: string | null;
};

export type DeliveryEvent = {
  id: number;
  deliveryId: number;
  status: DeliveryStatus;
  description: string;
  location: string | null;
  eventTime: string;
  createdBy: "SYSTEM" | "SELLER" | "CUSTOMER" | "ADMIN";
};

export type DeliveryRecord = {
  id: number;
  deliveryNumber: string;
  orderId: number;
  sellerId: number;
  customerId: number;
  addressId: number;
  deliveryMethod: DeliveryMethod;
  deliveryStatus: DeliveryStatus;
  deliveryFeePaise: number;
  currency: string;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  scheduledDate: string | null;
  scheduledSlot: string | null;
  trackingNumber: string | null;
  carrierName: string | null;
  dispatchAt: string | null;
  deliveredAt: string | null;
  deliveryInstructions: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDeliveryInput = {
  deliveryMethod: DeliveryMethod;
  addressId: number;
  deliveryInstructions?: string | null;
};

export type SelectDeliveryMethodInput = {
  deliveryMethod: DeliveryMethod;
  addressId: number;
};

export type DeliveryPriceQuote = {
  deliveryFeePaise: number;
  currency: string;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  message?: string | null;
};

export type SellerDeliveryCapability = {
  sellerId: number;
  allowsDelivery: boolean;
  allowsPickup: boolean;
  deliveryMethod: DeliveryMethod | null;
};