import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingForm } from "./onboarding-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Already onboarded — bounce to the app. Belt-and-suspenders with the proxy.
  if (user.workspace.onboarding_completed_at) {
    redirect("/jobs");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Bienvenido a Talental</h1>
            <p className="text-sm text-muted-foreground">
              Confirma tu nombre y el de tu agencia para terminar de configurar
              tu cuenta.
            </p>
          </div>
          <OnboardingForm
            initialFullName={user.team_member.full_name ?? ""}
            initialAgencyName={user.workspace.name ?? ""}
          />
        </CardContent>
      </Card>
    </main>
  );
}
