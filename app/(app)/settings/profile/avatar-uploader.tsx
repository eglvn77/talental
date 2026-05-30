"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  removeProfileAvatarAction,
  uploadProfileAvatarAction,
} from "../actions";

/**
 * Profile avatar uploader. Big circular preview on the left, two
 * actions on the right ("Cambiar" + optional "Quitar"). Click on the
 * preview also opens the file picker — both affordances point to the
 * same `<input type="file">` so the choice is obvious to the user.
 *
 * No client-side cropping for now; the browser scales the image to
 * fit and Storage stores the original. We accept up to 5 MB, matching
 * the bucket's file_size_limit.
 */
export function AvatarUploader({
  initialUrl,
  name,
}: {
  initialUrl: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.actionFailed(t("profile.imageTooBig"));
      return;
    }
    setPending(true);
    const form = new FormData();
    form.set("file", file);
    const res = await uploadProfileAvatarAction(form);
    setPending(false);
    if (!res.ok) {
      toast.actionFailed(t("profile.uploadFailed"), res.error);
      return;
    }
    setUrl(res.data.avatarUrl);
    toast.actionOk(t("profile.photoUpdated"));
    // The sidebar lives in the root layout and shows the avatar — pull
    // a fresh render so the new image propagates.
    router.refresh();
  }

  async function handleRemove() {
    setPending(true);
    const res = await removeProfileAvatarAction();
    setPending(false);
    if (!res.ok) {
      toast.actionFailed(t("profile.removeFailed"), res.error);
      return;
    }
    setUrl(null);
    toast.actionOk(t("profile.photoRemoved"));
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="group relative"
        aria-label={t("profile.changePhoto")}
        title={t("profile.changePhoto")}
      >
        <Avatar src={url} name={name} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <Upload className="h-5 w-5 text-white" />
          )}
        </span>
      </button>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="gap-1"
          >
            <Upload className="h-3.5 w-3.5" />
            {url ? t("profile.change") : t("profile.uploadPhoto")}
          </Button>
          {url ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={pending}
              className="gap-1 text-muted-foreground hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
              {t("profile.remove")}
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("profile.photoHint")}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Reset value so picking the same file twice in a row
          // re-triggers onChange.
          e.target.value = "";
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
