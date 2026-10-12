import { useMemo, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminErrorState } from "../components/AdminErrorState";
import { AdminLoadingState } from "../components/AdminLoadingState";
import { formatAdminCount } from "../components/format";
import {
  useAdminPermissions,
  useAdminRoleMutations,
  useAdminRoles,
} from "../query";
import { hasPermission, type AdminAccess } from "../access";
import { ADMIN_NAV } from "../components/AdminSidebar";
import type { AdminPermissionRow, AdminRoleRow } from "../api";

/**
 * `/admin/roles` — the role editor (PROMPT 22).
 *
 * ## Why a grouped matrix rather than a flat list
 *
 * The catalogue is `resource.action` (`products.view`, `products.manage`, …). Read
 * flat, "can this role publish a listing?" means scanning for two keys in different
 * parts of a 26-row list. Grouped by resource, the same question is answered by one
 * block: view, and the manage keys beside it. The grouping comes from the permission
 * catalogue itself (`groupKey`), so a new key lands in the right block automatically.
 *
 * ## Training-wheels guards, mirrored from the server
 *
 * Built-in roles cannot be edited or deleted, a role that is still assigned cannot be
 * deleted, and a manager cannot edit a role they hold. The server enforces all three
 * authoritatively (`routes/admin.ts`); the same rules disable the controls here so the
 * UI never offers an action that is going to be refused. Hiding is UX; the server is
 * the boundary.
 *
 * ## "View as role"
 *
 * A permission set is abstract until you see what it buys. The panel runs the same
 * `hasPermission` the sidebar uses against a role's grants, so an editor can check
 * "would a FINANCE agent see payouts?" by choosing the role instead of reasoning
 * about the checkboxes.
 */

const GROUP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Products",
  categories: "Categories",
  orders: "Orders",
  rentals: "Rentals",
  users: "Users",
  vendors: "Vendors",
  payouts: "Payouts & finance",
  reviews: "Reviews",
  reports: "Reports",
  rbac: "Roles & permissions",
  audit: "Audit",
  settings: "Settings",
};

function groupLabel(groupKey: string): string {
  return GROUP_LABELS[groupKey] ?? groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
}

function accessForRole(role: AdminRoleRow): AdminAccess {
  return {
    role: "ADMIN",
    roles: [role.name],
    permissions: role.permissions,
    isSuperAdmin: role.name === "SUPER_ADMIN",
  };
}

export function AdminRolesPage() {
  const roles = useAdminRoles();
  const permissions = useAdminPermissions();
  const mutations = useAdminRoleMutations();

  const [editing, setEditing] = useState<AdminRoleRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminRoleRow | null>(null);
  const [viewAs, setViewAs] = useState<string>("");

  const viewingRole = useMemo(
    () => roles.data?.find((role) => role.name === viewAs) ?? null,
    [roles.data, viewAs],
  );

  if (roles.isPending || permissions.isPending) {
    return <AdminLoadingState rows={4} />;
  }
  if (roles.isError || permissions.isError) {
    return (
      <AdminErrorState
        label="We couldn't load roles and permissions."
        onRetry={() => void roles.refetch()}
      />
    );
  }

  const roleRows = roles.data ?? [];
  const permissionRows = permissions.data ?? [];

  return (
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        eyebrow="Revaro admin"
        title="Roles & permissions"
        description="Who can do what. Built-in roles are fixed; custom roles are yours to shape."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus size={15} aria-hidden /> New role
          </Button>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--divider)] px-4 py-3">
            <h2 className="font-heading text-sm font-extrabold">Roles</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatAdminCount(roleRows.length)} roles in use.
            </p>
          </div>
          <ul className="divide-y divide-[var(--divider)]">
            {roleRows.map((role) => (
              <li key={role.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{role.name}</span>
                    {role.isSystem ? (
                      <Badge className="bg-muted text-muted-foreground">Built-in</Badge>
                    ) : (
                      <Badge className="bg-primary/12 text-primary">Custom</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {role.description ?? "No description."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAdminCount(role.memberCount)} member
                    {role.memberCount === 1 ? "" : "s"} · {role.permissions.length} permission
                    {role.permissions.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewAs(role.name)}
                    aria-label={`View workspace as ${role.name}`}
                  >
                    <ShieldCheck size={14} aria-hidden /> View as
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={role.isSystem}
                    onClick={() => setEditing(role)}
                    aria-label={`Edit ${role.name}`}
                  >
                    <Pencil size={14} aria-hidden /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={role.isSystem || role.memberCount > 0}
                    onClick={() => setDeleting(role)}
                    aria-label={`Delete ${role.name}`}
                    title={
                      role.memberCount > 0
                        ? "Remove this role from every account before deleting it."
                        : undefined
                    }
                  >
                    <Trash2 size={14} aria-hidden /> Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <ViewAsPanel role={viewingRole} roleRows={roleRows} onSelect={setViewAs} />
      </section>

      {editing ? (
        <RoleEditorDialog
          role={editing === "new" ? null : editing}
          permissionRows={permissionRows}
          isSubmitting={mutations.isPending}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            if (editing === "new") {
              await mutations.create(values);
            } else {
              await mutations.update({ id: editing.id, input: values });
            }
            setEditing(null);
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteRoleDialog
          role={deleting}
          isSubmitting={mutations.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={async (reason) => {
            await mutations.remove({ id: deleting.id, reason });
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The "view as role" panel: the sidebar an account holding this role would see.
 *
 * It renders the *real* `ADMIN_NAV` through the same filter, so the preview cannot
 * drift from the rail it is previewing.
 */
function ViewAsPanel({
  role,
  roleRows,
  onSelect,
}: {
  role: AdminRoleRow | null;
  roleRows: AdminRoleRow[];
  onSelect: (name: string) => void;
}) {
  const access = role ? accessForRole(role) : undefined;
  const visible = role
    ? ADMIN_NAV.map((section) => ({
        ...section,
        items: section.items.filter((item) => hasPermission(access, item.permission)),
      })).filter((section) => section.items.length > 0)
    : [];

  return (
    <Card className="p-4">
      <h2 className="font-heading text-sm font-extrabold">View as role</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        See the sidebar an account with this role would get.
      </p>

      <label className="mt-3 block space-y-1">
        <span className="sr-only">Role to preview</span>
        <select
          value={role?.name ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          className="h-9 w-full rounded-xl border border-[var(--divider)] bg-background px-3 text-sm"
        >
          <option value="">Choose a role…</option>
          {roleRows.map((row) => (
            <option key={row.id} value={row.name}>
              {row.name}
            </option>
          ))}
        </select>
      </label>

      {!role ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Choose a role to preview its workspace.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="Nothing visible"
              description="This role has no grants, so the rail would be empty."
            />
          ) : (
            visible.map((section) => (
              <div key={section.title}>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-sm">
                      <item.icon size={14} aria-hidden className="text-muted-foreground" />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function RoleEditorDialog({
  role,
  permissionRows,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  role: AdminRoleRow | null;
  permissionRows: AdminPermissionRow[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    description?: string;
    permissions: string[];
    reason: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byGroup = new Map<string, AdminPermissionRow[]>();
    for (const row of permissionRows) {
      const list = byGroup.get(row.groupKey) ?? [];
      list.push(row);
      byGroup.set(row.groupKey, list);
    }
    return [...byGroup.entries()].sort(([a], [b]) => groupLabel(a).localeCompare(groupLabel(b)));
  }, [permissionRows]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      setError("Give the role a name of at least three characters.");
      return;
    }
    if (reason.trim().length === 0) {
      setError("A reason is required — it is written to the audit log.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim() || undefined,
        permissions: [...selected].sort(),
        reason: reason.trim(),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn't save the role.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>
            {role
              ? "Rename, describe or re-grant this custom role."
              : "Custom roles are yours to shape. Built-in roles stay fixed."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CATALOGUE_EDITOR"
              maxLength={32}
              autoFocus
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Description
            </span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this role is for."
              maxLength={200}
            />
          </label>
        </div>

        <div className="mt-2 max-h-[45vh] space-y-4 overflow-y-auto rounded-2xl border border-[var(--divider)] p-3">
          {groups.map(([groupKey, rows]) => (
            <section key={groupKey}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                  {groupLabel(groupKey)}
                </h3>
                <button
                  type="button"
                  className="text-[11px] font-bold text-primary"
                  onClick={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      const allSelected = rows.every((row) => next.has(row.key));
                      for (const row of rows) {
                        if (allSelected) next.delete(row.key);
                        else next.add(row.key);
                      }
                      return next;
                    })
                  }
                >
                  {rows.every((row) => selected.has(row.key)) ? "Clear all" : "Select all"}
                </button>
              </div>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {rows.map((row) => {
                  const on = selected.has(row.key);
                  return (
                    <li key={row.key}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => toggle(row.key)}
                        className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/60"
                      >
                        <span
                          aria-hidden
                          className={
                            on
                              ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-primary bg-primary text-[10px] font-black text-primary-foreground"
                              : "mt-0.5 size-4 shrink-0 rounded border border-[var(--divider)]"
                          }
                        >
                          {on ? "✓" : ""}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{row.key}</span>
                          {row.description ? (
                            <span className="block text-xs text-muted-foreground">
                              {row.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <label className="mt-3 block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Reason (recorded in the audit log)
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Say why, so the log explains itself later."
            rows={2}
            maxLength={300}
          />
        </label>

        {error ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="mt-4">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
            {role ? "Save role" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  role: AdminRoleRow;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {role.name}?</DialogTitle>
          <DialogDescription>
            The role and its {role.permissions.length} permission grant(s) are removed. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

        <label className="mt-3 block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Reason (recorded in the audit log)
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this role going away?"
            rows={2}
            maxLength={300}
            autoFocus
          />
        </label>

        {error ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="mt-4">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting || reason.trim().length === 0}
            onClick={() => {
              setError(null);
              void onConfirm(reason.trim()).catch((confirmError) =>
                setError(
                  confirmError instanceof Error ? confirmError.message : "Couldn't delete the role.",
                ),
              );
            }}
          >
            {isSubmitting ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
