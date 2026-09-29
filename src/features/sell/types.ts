export type ListingMode = "SALE" | "RENT" | "BOTH";

export type SellForm = {
  title: string;
  description: string;
  categoryId: number | null;
  brand: string;
  condition: string;
  listingType: ListingMode;
  location: string;
  purchasePrice: string;
  rentalPricePerDay: string;
  rentalPricePerWeek: string;
  rentalPricePerMonth: string;
  securityDeposit: string;
  quantity: string;
  images: string[];
  tags: string;
};

export const initialSellForm: SellForm = {
  title: "",
  description: "",
  categoryId: null,
  brand: "",
  condition: "GOOD",
  listingType: "BOTH",
  location: "",
  purchasePrice: "",
  rentalPricePerDay: "",
  rentalPricePerWeek: "",
  rentalPricePerMonth: "",
  securityDeposit: "",
  quantity: "1",
  images: [],
  tags: "",
};

export const sellSteps = ["Photos", "Details", "Mode", "Pricing", "Location", "Preview"];
