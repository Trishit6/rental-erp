import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminField } from "./AdminField";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import { formatAdminMoney } from "./format";
import {
  COUPON_DISCOUNT_TYPE_LABELS,
  COUPON_DISCOUNT_TYPES,
  COUPON_SCOPES,
  COUPON_SCOPE_LABELS,
  COUPON_STATUS_LABELS,
  COUPON_STATUSES,
  type AdminCouponDiscountType,
  type AdminCouponScope,
  type AdminCouponStatus,
  type AdminCouponWriteInput,
} from "../api";
import {
  useAdminCategories,
  useAdminCouponDetail,
  useAdminProducts,
  useAdminSellersList,
  useCreateAdminCoupon,
  useDeleteAdminCoupon,
  useUpdateAdminCoupon,
} from "../query";
import { EMPTY_ADMIN_PRODUCT_FILTERS } from "../types";

const PAISE_PER_RUPEE = 100;

/**
 * Create or edit one coupon, and (when it has never been used) delete it.
 *
 * ## Money in, money out
 *
 * `discount_value` is paise for `FLAT` and basis points for `PERCENT` — precise, and
 * hostile to type into. The form takes rupees and a percentage and converts on submit,
 * so the operator types "10" and "₹200", not "1000" and "20000", and the conversion is
 * in one place.
 *
 * ## Percentages are capped at 100
 *
 * The server refuses a basis-point value above 10000 (100%); the same rule is mirrored
 * in the disabled save so the refusal is not the first the operator hears of it.
 *
 * ## Deleting is only offered for an unused coupon
 *
 * A redemption cascades from its coupon, so deleting a used one would delete the record
 * of a discount that was really taken off a real order. The delete action is not shown
 * once the coupon has been redeemed; the server refuses it too.
 */
export function AdminCouponDialog({
  couponId,
  open,
  onOpenChange,
}: {
  /** `null` creates a new coupon; a number edits that one. */
  couponId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEditing = couponId !== null;
  const detail = useAdminCouponDetail(open && isEditing ? couponId : null);
  const categories = useAdminCategories();
  // The scope pickers need a list to choose from. Bounded to a single page: the
  // desk is choosing one seller or one product, not paging a catalogue.
  const sellers = useAdminSellersList({ search: "", status: null, page: 1, pageSize: 100 });
  const products = useAdminProducts({ ...EMPTY_ADMIN_PRODUCT_FILTERS, pageSize: 100 });
  const create = useCreateAdminCoupon();
  const update = useUpdateAdminCoupon(couponId ?? 0);
  const remove = useDeleteAdminCoupon(couponId ?? 0);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<AdminCouponDiscountType>("PERCENT");
  const [discountAmount, setDiscountAmount] = useState("");
  const [maxDiscountRupees, setMaxDiscountRupees] = useState("");
  const [minimumOrderRupees, setMinimumOrderRupees] = useState("0");
  const [usageLimit, setUsageLimit] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [status, setStatus] = useState<AdminCouponStatus>("ACTIVE");
  const [appliesTo, setAppliesTo] = useState<AdminCouponScope>("ALL");
  const [categoryId, setCategoryId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [productId, setProductId] = useState("");
  const [stackable, setStackable] = useState(false);
  const [allowDepositDiscount, setAllowDepositDiscount] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const seedKey = open ? (isEditing ? `edit:${couponId}` : "new") : null;
  const coupon = detail.data?.coupon;

  // Seed once per open record. This is the documented "adjust state when a prop
  // changes" render-phase update: it converges in one render and then leaves the
  // operator's own edits alone.
  if (open && seedKey !== seededKey) {
    setSeededKey(seedKey);
    if (isEditing && coupon) {
      setCode(coupon.code);
      setDescription(coupon.description ?? "");
      setDiscountType(coupon.discountType as AdminCouponDiscountType);
      setDiscountAmount(
        coupon.discountType === "PERCENT"
          ? String(coupon.discountValue / 100)
          : String(coupon.discountValue / PAISE_PER_RUPEE),
      );
      setMaxDiscountRupees(
        coupon.maxDiscountPaise == null ? "" : String(coupon.maxDiscountPaise / PAISE_PER_RUPEE),
      );
      setMinimumOrderRupees(String(coupon.minimumOrderPaise / PAISE_PER_RUPEE));
      setUsageLimit(coupon.usageLimit == null ? "" : String(coupon.usageLimit));
      setPerUserLimit(coupon.perUserLimit == null ? "" : String(coupon.perUserLimit));
      setStartsAt(toLocalInput(coupon.startsAt));
      setEndsAt(toLocalInput(coupon.endsAt));
      setStatus(coupon.status as AdminCouponStatus);
      setAppliesTo(coupon.appliesTo as AdminCouponScope);
      setCategoryId(coupon.categoryId == null ? "" : String(coupon.categoryId));
      setSellerId(coupon.sellerId == null ? "" : String(coupon.sellerId));
      setProductId(coupon.productId == null ? "" : String(coupon.productId));
      setStackable(coupon.stackable);
      setAllowDepositDiscount(coupon.allowDepositDiscount);
    } else {
      setCode("");
      setDescription("");
      setDiscountType("PERCENT");
      setDiscountAmount("");
      setMaxDiscountRupees("");
      setMinimumOrderRupees("0");
      setUsageLimit("");
      setPerUserLimit("");
      setStartsAt("");
      setEndsAt("");
      setStatus("ACTIVE");
      setAppliesTo("ALL");
      setCategoryId("");
      setSellerId("");
      setProductId("");
      setStackable(false);
      setAllowDepositDiscount(false);
    }
  }

  const amount = Number(discountAmount);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const percentValid = discountType !== "PERCENT" || amount <= 100;
  const categoryValid = appliesTo !== "CATEGORY" || categoryId !== "";
  const sellerValid = appliesTo !== "SELLER" || sellerId !== "";
  const productValid = appliesTo !== "PRODUCT" || productId !== "";
  const canSave =
    code.trim().length >= 2 &&
    amountValid &&
    percentValid &&
    categoryValid &&
    sellerValid &&
    productValid &&
    !create.isPending &&
    !update.isPending;
  const canDelete = isEditing && (detail.data?.redemptionCount ?? 0) === 0;

  const categoryOptions = (categories.data ?? []).map((category) => ({
    value: String(category.id),
    label: category.name,
  }));
  const sellerOptions = (sellers.data?.rows ?? []).map((seller) => ({
    value: String(seller.id),
    label: seller.name,
  }));
  const productOptions = (products.data?.rows ?? []).map((product) => ({
    value: String(product.id),
    label: product.title,
  }));

  function buildInput(): AdminCouponWriteInput {
    return {
      code: code.trim().toUpperCase(),
      description: description.trim() === "" ? null : description.trim(),
      discountType,
      // Both conversions are ×100: rupees→paise and percent→basis points.
      discountValue: Math.round(amount * PAISE_PER_RUPEE),
      maxDiscountPaise:
        discountType === "PERCENT" && maxDiscountRupees.trim() !== ""
          ? Math.round(Number(maxDiscountRupees) * PAISE_PER_RUPEE)
          : null,
      minimumOrderPaise: Math.round(Number(minimumOrderRupees || "0") * PAISE_PER_RUPEE),
      usageLimit: usageLimit.trim() === "" ? null : Math.trunc(Number(usageLimit)),
      perUserLimit: perUserLimit.trim() === "" ? null : Math.trunc(Number(perUserLimit)),
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      status,
      appliesTo,
      categoryId: appliesTo === "CATEGORY" ? Number(categoryId) : null,
      sellerId: appliesTo === "SELLER" ? Number(sellerId) : null,
      productId: appliesTo === "PRODUCT" ? Number(productId) : null,
      stackable,
      allowDepositDiscount,
    };
  }

  function submit() {
    const input = buildInput();
    if (isEditing) {
      update.mutate(input, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(input, { onSuccess: () => onOpenChange(false) });
    }
  }

  const discountPreview = !amountValid
    ? null
    : discountType === "PERCENT"
      ? `${amount}% off up to ${formatAdminMoney(
          Math.round(Number(maxDiscountRupees || "0") * PAISE_PER_RUPEE) || 0,
          "INR",
        )}`
      : `${formatAdminMoney(Math.round(amount * PAISE_PER_RUPEE), "INR")} off`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? `Edit ${coupon?.code ?? "coupon"}` : "New coupon"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? `${detail.data?.redemptionCount ?? 0} redemption(s) so far.`
                : "A discount code customers can apply at checkout."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AdminField label="Code" htmlFor="coupon-code">
              <Input
                id="coupon-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SAVE10"
                maxLength={40}
              />
            </AdminField>
            <AdminField label="Description" htmlFor="coupon-description">
              <Input
                id="coupon-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="10% off the first order"
                maxLength={200}
              />
            </AdminField>

            <AdminField label="Discount type" htmlFor="coupon-type">
              <NativeSelect
                id="coupon-type"
                label="Discount type"
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value as AdminCouponDiscountType)}
                options={COUPON_DISCOUNT_TYPES.map((value) => ({
                  value,
                  label: COUPON_DISCOUNT_TYPE_LABELS[value],
                }))}
              />
            </AdminField>
            <AdminField
              label={discountType === "PERCENT" ? "Percent off" : "Amount off (₹)"}
              htmlFor="coupon-amount"
              hint={discountPreview ?? undefined}
              error={
                discountType === "PERCENT" && !percentValid
                  ? "A percentage cannot exceed 100."
                  : null
              }
            >
              <Input
                id="coupon-amount"
                type="number"
                inputMode="decimal"
                min={0}
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                placeholder={discountType === "PERCENT" ? "10" : "200"}
              />
            </AdminField>

            {discountType === "PERCENT" ? (
              <AdminField label="Max discount (₹)" htmlFor="coupon-max">
                <Input
                  id="coupon-max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={maxDiscountRupees}
                  onChange={(event) => setMaxDiscountRupees(event.target.value)}
                  placeholder="No cap"
                />
              </AdminField>
            ) : (
              <div />
            )}
            <AdminField label="Minimum order (₹)" htmlFor="coupon-min">
              <Input
                id="coupon-min"
                type="number"
                inputMode="decimal"
                min={0}
                value={minimumOrderRupees}
                onChange={(event) => setMinimumOrderRupees(event.target.value)}
              />
            </AdminField>

            <AdminField label="Usage limit" htmlFor="coupon-usage" hint="Blank means unlimited.">
              <Input
                id="coupon-usage"
                type="number"
                min={1}
                value={usageLimit}
                onChange={(event) => setUsageLimit(event.target.value)}
                placeholder="Unlimited"
              />
            </AdminField>
            <AdminField
              label="Per-customer limit"
              htmlFor="coupon-per-user"
              hint="Blank means unlimited."
            >
              <Input
                id="coupon-per-user"
                type="number"
                min={1}
                value={perUserLimit}
                onChange={(event) => setPerUserLimit(event.target.value)}
                placeholder="Unlimited"
              />
            </AdminField>

            <AdminField label="Starts at" htmlFor="coupon-starts" hint="Blank means now.">
              <Input
                id="coupon-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </AdminField>
            <AdminField label="Ends at" htmlFor="coupon-ends" hint="Blank means no end.">
              <Input
                id="coupon-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </AdminField>

            <AdminField label="Status" htmlFor="coupon-status">
              <NativeSelect
                id="coupon-status"
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value as AdminCouponStatus)}
                options={COUPON_STATUSES.map((value) => ({
                  value,
                  label: COUPON_STATUS_LABELS[value],
                }))}
              />
            </AdminField>
            <AdminField label="Applies to" htmlFor="coupon-scope">
              <NativeSelect
                id="coupon-scope"
                label="Applies to"
                value={appliesTo}
                onChange={(event) => setAppliesTo(event.target.value as AdminCouponScope)}
                options={COUPON_SCOPES.map((value) => ({
                  value,
                  label: COUPON_SCOPE_LABELS[value],
                }))}
              />
            </AdminField>
            {appliesTo === "CATEGORY" ? (
              <AdminField
                label="Category"
                htmlFor="coupon-category"
                error={!categoryValid ? "Choose the category this coupon discounts." : null}
              >
                <NativeSelect
                  id="coupon-category"
                  label="Category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  options={[{ value: "", label: "Choose a category…" }, ...categoryOptions]}
                />
              </AdminField>
            ) : null}
            {appliesTo === "SELLER" ? (
              <AdminField
                label="Seller"
                htmlFor="coupon-seller"
                error={!sellerValid ? "Choose the seller this coupon discounts." : null}
              >
                <NativeSelect
                  id="coupon-seller"
                  label="Seller"
                  value={sellerId}
                  onChange={(event) => setSellerId(event.target.value)}
                  options={[{ value: "", label: "Choose a seller…" }, ...sellerOptions]}
                />
              </AdminField>
            ) : null}
            {appliesTo === "PRODUCT" ? (
              <AdminField
                label="Product"
                htmlFor="coupon-product"
                error={!productValid ? "Choose the product this coupon discounts." : null}
              >
                <NativeSelect
                  id="coupon-product"
                  label="Product"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  options={[{ value: "", label: "Choose a product…" }, ...productOptions]}
                />
              </AdminField>
            ) : null}

            <AdminField
              label="Stacks with other offers"
              htmlFor="coupon-stackable"
              hint="One code applies per order; this records the intent for reporting."
            >
              <NativeSelect
                id="coupon-stackable"
                label="Stacks with other offers"
                value={stackable ? "yes" : "no"}
                onChange={(event) => setStackable(event.target.value === "yes")}
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
              />
            </AdminField>
            <AdminField
              label="Discount the refundable deposit"
              htmlFor="coupon-deposit"
              hint="Off by default: a deposit is the customer's money, not a price."
            >
              <NativeSelect
                id="coupon-deposit"
                label="Discount the refundable deposit"
                value={allowDepositDiscount ? "yes" : "no"}
                onChange={(event) => setAllowDepositDiscount(event.target.value === "yes")}
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
              />
            </AdminField>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            {canDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={15} aria-hidden />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!canSave} onClick={submit}>
                {create.isPending || update.isPending ? (
                  <Loader2 size={15} aria-hidden className="animate-spin" />
                ) : null}
                {isEditing ? "Save changes" : "Create coupon"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AdminConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        subject={
          coupon ? `${coupon.code} · ${coupon.description ?? "no description"}` : "This coupon"
        }
        title="Delete this coupon?"
        body="The code stops working and the record is removed. This is only possible while the coupon has never been redeemed."
        confirmLabel="Delete coupon"
        tone="destructive"
        requireReason
        isSubmitting={remove.isPending}
        onConfirm={(reason) => {
          remove.mutate(reason, {
            onSuccess: () => {
              setDeleteOpen(false);
              onOpenChange(false);
            },
          });
        }}
      />
    </>
  );
}

/** An ISO timestamp to the `datetime-local` value the input expects, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** The inverse: a local `datetime-local` value to an ISO instant, or `null`. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
