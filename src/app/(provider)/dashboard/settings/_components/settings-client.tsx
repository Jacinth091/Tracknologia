"use client";

import { useActionState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  DeliveryTruck01Icon,
  HandshakeIcon,
  Home01Icon,
  MoreHorizontalCircle01Icon,
  Package01Icon,
  Store01Icon,
  Tick02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  Provider,
  ProviderServiceMode,
  ProviderUserProfile,
} from "@/features/providers";

import {
  updatePersonalProfileAction,
  updateProviderProfileAction,
  updateServiceModesAction,
  type SettingsActionState,
} from "../actions";

const SERVICE_MODE_OPTIONS = [
  {
    value: "DROP_OFF",
    label: "Drop-off",
    description: "Customer brings the device in.",
    icon: Package01Icon,
  },
  {
    value: "MEETUP",
    label: "Meetup",
    description: "Hand over in person, off-site.",
    icon: HandshakeIcon,
  },
  {
    value: "HOME_SERVICE",
    label: "Home service",
    description: "You travel to the customer.",
    icon: Home01Icon,
  },
  {
    value: "OTHER",
    label: "Other arrangement",
    description: "Agree something custom.",
    icon: MoreHorizontalCircle01Icon,
  },
] as const;

function ActionMessage({ state }: { state: SettingsActionState | null }) {
  if (state?.error) {
    return (
      <Alert variant="destructive">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={1.8}
          className="size-4"
          aria-hidden="true"
        />
        <AlertTitle>Changes were not saved</AlertTitle>
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }

  if (state?.success) {
    return (
      <Alert role="status">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={1.8}
          className="size-4 text-primary"
          aria-hidden="true"
        />
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>{state.success}</AlertDescription>
      </Alert>
    );
  }

  return null;
}

interface SettingsClientProps {
  provider: Provider;
  personalProfile: ProviderUserProfile;
  serviceModes: ProviderServiceMode[];
  canManageProvider: boolean;
}

export function SettingsClient({
  provider,
  personalProfile,
  serviceModes,
  canManageProvider,
}: SettingsClientProps) {
  const [personalState, personalAction, personalPending] = useActionState(
    updatePersonalProfileAction,
    null,
  );
  const [providerState, providerAction, providerPending] = useActionState(
    updateProviderProfileAction,
    null,
  );
  const [modeState, modeAction, modePending] = useActionState(
    updateServiceModesAction,
    null,
  );
  const configuredModes = new Map(
    serviceModes.map((mode) => [mode.mode, mode.details]),
  );

  const personalPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <HugeiconsIcon
            icon={UserIcon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Your Profile
        </CardTitle>
        <CardDescription>
          Update the name and contact details your team sees.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={personalAction} className="space-y-4">
          <ActionMessage state={personalState} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="person-displayName">Full Name</Label>
              <Input
                id="person-displayName"
                name="displayName"
                defaultValue={personalProfile.displayName}
                required
                disabled={personalPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-contactPhone">Contact Phone</Label>
              <Input
                id="person-contactPhone"
                name="contactPhone"
                type="tel"
                defaultValue={personalProfile.contactPhone ?? ""}
                disabled={personalPending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="person-avatarUrl">Avatar URL</Label>
            <Input
              id="person-avatarUrl"
              name="avatarUrl"
              type="url"
              defaultValue={personalProfile.avatarUrl ?? ""}
              placeholder="https://example.com/avatar.jpg"
              disabled={personalPending}
            />
          </div>
          <Button
            type="submit"
            disabled={personalPending}
            className="w-full sm:w-auto"
          >
            {personalPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Saving profile...
              </span>
            ) : (
              "Save Personal Profile"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const providerPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <HugeiconsIcon
            icon={Store01Icon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Provider Profile
        </CardTitle>
        <CardDescription>
          Update the business details customers see when requesting a repair.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={providerAction} className="space-y-4">
          <ActionMessage state={providerState} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider-type">Provider Type</Label>
              <Input
                id="provider-type"
                value={
                  provider.providerType === "SHOP"
                    ? "Repair Shop"
                    : "Independent Repairer"
                }
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-slug">Public Slug</Label>
              <Input
                id="provider-slug"
                value={provider.slug}
                disabled
                readOnly
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-displayName">Provider Name</Label>
            <Input
              id="provider-displayName"
              name="displayName"
              defaultValue={provider.displayName}
              required
              disabled={providerPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-description">Description</Label>
            <Textarea
              id="provider-description"
              name="description"
              defaultValue={provider.description ?? ""}
              maxLength={1000}
              disabled={providerPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-image">Profile Image URL</Label>
            <Input
              id="provider-image"
              name="profileImageUrl"
              type="url"
              defaultValue={provider.profileImageUrl ?? ""}
              placeholder="https://example.com/provider.jpg"
              disabled={providerPending}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider-email">Contact Email</Label>
              <Input
                id="provider-email"
                name="contactEmail"
                type="email"
                defaultValue={provider.contactEmail ?? ""}
                disabled={providerPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-phone">Contact Phone</Label>
              <Input
                id="provider-phone"
                name="contactPhone"
                type="tel"
                defaultValue={provider.contactPhone ?? ""}
                disabled={providerPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-address">Public Address</Label>
              <Input
                id="provider-address"
                name="publicAddress"
                defaultValue={provider.publicAddress ?? ""}
                disabled={providerPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-area">Service Area</Label>
              <Input
                id="provider-area"
                name="serviceArea"
                defaultValue={provider.serviceArea ?? ""}
                disabled={providerPending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-devices">Supported Devices</Label>
            <Input
              id="provider-devices"
              name="supportedDevices"
              defaultValue={provider.supportedDevices.join(", ")}
              placeholder="Smartphones, Laptops, Tablets"
              disabled={providerPending}
            />
            <p className="text-xs text-muted-foreground">
              Separate device categories with commas.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-input bg-card p-3">
            <div className="space-y-1">
              <p
                id="accepting-requests-label"
                className="text-sm font-medium text-foreground"
              >
                Accept new Repair Requests
              </p>
              <p className="text-xs text-muted-foreground">
                Let customers submit requests through your Provider link.
              </p>
            </div>
            <Switch
              name="acceptingRequests"
              aria-labelledby="accepting-requests-label"
              defaultChecked={provider.acceptingRequests}
              disabled={providerPending}
              className="mt-0.5"
            />
          </div>
          <Button
            type="submit"
            disabled={providerPending}
            className="w-full sm:w-auto"
          >
            {providerPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Saving Provider...
              </span>
            ) : (
              "Save Provider Profile"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const serviceModesPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <HugeiconsIcon
            icon={DeliveryTruck01Icon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Service Modes
        </CardTitle>
        <CardDescription>
          Choose how customers can arrange repairs with this Provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={modeAction} className="space-y-4">
          <ActionMessage state={modeState} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="group flex cursor-pointer flex-col gap-1.5 rounded-lg border border-input bg-card p-3 transition-colors has-[:checked]:border-foreground has-[:checked]:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="checkbox"
                  name="serviceModes"
                  value={option.value}
                  defaultChecked={configuredModes.has(option.value)}
                  className="sr-only"
                  disabled={modePending}
                />
                <span className="flex items-center justify-between">
                  <span className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                    <HugeiconsIcon
                      icon={option.icon}
                      strokeWidth={1.8}
                      className="size-4"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="inline-flex size-5 items-center justify-center rounded-full border border-input text-transparent transition-colors group-has-[:checked]:border-foreground group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground">
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2.4}
                      className="size-3"
                      aria-hidden="true"
                    />
                  </span>
                </span>
                <span className="text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mode-other-details">
              Other Arrangement Details
            </Label>
            <Input
              id="mode-other-details"
              name="serviceModeDetails.OTHER"
              defaultValue={configuredModes.get("OTHER") ?? ""}
              maxLength={240}
              disabled={modePending}
            />
          </div>
          <Button
            type="submit"
            disabled={modePending}
            className="w-full sm:w-auto"
          >
            {modePending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Saving modes...
              </span>
            ) : (
              "Save Service Modes"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  if (!canManageProvider) {
    return (
      <div className="space-y-6">
        {personalPanel}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <HugeiconsIcon
                icon={Store01Icon}
                strokeWidth={1.8}
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Provider Configuration
            </CardTitle>
            <CardDescription>
              Only a Provider Owner can change business and Service Mode
              settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <Tabs defaultValue="profile" className="w-full gap-5">
      <TabsList className="w-full justify-start sm:w-fit">
        <TabsTrigger value="profile">
          <HugeiconsIcon icon={UserIcon} strokeWidth={1.8} aria-hidden="true" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="business">
          <HugeiconsIcon
            icon={Store01Icon}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          Business
        </TabsTrigger>
        <TabsTrigger value="service-modes">
          <HugeiconsIcon
            icon={DeliveryTruck01Icon}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          Service modes
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profile">{personalPanel}</TabsContent>
      <TabsContent value="business">{providerPanel}</TabsContent>
      <TabsContent value="service-modes">{serviceModesPanel}</TabsContent>
    </Tabs>
  );
}
