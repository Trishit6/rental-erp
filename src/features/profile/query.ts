import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export type Address = {
  id: number;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
};

export const addressKeys = { all: ["addresses"] as const };

export function useAddresses() {
  return useQuery({
    queryKey: addressKeys.all,
    queryFn: async () => (await api.get<Address[]>("/addresses")).data,
  });
}

export function useAddressMutations() {
  const queryClient = useQueryClient();
  return {
    async addAddress(payload: Record<string, unknown>) {
      await api.post("/addresses", payload);
      void queryClient.invalidateQueries({ queryKey: addressKeys.all });
    },
    async removeAddress(id: number) {
      await api.delete(`/addresses/${id}`);
      void queryClient.invalidateQueries({ queryKey: addressKeys.all });
    },
  };
}
