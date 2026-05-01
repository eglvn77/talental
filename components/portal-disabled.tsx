import Image from "next/image";

export function PortalDisabled() {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-center gap-4 px-6">
          <Image
            src="/talental-logo.svg"
            alt="Talental"
            width={160}
            height={32}
            priority
            className="h-7 w-auto"
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-20">
        <div className="text-center">
          <p className="text-base text-muted-foreground">
            This portal is no longer active.
          </p>
        </div>
      </main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-6 py-6 text-xs text-muted-foreground">
          Powered by{" "}
          <a
            href="https://talental.mx"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 font-medium text-brand hover:underline"
          >
            Talental
          </a>
        </div>
      </footer>
    </>
  );
}
