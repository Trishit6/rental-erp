import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { validateImageFile } from "@/lib/storage";
import type { User as AccountUser } from "@/features/auth/types";
import { useAvatarMutation, useAvatarUploadConfig, useRemoveAvatarMutation } from "../query";

/**
 * Profile picture.
 *
 * ## Why there is no bespoke uploader here
 *
 * Avatars go through `@/lib/storage`, which asks the API for a single-object upload target
 * and PUTs the bytes to it — the same path listing photography takes. Building a second
 * uploader for one field would mean a second set of MIME and size checks, a second place
 * for an unbounded upload, and a second opinion about what a valid key looks like. The
 * server keys every object as `<scope>/<ownerId>/…`, so an avatar lands under the caller's
 * own prefix and nobody else's.
 *
 * ## Why the file is validated before it is sent
 *
 * `validateImageFile` gives an instant, plain explanation instead of a failed upload after
 * several seconds on a phone connection. It is a courtesy, not a boundary — the server
 * re-checks the type, the size and the key prefix independently, because a client check is
 * a hint and never a guarantee.
 */
export function AvatarCard({ user }: { user: AccountUser }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Only fetched once someone actually opens the picker, so the limits are in hand before
  // a file is chosen without every profile view paying for a storage request.
  const [picking, setPicking] = useState(false);
  const { data: config } = useAvatarUploadConfig(picking);

  const upload = useAvatarMutation(user.avatarUrl);
  const remove = useRemoveAvatarMutation(user.avatarUrl);
  const busy = upload.isPending || remove.isPending;

  async function handleFile(file: File) {
    if (!config) {
      toast.error("Image uploads are unavailable right now.");
      return;
    }
    const problem = validateImageFile(file, config);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to upload your photo. Please try again.",
      );
    } finally {
      // Clear the input so choosing the *same* file twice in a row still fires a change
      // event — otherwise the second pick is silently ignored as "no change".
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    try {
      await remove.mutateAsync();
      toast.success("Profile photo removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove your photo. Please try again.",
      );
    }
  }

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="font-heading text-lg font-extrabold">Profile photo</h2>
        <p className="text-sm text-muted-foreground">
          Shown beside your listings, reviews and messages. If you skip this, we use your
          initial.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <Avatar
          name={user.name}
          url={user.avatarUrl}
          fallback={<User size={24} aria-hidden />}
          className="size-20 text-2xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setPicking(true);
              inputRef.current?.click();
            }}
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Camera size={15} aria-hidden />
            )}
            {user.avatarUrl ? "Change photo" : "Upload a photo"}
          </Button>

          {user.avatarUrl && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleRemove()}>
              <Trash2 size={15} aria-hidden />
              Remove
            </Button>
          )}

          {/*
            A visually-hidden input rather than a styled one. The button above is the
            control a person uses and carries the accessible name; the input exists only to
            satisfy the browser's file dialog, and exposing it as well would put an
            unlabelled, unreachable control in the tab order.
          */}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={config?.allowedTypes.join(",") ?? "image/jpeg,image/png,image/webp,image/avif"}
            aria-label="Choose a profile photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
      </div>

      {/* Announced to assistive tech when the upload finishes, since the visible change is
          only a picture. */}
      <p role="status" className="sr-only">
        {busy ? "Uploading your profile photo" : `Current photo: ${user.avatarUrl ?? "initial"}`}
      </p>
    </Card>
  );
}