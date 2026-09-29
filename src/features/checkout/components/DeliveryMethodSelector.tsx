import { Card } from "@/components/ui/card";

export function DeliveryMethodSelector({
  value,
  onChange,
}: {
  value: "DELIVERY" | "PICKUP";
  onChange: (method: "DELIVERY" | "PICKUP") => void;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-heading text-lg font-extrabold">Delivery method</h2>
      <div className="inset-surface flex rounded-full p-1">
        {(["DELIVERY", "PICKUP"] as const).map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => onChange(method)}
            className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-all ${
              value === method ? "primary-button text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {method === "DELIVERY" ? "Deliver to me (₹49)" : "Pickup from seller"}
          </button>
        ))}
      </div>
    </Card>
  );
}
