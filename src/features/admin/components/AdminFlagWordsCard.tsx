import { useState } from "react";
import { Loader2, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAdminFlagWords, useSetAdminFlagWords } from "../query";

/**
 * The moderation flag-word list (PROMPT 29).
 *
 * ## A reading aid, not a rule
 *
 * The words do not hide anything or block a submission; the queue badges a review or
 * message that contains one so a moderator's eye lands there first. Making that
 * explicit in the copy matters — the moment a keyword list is assumed to *act*, the
 * list grows into a place where moderation policy is silently decided.
 *
 * ## Stored in `platform_settings`
 *
 * The value has to change at runtime, be attributed and not require a redeploy, which
 * is exactly what the single setting row is for. The editor sends a plain array and
 * the server normalises it (dedupe, trim, bound).
 */
export function AdminFlagWordsCard() {
  const flags = useAdminFlagWords();
  const save = useSetAdminFlagWords();
  const [draft, setDraft] = useState<string | null>(null);

  const words = flags.data ?? [];
  const value = draft ?? words.join(", ");
  const dirty = draft !== null && normalise(draft).join("|") !== words.join("|");

  function onSave() {
    save.mutate(normalise(value), { onSuccess: () => setDraft(null) });
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tags size={15} aria-hidden className="text-muted-foreground" />
        <h2 className="text-sm font-bold">Keyword flag list</h2>
        <span className="text-xs text-muted-foreground">
          {words.length === 0 ? "No words configured" : `${words.length} word(s)`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Reviews and messages containing one of these words are badged in the queue. Nothing is
        hidden or blocked automatically.
      </p>
      <Textarea
        aria-label="Flag words, comma or newline separated"
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="refund scam, abusive, counterfeit"
        rows={2}
        maxLength={2000}
      />
      <div className="flex justify-end gap-2">
        {dirty ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
            Reset
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={!dirty || save.isPending} onClick={onSave}>
          {save.isPending ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null}
          Save list
        </Button>
      </div>
    </Card>
  );
}

/** Split on commas or newlines, trim, drop blanks and case-insensitive duplicates. */
function normalise(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const word = part.trim();
    const key = word.toLowerCase();
    if (word && !seen.has(key)) {
      seen.add(key);
      out.push(word);
    }
  }
  return out;
}
