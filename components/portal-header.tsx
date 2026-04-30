import Image from "next/image";

type Props = {
  clientName: string;
  positionName: string | null;
  organizationName: string | null;
};

export function PortalHeader({ clientName, positionName, organizationName }: Props) {
  const right =
    [organizationName, positionName].filter(Boolean).join(" — ") || clientName;
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
        <Image
          src="/talental-logo.svg"
          alt="Talental"
          width={160}
          height={32}
          priority
          className="h-7 w-auto"
        />
        <div className="text-sm font-medium text-foreground">{right}</div>
      </div>
    </header>
  );
}
