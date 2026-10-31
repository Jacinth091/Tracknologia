import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PublicHeader } from "@/components/shared/public-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <div className="flex min-h-screen flex-col bg-muted/30">
        <PublicHeader />
        <main className="flex-1 px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Repair Requests unavailable</CardTitle>
                <CardDescription>
                  Provider does not exist or is not accepting new Requests.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Check link or contact Provider directly for current service
                  options.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
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
    </div>
  );
}
