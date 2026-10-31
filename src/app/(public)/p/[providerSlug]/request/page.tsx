import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PublicFooter } from "@/components/shared/public-footer";
import { PublicHeader } from "@/components/shared/public-header";
import { PublicRecoveryPanel } from "@/components/shared/public-recovery-panel";
import { getPublicProvider } from "@/features/providers";

import { RepairRequestForm } from "./_components/repair-request-form";

export const metadata: Metadata = {
  title: "Submit Repair Request — Tracknologia",
  description: "Send device and problem information to a repair Provider",
};

export default async function PublicRepairRequestPage({
  params,
}: {
  params: Promise<{ providerSlug: string }>;
}) {
  const { providerSlug } = await params;
  const provider = await getPublicProvider(providerSlug);

  if (!provider) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PublicHeader />
        <main className="flex flex-1 items-center px-4 py-10 sm:px-6 sm:py-16">
          <PublicRecoveryPanel kind="request-unavailable" />
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="py-4">
            <PageHeader
              eyebrow="Public request"
              title={`Request repair service from ${provider.displayName}`}
              description={provider.description || undefined}
            />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {provider.publicAddress && <span>{provider.publicAddress}</span>}
              {provider.serviceArea && (
                <span>Service area: {provider.serviceArea}</span>
              )}
            </div>
          </section>

          <RepairRequestForm
            providerSlug={provider.slug}
            providerName={provider.displayName}
            supportedDevices={provider.supportedDevices}
            serviceModes={provider.serviceModes}
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
