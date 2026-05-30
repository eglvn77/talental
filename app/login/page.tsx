import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/Wordmark";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-1">
            <Wordmark size="lg" />
            <p className="text-sm text-muted-foreground">
              {t("auth.tagline")}
            </p>
          </div>
          {params.reset === "ok" ? (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              {t("auth.passwordUpdated")}
            </p>
          ) : null}
          <LoginForm
            initialError={params.error}
            initialSent={params.sent}
            initialNext={params.next}
          />
          <p className="text-xs text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link
              href="/signup"
              className="text-foreground underline hover:opacity-80"
            >
              {t("auth.signUp")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
