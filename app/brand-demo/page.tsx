import { Wordmark } from "@/components/brand/Wordmark";
import { Logo } from "@/components/brand/Logo";

/**
 * Temporary visual QA route for the Talental Brand v1 components.
 * Renders Wordmark + Logo in every size and variant on both Bone
 * (light) and Ink (dark) surfaces. Delete once visual sign-off is in.
 */
export default function BrandDemoPage() {
  return (
    <div className="min-h-screen">
      <Section bg="bg-background" label="background / Bone">
        <BrandSurface />
      </Section>
      <Section bg="bg-card" label="card / Bone card">
        <BrandSurface />
      </Section>
      {/* Force the Ink palette regardless of user theme so the QA
          page shows both modes side-by-side. */}
      <div data-theme="dark">
        <Section bg="bg-background" label="background / Ink">
          <BrandSurface />
        </Section>
        <Section bg="bg-card" label="card / Ink card">
          <BrandSurface />
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

function BrandSurface() {
  return (
    <div className="space-y-10">
      <Row title="Wordmark">
        <Wordmark size="sm" />
        <Wordmark size="md" />
        <Wordmark size="lg" />
        <Wordmark size="xl" />
      </Row>

      <Row title="Logo · square">
        <Logo variant="square" size="sm" />
        <Logo variant="square" size="md" />
        <Logo variant="square" size="lg" />
        <Logo variant="square" size="xl" />
      </Row>

      <Row title="Logo · circle">
        <Logo variant="circle" size="sm" />
        <Logo variant="circle" size="md" />
        <Logo variant="circle" size="lg" />
        <Logo variant="circle" size="xl" />
      </Row>

      <Row title="Logo · bare">
        <Logo variant="bare" size="sm" />
        <Logo variant="bare" size="md" />
        <Logo variant="bare" size="lg" />
        <Logo variant="bare" size="xl" />
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
