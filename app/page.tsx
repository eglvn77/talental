import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-brand">Talental</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is a private candidate review portal. Open the link your Talental
          partner sent you, or go to the{" "}
          <Link href="/admin" className="text-brand hover:underline">
            admin
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
