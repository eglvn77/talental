"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { inviteTeamMemberAction } from "@/app/(app)/settings/actions";

/**
 * Inline-expanding invite form. Admin-only — page-level guard
 * already redirected non-admins; rendering this component is the
 * "they CAN invite" affordance.
 *
 * On success: Supabase sends the magic-link invite email, the
 * team_members row is provisioned with the chosen role, the table
 * re-renders. The invitee shows as "Activo" with no `auth_user_id`
 * linkage yet — the first sign-in completes the loop.
 */
export function InviteMemberForm() {
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
      toast.actionOk("Invitación enviada", `${email} recibirá un magic link`);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Invitar miembro
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-border bg-card p-4"
    >
      <h3 className="mb-3 text-sm font-semibold">Invitar nuevo miembro</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Email *
          </span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@empresa.mx"
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Nombre (opcional)
          </span>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Maria López"
            disabled={pending}
            className="mt-1"
          />
        </label>
      </div>
      <div className="mt-3">
        <span className="text-xs font-medium text-muted-foreground">Rol</span>
        <div className="mt-1 inline-flex overflow-hidden rounded-md border border-border">
          {(["recruiter", "admin"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              disabled={pending}
              className={
                role === r
                  ? "bg-foreground px-3 py-1 text-xs text-background"
                  : "bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              }
            >
              {r === "recruiter" ? "Recruiter" : "Admin"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {role === "recruiter"
            ? "Solo ve las vacantes a las que está asignado y los candidatos relacionados."
            : "Acceso completo al workspace, igual que tú."}
        </p>
      </div>
      {error ? (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !email.trim()}>
          {pending ? "Enviando…" : "Enviar invitación"}
        </Button>
      </div>
    </form>
  );
}
