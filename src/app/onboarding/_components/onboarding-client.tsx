"use client";

import { useActionState, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  DeliveryTruck01Icon,
  MapPinIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import {
  onboardIndependentAction,
  onboardShopAction,
  acceptStaffInviteAction,
} from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import type { RegisterInput } from "@/features/auth";
import { DeviceCategoryFields } from "@/features/providers/ui/device-category-fields";
import type { InvitationShopDetails } from "@/features/providers";

const SERVICE_MODE_OPTIONS = [
  { value: "DROP_OFF", label: "Drop-off" },
  { value: "MEETUP", label: "Meetup" },
  { value: "HOME_SERVICE", label: "Home service" },
  { value: "OTHER", label: "Other arrangement" },
] as const;

function CheckChip({
  name,
  value,
  label,
  disabled,
}: {
  name: string;
  value: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-foreground has-[:checked]:bg-muted has-[:checked]:font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
      <input
        type="checkbox"
        name={name}
        value={value}
        className="size-4 shrink-0 accent-foreground"
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function ProviderOperatingFields({
  prefix,
  isPending,
  fieldErrors,
}: {
  prefix: string;
  isPending: boolean;
  fieldErrors?: Record<string, string>;
}) {
  return (
    <section
      className="grid gap-5 border-t border-border pt-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8"
      aria-labelledby={`${prefix}-services-heading`}
    >
      <div className="space-y-1.5">
        <h2 id={`${prefix}-services-heading`} className="text-lg font-semibold">
          Services &amp; coverage
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Let customers know what you repair and how to arrange it.
        </p>
      </div>
      <div className="min-w-0 space-y-6">
        <details
          open={Boolean(
            fieldErrors?.description ||
            fieldErrors?.publicAddress ||
            fieldErrors?.serviceArea,
          )}
          className="space-y-4"
        >
          <summary className="cursor-pointer rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            About &amp; location (optional)
          </summary>
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-description`}>
              Provider Description
            </Label>
            <Textarea
              id={`${prefix}-description`}
              name="description"
              placeholder="Briefly describe your repair services and specialties"
              disabled={isPending}
              maxLength={1000}
              aria-invalid={Boolean(fieldErrors?.description)}
              aria-describedby={
                fieldErrors?.description
                  ? `${prefix}-description-error`
                  : undefined
              }
            />
            <FieldError
              id={`${prefix}-description-error`}
              message={fieldErrors?.description}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-address`}>
                Public Address (Optional)
              </Label>
              <Input
                id={`${prefix}-address`}
                name="publicAddress"
                placeholder="Storefront or public meeting address"
                disabled={isPending}
                maxLength={300}
                aria-invalid={Boolean(fieldErrors?.publicAddress)}
                aria-describedby={
                  fieldErrors?.publicAddress
                    ? `${prefix}-address-error`
                    : undefined
                }
              />
              <FieldError
                id={`${prefix}-address-error`}
                message={fieldErrors?.publicAddress}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-area`}>Service Area (Optional)</Label>
              <Input
                id={`${prefix}-area`}
                name="serviceArea"
                placeholder="e.g. Metro Cebu and nearby cities"
                disabled={isPending}
                maxLength={300}
                aria-invalid={Boolean(fieldErrors?.serviceArea)}
                aria-describedby={
                  fieldErrors?.serviceArea ? `${prefix}-area-error` : undefined
                }
              />
              <FieldError
                id={`${prefix}-area-error`}
                message={fieldErrors?.serviceArea}
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A storefront address is not required. Only share an address you want
            customers to see.
          </p>
        </details>

        <fieldset
          className="group/service-modes space-y-3"
          aria-invalid={Boolean(fieldErrors?.serviceModes)}
          aria-describedby={
            fieldErrors?.serviceModes ? `${prefix}-modes-error` : undefined
          }
        >
          <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HugeiconsIcon
              icon={DeliveryTruck01Icon}
              strokeWidth={1.8}
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            How customers get repairs
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_MODE_OPTIONS.map((option) => (
              <CheckChip
                key={option.value}
                name="serviceModes"
                value={option.value}
                label={option.label}
                disabled={isPending}
              />
            ))}
          </div>
          <div className="hidden space-y-2 group-has-[input[value=OTHER]:checked]/service-modes:block">
            <Label htmlFor={`${prefix}-other`}>Other arrangement details</Label>
            <Input
              id={`${prefix}-other`}
              name="serviceModeDetails.OTHER"
              placeholder="Describe how the repair is arranged"
              disabled={isPending}
              maxLength={240}
            />
          </div>
          <FieldError
            id={`${prefix}-modes-error`}
            message={fieldErrors?.serviceModes}
          />
        </fieldset>

        <DeviceCategoryFields
          disabled={isPending}
          error={fieldErrors?.supportedDevices}
        />

        <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-5 has-[:disabled]:opacity-50">
          <input
            type="checkbox"
            name="acceptingRequests"
            className="mt-0.5 size-4 rounded border-border accent-foreground"
            defaultChecked
            disabled={isPending}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Accept new Repair Requests
            </span>
            <span className="block text-xs text-muted-foreground">
              Let customers send requests through your public page.
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}

interface OnboardingClientProps {
  defaultInviteToken?: string;
  initialAccountIntent?: RegisterInput["intent"];
  initialDisplayName?: string;
  initialEmail?: string;
  shopDetails?: InvitationShopDetails | null;
}

export function OnboardingClient({
  defaultInviteToken,
  initialAccountIntent,
  initialDisplayName,
  initialEmail,
  shopDetails,
}: OnboardingClientProps) {
  // If the user registered as a specific provider type or has an invite token/shopDetails, lock to that sole flow
  const lockedType =
    defaultInviteToken || shopDetails ? "STAFF" : initialAccountIntent;
  const [selectedType, setSelectedType] = useState<RegisterInput["intent"]>(
    lockedType ?? "INDEPENDENT",
  );

  const [indState, indAction, indPending] = useActionState(
    onboardIndependentAction,
    null,
  );
  const [shopState, shopAction, shopPending] = useActionState(
    onboardShopAction,
    null,
  );
  const [staffState, staffAction, staffPending] = useActionState(
    acceptStaffInviteAction,
    null,
  );

  const isPending = indPending || shopPending || staffPending;
  const currentFlow = lockedType ?? selectedType;
  const isShop = currentFlow === "SHOP";
  const ownerState = isShop ? shopState : indState;
  const ownerPending = isShop ? shopPending : indPending;

  return (
    <div
      className={
        currentFlow === "STAFF" ? "mx-auto max-w-2xl space-y-8" : "space-y-8"
      }
    >
      <div className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          {currentFlow === "STAFF"
            ? "Join your shop"
            : currentFlow === "SHOP"
              ? "Set up your repair shop"
              : "Set up your independent profile"}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          {currentFlow === "STAFF"
            ? "Add your details to finish joining your team."
            : "A few details to make this workspace yours. You can update your profile in Settings."}
        </p>
      </div>
      {/* Only show flow switcher if the user did not register as a specific account type */}
      {!lockedType && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            How will you use Tracknologia?
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                { value: "INDEPENDENT", label: "Independent" },
                { value: "SHOP", label: "Shop Owner" },
                { value: "STAFF", label: "Shop Staff" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-medium transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-foreground has-[:checked]:bg-muted/50 has-[:disabled]:opacity-50"
              >
                <input
                  type="radio"
                  name="onboarding-intent"
                  value={option.value}
                  checked={currentFlow === option.value}
                  onChange={() => setSelectedType(option.value)}
                  disabled={isPending}
                  className="size-4 shrink-0 accent-foreground"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Card className="p-5 sm:p-8">
        {currentFlow !== "STAFF" && (
          <form
            key={currentFlow}
            action={isShop ? shopAction : indAction}
            className="space-y-8"
            aria-busy={isPending}
          >
            {ownerState?.error && (
              <Alert variant="destructive">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  strokeWidth={1.8}
                  className="size-4"
                  aria-hidden="true"
                />
                <AlertTitle>Could not complete setup</AlertTitle>
                <AlertDescription>{ownerState.error}</AlertDescription>
              </Alert>
            )}

            <section
              className="grid gap-5 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8"
              aria-labelledby="your-details-heading"
            >
              <div className="space-y-1.5">
                <h2 id="your-details-heading" className="text-lg font-semibold">
                  Personal details
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your personal profile, separate from your public business
                  details.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="setup-ownerName">
                    {isShop ? "Your Full Name (Owner) *" : "Your Full Name *"}
                  </Label>
                  <Input
                    id="setup-ownerName"
                    name="ownerName"
                    placeholder="e.g. Alex Martinez"
                    disabled={isPending}
                    required
                    autoComplete="name"
                    maxLength={120}
                    aria-invalid={Boolean(ownerState?.fieldErrors?.ownerName)}
                    aria-describedby={
                      ownerState?.fieldErrors?.ownerName
                        ? "owner-name-error"
                        : undefined
                    }
                  />
                  <FieldError
                    id="owner-name-error"
                    message={ownerState?.fieldErrors?.ownerName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-ownerPhone">
                    Your phone (optional)
                  </Label>
                  <Input
                    id="setup-ownerPhone"
                    name="ownerContactPhone"
                    type="tel"
                    placeholder="+63 912 345 6789"
                    disabled={isPending}
                    autoComplete="tel"
                    maxLength={40}
                    aria-invalid={Boolean(
                      ownerState?.fieldErrors?.ownerContactPhone,
                    )}
                    aria-describedby={
                      ownerState?.fieldErrors?.ownerContactPhone
                        ? "owner-phone-error"
                        : undefined
                    }
                  />
                  <FieldError
                    id="owner-phone-error"
                    message={ownerState?.fieldErrors?.ownerContactPhone}
                  />
                </div>
              </div>
            </section>
            <section
              className="grid gap-5 border-t border-border pt-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8"
              aria-labelledby="business-heading"
            >
              <div className="space-y-1.5">
                <h2 id="business-heading" className="text-lg font-semibold">
                  {isShop ? "Shop details" : "Business details"}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The name and contact details customers see.
                </p>
              </div>
              <div className="min-w-0 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="setup-name">
                    {isShop
                      ? "Shop / Business Name *"
                      : "Repair Brand / Business Name *"}
                  </Label>
                  <Input
                    id="setup-name"
                    name="displayName"
                    defaultValue={initialDisplayName ?? ""}
                    placeholder="e.g. Alex Tech Services"
                    disabled={isPending}
                    required
                    maxLength={120}
                    aria-invalid={Boolean(ownerState?.fieldErrors?.displayName)}
                    aria-describedby={
                      ownerState?.fieldErrors?.displayName
                        ? "business-name-error"
                        : undefined
                    }
                  />
                  <FieldError
                    id="business-name-error"
                    message={ownerState?.fieldErrors?.displayName}
                  />
                </div>
                <details
                  open={Boolean(
                    ownerState?.fieldErrors?.contactEmail ||
                    ownerState?.fieldErrors?.contactPhone,
                  )}
                >
                  <summary className="cursor-pointer rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    Public contact (optional)
                  </summary>
                  <div className="mt-5 grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="setup-email">Contact Email</Label>
                      <Input
                        id="setup-email"
                        name="contactEmail"
                        type="email"
                        defaultValue={initialEmail ?? ""}
                        placeholder="alex@mobiletech.com"
                        disabled={isPending}
                        maxLength={254}
                        aria-invalid={Boolean(
                          ownerState?.fieldErrors?.contactEmail,
                        )}
                        aria-describedby={
                          ownerState?.fieldErrors?.contactEmail
                            ? "contact-email-error"
                            : undefined
                        }
                      />
                      <FieldError
                        id="contact-email-error"
                        message={ownerState?.fieldErrors?.contactEmail}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="setup-phone">Contact Phone</Label>
                      <Input
                        id="setup-phone"
                        name="contactPhone"
                        type="tel"
                        placeholder="+63 912 345 6789"
                        disabled={isPending}
                        maxLength={40}
                        aria-invalid={Boolean(
                          ownerState?.fieldErrors?.contactPhone,
                        )}
                        aria-describedby={
                          ownerState?.fieldErrors?.contactPhone
                            ? "contact-phone-error"
                            : undefined
                        }
                      />
                      <FieldError
                        id="contact-phone-error"
                        message={ownerState?.fieldErrors?.contactPhone}
                      />
                    </div>
                  </div>
                </details>
              </div>
            </section>
            <ProviderOperatingFields
              prefix={isShop ? "shop" : "ind"}
              isPending={isPending}
              fieldErrors={ownerState?.fieldErrors}
            />

            <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Only your name and business name are required.
              </p>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                size="lg"
                disabled={isPending}
              >
                {ownerPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    Creating workspace...
                  </span>
                ) : isShop ? (
                  "Create shop"
                ) : (
                  "Create workspace"
                )}
              </Button>
            </div>
          </form>
        )}

        {currentFlow === "STAFF" && (
          <form
            action={staffAction}
            className="space-y-6"
            aria-busy={isPending}
          >
            {defaultInviteToken && (
              <input type="hidden" name="token" value={defaultInviteToken} />
            )}

            <div className="space-y-2 border-b border-border pb-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                  <HugeiconsIcon
                    icon={UserGroupIcon}
                    strokeWidth={1.8}
                    className="size-4"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {shopDetails?.shopName || "Repair Shop Invitation"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Role:{" "}
                    <span className="font-semibold text-foreground">Staff</span>
                  </p>
                </div>
              </div>
              {(shopDetails?.publicAddress || shopDetails?.serviceArea) && (
                <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
                  <HugeiconsIcon
                    icon={MapPinIcon}
                    strokeWidth={1.8}
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {[shopDetails.publicAddress, shopDetails.serviceArea]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              )}
            </div>

            {staffState?.error && (
              <Alert variant="destructive">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  strokeWidth={1.8}
                  className="size-4"
                  aria-hidden="true"
                />
                <AlertTitle>Could not join the shop</AlertTitle>
                <AlertDescription>{staffState.error}</AlertDescription>
              </Alert>
            )}

            {!defaultInviteToken && (
              <div className="space-y-2">
                <Label htmlFor="invite-token">Invitation code *</Label>
                <Input
                  id="invite-token"
                  name="token"
                  placeholder="Paste invitation token here"
                  disabled={isPending}
                  required
                  aria-invalid={Boolean(staffState?.fieldErrors?.token)}
                  aria-describedby={
                    staffState?.fieldErrors?.token
                      ? "invite-token-error"
                      : undefined
                  }
                />
                <FieldError
                  id="invite-token-error"
                  message={staffState?.fieldErrors?.token}
                />
              </div>
            )}

            <section
              aria-labelledby="staff-details-heading"
              className="space-y-4"
            >
              <h2 id="staff-details-heading" className="text-lg font-semibold">
                Personal details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="staff-fullName">Your Full Name *</Label>
                  <Input
                    id="staff-fullName"
                    name="fullName"
                    defaultValue={initialDisplayName ?? ""}
                    placeholder="e.g. Alex Martinez"
                    disabled={isPending}
                    required
                    autoComplete="name"
                    aria-invalid={Boolean(staffState?.fieldErrors?.fullName)}
                    aria-describedby={
                      staffState?.fieldErrors?.fullName
                        ? "staff-name-error"
                        : undefined
                    }
                  />
                  <FieldError
                    id="staff-name-error"
                    message={staffState?.fieldErrors?.fullName}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-contactPhone">
                    Contact Phone (Optional)
                  </Label>
                  <Input
                    id="staff-contactPhone"
                    name="contactPhone"
                    type="tel"
                    placeholder="+63 912 345 6789"
                    disabled={isPending}
                    autoComplete="tel"
                    aria-invalid={Boolean(
                      staffState?.fieldErrors?.contactPhone,
                    )}
                    aria-describedby={
                      staffState?.fieldErrors?.contactPhone
                        ? "staff-phone-error"
                        : undefined
                    }
                  />
                  <FieldError
                    id="staff-phone-error"
                    message={staffState?.fieldErrors?.contactPhone}
                  />
                </div>
              </div>
            </section>

            <Button type="submit" className="w-full" disabled={isPending}>
              {staffPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  Joining shop team...
                </span>
              ) : (
                "Join shop"
              )}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
