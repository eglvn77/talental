import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Settings shell — just the page chrome (max-width + padding).
 * The navigation lives in two places:
 *   - `<SettingsTileGrid />` on /settings (root) when the admin lands
 *     to give them a visual index grouped by area.
 *   - `<SettingsTabs />` invoked inline at the top of each sub-section
 *     so once inside, the admin can hop between sections horizontally
 *     (same tab pattern as `/jobs/[jobId]`).
 *
 * This replaces the older side-nav layout, which didn't match the rest
 * of the app and forced a 200px column on screens that didn't need it.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getT();
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
      <h1 className="mb-4 text-2xl font-semibold">{t("nav.settings")}</h1>
      {children}
    </div>
  );
}
