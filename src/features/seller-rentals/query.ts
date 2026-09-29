import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { RentalItem } from "@/lib/types";

export function useRentals() {
  return useQuery({
    queryKey: queryKeys.rentals,
    // `role=all` explicitly: the endpoint now defaults to the *renter's* rentals
    // (the customer "My Rentals" view). This dashboard has always shown both
    // sides of the table, and asking for it by name makes that explicit.
    queryFn: async () => (await api.get<RentalItem[]>("/rentals?role=all")).data,
  });
}

export function useRentalActions() {
  const queryClient = useQueryClient();
  return {
    async returnRental(id: number) {
      try {
        await api.post(`/rentals/${id}/return`);
        toast("Marked as returned. The owner will confirm the deposit.");
        void queryClient.invalidateQueries({ queryKey: queryKeys.rentals });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Couldn't mark as returned.");
      }
    },
    async cancelRental(id: number) {
      try {
        await api.post(`/rentals/${id}/cancel`);
        toast("Rental cancelled. Refund initiated to your mock wallet.");
        void queryClient.invalidateQueries({ queryKey: queryKeys.rentals });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Couldn't cancel the rental.");
      }
    },
    async buyNow(rentalId: number) {
      try {
        const { data } = await api.post<{ orderId: number; credit: number }>(
          `/rentals/${rentalId}/buy`,
        );
        toast(`Purchased! ₹${Math.round(data.credit / 100)} of rent credited.`);
        void queryClient.invalidateQueries({ queryKey: queryKeys.rentals });
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Rent-to-own failed.");
      }
    },
  };
}
