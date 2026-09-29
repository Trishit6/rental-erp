import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Handshake, Leaf, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    number: "01",
    icon: BadgeCheck,
    title: "Find your thing",
    description:
      "Explore thoughtfully shared finds from people in your neighbourhood. Every listing has clear rental and buy-it-now prices.",
  },
  {
    number: "02",
    icon: Handshake,
    title: "Meet your neighbour",
    description:
      "Agree on the dates and hand-off that work for you. Keep communication friendly, clear and on Revaro.",
  },
  {
    number: "03",
    icon: Leaf,
    title: "Enjoy more, waste less",
    description:
      "Use what you need, return it in good shape, and help good things find their next chapter.",
  },
];

export function HowItWorksPage() {
  return (
    <div className="page-wrap space-y-8 pb-8 pt-10">
      <section className="raised-surface rounded-[32px] px-6 py-10 text-center sm:px-10 sm:py-14">
        <span className="soft-button mx-auto flex size-14 items-center justify-center rounded-2xl text-accent">
          <ShieldCheck size={25} />
        </span>
        <p className="eyebrow mt-5">Good things, shared thoughtfully</p>
        <h1 className="mx-auto mt-2 max-w-2xl font-heading text-4xl font-black tracking-tight sm:text-5xl">
          More access. Less stuff.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Revaro makes it easy to borrow useful things nearby, earn from what you own, and give
          pre-loved pieces a second life.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link to="/browse">
            Explore the neighbourhood
            <ArrowRight size={15} />
          </Link>
        </Button>
      </section>
      <section className="grid gap-5 md:grid-cols-3">
        {steps.map(({ number, icon: Icon, title, description }) => (
          <Card key={number} className="p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <span className="inset-surface flex size-12 items-center justify-center rounded-2xl text-primary">
                <Icon size={21} />
              </span>
              <span className="font-heading text-3xl font-black text-primary/30">{number}</span>
            </div>
            <h2 className="mt-5 font-heading text-xl font-extrabold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </Card>
        ))}
      </section>
      <section className="dark-panel rounded-3xl px-6 py-8 text-center text-primary-foreground sm:px-10">
        <h2 className="font-heading text-2xl font-extrabold">
          Ready to make sharing your superpower?
        </h2>
        <p className="mt-2 text-sm text-primary-foreground/70">
          Start with one item, one weekend, one neighbour.
        </p>
        <Button asChild variant="secondary" className="mt-5">
          <Link to="/list">Share your first item</Link>
        </Button>
      </section>
    </div>
  );
}
