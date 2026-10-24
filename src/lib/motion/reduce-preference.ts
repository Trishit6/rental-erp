import { useSyncExternalStore } from "react";

/**
 * The in-app "Reduce animations" preference.
 *
 * Stored locally only: it is a non-sensitive *display* preference, the same
 * class of setting as the theme. No endpoint, no server sync, nothing worth
 * protecting — it must never confuse a privacy review into thinking it carries
 * account state.
 *
 * `MotionProvider` reads it to force `MotionConfig reducedMotion="always"`,
 * which collapsed every U4 effect to its defined final state. The OS
 * `prefers-reduced-motion` setting applies *in addition* through the "user"
 * mode when this preference is off, so honoring either channel is enough.
 */

const STORAGE_KEY = "revaro.reduceAnimations";

let currentValue = readStored();
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode / disabled storage: the OS setting still applies onward.
    return false;
  }
}

function setStored(value: boolean) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    // Re-read so a storage event or blocked write keeps state honest.
    currentValue = readStored();
  } catch {
    currentValue = value;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      currentValue = readStored();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setReduceAnimations(value: boolean) {
  setStored(value);
}

/** The preference, shared across every reader. Enables MotionConfig. */
export function useReduceAnimations(): boolean {
  return useSyncExternalStore(subscribe, () => currentValue, () => false);
}
