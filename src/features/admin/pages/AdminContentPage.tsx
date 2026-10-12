import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  History,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchImageUploadConfig, uploadImage, validateImageFile } from "@/lib/storage";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils/cn";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminField as Field } from "../components/AdminField";
import { AdminConfirmDialog } from "../components/AdminConfirmDialog";
import { AdminErrorState } from "../components/AdminErrorState";
import { formatAdminDateTime, humanizeEnum } from "../components/format";
import {
  useAdminBlock,
  useAdminBlocks,
  useAdminBanners,
  useAdminCmsCatalogue,
  useAdminCmsVersions,
  useCreateAdminBanner,
  useDeleteAdminBanner,
  useDeleteAdminBlock,
  useReorderAdminBanners,
  useSaveAdminBlock,
  useSetAdminBlockStatus,
  useUpdateAdminBanner,
} from "../query";
import type { AdminBanner, AdminBlock, AdminCmsVersion } from "../types";
import type { AdminBannerWriteInput } from "../api";

/**
 * `/admin/content` — the CMS: hero banners and the homepage's editorial blocks.
 *
 * ## Everything here is scheduled, ordered content
 *
 * A banner is a window (`startsAt`…`endsAt`) inside a placement (`HERO`,
 * `CATEGORY_STRIP`, `FOOTER`). Visibility is *computed* from that window — the
 * server's `isBannerLive` is the same predicate the storefront read uses — so the
 * list shows the state a visitor would actually get ("Live", "Scheduled in 3 days",
 * "Expired") rather than the operator's stored intent, which is the thing that can
 * disagree with reality.
 *
 * A block is keyed content a component looks up by name. It is saved as a draft and
 * published explicitly, and every write lands in the audit trail, which is what the
 * history panel reads. Publishing is never a side effect of saving.
 *
 * ## No developer required
 *
 * Known blocks (`home.how_it_works`, `home.promo`, `home.featured`) get structured
 * fields — steps, a call-to-action, a product id list. Any other key falls back to a
 * JSON editor, which is the escape hatch rather than the primary tool. URLs are
 * validated by the server to be in-app paths or `https:`, so a banner cannot become
 * stored XSS.
 */
export function AdminContentPage() {
  const [tab, setTab] = useState<"banners" | "blocks">("banners");

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Content"
        title="Content"
        description="Hero banners and the homepage's editorial blocks. Save a banner or publish a block and the storefront picks the change up on its next read — no deploy."
      />

      <div
        role="tablist"
        aria-label="Content sections"
        className="inline-flex rounded-xl border border-[var(--divider)] p-1"
      >
        {(["banners", "blocks"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "banners" ? "Banners" : "Homepage blocks"}
          </button>
        ))}
      </div>

      {tab === "banners" ? <BannersPanel /> : <BlocksPanel />}
    </div>
  );
}

/* --------------------------------- banners ---------------------------------- */

const PLACEMENT_LABELS: Record<string, string> = {
  HERO: "Hero",
  CATEGORY_STRIP: "Category strip",
  FOOTER: "Footer",
};

const PLACEMENT_FALLBACK = Object.keys(PLACEMENT_LABELS);

/**
 * A banner's *effective* state, which is not its stored status.
 *
 * Mirrors `isBannerLive` on the server: `DRAFT`/`PAUSED` are never live, and an
 * `ACTIVE`/`SCHEDULED` banner before its start is "scheduled" while one past its end
 * is "expired". The label an operator reads here is the label a visitor lives.
 */
function bannerState(banner: AdminBanner, now = Date.now()): "LIVE" | "SCHEDULED" | "EXPIRED" | "PAUSED" | "DRAFT" {
  if (banner.status === "DRAFT") return "DRAFT";
  if (banner.status === "PAUSED") return "PAUSED";
  const starts = banner.startsAt ? new Date(banner.startsAt).getTime() : null;
  const ends = banner.endsAt ? new Date(banner.endsAt).getTime() : null;
  if (starts !== null && starts > now) return "SCHEDULED";
  if (ends !== null && ends <= now) return "EXPIRED";
  return "LIVE";
}

const STATE_STYLES: Record<string, string> = {
  LIVE: "bg-success/15 text-success",
  SCHEDULED: "bg-primary/15 text-primary",
  EXPIRED: "bg-muted text-muted-foreground",
  PAUSED: "bg-warning/15 text-warning",
  DRAFT: "bg-muted text-muted-foreground",
};

function BannersPanel() {
  const banners = useAdminBanners();
  const catalogue = useAdminCmsCatalogue();
  const createBanner = useCreateAdminBanner();
  const updateBanner = useUpdateAdminBanner();
  const removeBanner = useDeleteAdminBanner();
  const reorder = useReorderAdminBanners();

  const [editing, setEditing] = useState<AdminBanner | "new" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);

  const rows = useMemo(() => banners.data ?? [], [banners.data]);
  const placements = catalogue.data?.placements ?? PLACEMENT_FALLBACK;
  const statuses = catalogue.data?.bannerStatuses ?? ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"];

  const grouped = useMemo(() => {
    const map = new Map<string, AdminBanner[]>();
    for (const placement of placements) map.set(placement, []);
    for (const row of rows) {
      const list = map.get(row.placement) ?? [];
      list.push(row);
      map.set(row.placement, list);
    }
    return map;
  }, [rows, placements]);

  function move(placement: string, id: number, direction: -1 | 1) {
    const ids = (grouped.get(placement) ?? []).map((row) => row.id);
    const index = ids.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorder.mutate({ placement, ids });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            setFormError(null);
            setEditing("new");
          }}
        >
          <Plus size={15} aria-hidden />
          New banner
        </Button>
      </div>

      {banners.isLoading && !banners.data ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </Card>
      ) : banners.isError ? (
        <AdminErrorState label="Banners could not be loaded." onRetry={() => void banners.refetch()} />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <EmptyState
            icon={ImageIcon}
            title="No banners yet"
            description="Hero banners are scheduled slots. Add one and give it a start and end so it appears and expires on its own."
            action={
              <Button type="button" onClick={() => setEditing("new")}>
                <Plus size={15} aria-hidden />
                New banner
              </Button>
            }
          />
        </Card>
      ) : (
        [...grouped.entries()].map(([placement, list]) => (
          <Card key={placement} className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--divider)] px-4 py-3">
              <p className="font-semibold">{PLACEMENT_LABELS[placement] ?? humanizeEnum(placement)}</p>
              <span className="text-xs text-muted-foreground">
                {list.length} banner{list.length === 1 ? "" : "s"}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Nothing scheduled here.</p>
            ) : (
              <ul className="divide-y divide-[var(--divider)]">
                {list.map((banner, index) => {
                  const state = bannerState(banner);
                  return (
                    <li key={banner.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          aria-label={`Move ${banner.title} up`}
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => move(placement, banner.id, -1)}
                          className="rounded p-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUp size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${banner.title} down`}
                          disabled={index === list.length - 1 || reorder.isPending}
                          onClick={() => move(placement, banner.id, 1)}
                          className="rounded p-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDown size={14} aria-hidden />
                        </button>
                      </div>

                      <img
                        src={banner.imageUrl}
                        alt=""
                        className="h-12 w-20 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{banner.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {banner.subtitle ?? "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {banner.startsAt ? `From ${formatAdminDateTime(banner.startsAt)}` : "No start"}
                          {" · "}
                          {banner.endsAt ? `Until ${formatAdminDateTime(banner.endsAt)}` : "No end"}
                        </p>
                      </div>

                      <Badge className={STATE_STYLES[state]}>{humanizeEnum(state)}</Badge>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {humanizeEnum(banner.status)}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => {
                            setFormError(null);
                            setEditing(banner);
                          }}
                        >
                          <Pencil size={14} aria-hidden />
                          <span className="sr-only">Edit {banner.title}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleting(banner)}
                        >
                          <Trash2 size={14} aria-hidden />
                          <span className="sr-only">Delete {banner.title}</span>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New banner" : "Edit banner"}</DialogTitle>
            <DialogDescription>
              A banner shows in its placement while it is active and inside its window. Leave
              the dates blank for "always".
            </DialogDescription>
          </DialogHeader>
          <BannerForm
            key={editing === "new" ? "new" : (editing?.id ?? "new")}
            banner={editing === "new" ? null : editing}
            placements={placements}
            statuses={statuses}
            saving={createBanner.isPending || updateBanner.isPending}
            serverError={formError}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => {
              setFormError(null);
              if (editing && editing !== "new") {
                updateBanner.mutate(
                  { id: editing.id, input },
                  {
                    onSuccess: () => setEditing(null),
                    onError: (error: Error) => setFormError(error.message),
                  },
                );
              } else {
                createBanner.mutate(input, {
                  onSuccess: () => setEditing(null),
                  onError: (error: Error) => setFormError(error.message),
                });
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <AdminConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        subject={deleting?.title ?? ""}
        title="Delete this banner?"
        body="The banner is removed immediately, including from any placement it is currently live in. This cannot be undone."
        confirmLabel="Delete banner"
        tone="destructive"
        requireReason
        reasonLabel="Reason (recorded in the audit log)"
        isSubmitting={removeBanner.isPending}
        onConfirm={(reason) =>
          deleting &&
          removeBanner.mutate({ id: deleting.id, reason }, { onSettled: () => setDeleting(null) })
        }
      />
    </div>
  );
}

/** ISO string ↔ the `datetime-local` value the input speaks. */
function toLocalInput(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function BannerForm({
  banner,
  placements,
  statuses,
  saving,
  serverError,
  onCancel,
  onSubmit,
}: {
  banner: AdminBanner | null;
  placements: string[];
  statuses: string[];
  saving: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (input: AdminBannerWriteInput) => void;
}) {
  const [placement, setPlacement] = useState(banner?.placement ?? placements[0] ?? "HERO");
  const [title, setTitle] = useState(banner?.title ?? "");
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? "");
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "");
  const [status, setStatus] = useState(banner?.status ?? "DRAFT");
  const [startsAt, setStartsAt] = useState(toLocalInput(banner?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(banner?.endsAt ?? null));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (title.trim().length === 0) {
      setError("Give the banner a title.");
      return;
    }
    if (imageUrl.trim().length === 0) {
      setError("Add an image — required, and validated on the server.");
      return;
    }
    if (startsAt !== "" && endsAt !== "" && new Date(endsAt) <= new Date(startsAt)) {
      setError("The end must be after the start.");
      return;
    }
    setError(null);
    onSubmit({
      placement,
      title: title.trim(),
      subtitle: subtitle.trim() === "" ? null : subtitle.trim(),
      imageUrl: imageUrl.trim(),
      linkUrl: linkUrl.trim() === "" ? null : linkUrl.trim(),
      status,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="mt-4 space-y-4">
        {serverError ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Placement" htmlFor="admin-banner-placement">
            <NativeSelect
              id="admin-banner-placement"
              label="Placement"
              value={placement}
              onChange={(event) => setPlacement(event.target.value)}
              options={placements.map((value) => ({
                value,
                label: PLACEMENT_LABELS[value] ?? humanizeEnum(value),
              }))}
            />
          </Field>
          <Field label="Status" htmlFor="admin-banner-status">
            <NativeSelect
              id="admin-banner-status"
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              options={statuses.map((value) => ({ value, label: humanizeEnum(value) }))}
            />
          </Field>
        </div>

        <Field label="Title" error={error} htmlFor="admin-banner-title">
          <Input
            id="admin-banner-title"
            value={title}
            aria-invalid={!!error}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field label="Subtitle" hint="Optional." htmlFor="admin-banner-subtitle">
          <Input
            id="admin-banner-subtitle"
            value={subtitle ?? ""}
            onChange={(event) => setSubtitle(event.target.value)}
          />
        </Field>

        <CmsImageField
          id="admin-banner-image"
          label="Image"
          value={imageUrl}
          error={error}
          onChange={setImageUrl}
        />

        <Field
          label="Link"
          hint="An in-app path like /browse, or an https:// URL. Blank is fine."
          htmlFor="admin-banner-link"
        >
          <Input
            id="admin-banner-link"
            value={linkUrl}
            placeholder="/browse"
            onChange={(event) => setLinkUrl(event.target.value)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts at" hint="Blank = live immediately." htmlFor="admin-banner-start">
            <Input
              id="admin-banner-start"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Ends at" hint="Blank = never expires." htmlFor="admin-banner-end">
            <Input
              id="admin-banner-end"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <DialogFooter className="mt-5">
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
          {saving ? "Saving…" : banner ? "Save changes" : "Create banner"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------- image field -------------------------------- */

/**
 * The banner image: an uploaded object (the same storage pipeline every other image
 * uses) or a pasted URL, with upload progress and a preview.
 *
 * The upload rule is not re-implemented here — `validateImageFile` checks type and size
 * against the server's own limits, and the server re-checks both. This control only
 * decides when to call it.
 */
function CmsImageField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const { data: config } = useQuery({
    queryKey: queryKeys.storageConfig,
    queryFn: fetchImageUploadConfig,
    staleTime: 30 * 60 * 1000,
  });
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function pick(file: File) {
    if (!config) {
      setMessage("Upload limits are still loading — try again in a moment.");
      return;
    }
    const invalid = validateImageFile(file, config);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setMessage(null);
    setProgress(0);
    try {
      const uploaded = await uploadImage("cms", file, setProgress);
      onChange(uploaded.publicUrl);
      toast.success("Image uploaded.");
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "The upload failed.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Field label={label} error={error ?? message} htmlFor={id}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={id}
            value={value}
            placeholder="/api/storage/local?key=cms/… or https://…"
            onChange={(event) => onChange(event.target.value)}
          />
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--divider)] px-3 py-2 text-xs font-medium transition hover:bg-accent">
            <Upload size={13} aria-hidden />
            Upload
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void pick(file);
              }}
            />
          </label>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => onChange("")}
            >
              <X size={14} aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>

        {progress !== null ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}

        {value ? (
          <img src={value} alt="" className="h-24 w-full max-w-sm rounded-lg object-cover" />
        ) : null}
      </div>
    </Field>
  );
}

/* ---------------------------------- blocks ---------------------------------- */

const KNOWN_KEYS = ["home.how_it_works", "home.promo", "home.featured"] as const;

/** A sensible starting shape, so a first-time editor has something to fill in. */
const DEFAULT_BLOCK_CONTENT: Record<string, Record<string, unknown>> = {
  "home.how_it_works": {
    title: "How Revaro works",
    steps: [
      { title: "Browse", body: "Find what you need from verified sellers." },
      { title: "Book", body: "Pay securely and pick your dates." },
      { title: "Enjoy", body: "Get it delivered or collect it yourself." },
    ],
  },
  "home.promo": {
    title: "New season, new finds",
    body: "Fresh listings from trusted sellers, added every day.",
    ctaLabel: "Browse now",
    ctaHref: "/browse",
  },
  "home.featured": { title: "Featured picks", subtitle: "", productIds: [] },
};

function BlocksPanel() {
  const catalogue = useAdminCmsCatalogue();
  const blocks = useAdminBlocks();
  const [selectedKey, setSelectedKey] = useState<string>(KNOWN_KEYS[0]);
  const block = useAdminBlock(selectedKey);
  const versions = useAdminCmsVersions("cms_block", block.data?.id ?? null);

  const known = catalogue.data?.blocks ?? [];
  const extraKeys = (blocks.data ?? [])
    .map((row) => row.blockKey)
    .filter((key) => !known.some((entry) => entry.key === key));
  const options = [
    ...known.map((entry) => ({ key: entry.key, label: entry.label, description: entry.description })),
    ...extraKeys.map((key) => ({ key, label: key, description: "Custom block." })),
  ];

  const selectedLabel = options.find((option) => option.key === selectedKey)?.label ?? selectedKey;
  const selectedDescription = options.find((option) => option.key === selectedKey)?.description;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <Card className="p-2">
        <nav aria-label="Blocks" className="flex flex-col gap-1">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSelectedKey(option.key)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm transition",
                selectedKey === option.key
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {option.label}
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {option.key}
              </span>
            </button>
          ))}
        </nav>
      </Card>

      <div className="space-y-4">
        <BlockEditor
          key={`${selectedKey}:${block.data?.rawContent ?? "new"}`}
          blockKey={selectedKey}
          label={selectedLabel}
          description={selectedDescription}
          known={KNOWN_KEYS.includes(selectedKey as (typeof KNOWN_KEYS)[number])}
          block={block.data ?? null}
          loading={block.isLoading}
          versions={versions.data ?? []}
          versionsLoading={versions.isLoading}
        />
      </div>
    </div>
  );
}

function BlockEditor({
  blockKey,
  label,
  description,
  known,
  block,
  loading,
  versions,
  versionsLoading,
}: {
  blockKey: string;
  label: string;
  description?: string;
  known: boolean;
  block: AdminBlock | null;
  loading: boolean;
  versions: AdminCmsVersion[];
  versionsLoading: boolean;
}) {
  const save = useSaveAdminBlock();
  const setStatus = useSetAdminBlockStatus();
  const remove = useDeleteAdminBlock();

  // The editor is remounted (by its `key`) whenever the selected key or the stored
  // content changes, so this only has to describe the first render of a mount. State
  // is initialised from it rather than synced in an effect, which is what keeps a
  // background refetch from clobbering an in-progress draft.
  const initial = block?.content ?? DEFAULT_BLOCK_CONTENT[blockKey] ?? {};
  const [draft, setDraft] = useState<Record<string, unknown>>(() => structuredClone(initial));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const published = block?.status === "PUBLISHED";

  function handleSave() {
    setError(null);
    if (!known) {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        save.mutate(
          { key: blockKey, content: parsed },
          { onError: (mutationError: Error) => setError(mutationError.message) },
        );
      } catch {
        setError("That is not valid JSON.");
      }
      return;
    }
    save.mutate(
      { key: blockKey, content: draft },
      { onError: (mutationError: Error) => setError(mutationError.message) },
    );
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              {label}
              <Badge className={published ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
                {published ? "Published" : "Draft"}
              </Badge>
              {block ? null : <span className="text-xs text-muted-foreground">Not created yet</span>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description ?? blockKey}
              {block ? ` · updated ${formatAdminDateTime(block.updatedAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null}
              Save draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              <Eye size={14} aria-hidden />
              Preview
            </Button>
            {published ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={setStatus.isPending || !block}
                onClick={() => setStatus.mutate({ key: blockKey, status: "DRAFT" })}
              >
                <EyeOff size={14} aria-hidden />
                Unpublish
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={setStatus.isPending || !block}
                onClick={() => setStatus.mutate({ key: blockKey, status: "PUBLISHED" })}
              >
                <Eye size={14} aria-hidden />
                Publish
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              disabled={!block}
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={14} aria-hidden />
              <span className="sr-only">Delete block</span>
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {error ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : known ? (
            <>
              {blockKey === "home.how_it_works" ? (
                <HowItWorksEditor draft={draft} onChange={setDraft} />
              ) : null}
              {blockKey === "home.promo" ? <PromoEditor draft={draft} onChange={setDraft} /> : null}
              {blockKey === "home.featured" ? (
                <FeaturedEditor draft={draft} onChange={setDraft} />
              ) : null}
            </>
          ) : (
            <Field
              label="Content (JSON)"
              hint="Custom blocks are stored as-is. The renderer decides what to do with them."
              htmlFor="admin-block-json"
            >
              <Textarea
                id="admin-block-json"
                className="min-h-[220px] font-mono text-xs"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
              />
            </Field>
          )}
        </div>

        {previewOpen ? (
          <BlockPreview className="mt-4" blockKey={blockKey} content={draft} json={jsonText} known={known} />
        ) : null}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 font-semibold">
          <History size={15} aria-hidden />
          History
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every save and publish, read from the audit trail. Restoring a version saves it as a
          new draft. {versionsLoading ? "Loading…" : ""}
        </p>
        <ul className="mt-3 space-y-2">
          {versions.length === 0 ? (
            <li className="text-sm text-muted-foreground">No changes recorded yet.</li>
          ) : (
            versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--divider)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{humanizeEnum(version.action)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {version.adminName ?? "Unknown"} · {formatAdminDateTime(version.createdAt)}
                    {version.reason ? ` · ${version.reason}` : ""}
                  </p>
                </div>
                {block && version.before ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={save.isPending}
                    onClick={() => {
                      const before = version.before as { content?: Record<string, unknown> } | null;
                      if (before?.content) {
                        save.mutate({ key: blockKey, content: before.content });
                      }
                    }}
                  >
                    Restore
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </Card>

      <AdminConfirmDialog
        open={deleting}
        onOpenChange={(open) => !open && setDeleting(false)}
        subject={blockKey}
        title="Delete this block?"
        body="The block's stored content is removed. Any component that reads it falls back to its built-in copy. This cannot be undone."
        confirmLabel="Delete block"
        tone="destructive"
        requireReason
        reasonLabel="Reason (recorded in the audit log)"
        isSubmitting={remove.isPending}
        onConfirm={(reason) =>
          remove.mutate({ key: blockKey, reason }, { onSettled: () => setDeleting(false) })
        }
      />
    </>
  );
}

/* -------------------------- structured block editors ------------------------ */

function HowItWorksEditor({
  draft,
  onChange,
}: {
  draft: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const title = typeof draft.title === "string" ? draft.title : "";
  const steps = Array.isArray(draft.steps)
    ? (draft.steps as { title?: string; body?: string }[])
    : [];

  function update(next: Partial<Record<string, unknown>>) {
    onChange({ ...draft, ...next });
  }

  function updateStep(index: number, patch: { title?: string; body?: string }) {
    const next = steps.map((step, position) => (position === index ? { ...step, ...patch } : step));
    update({ steps: next });
  }

  return (
    <>
      <Field label="Title" htmlFor="admin-how-title">
        <Input
          id="admin-how-title"
          value={title}
          onChange={(event) => update({ title: event.target.value })}
        />
      </Field>

      <div className="space-y-3">
        <p className="text-sm font-medium">Steps</p>
        {steps.map((step, index) => (
          <div
            key={index}
            className="space-y-2 rounded-xl border border-[var(--divider)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Step {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:bg-destructive/10"
                disabled={steps.length <= 1}
                onClick={() => update({ steps: steps.filter((_, position) => position !== index) })}
              >
                <Trash2 size={13} aria-hidden />
                <span className="sr-only">Remove step {index + 1}</span>
              </Button>
            </div>
            <Input
              aria-label={`Step ${index + 1} title`}
              value={step.title ?? ""}
              placeholder="Step title"
              onChange={(event) => updateStep(index, { title: event.target.value })}
            />
            <Textarea
              aria-label={`Step ${index + 1} body`}
              value={step.body ?? ""}
              placeholder="What happens in this step?"
              onChange={(event) => updateStep(index, { body: event.target.value })}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={steps.length >= 8}
          onClick={() => update({ steps: [...steps, { title: "", body: "" }] })}
        >
          <Plus size={14} aria-hidden />
          Add step
        </Button>
      </div>
    </>
  );
}

function PromoEditor({
  draft,
  onChange,
}: {
  draft: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const text = (key: string) => (typeof draft[key] === "string" ? (draft[key] as string) : "");
  const update = (key: string, value: string) => onChange({ ...draft, [key]: value });

  return (
    <>
      <Field label="Title" htmlFor="admin-promo-title">
        <Input
          id="admin-promo-title"
          value={text("title")}
          onChange={(event) => update("title", event.target.value)}
        />
      </Field>
      <Field label="Body" htmlFor="admin-promo-body">
        <Textarea
          id="admin-promo-body"
          value={text("body")}
          onChange={(event) => update("body", event.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button label" htmlFor="admin-promo-cta">
          <Input
            id="admin-promo-cta"
            value={text("ctaLabel")}
            onChange={(event) => update("ctaLabel", event.target.value)}
          />
        </Field>
        <Field
          label="Button link"
          hint="An in-app path like /browse, or an https:// URL."
          htmlFor="admin-promo-href"
        >
          <Input
            id="admin-promo-href"
            value={text("ctaHref")}
            onChange={(event) => update("ctaHref", event.target.value)}
          />
        </Field>
      </div>
    </>
  );
}

function FeaturedEditor({
  draft,
  onChange,
}: {
  draft: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const text = (key: string) => (typeof draft[key] === "string" ? (draft[key] as string) : "");
  const ids = Array.isArray(draft.productIds)
    ? (draft.productIds as number[]).join(", ")
    : "";

  return (
    <>
      <Field label="Title" htmlFor="admin-featured-title">
        <Input
          id="admin-featured-title"
          value={text("title")}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </Field>
      <Field label="Subtitle" hint="Optional." htmlFor="admin-featured-subtitle">
        <Input
          id="admin-featured-subtitle"
          value={text("subtitle")}
          onChange={(event) => onChange({ ...draft, subtitle: event.target.value })}
        />
      </Field>
      <Field
        label="Product ids"
        hint="Comma-separated listing ids, in the order they should appear (up to 24)."
        htmlFor="admin-featured-ids"
      >
        <Input
          id="admin-featured-ids"
          value={ids}
          placeholder="12, 34, 56"
          onChange={(event) =>
            onChange({
              ...draft,
              productIds: event.target.value
                .split(",")
                .map((part) => Number(part.trim()))
                .filter((value) => Number.isInteger(value) && value > 0),
            })
          }
        />
      </Field>
    </>
  );
}

/* --------------------------------- preview ---------------------------------- */

/**
 * A draft preview.
 *
 * ## Why this is not the storefront component
 *
 * Importing `HowItWorks` here would be a cross-feature import, and rendering the *live*
 * one would show the published copy, not the draft on screen — which is precisely what
 * an editor is trying to see. So this is a deliberate, simplified rendering of the same
 * content, good enough to answer the question a preview exists for ("does this read
 * right, and does it fit?"). The block's shape, not its exact pixels, is what it shows.
 *
 * Like the storefront consumers, it reads the draft defensively: a field that is the
 * wrong type renders as empty rather than throwing inside the workspace.
 */
function BlockPreview({
  blockKey,
  content,
  json,
  known,
  className,
}: {
  blockKey: string;
  content: Record<string, unknown>;
  json: string;
  known: boolean;
  className?: string;
}) {
  const str = (key: string) => (typeof content[key] === "string" ? (content[key] as string) : "");
  const steps = Array.isArray(content.steps)
    ? (content.steps as unknown[]).filter(
        (entry): entry is { title?: string; body?: string } =>
          typeof entry === "object" && entry !== null,
      )
    : [];

  return (
    <div className={cn("rounded-xl border border-dashed border-[var(--divider)] p-4", className)}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Preview · draft only
      </p>

      {!known ? (
        <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
          {json}
        </pre>
      ) : blockKey === "home.how_it_works" ? (
        <div className="mt-3 space-y-3">
          <p className="font-heading text-lg font-extrabold">{str("title")}</p>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet.</p>
          ) : (
            <ol className="grid gap-2 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={index} className="rounded-lg border border-[var(--divider)] p-3">
                  <span className="text-xs font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-1 text-sm font-semibold">{step.title ?? "Untitled"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.body ?? ""}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : blockKey === "home.promo" ? (
        <div className="mt-3 rounded-xl bg-primary/10 p-4">
          <p className="font-heading text-lg font-extrabold">{str("title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{str("body")}</p>
          {str("ctaLabel") ? (
            <span className="mt-3 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              {str("ctaLabel")}
            </span>
          ) : null}
          {str("ctaHref") ? (
            <p className="mt-1 text-[11px] text-muted-foreground">→ {str("ctaHref")}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <p className="font-heading text-lg font-extrabold">{str("title")}</p>
          {str("subtitle") ? <p className="text-sm text-muted-foreground">{str("subtitle")}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {Array.isArray(content.productIds) ? content.productIds.length : 0} product
            {Array.isArray(content.productIds) && content.productIds.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Save the draft, then Publish to make it visible on the storefront.
      </p>
    </div>
  );
}
