import Link from "next/link";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/settings/profile", label: "Mi perfil" },
  { href: "/settings/team", label: "Equipo" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/custom-fields", label: "Campos personalizados" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Configuración</h1>
      <div className="grid grid-cols-[200px_1fr] gap-8">
        <nav className="flex flex-col gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
