import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Recupera tu contraseña</h1>
            <p className="text-sm text-muted-foreground">
              Te enviaremos un link para restablecerla.
            </p>
          </div>
          <ForgotPasswordForm />
          <p className="text-xs text-muted-foreground">
            <Link
              href="/login"
              className="text-foreground underline hover:opacity-80"
            >
              Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
