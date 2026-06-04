import { getT } from "@/lib/i18n/server";

export async function PortalInvalid() {
  const t = await getT();
  return (
    <main className="mx-auto mt-32 w-full max-w-md px-6 text-center">
      <h1 className="text-lg font-semibold">{t("portal.tokenInvalid")}</h1>
    </main>
  );
}
