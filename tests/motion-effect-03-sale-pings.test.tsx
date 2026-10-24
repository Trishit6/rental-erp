/**
 * U4 effect 03 — sale pings (client).
 *
 * framer-motion is mocked; the loop gate and the feed API are mocked; TanStack
 * Query runs for real against the mock, so the test sees exactly what the page
 * sees: a query gated on the kill switch, a cycle driven by the loop hook, and
 * pings that each show once and then leave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, act } from "@testing-library/react";
import { SalePings, PING_TICK_MS, PING_VISIBLE_MS, pingAgo, type ProofEvent } from "@/components/motion-effects/sale-pings";

const REDUCED = { current: false };
const LOOP_RUNNING = { current: true };
const FEED = { events: [] as ProofEvent[] | undefined };

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useReducedMotion: () => REDUCED.current,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children }: { to: string; params?: { slug: string }; children?: ReactNode }) => (
    <a href={to.replace("$slug", params?.slug ?? "")}>{children}</a>
  ),
}));

vi.mock("@/lib/motion/useVisibleLoop", () => ({
  useVisibleLoop: () => LOOP_RUNNING.current,
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    get: vi.fn(async () => ({ data: { events: FEED.events ?? [] } })),
  },
}));

const event = (over: Partial<ProofEvent> = {}): ProofEvent => ({
  kind: "bought",
  productTitle: "Ceramic Pour-Over Set",
  productSlug: "ceramic-pour-over",
  image: null,
  city: "Pune",
  bucket: "10-30 min",
  ...over,
});

function renderPings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 60_000 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SalePings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  REDUCED.current = false;
  LOOP_RUNNING.current = true;
  FEED.events = [event(), event({ kind: "rented", productTitle: "Bookshelf", productSlug: "bookshelf", city: null, bucket: "today" })];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ping copy (pure)", () => {
  it("renders buckets as coarse, honest time phrases", () => {
    expect(pingAgo("10-30 min")).toBe("10–30 min ago");
    expect(pingAgo("1 h")).toBe("about 1 h ago");
    expect(pingAgo("today")).toBe("earlier today");
  });
});

describe("SalePings", () => {
  it("shows the first event once the feed arrives, as a product link", async () => {
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("Someone just bought")).toBeInTheDocument();
    expect(screen.getByText(/Ceramic Pour-Over Set.*Pune.*10–30 min ago/s)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/product/ceramic-pour-over");
  });

  it("does not invent a place when the server withheld the city", async () => {
    FEED.events = [event({ city: null })];
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("Someone just bought")).toBeInTheDocument();
    expect(screen.getByText(/Ceramic Pour-Over Set.*10–30 min ago/s)).toBeInTheDocument();
  });

  it("advances to the next event after one full tick", async () => {
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    // Advance past the tick, then flush the "show" timer (0 ms delay) that the
    // tick's re-render schedules one pass later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_TICK_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText("Someone just rented")).toBeInTheDocument();
    expect(screen.getByText(/Bookshelf.*earlier today/s)).toBeInTheDocument();
  });

  it("takes each ping down after its visible window", async () => {
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_VISIBLE_MS + 1);
    });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing whenever the loop gate is closed", async () => {
    LOOP_RUNNING.current = false;
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_VISIBLE_MS * 3);
    });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing while reduced motion is on, and asks for no feed", async () => {
    REDUCED.current = true;
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_VISIBLE_MS * 3);
    });
    expect(screen.queryByRole("link")).toBeNull();
    const { api } = await import("@/lib/api/client");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows nothing from an empty feed — silence beats a lonely event", async () => {
    FEED.events = [];
    renderPings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_VISIBLE_MS * 3);
    });
    expect(screen.queryByRole("link")).toBeNull();
  });
});
