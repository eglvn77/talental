import { hiring } from "@/lib/hiring";
import { sanitizeRichText } from "../../../_components/sanitize-html";
import { DescriptionEditor } from "./description-editor";

export const dynamic = "force-dynamic";

export default async function JobDescriptionTab({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const { data } = await (await hiring())
    .from("jobs")
    .select("public_description")
    .eq("id", jobId)
    .maybeSingle();

  const raw = (data?.public_description as string | null) ?? "";
  const html = sanitizeRichText(raw);

  return <DescriptionEditor jobId={jobId} initialHtml={html} />;
}
