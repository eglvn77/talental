import Link from "next/link";
import { SignupForm } from "./signup-form";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/Wordmark";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <Wordmark size="lg" />
            <div>
              <h1 className="text-base font-medium">Crea tu cuenta</h1>
              <p className="text-sm text-muted-foreground">
                Confirma tu email para entrar.
              </p>
            </div>
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
