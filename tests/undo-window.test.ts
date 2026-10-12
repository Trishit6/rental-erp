import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUndoWindow } from "@/features/seller-orders/use-undo-window";

/**
 * The undo window (PROMPT 21).
 *
 * The hook's contract is what makes the bulk action safe: nothing is committed
 * until the window closes, an undo sends nothing at all, and a change the user
 * asked for is never dropped — not by a fast second click, and not by leaving the
 * page.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("useUndoWindow", () => {
  it("holds the commit until the window elapses", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useUndoWindow(commit, 5000));

    act(() => result.current.schedule("batch"));
    expect(commit).not.toHaveBeenCalled();
    expect(result.current.pending).toBe("batch");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(commit).toHaveBeenCalledWith("batch");
    expect(result.current.pending).toBeNull();
  });

  it("sends nothing when the batch is undone", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useUndoWindow(commit, 5000));

    act(() => result.current.schedule("batch"));
    act(() => result.current.undo());
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(commit).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it("commits a second batch's predecessor rather than dropping it", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useUndoWindow(commit, 5000));

    act(() => result.current.schedule("first"));
    act(() => result.current.schedule("second"));

    expect(commit).toHaveBeenCalledWith("first");
    expect(result.current.pending).toBe("second");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(commit).toHaveBeenLastCalledWith("second");
  });

  it("flushes a pending batch on unmount instead of silently dropping it", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result, unmount } = renderHook(() => useUndoWindow(commit, 5000));

    act(() => result.current.schedule("batch"));
    unmount();

    expect(commit).toHaveBeenCalledWith("batch");
  });
});
