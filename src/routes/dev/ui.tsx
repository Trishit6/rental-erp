import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { StatCard } from "@/components/ui/stat-card";
import { Kbd } from "@/components/ui/kbd";
import { Stepper } from "@/components/ui/stepper";
import { SectionHeader } from "@/components/ui/section-header";

export const Route = createFileRoute("/dev/ui")({
  component: DevUI,
});

function DevUI() {
  const [page, setPage] = useState(1);
  if (!import.meta.env.DEV) {
    return <div className="p-8">Not available in production</div>;
  }
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <SectionHeader eyebrow="Dev" title="UI Primitives" description="Light/dark review" />
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-lg font-extrabold">Buttons</h3>
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-lg font-extrabold">Form</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Input" />
          <Textarea placeholder="Textarea" />
        </div>
        <div className="flex items-center gap-2">
          <Switch aria-label="Toggle" />
          <span className="text-sm">Switch</span>
        </div>
        <Progress value={40} aria-label="Progress" />
      </Card>
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-lg font-extrabold">Feedback</h3>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge>Secondary</Badge>
          <Badge>Outline</Badge>
        </div>
        <Alert>Default alert</Alert>
        <InlineNotice>Inline notice</InlineNotice>
        <Stepper steps={[{ label: "Cart" }, { label: "Details" }, { label: "Payment" }]} current={1} />
      </Card>
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-lg font-extrabold">Accordion</h3>
        <Accordion>
          <AccordionItem title="Item 1">Content 1</AccordionItem>
          <AccordionItem title="Item 2">Content 2</AccordionItem>
        </Accordion>
      </Card>
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-lg font-extrabold">Navigation</h3>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Products" }]} />
        <Pagination page={page} totalPages={3} onPageChange={setPage} />
      </Card>
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-lg font-extrabold">States</h3>
        <EmptyState title="No items" description="Nothing here yet" actionLabel="Browse" actionHref="/browse" />
        <ErrorState description="Failed to load" onRetry={() => {}} />
        <StatCard label="Users" value="1,234" />
        <div>
          <Kbd>⌘K</Kbd>
        </div>
      </Card>
    </div>
  );
}
