import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, Calendar, Package, ShoppingBag } from "lucide-react";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Earnings = {
  saleEarnings: number;
  rentalEarnings: number;
  pendingOrderCount: number;
};

type RentalRow = { id: number; status: string };

export function DashboardPage() {
  const { user } = useAuth();

  const { data: earnings } = useQuery({
    queryKey: queryKeys.earnings,
    queryFn: async () => (await api.get<Earnings>("/seller/earnings")).data,
  });

  const { data: rentals } = useQuery({
    queryKey: queryKeys.rentals,
    // `role=all` explicitly: the endpoint now defaults to the *renter's* rentals
    // (the customer "My Rentals" view). A seller's dashboard needs both sides of
    // the table — the ones they rented and the ones of their own listings.
    queryFn: async () => (await api.get<RentalRow[]>("/rentals?role=all")).data,
  });

  const activeRentals = (rentals ?? []).filter(
    (rental) => rental.status === "ACTIVE" || rental.status === "CONFIRMED",
  ).length;

  return (
    <div className="page-wrap space-y-7 pb-10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your neighbourhood business</p>
          <h1 className="section-title mt-1 text-3xl">
            Hi {user?.name.split(" ")[0] ?? "there"} 👋
          </h1>
        </div>
        <Button asChild>
          <Link to="/list">
            List a new item <ArrowRight size={15} />
          </Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2">
        {[
          { to: "/dashboard", label: "Overview" },
          { to: "/dashboard/products", label: "Products" },
          { to: "/dashboard/orders", label: "Orders" },
          { to: "/dashboard/rentals", label: "Rentals" },
          { to: "/dashboard/earnings", label: "Earnings" },
          { to: "/dashboard/messages", label: "Messages" },
        ].map((tab) => (
          <Button
            key={tab.to}
            asChild
            size="sm"
            variant={location.pathname === tab.to ? "default" : "secondary"}
          >
            <Link to={tab.to}>{tab.label}</Link>
          </Button>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Banknote}
          label="Sale earnings"
          value={formatInr(earnings?.saleEarnings ?? 0)}
        />
        <StatCard
          icon={Calendar}
          label="Rental earnings"
          value={formatInr(earnings?.rentalEarnings ?? 0)}
        />
        <StatCard icon={Package} label="Active rentals" value={String(activeRentals)} />
        <StatCard
          icon={ShoppingBag}
          label="Pending orders"
          value={String(earnings?.pendingOrderCount ?? 0)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-heading text-lg font-extrabold">Grow your listings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every item you share earns on rentals and sales — and keeps good things in circulation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/list">List an item</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/dashboard/products">Manage products</Link>
            </Button>
          </div>
        </Card>
        <Card className="dark-panel p-6 text-primary-foreground">
          <p className="eyebrow text-primary-foreground/60">Tip</p>
          <h2 className="mt-2 font-heading text-lg font-extrabold">Clear photos rent 3× faster</h2>
          <p className="mt-1 text-sm text-primary-foreground/75">
            Natural light, honest angles, and a short description help your neighbours trust the
            listing.
          </p>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
        <Icon size={18} />
      </span>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-black">{value}</p>
    </Card>
  );
}
