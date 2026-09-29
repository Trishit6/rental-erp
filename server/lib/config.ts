/** Server-side platform configuration. Never exposed to the browser. */

export const PLATFORM_SALE_FEE_PERCENT = Number(process.env.PLATFORM_SALE_FEE_PERCENT ?? 5);

export const PLATFORM_RENTAL_FEE_PERCENT = Number(process.env.PLATFORM_RENTAL_FEE_PERCENT ?? 10);

export const DELIVERY_FEE_PAISE = 4900;

export const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? "mock";
