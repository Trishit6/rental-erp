import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  fetchImageUploadConfig,
  objectKeyFromUrl,
  uploadAvatarImage,
  validateImageFile,
  type ImageUploadConfig,
} from "@/lib/storage";
// The profile mutations write the *session user*, not a profile-shaped cache entry, so
// the mutation that owns that cache entry lives with the auth feature. Importing it from
// `@/features/auth/query` rather than re-declaring one here is deliberate: a second copy
// would be a second thing that has to remember to update `queryKeys.auth`, and forgetting
// would show a stale name in the header next to a correct profile form.
import { useUpdateProfileMutation } from "@/features/auth/query";

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

/**
 * The image limits, for refusing a bad file before a byte leaves the browser.
 *
 * Deferred rather than loaded eagerly: a visitor who opens their profile to change a phone
 * number should not pay for a storage round trip. The server re-checks the MIME type and
 * size independently — this is a faster error message, never the boundary.
 */
export function useAvatarUploadConfig(enabled: boolean) {
  return useQuery({
    queryKey: ["storage", "config"],
    queryFn: fetchImageUploadConfig,
    enabled,
    // Deployment-fixed limits, so this never needs revalidating once fetched.
    staleTime: Infinity,
  });
}

/**
 * Replace the signed-in user's profile picture.
 *
 * ## Order of operations, and why it is this one
 *
 * Upload, then save the URL, then delete the previous object — never the other way round.
 * If the save fails, the account still points at the picture it had, so the worst outcome
 * is an unreferenced file sitting in storage. Deleting first would trade that invisible
 * problem for a real one: a saved avatar URL pointing at an object that no longer exists,
 * which renders as a broken image everywhere the user appears.
 *
 * The final delete is fired and forgotten. It is not awaited into the error path, so an
 * orphaned file cannot turn an action the user can see succeed into a reported failure.
 */
export function useAvatarMutation(currentAvatarUrl: string | null | undefined) {
  const updateProfile = useUpdateProfileMutation();

  return useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadAvatarImage(file);
      await updateProfile.mutateAsync({ avatarUrl: uploaded.publicUrl });

      const previousKey = currentAvatarUrl ? objectKeyFromUrl(currentAvatarUrl) : null;
      if (previousKey && previousKey !== uploaded.key) {
        void api.delete("/storage/object", { key: previousKey }).catch(() => undefined);
      }
      return uploaded;
    },
  });
}

/**
 * Remove the profile picture.
 *
 * Sets `avatarUrl` to `null` rather than uploading a placeholder: the shared `Avatar`
 * component already draws a name-derived initial for a null url, so clearing the column is
 * both the correct data change and the cheapest one. The old object is deleted by the same
 * best-effort rule as `useAvatarMutation`.
 */
export function useRemoveAvatarMutation(currentAvatarUrl: string | null | undefined) {
  const updateProfile = useUpdateProfileMutation();

  return useMutation({
    mutationFn: async () => {
      await updateProfile.mutateAsync({ avatarUrl: null });
      const key = currentAvatarUrl ? objectKeyFromUrl(currentAvatarUrl) : null;
      if (key) {
        void api.delete("/storage/object", { key }).catch(() => undefined);
      }
    },
  });
}

export { validateImageFile };
export type { ImageUploadConfig };