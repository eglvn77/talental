import { Card, CardContent } from "@/components/ui/card";
import { hiring } from "@/lib/hiring";
import { sanitizeRichText } from "../../../_components/sanitize-html";

export const dynamic = "force-dynamic";

export default async function JobPostingTab({
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

  return (
    <Card>
      <CardContent>
        {html ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta vacante aún no tiene descripción de puesto. Agrégala desde la
            pestaña Ajustes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
