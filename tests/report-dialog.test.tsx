import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportDialog, REPORT_REASONS } from "@/features/safety/components/ReportDialog";
import { ReportButton } from "@/features/safety/components/ReportButton";
import * as safetyApi from "@/features/safety/api";
import type { ReportTarget } from "@/features/safety/types";

/**
 * The report form (PROMPT 18).
 *
 * The dialog is the one place a user turns a bad experience into a moderation row, so
 * the things worth pinning are: the reasons it offers fit the server's column, the
 * target and the typed details reach the API intact, and closing happens only after the
 * server has accepted it.
 *
 * The last test is load-bearing for every surface that renders the trigger — the dialog
 * (and its mutation hook) must not be constructed until it is opened, or merely showing
 * a "Report" button would demand a QueryClient the surface may not have.
 */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

vi.mock("@/features/safety/api", () => ({
  submitReport: vi.fn(),
}));

const TARGET: ReportTarget = { kind: "product", id: 42, label: "this listing" };

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(safetyApi.submitReport).mockResolvedValue({ id: 1 });
});

describe("the reasons offered", () => {
  it("fit the server's 32-character reason column", () => {
    for (const reason of REPORT_REASONS) {
      expect(reason.value.length).toBeGreaterThanOrEqual(3);
      expect(reason.value.length).toBeLessThanOrEqual(32);
    }
  });
});

describe("submitting a report", () => {
  it("sends the target, the reason and the typed details", async () => {
    const user = userEvent.setup();
    render(<ReportDialog target={TARGET} onOpenChange={vi.fn()} />, { wrapper });

    await user.type(screen.getByLabelText("Details"), "It looked counterfeit.");
    await user.click(screen.getByRole("button", { name: "Submit report" }));

    expect(safetyApi.submitReport).toHaveBeenCalledWith(TARGET, {
      reason: REPORT_REASONS[0].value,
      details: "It looked counterfeit.",
    });
  });

  it("closes only after the server accepts the report", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ReportDialog target={TARGET} onOpenChange={onOpenChange} />, { wrapper });

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open when the submission fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(safetyApi.submitReport).mockRejectedValueOnce(new Error("network"));

    render(<ReportDialog target={TARGET} onOpenChange={onOpenChange} />, { wrapper });
    await user.click(screen.getByRole("button", { name: "Submit report" }));

    // Losing a report to a transient error is the one outcome a report form must not
    // have, so a failed submit must not close the dialog.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("the trigger", () => {
  it("renders without a query client because the dialog is not mounted yet", () => {
    // No QueryClientProvider here on purpose.
    render(<ReportButton target={TARGET} />);

    expect(screen.getByTestId("report-button")).toBeDefined();
    expect(screen.getByRole("button", { name: "Report this listing" })).toBeDefined();
  });
});
