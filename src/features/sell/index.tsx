import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ImagePlus, Repeat, Tag } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { publishListing, rupeesStringToPaise } from "./api";
import { initialSellForm, sellSteps, type SellForm } from "./types";
import { SellStepNav } from "./components/SellStepNav";
import { useSellCategories } from "./query";

export function ListItemPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SellForm>(initialSellForm);
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: categories } = useSellCategories();

  function update<K extends keyof SellForm>(field: K, value: SellForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addImageUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      toast("Use an image URL starting with http(s)://");
      return;
    }
    if (form.images.includes(url)) return;
    update("images", [...form.images, url]);
    setImageUrl("");
  }

  async function publish() {
    setSubmitting(true);
    try {
      if (!form.categoryId) {
        toast("Choose a category first.");
        setStep(1);
        return;
      }
      await publishListing({
        title: form.title,
        description: form.description,
        categoryId: form.categoryId,
        brand: form.brand || undefined,
        condition: form.condition,
        listingType: form.listingType,
        location: form.location,
        purchasePrice: rupeesStringToPaise(form.purchasePrice),
        rentalPricePerDay: rupeesStringToPaise(form.rentalPricePerDay),
        rentalPricePerWeek: rupeesStringToPaise(form.rentalPricePerWeek),
        rentalPricePerMonth: rupeesStringToPaise(form.rentalPricePerMonth),
        securityDeposit: rupeesStringToPaise(form.securityDeposit),
        quantity: Number(form.quantity) || 1,
        images: form.images,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast("Your item is live. Thanks for sharing!");
      void navigate({ to: "/dashboard/products" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't publish your listing.");
    } finally {
      setSubmitting(false);
    }
  }

  const canNext = (() => {
    switch (step) {
      case 0:
        return true; // photos optional
      case 1:
        return (
          form.title.trim().length >= 3 && form.description.trim().length >= 10 && !!form.categoryId
        );
      case 2:
        return true;
      case 3: {
        const wantsRent = form.listingType !== "SALE";
        const wantsSale = form.listingType !== "RENT";
        if (wantsRent && !form.rentalPricePerDay) return false;
        if (wantsSale && !form.purchasePrice) return false;
        return true;
      }
      case 4:
        return form.location.trim().length >= 2;
      default:
        return true;
    }
  })();

  return (
    <div className="page-wrap max-w-4xl space-y-7 pb-8 pt-8">
      <Link to="/" className="nav-link inline-flex items-center gap-1 text-sm font-semibold">
        <ArrowLeft size={15} />
        Back home
      </Link>
      <div>
        <p className="eyebrow">Give your things another life</p>
        <h1 className="section-title mt-1 text-3xl sm:text-4xl">List it. Earn from it.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Snap it → set rent + buy → get paid. Your listing goes live instantly.
        </p>
      </div>

      <SellStepNav step={step} onStepChange={setStep} />

      <Card className="p-5 sm:p-8">
        {step === 0 && (
          <div className="space-y-4">
            <div className="inset-surface flex min-h-40 flex-col items-center justify-center rounded-3xl p-5 text-center">
              <span className="soft-button flex size-12 items-center justify-center rounded-2xl text-primary">
                <ImagePlus size={21} />
              </span>
              <p className="mt-3 text-sm font-bold">Add photos of your item</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Paste image URLs for now (local uploads arrive with cloud storage). The first image
                becomes your cover.
              </p>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-bold">Image URL</span>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addImageUrl();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addImageUrl}>
                  Add
                </Button>
              </div>
            </label>
            {form.images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.images.map((url, index) => (
                  <div key={url} className="inset-surface relative rounded-2xl p-1.5">
                    <img src={url} alt="" className="size-20 rounded-xl object-cover" />
                    {index === 0 && (
                      <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Remove image"
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                      onClick={() =>
                        update(
                          "images",
                          form.images.filter((u) => u !== url),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-bold">What are you sharing?</span>
              <Input
                required
                maxLength={120}
                placeholder="e.g. Vintage lounge chair"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-bold">Describe it</span>
              <textarea
                className="inset-surface w-full rounded-2xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                rows={4}
                minLength={10}
                maxLength={5000}
                placeholder="Condition, quirks, what's included — anything a neighbour should know."
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">Category</span>
              <select
                className="inset-surface h-11 w-full rounded-full px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                value={form.categoryId ?? ""}
                onChange={(e) => update("categoryId", Number(e.target.value))}
              >
                <option value="" disabled>
                  Choose a category
                </option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">Brand (optional)</span>
              <Input
                value={form.brand}
                onChange={(e) => update("brand", e.target.value)}
                placeholder="e.g. Sony"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">Condition</span>
              <select
                className="inset-surface h-11 w-full rounded-full px-4 text-sm outline-none"
                value={form.condition}
                onChange={(e) => update("condition", e.target.value)}
              >
                {["NEW", "LIKE_NEW", "GOOD", "FAIR", "USED"].map((condition) => (
                  <option key={condition} value={condition}>
                    {condition.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">Tags (comma separated)</span>
              <Input
                value={form.tags}
                onChange={(e) => update("tags", e.target.value)}
                placeholder="camera, travel"
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm font-bold">How do you want to share it?</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { value: "SALE", icon: Tag, label: "Sell", hint: "One-time sale" },
                  { value: "RENT", icon: Repeat, label: "Rent", hint: "Earn per day" },
                  {
                    value: "BOTH",
                    icon: Camera,
                    label: "Rent + Sell",
                    hint: "Maximum flexibility",
                  },
                ] as const
              ).map(({ value, icon: Icon, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update("listingType", value)}
                  className={`flex flex-col items-center gap-2 rounded-3xl p-5 transition ${
                    form.listingType === value
                      ? "raised-surface ring-2 ring-primary"
                      : "inset-surface"
                  }`}
                >
                  <Icon
                    size={22}
                    className={
                      form.listingType === value ? "text-primary" : "text-muted-foreground"
                    }
                  />
                  <span className="text-sm font-extrabold">{label}</span>
                  <span className="text-[11px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {form.listingType !== "SALE" && (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Rental price per day (₹)</span>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="180"
                    value={form.rentalPricePerDay}
                    onChange={(e) => update("rentalPricePerDay", e.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Per week (₹, optional)</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="950"
                    value={form.rentalPricePerWeek}
                    onChange={(e) => update("rentalPricePerWeek", e.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Per month (₹, optional)</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="3200"
                    value={form.rentalPricePerMonth}
                    onChange={(e) => update("rentalPricePerMonth", e.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Security deposit (₹, optional)</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="500"
                    value={form.securityDeposit}
                    onChange={(e) => update("securityDeposit", e.target.value)}
                  />
                </label>
              </>
            )}
            {form.listingType !== "RENT" && (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Buy-it-now price (₹)</span>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="18500"
                    value={form.purchasePrice}
                    onChange={(e) => update("purchasePrice", e.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Quantity</span>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={form.quantity}
                    onChange={(e) => update("quantity", e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <label className="block space-y-2">
            <span className="text-sm font-bold">Your neighbourhood</span>
            <Input
              required
              maxLength={120}
              placeholder="e.g. Indiranagar, Bengaluru"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </label>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-background/90 text-foreground">
                {form.listingType === "BOTH"
                  ? "Rent + buy"
                  : form.listingType === "RENT"
                    ? "For rent"
                    : "For sale"}
              </Badge>
              <Badge className="bg-accent/10 text-accent">{form.condition.replace("_", " ")}</Badge>
            </div>
            <h2 className="font-heading text-xl font-extrabold">{form.title || "Untitled item"}</h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {form.description || "No description yet."}
            </p>
            {form.images.length > 0 && (
              <div className="inset-surface rounded-3xl p-3">
                <img
                  src={form.images[0]}
                  alt=""
                  className="aspect-[4/3] w-full rounded-2xl object-cover"
                />
              </div>
            )}
            <div className="inset-surface space-y-2 rounded-2xl p-4 text-sm">
              {form.listingType !== "SALE" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rent</span>
                  <span className="font-bold">₹{form.rentalPricePerDay || "—"}/day</span>
                </div>
              )}
              {form.listingType !== "RENT" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Buy</span>
                  <span className="font-bold">₹{form.purchasePrice || "—"}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span className="font-bold">{form.location || "—"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="mt-7 flex items-center justify-between gap-3 border-t border-border/70 pt-5">
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < sellSteps.length - 1 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight size={15} />
            </Button>
          ) : (
            <Button size="lg" onClick={publish} disabled={submitting}>
              {submitting ? "Publishing..." : "Publish your listing"}
              <CheckCircle2 size={16} />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
