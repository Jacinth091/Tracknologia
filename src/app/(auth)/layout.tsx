import { BrandLogo } from "@/components/shared/brand-logo";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-background px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-1">
          <Link href="/" className="inline-block rounded-sm">
            <BrandLogo className="h-9" />
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
