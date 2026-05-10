import { NextResponse } from "next/server";
import { isAuthenticated as isAdmin } from "@/lib/auth/session";
import { listJobs, listOrganizations } from "@/lib/manatal";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [jobs, orgs] = await Promise.all([listJobs(), listOrganizations()]);
    const orgById = new Map(orgs.map((o) => [o.id, o.name]));

    const items = jobs.map((j) => {
      let orgName: string | null = null;
      if (typeof j.organization === "number") {
        orgName = orgById.get(j.organization) ?? null;
      } else if (j.organization && typeof j.organization === "object") {
        orgName = j.organization.name ?? null;
      }
      return {
        id: j.id,
        position_name: j.position_name,
        organization_name: orgName,
        status: j.status ?? null,
      };
    });

    // Active first, then everything else; alphabetical within each bucket.
    items.sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.position_name.localeCompare(b.position_name);
    });

    return NextResponse.json({ jobs: items });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed";
    const friendly = /Manatal 401/.test(raw)
      ? "Manatal rejected the API token (401). Check MANATAL_API_TOKEN in your env."
      : raw;
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
