import { PublicFooter } from "@/components/shared/public-footer";
import { PublicHeader } from "@/components/shared/public-header";

// One calm shell for every auth screen: the shared public header, then a
// single centred column. The marketing panel is gone; it competed with the form.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-lg">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}
