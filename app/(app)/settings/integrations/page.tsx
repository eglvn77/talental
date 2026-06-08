import { Suspense } from "react";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ConnectLinkedinButton } from "./connect-button";
import { DAILY_UNIPILE_LIMIT } from "@/lib/integrations/unipile/profile";

export const dynamic = "force-dynamic";

/**
 * Settings → Integrations page. V1 lists the workspace's connected
 * channel accounts (LinkedIn primarily, others when we add them) and
 * lets the recruiter connect a new one via Unipile's Hosted Auth.
 *
 * Why this exists: LinkedIn coverage from Coresignal (licensed data
 * provider) is partial — many real candidates aren't in their index.
 * Connecting a LinkedIn account via Unipile gives us a fallback path
 * that uses the recruiter's own session to fetch ANY profile they
 * can see in LinkedIn directly.
 */
export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const justConnected = sp.status === "success";
  const justFailed = sp.status === "failure";

  const db = await hiring();
  const { data: accounts } = await db
    .from("connected_accounts")
    .select("id, provider, status, last_status_update, account_metadata")
    .eq("workspace_id", me.workspace.id)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    provider: string;
    status: string;
    last_status_update: string;
    account_metadata: Record<string, unknown> | null;
  };
  const rows = (accounts ?? []) as Row[];
  const linkedinAccount = rows.find((r) => r.provider === "LINKEDIN");

  // Today's Unipile usage — counts successful fetches against the
  // daily cap. Same definition as the runtime check inside
  // enrichCandidateViaUnipile so what the user sees matches what
  // the cap actually enforces.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayUnipileCount } = await db
    .from("candidates")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", me.workspace.id)
    .eq("enrichment_status", "unipile_ok")
    .gte("enriched_at", startOfDay.toISOString());
  const usedToday = todayUnipileCount ?? 0;
  const remaining = Math.max(0, DAILY_UNIPILE_LIMIT - usedToday);
  const pctUsed = Math.min(100, (usedToday / DAILY_UNIPILE_LIMIT) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Integraciones</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conecta tus cuentas externas para mejorar el sourcing y la
        comunicación con candidatos.
      </p>

      {justConnected ? (
        <div className="mt-6 rounded-md border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">
          ✓ Cuenta conectada correctamente.
        </div>
      ) : null}
      {justFailed ? (
        <div className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          La conexión no se completó. Intenta de nuevo.
        </div>
      ) : null}

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">LinkedIn</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Conecta tu LinkedIn personal para que el ATS pueda
              enriquecer perfiles que Coresignal no tiene indexados.
              Usa Unipile (legítimo, no scraping) — tu sesión queda
              segura y nunca compartimos tus credenciales.
            </p>
          </div>
          <Suspense
            fallback={
              <span className="text-xs text-muted-foreground">…</span>
            }
          >
            {linkedinAccount ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  linkedinAccount.status === "ok"
                    ? "bg-positive/15 text-positive"
                    : "bg-warning/15 text-warning"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    linkedinAccount.status === "ok"
                      ? "bg-positive"
                      : "bg-warning"
                  }`}
                />
                {linkedinAccount.status === "ok"
                  ? "Conectada"
                  : linkedinAccount.status}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                No conectada
              </span>
            )}
          </Suspense>
        </div>

        <div className="mt-4 flex gap-3">
          <ConnectLinkedinButton
            providers={["LINKEDIN"]}
            reconnectAccountId={
              linkedinAccount?.status === "ok"
                ? undefined
                : (linkedinAccount as { id?: string } | undefined)?.id
            }
            label={
              linkedinAccount
                ? linkedinAccount.status === "ok"
                  ? "Reconectar"
                  : "Reconectar (requerido)"
                : "Conectar LinkedIn"
            }
          />
        </div>

        {linkedinAccount ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Última actualización:{" "}
            {new Date(linkedinAccount.last_status_update).toLocaleString(
              "es-MX",
            )}
          </p>
        ) : null}

        {/* Daily usage meter — only relevant when LinkedIn is
            actually connected; otherwise the cap doesn't apply. */}
        {linkedinAccount?.status === "ok" ? (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">
                Uso de Unipile hoy
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {usedToday} / {DAILY_UNIPILE_LIMIT}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  pctUsed >= 90
                    ? "bg-danger"
                    : pctUsed >= 70
                      ? "bg-warning"
                      : "bg-positive"
                }`}
                style={{ width: `${pctUsed}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {remaining > 0
                ? `Te quedan ${remaining} fetches hoy. El contador se resetea a las 00:00 UTC.`
                : "Llegaste al límite diario. Mañana se reactiva — o edita los candidatos a mano hoy."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Solo cuenta cuando Unipile efectivamente buscó un
              perfil en LinkedIn (Coresignal hits no cuentan).
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">¿Cómo funciona?</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">1.</strong> Click
            "Conectar LinkedIn" arriba.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> Unipile abre
            un wizard donde inicias sesión en LinkedIn (en su dominio
            seguro, nosotros nunca vemos tu password).
          </li>
          <li>
            <strong className="text-foreground">3.</strong> Una vez
            conectado, vuelves aquí y el badge cambia a "Conectada".
          </li>
          <li>
            <strong className="text-foreground">4.</strong> Desde ahora,
            cuando agregues un candidato vía la extensión Chrome o el
            botón "Enrich with AI", si Coresignal no lo tiene, Unipile
            lo busca usando tu sesión.
          </li>
        </ol>
      </section>
    </div>
  );
}
