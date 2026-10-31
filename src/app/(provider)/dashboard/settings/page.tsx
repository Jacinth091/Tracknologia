import type { Metadata } from "next";

import { requireProviderContext } from "@/features/auth";
import {
  getProvider,
  getProviderServiceModes,
  getProviderUserProfile,
} from "@/features/providers";
import { getAppOrigin } from "@/lib/config/server";
import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsClient } from "./_components/settings-client";

export const metadata: Metadata = {
  title: "Provider Settings — Tracknologia",
  description: "Manage Provider operating and personal profile settings",
};

export default async function ProviderSettingsPage() {
  const supabase = await createClient();
  const context = await requireProviderContext(supabase);
  const [provider, personalProfile, serviceModes] = await Promise.all([
    getProvider(context.providerId, supabase),
    getProviderUserProfile(context.userId, supabase),
    getProviderServiceModes(context.providerId, supabase),
  ]);

  if (!provider || !personalProfile) {
    throw new Error("Provider settings could not be loaded");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Provider"
        title="Provider Settings"
        description="Manage your profile, business details, and repair arrangements."
      />

      <SettingsClient
        provider={provider}
        personalProfile={personalProfile}
        serviceModes={serviceModes}
        canManageProvider={context.role === "OWNER"}
        requestLinkUrl={`${getAppOrigin()}/p/${provider.slug}/request`}
      />
    </div>
  );
}
