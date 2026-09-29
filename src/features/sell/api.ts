import { api } from "@/lib/api/client";

export type SellPayload = {
  title: string;
  description: string;
  categoryId: number;
  brand?: string;
  condition: string;
  listingType: "SALE" | "RENT" | "BOTH";
  location: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  quantity: number;
  images: string[];
  tags: string[];
};

export async function publishListing(payload: SellPayload): Promise<void> {
  await api.post("/seller/products", payload);
}

export function rupeesStringToPaise(value: string): number | null {
  return value ? Math.round(Number(value) * 100) : null;
}
