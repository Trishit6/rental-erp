import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Banknote, Wallet } from "lucide-react";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { formatInr } from "@/lib/pricing";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

type Earnings = {
  saleEarnings: number;
  rentalEarnings: number;
  pendingOrderCount: number;
};

type Transaction = {
  id: number;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
  orderId: number | null;
};

export function DashboardEarningsPage() {
  const { data: earnings } = useQuery({
    queryKey: queryKeys.earnings,
    queryFn: async () => (await api.get<Earnings>("/seller/earnings")).data,
  });

  const { data: transactions } = useQuery({
    queryKey: queryKeys.transactions,
    queryFn: async () => (await api.get<Transaction[]>("/seller/transactions")).data,
  });

  return (
    <div className="page-wrap space-y-7 pb-10 pt-8">
      <h1 className="section-title text-3xl">Earnings</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
            <Banknote size={18} />
          </span>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Sale earnings</p>
          <p className="font-heading text-2xl font-black">
            {formatInr(earnings?.saleEarnings ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
            <Wallet size={18} />
          </span>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Rental earnings</p>
          <p className="font-heading text-2xl font-black">
            {formatInr(earnings?.rentalEarnings ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-muted-foreground">Pending orders</p>
          <p className="font-heading text-2xl font-black">{earnings?.pendingOrderCount ?? 0}</p>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-extrabold">Transactions</h2>
        {!transactions?.length ? (
          <EmptyState
            icon={Banknote}
            title="No transactions yet"
            description="Payments, refunds and payouts will appear here."
          />
        ) : (
          <Card className="overflow-x-auto p-2">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Order</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-3">
                      {format(new Date(transaction.createdAt), "d MMM yyyy")}
                    </td>
                    <td className="px-3 py-3">{transaction.type}</td>
                    <td className="px-3 py-3">
                      {transaction.orderId ? `#${transaction.orderId}` : "—"}
                    </td>
                    <td className="px-3 py-3 font-bold">{formatInr(transaction.amount)}</td>
                    <td className="px-3 py-3">
                      <Badge
                        className={
                          transaction.status === "SUCCEEDED" ? "bg-accent/10 text-accent" : ""
                        }
                      >
                        {transaction.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
