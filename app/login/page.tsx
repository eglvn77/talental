import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Talental</h1>
            <p className="text-sm text-muted-foreground">
              Inicia sesión en tu workspace.
            </p>
          </div>
          {params.reset === "ok" ? (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              Contraseña actualizada. Inicia sesión.
            </p>
          ) : null}
          <LoginForm
            initialError={params.error}
            initialSent={params.sent}
            initialNext={params.next}
          />
          <p className="text-xs text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link
              href="/signup"
              className="text-foreground underline hover:opacity-80"
            >
              Regístrate
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
