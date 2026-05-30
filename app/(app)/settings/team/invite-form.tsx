"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { inviteTeamMemberAction } from "@/app/(app)/settings/actions";

/**
 * Invite-team-member trigger + modal. Admin-only — the parent page
 * already redirected non-admins; rendering this is the affordance.
 *
 * On success: Supabase sends the magic-link invite email, the
 * `team_members` row is provisioned with the chosen role, and the
 * table re-renders. The invitee shows as "Activo" with the
 * `auth_user_id` pre-linked from the invite response; their first
 * sign-in lands them straight into the workspace.
 */
export function InviteMemberForm() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "recruiter">("recruiter");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setFullName("");
    setRole("recruiter");
    setError(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await inviteTeamMemberAction({
        email,
        fullName: fullName || undefined,
        role,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.actionOk(
        t("team.inviteSentTitle"),
        t("team.inviteSentBody", { email }),
      );
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
        else setOpen(true);
      }}
    >
      <Dialog.Trigger asChild>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("team.inviteButton")}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              {t("team.inviteDialogTitle")}
            </Dialog.Title>
            <button
              type="button"
              onClick={close}
              disabled={pending}
              aria-label={t("team.close")}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("team.emailLabel")}
                </span>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="persona@empresa.mx"
                  required
                  disabled={pending}
                  className="mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("team.nameLabel")}
                </span>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Maria López"
                  disabled={pending}
                  className="mt-1.5"
                />
              </label>
            </div>

            <div>
              <span className="block text-xs font-medium text-muted-foreground">
                {t("team.roleLabel")}
              </span>
              <div className="mt-1.5 inline-flex overflow-hidden rounded-md border border-border">
                {(["recruiter", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    disabled={pending}
                    className={
                      role === r
                        ? "bg-foreground px-4 py-1.5 text-xs text-background"
                        : "bg-background px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    }
                  >
                    {r === "recruiter"
                      ? t("team.roleRecruiter")
                      : t("team.roleAdmin")}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {role === "recruiter"
                  ? t("team.roleRecruiterHint")
                  : t("team.roleAdminHint")}
              </p>
            </div>

            {error ? (
              <p className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={close}
                disabled={pending}
              >
                {t("team.cancel")}
              </Button>
              <Button type="submit" disabled={pending || !email.trim()}>
                {pending ? t("team.sending") : t("team.sendInvite")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
