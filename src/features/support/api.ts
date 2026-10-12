import { api, type Pagination } from "@/lib/api/client";
import type {
  CreateTicketInput,
  HelpTopic,
  TicketDetail,
  TicketReplyInput,
  TicketStatus,
  TicketSummary,
} from "./types";

/**
 * Every network call the support feature makes.
 *
 * ## No user ids, anywhere
 *
 * `getTicket(id)` takes a *ticket* id; the server resolves the owner from the session
 * and answers `404` for a ticket that is not the caller's. There is deliberately no
 * `getTicket(userId, ticketId)` shape, because a client that could name a user id is a
 * client that could try to read someone else's.
 */

export async function getTickets(
  params: {
    page?: number;
    pageSize?: number;
    status?: TicketStatus;
  } = {},
): Promise<{ tickets: TicketSummary[]; pagination?: Pagination }> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  const result = await api.get<TicketSummary[]>(`/support/tickets${query ? `?${query}` : ""}`);
  return { tickets: result.data ?? [], pagination: result.pagination };
}

export async function getTicket(id: number): Promise<TicketDetail> {
  return (await api.get<TicketDetail>(`/support/tickets/${id}`)).data;
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<{ id: number; ticketNumber: string }> {
  return (await api.post<{ id: number; ticketNumber: string }>("/support/tickets", input)).data;
}

export async function replyToTicket(
  id: number,
  input: TicketReplyInput,
): Promise<{ messageId: number; status: TicketStatus }> {
  return (
    await api.post<{ messageId: number; status: TicketStatus }>(
      `/support/tickets/${id}/messages`,
      input,
    )
  ).data;
}

export async function reopenTicket(id: number): Promise<{ id: number; status: "OPEN" }> {
  return (await api.post<{ id: number; status: "OPEN" }>(`/support/tickets/${id}/reopen`)).data;
}

export async function rateTicket(
  id: number,
  input: { rating: number; comment?: string },
): Promise<{ id: number; rating: number }> {
  return (await api.post<{ id: number; rating: number }>(`/support/tickets/${id}/rating`, input))
    .data;
}

export async function getHelpTopics(query: string): Promise<HelpTopic[]> {
  return (
    (await api.get<HelpTopic[]>(`/support/help-topics?q=${encodeURIComponent(query)}`)).data ?? []
  );
}

export async function getDuplicateTicket(
  orderId: number,
): Promise<{ id: number; ticketNumber: string; subject: string; status: string } | null> {
  const result = await api.get<{
    ticket: { id: number; ticketNumber: string; subject: string; status: string } | null;
  }>(`/support/tickets/duplicate?orderId=${orderId}`);
  return result.data.ticket;
}
