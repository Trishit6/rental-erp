import { sellSteps } from "../types";

export function SellStepNav({
  step,
  onStepChange,
}: {
  step: number;
  onStepChange: (step: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {sellSteps.map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() => index <= step && onStepChange(index)}
          className={`rounded-full px-4 py-2 text-xs font-bold transition ${
            index === step
              ? "primary-button text-primary-foreground"
              : index < step
                ? "soft-button text-accent"
                : "inset-surface text-muted-foreground"
          }`}
        >
          {index + 1}. {label}
        </button>
      ))}
    </div>
  );
}
