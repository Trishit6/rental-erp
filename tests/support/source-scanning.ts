/**
 * Helpers for tests that read a source file as its subject.
 *
 * ## Why this exists
 *
 * Several properties in this suite are not about behaviour but about *text*: that every
 * notification type has an emitter somewhere in `server/`, that no route in
 * `server/routes/messages.ts` accepts a participant from the client, that a page does not
 * `fetch()`. A test like that has to read the file, and then it has to decide what counts
 * as code — which turns out to be where these tests silently lose their teeth.
 *
 * The failure is specific and has already happened here. A drift test that searched every
 * file under `server/` for the token `ORDER_READY_FOR_PICKUP` matched the *doc comment on
 * the line that explained the bug it was written to prevent*, and so passed with the bug
 * still in place. A test that documents a defect while being structurally unable to see
 * it is worse than no test: it is a false reassurance in a file whose purpose is
 * assurance.
 *
 * So: strip comments first, then match. Both test files that read source as their subject
 * use these helpers rather than re-deriving the rules, because the rules are subtle and a
 * second, slightly different copy is how the first one went wrong.
 */

/**
 * Remove `/* … *\/` blocks and `//` line comments, preserving line structure.
 *
 * Line structure is preserved deliberately — callers index into the result with
 * `.split("\n")` to report *which line* offended, and collapsing the file to one line
 * would turn a useful failure message into a useless one.
 *
 * `//` is not stripped when it follows a colon, so the protocol in `"https://example.com"`
 * survives. Stripping there would truncate the rest of the line, which cannot create a
 * false *match* but can hide a real offender on that line.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Comment-stripped source, split into lines — what a "scan this file" assertion wants. */
export function codeLines(source: string): string[] {
  return stripComments(source).split("\n");
}

/**
 * Lines matching `pattern`, with their 1-based line numbers, for use in assertion messages.
 *
 * An offender list without line numbers produces a failure a reader has to go re-derive by
 * hand; with them, the failure is actionable without leaving the test run.
 */
export function offendingLines(source: string, pattern: RegExp): string[] {
  return codeLines(source)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, number }) => `${number}: ${line}`);
}
