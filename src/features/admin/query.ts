import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export type AdminStats = {
  users: number;
  products: number;
  orders: number;
  rentals: number;
  reviews: number;
  openReports: number;
  grossVolume: number;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
};

export type AdminProduct = {
  id: number;
  title: string;
  status: string;
  sellerName: string;
};

export type AdminReport = {
  id: number;
  reason: string;
  details: string | null;
  status: string;
};

export function useAdminStats() {
  return useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: async () => (await api.get<AdminStats>("/admin/stats")).data,
  });
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: async () => (await api.get<AdminUser[]>("/admin/users")).data,
    enabled,
  });
}

export function useAdminProducts(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminProducts,
    queryFn: async () => (await api.get<AdminProduct[]>("/admin/products")).data,
    enabled,
  });
}

export function useAdminReports(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminReports,
    queryFn: async () => (await api.get<AdminReport[]>("/admin/reports")).data,
    enabled,
  });
}

export function useAdminActions() {
  const queryClient = useQueryClient();
  return {
    async suspendUser(id: number, suspend: boolean) {
      await api.patch(`/admin/users/${id}/${suspend ? "suspend" : "unsuspend"}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      toast(suspend ? "User suspended" : "User restored");
    },
    async setProductStatus(id: number, status: string) {
      await api.patch(`/admin/products/${id}/status`, { status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      toast("Product status updated");
    },
    async resolveReport(id: number, status: string) {
      await api.patch(`/admin/reports/${id}`, { status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReports });
    },
  };
}
