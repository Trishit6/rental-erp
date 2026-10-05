/**
 * Cross-tab session synchronisation.
 *
 * ## The problem this solves
 *
 * The session lives in an httpOnly cookie, which the browser will not let JavaScript
 * read or write. That is exactly what makes it secure, and it has one consequence worth
 * being explicit about: a tab has *no* way to learn on its own that a different tab just
 * signed in or out. Without a signal, signing out in one tab leaves the other rendering
 * the previous user's name, avatar, unread badge and account menu — reading cached data
 * that the server has already stopped authorising.
 *
 * ## What is signalled, and what is not
 *
 * Only a coarse event travels: "the auth state changed, go and ask the server." The
 * **identity itself is never broadcast**. No user id, name, email or role is written to
 * `localStorage` or posted on a channel — a message another page can read would leak the
 * signed-in user's details into storage that outlives the session and survives logout.
 * A receiver always re-fetches `/auth/me`, so the authoritative answer still comes from
 * the cookie and the database.
 *
 * ## Why both transports
 *
 * `BroadcastChannel` is the right tool and is not universally available — jsdom does not
 * implement it, and older Safari does not either. `localStorage`'s `storage` event
 * covers those. Writing a key is enough to make the event fire in *other* documents; the
 * writer does not receive its own event, which is exactly the semantics wanted here.
 *
 * The value is a timestamp rather than a counter so that two tabs which somehow
 * coincidentally write in the same millisecond still produce a changing value and cannot
 * leave a listener comparing a string to itself forever.
 */

export type AuthChangeEvent = "signed-in" | "signed-out";

const STORAGE_KEY = "revaro:auth-event";

type Listener = (event: AuthChangeEvent) => void;

const listeners = new Set<Listener>();

function isAuthChangeEvent(value: unknown): value is AuthChangeEvent {
  return value === "signed-in" || value === "signed-out";
}

function deliver(event: AuthChangeEvent) {
  for (const listener of listeners) listener(event);
}

/**
 * Tell other tabs that the auth state changed.
 *
 * Best-effort by design: a browser with storage disabled throws on `setItem`, and that
 * must not turn a successful sign-in into a failed one. The in-tab listeners still fire —
 * synchronising other tabs is a convenience layered on top of a mutation that has already
 * succeeded against the server.
 */
export function publishAuthChange(event: AuthChangeEvent): void {
  deliver(event);
  try {
    window.localStorage.setItem(STORAGE_KEY, `${event}:${Date.now()}`);
  } catch {
    // Private-mode or storage-disabled browser. Nothing to do.
  }
}

/**
 * Subscribe to auth changes from other tabs. Returns an unsubscribe function.
 *
 * Both listeners are registered together and torn down together, so a caller never has
 * to know which transport actually worked on the browser it is running on.
 */
export function subscribeToAuthChanges(listener: Listener): () => void {
  listeners.add(listener);

  const channel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("revaro:auth") : null;
  if (channel) {
    channel.onmessage = (message: MessageEvent) => {
      if (isAuthChangeEvent(message.data)) deliver(message.data);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || typeof event.newValue !== "string") return;
    const [name] = event.newValue.split(":");
    if (isAuthChangeEvent(name)) deliver(name);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}