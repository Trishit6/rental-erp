import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductForm } from "./components/ProductForm";
import {
  EMPTY_PRODUCT_FORM,
  productFormIssues,
  productFormSchema,
  toFormValues,
  toPayload,
  type ProductFormIssue,
  type ProductFormValues,
} from "./components/schema";
import {
  useCreateSellerProduct,
  useSellerProduct,
  useStorageConfig,
  useUpdateSellerProduct,
} from "./query";
import { useCategoryOptions } from "@/lib/categories";
import { ApiError } from "@/lib/api/client";

/**
 * Create a listing — `/dashboard/products/new`.
 *
 * Replaces the six-step wizard that used to live at `/list`. The wizard's real
 * problem was not its shape, it was that it was a *second* place a listing could
 * be created, with its own validation and its own idea of what a listing needs.
 * Two forms means the rules drift: the wizard never asked for a rental duration
 * and never uploaded a photo, and it published immediately with no draft to
 * review. This is one form, used for both create and edit, that starts as a draft.
 */
export function NewProductPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [issues, setIssues] = useState<ProductFormIssue[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const storageConfig = useStorageConfig();
  const categories = useCategoryOptions();
  const createProduct = useCreateSellerProduct();

  async function submit() {
    setSubmitError(null);
    const parsed = productFormSchema.safeParse(values);
    if (!parsed.success) {
      setIssues(productFormIssues(parsed.error));
      return;
    }
    setIssues([]);
    try {
      const created = await createProduct.mutateAsync(toPayload(values));
      void navigate({
        to: "/dashboard/products/$productId/edit",
        params: { productId: String(created.id) },
      });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Couldn't save that listing.",
      );
    }
  }

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-10 pt-8">
      <Link
        to="/dashboard/products"
        className="nav-link inline-flex items-center gap-1 text-sm font-semibold"
      >
        <ArrowLeft size={15} aria-hidden />
        Back to listings
      </Link>

      <header>
        <p className="eyebrow">New listing</p>
        <h1 className="section-title mt-1 text-3xl sm:text-4xl">What are you listing?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It saves as a draft. Nothing is public until you publish it from your listings, so you can
          come back and check it first.
        </p>
      </header>

      {categories.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Loading categories…</p>
        </Card>
      ) : (
        <ProductForm
          mode="create"
          values={values}
          onChange={setValues}
          onSubmit={() => void submit()}
          submitting={createProduct.isPending}
          issues={issues}
          storageConfig={storageConfig}
          categories={categories}
          submitError={submitError}
        />
      )}
    </div>
  );
}

/**
 * Edit a listing — `/dashboard/products/$productId/edit`.
 *
 * There was no edit screen at all before this. The listings page offered a status
 * toggle and a delete, and a seller who wanted to correct a price or swap a photo
 * had no route to do it — so the only way to change a listing was to delete it
 * and create it again, which destroyed the URL, the view count, the reviews and
 * the ranking. (And for anything that had sold, it simply failed: the delete was
 * a hard delete against a `restrict` foreign key.)
 *
 * The one read this needs is `GET /seller/products/:id`, which returns the whole
 * listing plus its images, tags and reference counts in a single request —
 * ownership is in the server's predicate, so another seller's id is a 404 rather
 * than a 403 that would confirm the listing exists.
 */
export function EditProductPage() {
  const { productId } = useParams({ from: "/dashboard/products/$productId/edit" });
  const navigate = useNavigate();
  const id = Number(productId);

  const [values, setValues] = useState<ProductFormValues | null>(null);
  const [issues, setIssues] = useState<ProductFormIssue[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const storageConfig = useStorageConfig();
  const categories = useCategoryOptions();
  const updateProduct = useUpdateSellerProduct(id);
  const { data: product, isLoading, isError } = useSellerProduct(id);

  // Seed the form once per loaded product. Deriving it during render (rather than
  // in an effect) means the first paint after the read already has the values —
  // an effect would show an empty form for a frame and then fill it, which on a
  // long description is a visible flash of "you have lost your listing".
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (product && seededFor !== product.id) {
    setSeededFor(product.id);
    setValues(toFormValues(product));
  }

  async function submit() {
    if (!values) return;
    setSubmitError(null);
    const parsed = productFormSchema.safeParse(values);
    if (!parsed.success) {
      setIssues(productFormIssues(parsed.error));
      return;
    }
    setIssues([]);
    try {
      await updateProduct.mutateAsync(toPayload(values));
      void navigate({ to: "/dashboard/products" });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't save your changes.");
    }
  }

  if (isLoading) return <EditSkeleton />;

  if (isError || !product) {
    return (
      <div className="page-wrap max-w-2xl space-y-5 pt-10">
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="soft-button flex size-12 items-center justify-center rounded-2xl text-primary">
            <PackageOpen size={22} aria-hidden />
          </span>
          <h1 className="font-heading text-lg font-extrabold">Listing not found</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have been removed, or it belongs to another seller — the two look the same on
            purpose, so this page can't be used to find out which.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link to="/dashboard/products">Back to listings</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-10 pt-8">
      <Link
        to="/dashboard/products"
        className="nav-link inline-flex items-center gap-1 text-sm font-semibold"
      >
        <ArrowLeft size={15} aria-hidden />
        Back to listings
      </Link>

      <header>
        <p className="eyebrow">Edit listing</p>
        <h1 className="section-title mt-1 text-3xl sm:text-4xl">{product.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Changes go live as soon as you save — including price and photos, which customers see
          immediately.
        </p>
      </header>

      {product.status === "ARCHIVED" && (
        <Card className="border-amber-500/30 bg-amber-500/8 p-4">
          <p className="text-sm font-semibold">This listing is archived.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Its history is intact, but it can't be edited while archived — the server refuses, so
            the form is read-only rather than letting you type into something that will be rejected.
          </p>
        </Card>
      )}

      {values && (
        <fieldset disabled={product.status === "ARCHIVED"} className="space-y-5">
          <ProductForm
            mode="edit"
            values={values}
            onChange={setValues}
            onSubmit={() => void submit()}
            submitting={updateProduct.isPending}
            submitLabel="Save changes"
            issues={issues}
            storageConfig={storageConfig}
            categories={categories}
            submitError={submitError}
          />
        </fieldset>
      )}

      {product.references.blocking > 0 && (
        <p className="text-xs text-muted-foreground">
          This listing has {product.references.orders} order
          {product.references.orders === 1 ? "" : "s"} and {product.references.reviews} review
          {product.references.reviews === 1 ? "" : "s"} against it, so it can be archived but not
          deleted.
        </p>
      )}
    </div>
  );
}

function EditSkeleton() {
  return (
    <div className="page-wrap max-w-3xl space-y-5 pt-8" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-2/3" />
      <Card className="space-y-4 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-11 w-full rounded-full" />
      </Card>
      <Card className="space-y-4 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 w-full rounded-full" />
      </Card>
      <span className="sr-only">Loading the listing…</span>
    </div>
  );
}
