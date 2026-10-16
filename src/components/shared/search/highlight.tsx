import { Fragment, type ReactNode } from "react";

/**
 * Highlight a suggestion's matched text by *splitting into React nodes*.
 *
 * There is deliberately no `dangerouslySetInnerHTML` and no string built with
 * markup and then parsed — the server's title or a category name can contain
 * `<script>` or any HTML, and a highlight helper is exactly the place a naive
 * join-with-`<mark>`-then-set-innerHTML implementation turns data into an
 * execution sink. Slicing into `<mark>` children leaves React owning every
 * text node, so `<`, `>` and script tags can only ever render as inert text.
 *
 * The match is per-token (`tokenizeQuery` mirrors the server's tokenizer), so
 * "gaming lap" marks `Gaming` in one title and both words wherever they fall —
 * case-insensitively, positions found by `.toLowerCase()` comparison only.
 */

/** Tokenize exactly like the server (`server/lib/search-suggest.ts#tokenize`). */
function splitTokens(query: string): string[] {
  const normalized = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return normalized.filter((token) => token.length > 0);
}

/**
 * Split `text` at the first occurrence of each query token (case-insensitive).
 *
 * Returns segments — unmatched text and matched text — while keeping the
 * original characters of `text` intact (never the query's). Tokens are tried
 * left to right; a token that no longer occurs after a match is skipped.
 */
export function highlightSegments(text: string, query: string): { value: string; matched: boolean }[] {
  const tokens = splitTokens(query);
  const lower = text.toLowerCase();

  const cuts: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    // Find an occurrence *outside* already-marked ranges, so overlapping
    // tokens neither symlink into a mark nor mark plain text twice.
    for (let index = lower.indexOf(token); index !== -1; index = lower.indexOf(token, index + 1)) {
      const end = index + token.length;
      if (cuts.every((cut) => end <= cut.start || index >= cut.end)) {
        cuts.push({ start: index, end });
        break;
      }
    }
  }

  if (cuts.length === 0) return [{ value: text, matched: false }];
  cuts.sort((a, b) => a.start - b.start);

  const segments: { value: string; matched: boolean }[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.start > cursor) segments.push({ value: text.slice(cursor, cut.start), matched: false });
    segments.push({ value: text.slice(cut.start, cut.end), matched: true });
    cursor = cut.end;
  }
  if (cursor < text.length) segments.push({ value: text.slice(cursor), matched: false });
  return segments;
}

/** The rendered highlight: plain segments stay plain Text, matches become `<mark>`. */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const segments = highlightSegments(text, query);
  if (segments.length === 1 && !segments[0].matched) return <>{text}</>;
  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={`${index}-${segment.matched ? "m" : "p"}`}>
          {segment.matched ? (
            <mark className="bg-transparent font-semibold text-foreground">{segment.value}</mark>
          ) : (
            segment.value
          )}
        </Fragment>
      ))}
    </>
  );
}
