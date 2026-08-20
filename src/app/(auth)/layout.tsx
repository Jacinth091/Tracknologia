import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-foreground hover:opacity-90 inline-block"
          >
            Tracknologia
          </Link>
          <p className="text-sm text-muted-foreground">
            Repair Operations & Tracking Platform
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
