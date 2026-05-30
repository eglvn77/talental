"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import {
  removeWorkspaceLogoAction,
  updateWorkspaceBrandingAction,
  uploadWorkspaceLogoAction,
} from "../actions";

type CareersTheme = "light" | "dark" | "system";

/**
 * Branding form for the careers landing. Three fields, autosaved
 * independently:
 *   - Logo (image upload, bucket=avatars, path=workspaces/<id>/logo-…)
 *   - Accent color (hex string, painted on the careers header
 *     accent stripe + can be referenced from job-specific themes)
 *   - Careers tagline (free-text line under the workspace name on
 *     the public landing)
 *
 * All writes go through service-role server actions because
 * hiring.workspaces RLS scopes UPDATE to the owner only — branding
 * is an admin-level concern, so the action gates on isAdmin and
 * patches column-by-column.
 */
export function BrandingForm({
  initialLogoUrl,
  initialLogoUrlDark,
  initialAccentColor,
  initialCareersTagline,
  initialCareersTheme,
}: {
  initialLogoUrl: string | null;
  initialLogoUrlDark: string | null;
  initialAccentColor: string | null;
  initialCareersTagline: string | null;
  initialCareersTheme: CareersTheme;
}) {
  const t = useT();
  const router = useRouter();
  const [accent, setAccent] = useState(initialAccentColor ?? "");
  const [tagline, setTagline] = useState(initialCareersTagline ?? "");
  const [theme, setTheme] = useState<CareersTheme>(initialCareersTheme);
  const lastAccent = useRef(initialAccentColor ?? "");
  const lastTagline = useRef(initialCareersTagline ?? "");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setAccent(initialAccentColor ?? "");
    setTagline(initialCareersTagline ?? "");
    setTheme(initialCareersTheme);
    lastAccent.current = initialAccentColor ?? "";
    lastTagline.current = initialCareersTagline ?? "";
  }, [
    initialAccentColor,
    initialCareersTagline,
    initialCareersTheme,
  ]);

  async function commitTheme(next: CareersTheme) {
    if (next === theme) return;
    const prev = theme;
    setTheme(next);
    setSavingKey("theme");
    const res = await updateWorkspaceBrandingAction({ careersTheme: next });
    setSavingKey(null);
    if (!res.ok) {
      toast.actionFailed(t("careersCfg.saveThemeFailed"), res.error);
      setTheme(prev);
      return;
    }
    router.refresh();
  }

  async function commitAccent() {
    const v = accent.trim();
    if (v === lastAccent.current) return;
    setSavingKey("accent");
    const res = await updateWorkspaceBrandingAction({ accentColor: v || null });
    setSavingKey(null);
    if (!res.ok) {
      toast.actionFailed(t("careersCfg.saveColorFailed"), res.error);
      setAccent(lastAccent.current);
      return;
    }
    lastAccent.current = v;
    router.refresh();
  }

  async function commitTagline() {
    const v = tagline.trim();
    if (v === lastTagline.current) return;
    setSavingKey("tagline");
    const res = await updateWorkspaceBrandingAction({
      careersTagline: v || null,
    });
    setSavingKey(null);
    if (!res.ok) {
      toast.actionFailed(t("careersCfg.saveTaglineFailed"), res.error);
      setTagline(lastTagline.current);
      return;
    }
    lastTagline.current = v;
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Logos — light and dark variants. Dark mode often hides a
          dark-ink mark on a dark canvas (and vice versa) so we give
          the recruiter two slots. If only one is uploaded, the
          careers header falls back to it across both themes. */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-foreground">
          {t("careersCfg.logo")}
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          <LogoSlot
            variant="light"
            label={t("careersCfg.logoForLightBg")}
            initialUrl={initialLogoUrl}
          />
          <LogoSlot
            variant="dark"
            label={t("careersCfg.logoForDarkBg")}
            initialUrl={initialLogoUrlDark}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("careersCfg.logoHelp")}
        </p>
      </div>

      {/* Accent color */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="block text-xs font-medium text-foreground">
            {t("careersCfg.accentColor")}
          </span>
          {savingKey === "accent" ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex max-w-md items-center gap-2">
          <input
            type="color"
            value={accent || "#8e966a"}
            onChange={(e) => setAccent(e.target.value)}
            onBlur={commitAccent}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
            aria-label={t("careersCfg.accentColor")}
          />
          <Input
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            onBlur={commitAccent}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="#8e966a"
            className="flex-1 font-mono text-xs"
          />
          {/* Quick restore: clears the override so the workspace
              falls back to the Distillate olive default. Only shown
              when a custom color is actually set. */}
          {accent ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={async () => {
                setAccent("");
                setSavingKey("accent");
                const res = await updateWorkspaceBrandingAction({
                  accentColor: null,
                });
                setSavingKey(null);
                if (!res.ok) {
                  toast.actionFailed(
                    t("careersCfg.restoreColorFailed"),
                    res.error,
                  );
                  setAccent(lastAccent.current);
                  return;
                }
                lastAccent.current = "";
                router.refresh();
              }}
              className="text-muted-foreground"
            >
              {t("careersCfg.restore")}
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("careersCfg.accentColorHelp")}
        </p>
      </div>

      {/* Tagline */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="block text-xs font-medium text-foreground">
            {t("careersCfg.careersTagline")}
          </span>
          {savingKey === "tagline" ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <Input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          onBlur={commitTagline}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder={t("careersCfg.taglinePlaceholder")}
          className="max-w-md"
        />
      </div>

      {/* Theme. Per-workspace override for the public careers site,
          independent from the recruiter's ATS theme (which is
          per-user via localStorage). Server-side stamped on <html>
          in the careers route so there's no light-flash on dark. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="block text-xs font-medium text-foreground">
            {t("careersCfg.siteMode")}
          </span>
          {savingKey === "theme" ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <Select
          value={theme}
          onChange={(v) => commitTheme(v as CareersTheme)}
          className="max-w-md"
          options={[
            { value: "light", label: t("careersCfg.themeLight") },
            { value: "dark", label: t("careersCfg.themeDark") },
            { value: "system", label: t("careersCfg.themeSystem") },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("careersCfg.siteModeHelp")}
        </p>
      </div>
    </div>
  );
}

/**
 * One logo slot — own preview + own upload/remove flow. Mounted
 * twice in BrandingForm (light + dark variants). Keeps the state
 * local so each slot's pending spinner / preview is independent.
 *
 * Preview tile carries its own background (bg-bg-1 for light,
 * #1a1a1a for dark) so the recruiter can actually see whether the
 * mark survives on the canvas it's meant for, regardless of which
 * theme the ATS itself is in.
 */
function LogoSlot({
  variant,
  label,
  initialUrl,
}: {
  variant: "light" | "dark";
  label: string;
  initialUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.actionFailed(t("careersCfg.logoExceedsSize"));
      return;
    }
    setPending(true);
    const form = new FormData();
    form.set("file", file);
    form.set("variant", variant);
    const res = await uploadWorkspaceLogoAction(form);
    setPending(false);
    if (!res.ok) {
      toast.actionFailed(t("careersCfg.uploadLogoFailed"), res.error);
      return;
    }
    setUrl(res.data.logoUrl);
    toast.actionOk(t("careersCfg.logoUpdated"));
    router.refresh();
  }

  async function remove() {
    setPending(true);
    const res = await removeWorkspaceLogoAction({ variant });
    setPending(false);
    if (!res.ok) {
      toast.actionFailed(t("careersCfg.removeLogoFailed"), res.error);
      return;
    }
    setUrl(null);
    toast.actionOk(t("careersCfg.logoRemoved"));
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-bg-1 p-3">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "flex h-20 items-center justify-center rounded-md ring-1 ring-border " +
          (variant === "dark" ? "bg-[#1a1a1a]" : "bg-bg-2")
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={t("careersCfg.logoAlt", { variant })}
            className="max-h-14 max-w-[140px] object-contain"
          />
        ) : (
          <span
            className={
              "text-xs " +
              (variant === "dark" ? "text-white/40" : "text-muted-foreground")
            }
          >
            {t("careersCfg.noLogo")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="gap-1"
        >
          <Upload className="h-3.5 w-3.5" />
          {url ? t("careersCfg.change") : t("careersCfg.upload")}
        </Button>
        {url ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={pending}
            className="gap-1 text-muted-foreground hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
            {t("careersCfg.remove")}
          </Button>
        ) : null}
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
