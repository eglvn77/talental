"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

/**
 * Click-to-edit candidate name in the profile header. Renders as
 * a plain h1 by default; click flips it to a text input. Enter or
 * blur commits via updateCandidateContactAction; Esc cancels.
 *
 * Empty strings are rejected client-side too so the user gets an
 * immediate "name can't be empty" hint instead of a server toast
 * after a round-trip.
 */
export function InlineNameEdit({
  candidateId,
  initialName,
}: {
  candidateId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync when the underlying name changes from elsewhere
  // (re-enrich, etc.) so the view doesn't go stale.
  useEffect(() => {
    if (!editing) setValue(initialName);
  }, [initialName, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = value.trim();
    if (next === initialName.trim()) {
      setEditing(false);
      return;
    }
    if (!next) {
      toast.actionFailed("Name can't be empty");
      setValue(initialName);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await updateCandidateContactAction({
        candidateId,
        patch: { full_name: next },
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't update name", res.error);
        setValue(initialName);
        setEditing(false);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <h1
        className="truncate text-xl font-semibold cursor-text hover:bg-foreground/[0.04] rounded px-1 -mx-1 transition-colors"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {initialName}
      </h1>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setValue(initialName);
            setEditing(false);
          }
        }}
        disabled={pending}
        className="text-xl font-semibold bg-background border border-border rounded px-1.5 py-0.5 min-w-0 flex-1 max-w-md"
        maxLength={120}
      />
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Check className="h-4 w-4 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
