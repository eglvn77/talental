import { ResetPasswordForm } from "./reset-password-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Nueva contraseña</h1>
            <p className="text-sm text-muted-foreground">
              Elige una contraseña segura para entrar a Talental.
            </p>
          </div>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
