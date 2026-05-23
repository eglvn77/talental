import { Wordmark } from "@/components/brand/Wordmark";
import { Mark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Eyebrow } from "@/components/ui/eyebrow";

/**
 * Visual QA route for the Talental Distillate brand system.
 *
 * Renders every primitive on bone, paper, tint, and ink surfaces so a
 * single screenshot covers token coverage end-to-end. The Wordmark
 * auto-picks the flat variant at <32px and the diminuendo at ≥32px per
 * the handoff cutover rules.
 */
export default function BrandDemoPage() {
  return (
    <div className="min-h-screen">
      <Section bg="bg-bg-1" label="bg-1 / Bone">
        <BrandSurface />
      </Section>
      <Section bg="bg-bg-2" label="bg-2 / Paper">
        <BrandSurface />
      </Section>
      <Section bg="bg-bg-3" label="bg-3 / Tint">
        <BrandSurface />
      </Section>
      {/* Force the Ink palette regardless of user theme so the QA
          page shows both modes side-by-side. */}
      <div data-theme="dark">
        <Section bg="bg-bg-1" label="bg-1 / Ink">
          <BrandSurface onInk />
        </Section>
        <Section bg="bg-bg-2" label="bg-2 / Ink paper">
          <BrandSurface onInk />
        </Section>
      </div>
    </div>
  );
}

function Section({
  bg,
  label,
  children,
}: {
  bg: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${bg} px-8 py-10 text-foreground`}>
      <p className="font-mono mb-6 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}

function BrandSurface({ onInk = false }: { onInk?: boolean }) {
  const variant = onInk ? "on-ink" : "default";
  return (
    <div className="space-y-10">
      <Row title="Wordmark">
        <Wordmark size="sm" variant={variant} />
        <Wordmark size="md" variant={variant} />
        <Wordmark size="lg" variant={variant} />
        <Wordmark size="xl" variant={variant} />
      </Row>

      <Row title="Mark · default">
        <Mark size="sm" variant={variant} />
        <Mark size="md" variant={variant} />
        <Mark size="lg" variant={variant} />
        <Mark size="xl" variant={variant} />
      </Row>

      <Row title="Buttons">
        <Button>Agregar vacante</Button>
        <Button variant="ink">Ink</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
      </Row>

      <Row title="Inputs">
        <div className="w-64">
          <Input placeholder="Buscar candidatos…" />
        </div>
        <div className="w-64">
          <Input placeholder="Disabled" disabled />
        </div>
      </Row>

      <Row title="Pills">
        <Pill tone="neutral" dot>
          Sourced
        </Pill>
        <Pill tone="accent" dot>
          Shortlist
        </Pill>
        <Pill tone="success" dot>
          In progress
        </Pill>
        <Pill tone="warning" dot>
          Screening
        </Pill>
        <Pill tone="danger" dot>
          Rejected
        </Pill>
        <Pill tone="info">02 / 04</Pill>
      </Row>

      <Row title="Eyebrow + heading">
        <div>
          <Eyebrow>Stage 02 / 04</Eyebrow>
          <h3 className="mt-1 text-lg font-medium">Submit to client</h3>
        </div>
      </Row>

      <Row title="Card">
        <Card className="w-80">
          <CardContent>
            <Eyebrow>LATAM · Remote</Eyebrow>
            <h4 className="mt-2 text-base font-medium">Head of Marketing</h4>
            <p className="mt-1 text-sm text-fg-2">
              Five candidates. All worth meeting.
            </p>
          </CardContent>
        </Card>
      </Row>
    </div>
  );
}

function Row({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-medium">{title}</h3>
      <div className="flex flex-wrap items-end gap-6">{children}</div>
    </div>
  );
}
