import { motion } from "framer-motion";
import { HeartHandshake, Search, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

const STEPS: { icon: LucideIcon; number: string; title: string; detail: string }[] = [
  {
    icon: Search,
    number: "01",
    title: "Find it",
    detail: "Browse rentals and pre-loved finds from neighbours nearby.",
  },
  {
    icon: ShoppingBag,
    number: "02",
    title: "Rent or buy",
    detail: "Book it for a weekend, or make it yours outright.",
  },
  {
    icon: HeartHandshake,
    number: "03",
    title: "Enjoy it — or make it yours",
    detail: "Return it when you're done, or keep it with rent-to-own.",
  },
];

/** Clean icon-based three-step section — no cartoon illustrations (spec §26). */
export function HowItWorks() {
  return (
    <section className="space-y-5" aria-labelledby="how-heading">
      <div>
        <p className="eyebrow">Simple by design</p>
        <h2 id="how-heading" className="section-title mt-1">
          How ReLoop works
        </h2>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
          >
            <Card className="h-full p-6">
              <div className="flex items-center justify-between">
                <span className="inset-surface flex size-12 items-center justify-center rounded-2xl text-primary">
                  <step.icon size={21} aria-hidden />
                </span>
                <span className="font-heading text-3xl font-black text-primary/30">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-5 font-heading text-xl font-extrabold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
