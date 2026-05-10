import { LoginForm } from "./login-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; next?: string }>;
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
          <LoginForm initialError={params.error} initialSent={params.sent} />
        </CardContent>
      </Card>
    </main>
  );
}
