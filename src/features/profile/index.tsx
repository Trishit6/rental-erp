import { useState } from "react";
import { User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MyReviewsSection } from "@/features/reviews";
import { AddressSection } from "./components/AddressSection";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  async function saveProfile() {
    try {
      await api.patch("/users/me", { name, phone });
      await refresh();
      toast("Profile updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update profile.");
    }
  }

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-10 pt-8">
      <h1 className="section-title text-3xl">Profile</h1>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <span className="inset-surface flex size-16 items-center justify-center rounded-full font-heading text-xl font-black text-primary">
            {user?.name.charAt(0) ?? <User size={24} />}
          </span>
          <div>
            <p className="font-heading text-lg font-extrabold">{user?.name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <p className="text-xs font-semibold text-accent">{user?.role}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Phone</span>
            <Input
              value={phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <Button onClick={saveProfile}>Save changes</Button>
      </Card>

      <AddressSection />

      {/* Reviews live here rather than on their own route because a customer's
          own words are part of their account, not a destination — it is the
          profile's history, alongside the addresses they saved. */}
      <MyReviewsSection />
    </div>
  );
}
