import { Wordmark } from "@/components/brand/Wordmark";
import { Mark } from "@/components/brand/Mark";

/**
 * Visual QA route for the Talental Distillate brand components.
 *
 * Renders Wordmark + Mark in every size and variant on both Bone
 * (light) and Ink (dark) surfaces. The Wordmark auto-picks the flat
 * variant at <32px and the diminuendo at ≥32px per handoff cutover
 * rules.
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

      <Row title="Mark · bare (inherits color)">
        <Mark size="sm" variant="bare" />
        <Mark size="md" variant="bare" />
        <Mark size="lg" variant="bare" />
        <Mark size="xl" variant="bare" />
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
