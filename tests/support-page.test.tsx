import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupportPage } from "@/features/support";
import { TicketDetailPage } from "@/features/support/ticket-page";
import type { TicketDetail, TicketSummary } from "@/features/support/types";

/**
 * The customer's support surfaces (PROMPT 19).
 *
 * The three decisions invisible in the query layer, and therefore worth a component
 * test: what a ticket with no replies shows, that a thread labels a staff line as
 * Support, and that a resolved ticket offers reopen + rating instead of a reply box
 * the server would reject.
 */

const mocks = vi.hoisted(() => ({
  list: { data: { tickets: [] as TicketSummary[] }, isLoading: false, isError: false },
  ticket: { data: null as TicketDetail | null, isLoading: false, isError: false },
  topics: { data: [] as { id: string; title: string }[] },
  duplicate: { data: null as { ticketNumber: string; subject: string; status: string } | null },
  create: vi.fn(),
  reply: vi.fn(),
  reopen: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to?: unknown; children?: ReactNode }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/support/query", () => ({
  useTickets: () => ({ ...mocks.list, refetch: vi.fn() }),
  useTicket: () => ({ ...mocks.ticket, refetch: vi.fn() }),
  useHelpTopics: () => mocks.topics,
  useDuplicateTicket: () => mocks.duplicate,
  useCreateTicket: () => ({ mutate: mocks.create, isPending: false }),
  useReplyToTicket: () => ({ mutate: mocks.reply, isPending: false }),
  useReopenTicket: () => ({ mutate: mocks.reopen, isPending: false }),
  useRateTicket: () => ({ mutate: mocks.rate, isPending: false }),
  supportErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong.",
}));

function ticketSummary(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: 5,
    ticketNumber: "TK-2026-000005",
    subject: "Refund never arrived",
    status: "OPEN",
    priority: "HIGH",
    orderId: null,
    rentalId: null,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:05:00.000Z",
    resolvedAt: null,
    closedAt: null,
    resolutionRating: null,
    messageCount: 1,
    ...overrides,
  };
}

function ticketDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    ...ticketSummary(),
    messages: [
      {
        id: 1,
        body: "It has been two weeks.",
        createdAt: "2026-05-01T10:00:00.000Z",
        authorId: 42,
        authorName: "You",
        authorIsStaff: false,
        attachments: [],
      },
      {
        id: 2,
        body: "We are looking into it now.",
        createdAt: "2026-05-01T10:05:00.000Z",
        authorId: 7,
        authorName: "Aarav",
        authorIsStaff: true,
        attachments: [],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.list = { data: { tickets: [] }, isLoading: false, isError: false };
  mocks.ticket = { data: null, isLoading: false, isError: false };
  mocks.topics = { data: [] };
  mocks.duplicate = { data: null };
  mocks.create.mockReset();
  mocks.reply.mockReset();
  mocks.reopen.mockReset();
  mocks.rate.mockReset();
});

describe("the support centre", () => {
  it("shows an empty state when there are no tickets", () => {
    render(<SupportPage />);
    expect(screen.getByText("No tickets yet")).toBeInTheDocument();
  });

  it("lists tickets with their number and status", () => {
    mocks.list = {
      data: {
        tickets: [
          ticketSummary(),
          ticketSummary({ id: 6, ticketNumber: "TK-2026-000006", subject: "Damaged item" }),
        ],
      },
      isLoading: false,
      isError: false,
    };
    render(<SupportPage />);

    expect(screen.getByText("Refund never arrived")).toBeInTheDocument();
    expect(screen.getByText("Damaged item")).toBeInTheDocument();
    expect(screen.getByText("TK-2026-000005")).toBeInTheDocument();
  });

  it("opens straight into composing when linked to an order", () => {
    render(<SupportPage orderId={12} />);
    expect(screen.getByTestId("ticket-form")).toBeInTheDocument();
    expect(screen.getByText(/About order #12/)).toBeInTheDocument();
  });
});

describe("opening a ticket", () => {
  it("submits the trimmed subject and body", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: /New ticket/i }));
    await user.type(screen.getByLabelText("Subject"), "  Refund  ");
    await user.type(screen.getByLabelText("What happened?"), "  It never arrived  ");
    await user.click(screen.getByRole("button", { name: /Open ticket/i }));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Refund", body: "It never arrived" }),
      expect.anything(),
    );
  });

  it("warns about an existing open ticket for the same order", () => {
    mocks.duplicate = {
      data: { ticketNumber: "TK-2026-000001", subject: "Already open", status: "OPEN" },
    };
    render(<SupportPage orderId={12} />);
    expect(screen.getByRole("status")).toHaveTextContent("TK-2026-000001");
  });
});

describe("a ticket thread", () => {
  it("labels a staff reply as Support and offers a reply box while open", () => {
    mocks.ticket = { data: ticketDetail(), isLoading: false, isError: false };
    render(<TicketDetailPage ticketId={5} />);

    const thread = screen.getByTestId("ticket-thread");
    expect(within(thread).getByText("Aarav · Support")).toBeInTheDocument();
    expect(within(thread).getByText("It has been two weeks.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reopen ticket/i })).not.toBeInTheDocument();
  });

  it("offers reopen and rating instead of a composer once resolved", () => {
    mocks.ticket = {
      data: ticketDetail({ status: "RESOLVED", resolvedAt: "2026-05-02T10:00:00.000Z" }),
      isLoading: false,
      isError: false,
    };
    render(<TicketDetailPage ticketId={5} />);

    expect(screen.getByRole("button", { name: /Reopen ticket/i })).toBeInTheDocument();
    expect(screen.getByTestId("ticket-rating")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
  });

  it("shows the saved rating once a resolved ticket has been rated", () => {
    mocks.ticket = {
      data: ticketDetail({ status: "CLOSED", resolutionRating: 4 }),
      isLoading: false,
      isError: false,
    };
    render(<TicketDetailPage ticketId={5} />);

    expect(screen.getByTestId("ticket-rating-saved")).toHaveTextContent("4/5");
    expect(screen.queryByTestId("ticket-rating")).not.toBeInTheDocument();
  });
});
