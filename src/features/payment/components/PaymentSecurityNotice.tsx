import { ShieldCheck, Lock } from "lucide-react";

/**
 * The trust notice.
 *
 * It says two things that are both true and both easy to get wrong: credentials
 * are handled by the provider rather than by Revaro, and the amount is
 * confirmed on the server. The second one is a real guarantee — the browser
 * cannot change what is charged — so it is worth stating plainly.
 */
export function PaymentSecurityNotice({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ul className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-start gap-2">
          <Lock size={12} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            Card and UPI details are entered on your payment provider&apos;s secure page. Revaro
            never sees or stores them.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            The amount is calculated and confirmed on our servers. If it changes before you pay,
            we will stop and ask you to review it.
          </span>
        </li>
      </ul>
    </div>
  );
}
