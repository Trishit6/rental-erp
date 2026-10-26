p='src/features/notifications/components/NotificationPreferencesSection.tsx'
s=open(p).read()
# replace Toggle with Switch
old = '''/**
 * One switch.
 *
 * A `<button role="switch">` rather than a styled checkbox, because the shape is the
 * affordance: the pill slides, and `aria-checked` is what a screen reader announces. A
 * checkbox announces "checked" in a form context that does not exist here.
 */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}'''
new = '''import { Switch } from "@/components/ui/switch";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return <Switch aria-label={label} checked={checked} onCheckedChange={() => onChange()} />;
}'''
if old in s:
    s=s.replace(old,new)
open(p,'w').write(s)
print('ok')
