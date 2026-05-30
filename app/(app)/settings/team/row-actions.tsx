"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, UserCog, UserMinus, UserCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import {
  deactivateTeamMemberAction,
  reactivateTeamMemberAction,
  updateTeamMemberRoleAction,
} from "@/app/(app)/settings/actions";

type Role = "owner" | "admin" | "recruiter";

/**
 * Per-row admin actions on /settings/team. Lets owners (and other
 * admins) change a member's role between admin / recruiter and
 * activate / deactivate them. The owner is read-only here; their
 * role is set once at workspace creation.
 */
export function TeamMemberRowActions({
  memberId,
  currentRole,
  isActive,
  isSelf,
}: {
  memberId: string;
  currentRole: Role;
  isActive: boolean;
  isSelf: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Owner row has nothing to edit from here.
  if (currentRole === "owner") return null;

  function setRole(role: "admin" | "recruiter") {
    if (role === currentRole) return;
    startTransition(async () => {
      const res = await updateTeamMemberRoleAction({ memberId, role });
      if (!res.ok) {
        toast.actionFailed(t("team.roleChangeFailed"), res.error);
        return;
      }
      toast.actionOk(t("team.roleUpdatedTo", { role }));
      router.refresh();
    });
  }

  function deactivate() {
    startTransition(async () => {
      const res = await deactivateTeamMemberAction({ memberId });
      if (!res.ok) {
        toast.actionFailed(t("team.deactivateFailed"), res.error);
        return;
      }
      toast.actionOk(t("team.memberDeactivated"));
      router.refresh();
    });
  }

  function reactivate() {
    startTransition(async () => {
      const res = await reactivateTeamMemberAction({ memberId });
      if (!res.ok) {
        toast.actionFailed(t("team.reactivateFailed"), res.error);
        return;
      }
      toast.actionOk(t("team.memberReactivated"));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("team.actions")}
          title={t("team.actions")}
          disabled={pending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs">{t("team.changeRole")}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => setRole("admin")}
          disabled={currentRole === "admin"}
          className="gap-2"
        >
          <UserCog className="h-3.5 w-3.5" />
          {t("team.roleAdmin")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setRole("recruiter")}
          disabled={currentRole === "recruiter"}
          className="gap-2"
        >
          <UserCog className="h-3.5 w-3.5" />
          {t("team.roleRecruiter")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isActive ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              if (isSelf) return;
              deactivate();
            }}
            disabled={isSelf}
            className="gap-2 text-danger focus:text-danger"
            title={isSelf ? t("team.cannotDeactivateSelf") : undefined}
          >
            <UserMinus className="h-3.5 w-3.5" />
            {t("team.deactivate")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              reactivate();
            }}
            className="gap-2"
          >
            <UserCheck className="h-3.5 w-3.5" />
            {t("team.reactivate")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
