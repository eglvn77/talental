"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  removeWorkspaceLogoAction,
  updateWorkspaceBrandingAction,
  uploadWorkspaceLogoAction,
} from "../actions";

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
  initialAccentColor,
  initialCareersTagline,
}: {
  initialLogoUrl: string | null;
  initialAccentColor: string | null;
  initialCareersTagline: string | null;
}) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [accent, setAccent] = useState(initialAccentColor ?? "");
  const [tagline, setTagline] = useState(initialCareersTagline ?? "");
  const lastAccent = useRef(initialAccentColor ?? "");
  const lastTagline = useRef(initialCareersTagline ?? "");
  const [logoPending, setLogoPending] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl(initialLogoUrl);
    setAccent(initialAccentColor ?? "");
    setTagline(initialCareersTagline ?? "");
    lastAccent.current = initialAccentColor ?? "";
    lastTagline.current = initialCareersTagline ?? "";
  }, [initialLogoUrl, initialAccentColor, initialCareersTagline]);

  async function commitAccent() {
    const v = accent.trim();
    if (v === lastAccent.current) return;
    setSavingKey("accent");
    const res = await updateWorkspaceBrandingAction({ accentColor: v || null });
    setSavingKey(null);
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar el color", res.error);
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
      toast.actionFailed("No se pudo guardar el tagline", res.error);
      setTagline(lastTagline.current);
      return;
    }
    lastTagline.current = v;
    router.refresh();
  }

  async function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.actionFailed("El logo excede 2 MB");
      return;
    }
    setLogoPending(true);
    const form = new FormData();
    form.set("file", file);
    const res = await uploadWorkspaceLogoAction(form);
    setLogoPending(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo subir el logo", res.error);
      return;
    }
    setLogoUrl(res.data.logoUrl);
    toast.actionOk("Logo actualizado");
    router.refresh();
  }

  async function handleRemoveLogo() {
    setLogoPending(true);
    const res = await removeWorkspaceLogoAction();
    setLogoPending(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo quitar el logo", res.error);
      return;
    }
    setLogoUrl(null);
    toast.actionOk("Logo eliminado");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Logo */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-foreground">
          Logo
        </span>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo del workspace"
              className="h-16 w-16 rounded-md object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-bg-2 text-xs text-muted-foreground ring-1 ring-border">
              Sin logo
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={logoPending}
              className="gap-1"
            >
              <Upload className="h-3.5 w-3.5" />
              {logoUrl ? "Cambiar" : "Subir logo"}
            </Button>
            {logoUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleRemoveLogo}
                disabled={logoPending}
                className="gap-1 text-muted-foreground hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
                Quitar
              </Button>
            ) : null}
            {logoPending ? (
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
              if (f) void uploadLogo(f);
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          PNG, JPG, WebP o SVG. Máx 2 MB. Se muestra en la página de
          carreras.
        </p>
      </div>

      {/* Accent color */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="block text-xs font-medium text-foreground">
            Color de acento
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
            aria-label="Color de acento"
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
        </div>
        <p className="text-[11px] text-muted-foreground">
          Se pinta como banda accent en la cabecera del sitio público.
        </p>
      </div>

      {/* Tagline */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="block text-xs font-medium text-foreground">
            Tagline de carreras
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
          placeholder="Buscamos talento que cambia industrias."
          className="max-w-md"
        />
      </div>
    </div>
  );
}
