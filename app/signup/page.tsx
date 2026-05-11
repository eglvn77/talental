import Link from "next/link";
import { SignupForm } from "./signup-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Crear cuenta en Talental</h1>
            <p className="text-sm text-muted-foreground">
              Crea tu cuenta. Confirma tu email para entrar.
            </p>
          </div>
          <SignupForm />
          <p className="text-xs text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-foreground underline hover:opacity-80"
            >
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
