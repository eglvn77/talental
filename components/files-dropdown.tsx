"use client";
import { useState } from "react";
import { FileDown, Files, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Attachment = { id: number; name: string };

// Single dropdown that surfaces both the resume (if has_resume) and any
// attachments (lazy-loaded on first open). Hidden entirely when neither is
// available — the caller decides whether to render this component at all.
export function FilesDropdown({
  candidateId,
  hasResume,
}: {
  candidateId: number;
  hasResume: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAttachments() {
    if (attachments || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/candidates/${candidateId}/attachments`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { attachments: Attachment[] } = await res.json();
      setAttachments(data.attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && loadAttachments()}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="View files"
          title="View files"
          className="text-muted-foreground hover:text-foreground"
        >
          <Files className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {hasResume ? (
          <DropdownMenuItem asChild>
            <a
              href={`/api/files/resume/${candidateId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              Resume
            </a>
          </DropdownMenuItem>
        ) : null}
        {hasResume && (loading || error || attachments) ? (
          <div className="my-1 border-t border-border" aria-hidden="true" />
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading attachments…
          </div>
        ) : error ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Couldn&apos;t load attachments.
          </div>
        ) : attachments && attachments.length === 0 ? (
          !hasResume ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No files.
            </div>
          ) : null
        ) : (
          <>
            {attachments && attachments.length > 0 ? (
              <DropdownMenuLabel>Attachments</DropdownMenuLabel>
            ) : null}
            {attachments?.map((a) => (
              <DropdownMenuItem key={a.id} asChild>
                <a
                  href={`/api/files/attachment/${candidateId}/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileDown className="h-4 w-4" />
                  <span className="truncate">{a.name}</span>
                </a>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
