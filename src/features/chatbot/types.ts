export type ChatRole = "user" | "assistant";

/** What actually crosses the wire (no client-side ids). */
export type ChatTurn = {
  role: ChatRole;
  content: string;
};

/** A single turn held in the widget's local conversation state. */
export type ChatMessage = ChatTurn & {
  id: string;
};

/** Compact listing summary the assistant can attach to a reply. */
export type ChatProduct = {
  id: number;
  slug: string;
  title: string;
  location: string;
  categoryName: string;
  listingType: string;
  condition: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  primaryImage: string | null;
  ratingAverage: number;
  ratingCount: number;
};

export type ChatSource = "ai" | "assistant";

export type ChatReply = {
  reply: string;
  source: ChatSource;
  products: ChatProduct[];
  suggestions: string[];
};
