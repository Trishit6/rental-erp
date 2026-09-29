import { useState } from "react";
import { Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useAdminStats,
  useAdminUsers,
  useAdminProducts,
  useAdminReports,
  useAdminActions,
} from "./query";

export function AdminPage() {
  const [tab, setTab] = useState<"stats" | "users" | "products" | "reports">("stats");
  const { data: stats } = useAdminStats();
  const { data: users } = useAdminUsers(tab === "users");
  const { data: products } = useAdminProducts(tab === "products");
  const { data: reports } = useAdminReports(tab === "reports");
  const { suspendUser, setProductStatus, resolveReport } = useAdminActions();

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <div className="flex items-center gap-3">
        <span className="soft-button flex size-11 items-center justify-center rounded-2xl text-primary">
          <ShieldAlert size={20} />
        </span>
        <h1 className="section-title text-3xl">Admin</h1>
      </div>

      <nav className="flex flex-wrap gap-2">
        {(
          [
            ["stats", "Overview"],
            ["users", "Users"],
            ["products", "Products"],
            ["reports", "Reports"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "default" : "secondary"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </nav>

      {tab === "stats" && stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Users", String(stats.users)],
            ["Products", String(stats.products)],
            ["Orders", String(stats.orders)],
            ["Rentals", String(stats.rentals)],
            ["Reviews", String(stats.reviews)],
            ["Open reports", String(stats.openReports)],
            ["Gross volume", formatInr(stats.grossVolume)],
          ].map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">{label}</p>
              <p className="font-heading text-2xl font-black">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === "users" && (
        <Card className="overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((user) => (
                <tr key={user.id} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-3 font-bold">{user.name}</td>
                  <td className="px-3 py-3">{user.email}</td>
                  <td className="px-3 py-3">
                    <Badge
                      className={
                        user.role === "SUSPENDED" ? "bg-destructive/10 text-destructive" : ""
                      }
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {user.role === "USER" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void suspendUser(user.id, true)}
                      >
                        <Ban size={13} /> Suspend
                      </Button>
                    ) : user.role === "SUSPENDED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void suspendUser(user.id, false)}
                      >
                        <CheckCircle2 size={13} /> Restore
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "products" && (
        <Card className="overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Seller</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).map((product) => (
                <tr key={product.id} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-3 font-bold">{product.title}</td>
                  <td className="px-3 py-3">{product.sellerName}</td>
                  <td className="px-3 py-3">
                    <Badge>{product.status}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void setProductStatus(product.id, "ACTIVE")}
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void setProductStatus(product.id, "PAUSED")}
                      >
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void setProductStatus(product.id, "ARCHIVED")}
                      >
                        Archive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "reports" && (
        <div className="space-y-3">
          {!reports?.length ? (
            <p className="inset-surface rounded-2xl px-5 py-8 text-center text-sm text-muted-foreground">
              No reports yet.
            </p>
          ) : (
            reports.map((report) => (
              <Card key={report.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="font-bold">{report.reason}</p>
                  {report.details && (
                    <p className="text-xs text-muted-foreground">{report.details}</p>
                  )}
                </div>
                <Badge
                  className={
                    report.status === "OPEN"
                      ? "bg-primary/10 text-primary"
                      : "bg-accent/10 text-accent"
                  }
                >
                  {report.status}
                </Badge>
                {report.status === "OPEN" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void resolveReport(report.id, "RESOLVED")}>
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void resolveReport(report.id, "DISMISSED")}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
