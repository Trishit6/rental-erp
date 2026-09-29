import type { Address } from "../query";
import { Card } from "@/components/ui/card";

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
}: {
  addresses?: Address[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-heading text-lg font-extrabold">Delivery address</h2>
      {addresses?.length ? (
        <div className="space-y-2">
          {addresses.map((address) => (
            <label
              key={address.id}
              className={`inset-surface flex cursor-pointer items-start gap-3 rounded-2xl p-3 text-sm ${
                selectedId === address.id ? "ring-2 ring-primary" : ""
              }`}
            >
              <input
                type="radio"
                name="address"
                className="mt-1"
                checked={selectedId === address.id}
                onChange={() => onSelect(address.id)}
              />
              <span>
                <span className="block font-bold">
                  {address.name} · {address.phone}
                </span>
                <span className="block text-muted-foreground">
                  {address.addressLine1}, {address.city}, {address.state} {address.postalCode}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No addresses yet. Add one in your profile after placing an order — or choose pickup.
        </p>
      )}
    </Card>
  );
}
