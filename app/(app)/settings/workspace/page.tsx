import { getCurrentUser } from "@/lib/auth/session";

export default async function WorkspacePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const w = me.workspace;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Workspace</h2>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Nombre</dt>
        <dd>{w.name}</dd>
        <dt className="text-muted-foreground">Slug</dt>
        <dd className="font-mono text-xs">{w.slug}</dd>
        <dt className="text-muted-foreground">Plan</dt>
        <dd className="capitalize">{w.plan_tier}</dd>
        <dt className="text-muted-foreground">Correo de facturación</dt>
        <dd>{w.billing_email ?? "—"}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        Editar el workspace viene pronto.
      </p>
    </section>
  );
}
