import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessagesPage } from "@/features/messages";
import * as messagesQuery from "@/features/messages/query";
import type { ConversationSummary, MessageRecord } from "@/features/messages/types";

/**
 * `/messages` — the two-pane inbox.
 *
 * The three client-side decisions that are invisible in the query layer, and therefore
 * worth a component test: which thread opens by itself, what the search actually filters,
 * and what happens to a draft whose send fails. The last is the one with a user in it — a
 * message they typed and lost is worse than any error string.
 */

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  forget: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/messages/query", () => ({
  useConversations: vi.fn(),
  useMessages: vi.fn(),
  useSendMessage: vi.fn(),
}));

vi.mock("@/lib/tanstack-db/sync", () => ({
  forgetConversationMessages: mocks.forget,
}));

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    conversationId: 5,
    productId: 100,
    productTitle: "Apple MacBook Air M2",
    productSlug: "apple-macbook-air-m2",
    orderId: null,
    orderNumber: null,
    rentalId: null,
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    lastMessageBody: "Is this still available?",
    lastMessageIsMine: false,
    unread: 1,
    otherUser: { id: 7, name: "Priya S.", avatarUrl: null, isSeller: true },
    otherUserIsSeller: true,
    ...overrides,
  };
}

function message(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 700,
    senderId: 42,
    senderName: "You",
    body: "Hello",
    createdAt: "2026-01-01T00:00:00.000Z",
    isMine: true,
    ...overrides,
  };
}

function setConversations(rows: ConversationSummary[], extra: Record<string, unknown> = {}) {
  vi.mocked(messagesQuery.useConversations).mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as never);
}

function setMessages(rows: MessageRecord[], extra: Record<string, unknown> = {}) {
  vi.mocked(messagesQuery.useMessages).mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = {};

  vi.mocked(messagesQuery.useSendMessage).mockReturnValue({
    mutateAsync: mocks.send,
    isPending: false,
  } as never);

  setConversations([]);
  setMessages([]);
});

describe("the inbox's states", () => {
  it("says no conversations exist and how to start one", () => {
    render(<MessagesPage />);

    expect(screen.getByText("No conversations yet")).toBeDefined();
    expect(screen.getByRole("link", { name: "Browse listings" })).toBeDefined();
  });

  it("shows a skeleton while loading, not an empty inbox", () => {
    setConversations([], { data: undefined, isLoading: true });
    render(<MessagesPage />);

    // "No conversations yet" for an unanswered request is a false statement about the
    // user's account, which is the specific failure being guarded.
    expect(screen.queryByText("No conversations yet")).toBeNull();
  });

  it("offers a retry when the inbox fails to load", async () => {
    const refetch = vi.fn();
    setConversations([], { data: undefined, isError: true, refetch });
    render(<MessagesPage />);

    expect(screen.getByText("Couldn't load your messages")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("which thread opens", () => {
  it("auto-selects the newest thread when the URL names none", () => {
    setConversations([
      conversation({ conversationId: 5, lastMessageAt: "2026-01-01T00:00:00.000Z" }),
      conversation({ conversationId: 9, lastMessageAt: "2026-02-01T00:00:00.000Z" }),
    ]);

    render(<MessagesPage />);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/messages",
      search: { conversation: 9 },
      replace: true,
    });
  });

  it("does not fight a thread the user already opened", () => {
    mocks.search = { conversation: 5 };
    setConversations([conversation({ conversationId: 5 }), conversation({ conversationId: 9 })]);
    render(<MessagesPage />);

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not auto-select from an empty list", () => {
    // There is nothing to pick, and navigating to a conversation the server does not have
    // would be a request for an id that will 403.
    render(<MessagesPage />);

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("the search box", () => {
  it("narrows the loaded list by counterparty name", async () => {
    setConversations([
      conversation({
        conversationId: 5,
        otherUser: { id: 7, name: "Priya S.", avatarUrl: null, isSeller: true },
      }),
      conversation({
        conversationId: 6,
        otherUser: { id: 8, name: "Rahul K.", avatarUrl: null, isSeller: true },
        productTitle: "Sony WH-1000XM5",
      }),
    ]);
    mocks.search = { conversation: 5 };

    render(<MessagesPage />);
    await userEvent.type(screen.getByLabelText("Search your conversations"), "rahul");

    expect(screen.getByRole("button", { name: /Rahul K\./ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Priya S\./ })).toBeNull();
  });

  it("offers a way back when the term matches nothing", async () => {
    setConversations([conversation()]);
    mocks.search = { conversation: 5 };

    render(<MessagesPage />);
    await userEvent.type(screen.getByLabelText("Search your conversations"), "zzz");

    expect(screen.getByText(/No conversations match/)).toBeDefined();
  });
});

describe("selecting a conversation", () => {
  it("pushes a history entry, so back returns to the previous thread", async () => {
    setConversations([
      conversation({ conversationId: 5 }),
      conversation({
        conversationId: 6,
        otherUser: { id: 8, name: "Rahul K.", avatarUrl: null, isSeller: true },
      }),
    ]);
    mocks.search = { conversation: 5 };

    render(<MessagesPage />);
    await userEvent.click(screen.getByRole("button", { name: /Rahul K\./ }));

    // `replace: false` matters: a selection is a navigation the user expects the back
    // button to undo, unlike the auto-select above.
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/messages",
      search: { conversation: 6 },
      replace: false,
    });
  });

  it("renders the open thread's transcript", () => {
    setConversations([conversation({ conversationId: 5 })]);
    setMessages([message({ id: 1, body: "First message", isMine: false, senderName: "Priya S." })]);
    mocks.search = { conversation: 5 };

    render(<MessagesPage />);

    expect(screen.getByText("First message")).toBeDefined();
    // Three times, and all three are correct: the sidebar row, the thread header, and the
    // incoming bubble's sender attribution.
    expect(screen.getAllByText("Priya S.")).toHaveLength(3);
  });
});

describe("the composer", () => {
  it("cannot send an empty draft", () => {
    setConversations([conversation({ conversationId: 5 })]);
    mocks.search = { conversation: 5 };

    render(<MessagesPage />);

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByText("Write a message first.")).toBeDefined();
  });

  it("sends against the open conversation", async () => {
    setConversations([conversation({ conversationId: 5 })]);
    mocks.search = { conversation: 5 };
    mocks.send.mockResolvedValue(message());

    render(<MessagesPage />);
    await userEvent.type(screen.getByLabelText("Message"), "Is it in stock?");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(mocks.send).toHaveBeenCalledWith({ conversationId: 5, body: "Is it in stock?" });
  });

  it("restores the draft when the send fails", async () => {
    /*
     * The assertion with a user in it. A failed send must not empty the composer: the
     * text they typed would be gone, and the server's error toast does not give it back.
     */
    setConversations([conversation({ conversationId: 5 })]);
    mocks.search = { conversation: 5 };
    mocks.send.mockRejectedValue(new Error("network"));

    render(<MessagesPage />);
    await userEvent.type(screen.getByLabelText("Message"), "Is it in stock?");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByLabelText("Message")).toHaveValue("Is it in stock?");
  });
});

describe("private transcripts do not outlive the page", () => {
  it("drops the transcript from the reactive store on unmount", () => {
    setConversations([conversation({ conversationId: 5 })]);
    mocks.search = { conversation: 5 };

    const { unmount } = render(<MessagesPage />);
    expect(mocks.forget).not.toHaveBeenCalled();

    unmount();

    // Message bodies are the most sensitive rows in the application; the store must not
    // keep them after the screen that fetched them is gone.
    expect(mocks.forget).toHaveBeenCalledTimes(1);
  });
});
