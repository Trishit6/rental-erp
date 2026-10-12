import { motion } from "framer-motion";
import { HeartHandshake, Search, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useHomeBlocks } from "../query";

/**
 * The three-step "how it works" band.
 *
 * ## Editable without a developer
 *
 * The copy comes from the `home.how_it_works` CMS block when one is published, and from
 * the constants below otherwise. The *icons* and the numbering stay in code on purpose:
 * they are the design's, not the editor's, and getting them from data would mean an
 * administrator could publish a step with no icon or a wrong count. A block supplies
 * text; the layout and its three-variant icon set remain fixed.
 */

type Step = { icon: LucideIcon; title: string; detail: string };

const FALLBACK_TITLE = "How Revaro works";

const FALLBACK_STEPS: Omit<Step, "icon">[] = [
  { title: "Find it", detail: "Browse rentals and pre-loved finds from neighbours nearby." },
  { title: "Rent or buy", detail: "Book it for a weekend, or make it yours outright." },
  { title: "Enjoy it — or make it yours", detail: "Return it when you're done, or keep it with rent-to-own." },
];

const STEP_ICONS: LucideIcon[] = [Search, ShoppingBag, HeartHandshake];

/** Read `steps` out of untyped block content, ignoring anything malformed. */
function readSteps(value: unknown): Omit<Step, "icon">[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : "";
      const detail = typeof record.body === "string" ? record.body : "";
      return title && detail ? { title, detail } : null;
    })
    .filter((entry): entry is Omit<Step, "icon"> => entry !== null);
}

export function HowItWorks() {
  const blocks = useHomeBlocks();
  const block = blocks.data?.["home.how_it_works"];
  const title = typeof block?.title === "string" && block.title.trim() !== "" ? block.title : FALLBACK_TITLE;
  const cmsSteps = readSteps(block?.steps);
  const steps = cmsSteps.length > 0 ? cmsSteps : FALLBACK_STEPS;

  return (
    <section className="space-y-5" aria-labelledby="how-heading">
      <div>
        <p className="eyebrow">Simple by design</p>
        <h2 id="how-heading" className="section-title mt-1">
          {title}
        </h2>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = STEP_ICONS[index % STEP_ICONS.length];
          return (
            <motion.div
              key={`${index}-${step.title}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
            >
              <Card className="h-full p-6">
                <div className="flex items-center justify-between">
                  <span className="inset-surface flex size-12 items-center justify-center rounded-2xl text-primary">
                    <Icon size={21} aria-hidden />
                  </span>
                  <span className="font-heading text-3xl font-black text-primary/30">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-xl font-extrabold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
