import { useRef, useState, type ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/storage";
import type { AttachmentInput } from "../types";

/**
 * Pick and upload files for a ticket.
 *
 * The bytes go through the shared storage client with the `tickets` scope, so the same
 * rules apply as anywhere else — MIME whitelisted, size capped, magic-byte checked,
 * stored under the caller's own prefix. The component's own check is a courtesy for the
 * user's benefit; the server re-checks all of it independently.
 */
export function AttachmentPicker({
  attachments,
  onChange,
  max = 5,
}: {
  attachments: AttachmentInput[];
  onChange: (next: AttachmentInput[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setError(null);
    setBusy(true);
    try {
      const uploaded: AttachmentInput[] = [];
      for (const file of files) {
        if (attachments.length + uploaded.length >= max) {
          setError(`You can attach up to ${max} files.`);
          break;
        }
        const result = await uploadImage("tickets", file);
        uploaded.push({
          fileName: file.name,
          url: result.publicUrl,
          mimeType: file.type,
          sizeBytes: file.size,
        });
      }
      if (uploaded.length > 0) onChange([...attachments, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={handleFiles}
        aria-label="Attach images"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy || attachments.length >= max}
        >
          <Paperclip size={13} aria-hidden />
          {busy ? "Uploading…" : "Attach image"}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>

      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <li
              key={`${attachment.url}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
            >
              <span className="max-w-40 truncate">{attachment.fileName}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.fileName}`}
                className="text-muted-foreground transition hover:text-destructive"
                onClick={() => onChange(attachments.filter((_, i) => i !== index))}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
