import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAddresses, useAddressMutations, type Address } from "../query";

const emptyAddress = {
  name: "",
  phone: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
};

export function AddressSection() {
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [address, setAddress] = useState(emptyAddress);
  const { data: addresses } = useAddresses();
  const { addAddress, removeAddress } = useAddressMutations();

  async function handleAddAddress() {
    try {
      await addAddress({
        ...address,
        country: "India",
        isDefault: (addresses?.length ?? 0) === 0,
      });
      setAddress(emptyAddress);
      setShowAddressForm(false);
      toast("Address added");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save address.");
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-extrabold">Addresses</h2>
        <Button size="sm" variant="secondary" onClick={() => setShowAddressForm((open) => !open)}>
          <Plus size={14} /> Add address
        </Button>
      </div>

      {showAddressForm && (
        <div className="inset-surface grid gap-3 rounded-2xl p-4 sm:grid-cols-2">
          {(
            [
              ["name", "Full name"],
              ["phone", "Phone"],
              ["addressLine1", "Address line 1"],
              ["city", "City"],
              ["state", "State"],
              ["postalCode", "Postal code"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="space-y-1.5">
              <span className="text-xs font-bold">{label}</span>
              <Input
                value={address[field]}
                onChange={(e) => setAddress({ ...address, [field]: e.target.value })}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <Button size="sm" onClick={handleAddAddress}>
              Save address
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(addresses ?? []).map((addressItem: Address) => (
          <div
            key={addressItem.id}
            className="inset-surface flex items-start justify-between gap-3 rounded-2xl p-3 text-sm"
          >
            <div>
              <p className="font-bold">
                {addressItem.name} · {addressItem.phone}
                {addressItem.isDefault && (
                  <span className="ml-2 text-xs font-bold text-accent">Default</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {addressItem.addressLine1}, {addressItem.city}, {addressItem.state}{" "}
                {addressItem.postalCode}
              </p>
            </div>
            <button
              type="button"
              aria-label="Remove address"
              onClick={() => void removeAddress(addressItem.id)}
            >
              <Trash2 size={15} className="text-destructive" />
            </button>
          </div>
        ))}
        {!addresses?.length && !showAddressForm && (
          <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
        )}
      </div>
    </Card>
  );
}
