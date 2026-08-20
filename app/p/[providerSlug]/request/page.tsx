import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Request a Repair — Tracknologia",
  description: "Submit a repair request to your repair provider",
};

export default async function ProviderRequestPage(props: {
  params: Promise<{ providerSlug: string }>;
}) {
  const { providerSlug } = await props.params;
  const formattedProviderName = providerSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/80 bg-background/95">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
            Tracknologia
          </Link>
          <Link
            href="/track"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Track Existing Repair
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Request Repair with {formattedProviderName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Fill in your device information and issue details. The provider will review
              and provide an intake confirmation.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Customer & Device Intake</CardTitle>
              <CardDescription>
                Provide accurate details to help diagnose and prepare parts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    1. Contact Information
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="customerName">Your Full Name</Label>
                      <Input id="customerName" name="customerName" placeholder="Jane Doe" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerPhone">Phone Number</Label>
                      <Input id="customerPhone" name="customerPhone" type="tel" placeholder="(555) 000-0000" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerEmail">Email Address (Optional)</Label>
                    <Input id="customerEmail" name="customerEmail" type="email" placeholder="jane@example.com" />
                  </div>
                </div>

                {/* Device Details */}
                <div className="space-y-4 border-t border-border/60 pt-6">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    2. Device Information
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="deviceType">Device Type</Label>
                      <Input id="deviceType" name="deviceType" placeholder="Phone, Laptop, etc." required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="brand">Brand</Label>
                      <Input id="brand" name="brand" placeholder="e.g. Apple, Samsung" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="model">Model</Label>
                      <Input id="model" name="model" placeholder="e.g. iPhone 15, ThinkPad X1" />
                    </div>
                  </div>
                </div>

                {/* Problem Description */}
                <div className="space-y-4 border-t border-border/60 pt-6">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    3. Reported Problem
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="reportedProblem">What is the issue with your device?</Label>
                    <textarea
                      id="reportedProblem"
                      name="reportedProblem"
                      rows={3}
                      className="w-full rounded-xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                      placeholder="Describe what happened, any symptoms, or troubleshooting attempts..."
                      required
                    />
                  </div>
                </div>

                {/* Service Mode Preference */}
                <div className="space-y-4 border-t border-border/60 pt-6">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    4. Preferred Service Mode
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { id: "DROP_OFF", label: "Drop-off", sub: "At shop" },
                      { id: "MEETUP", label: "Meetup", sub: "Agreed spot" },
                      { id: "HOME_SERVICE", label: "Home Service", sub: "On-site" },
                      { id: "OTHER", label: "Other", sub: "Custom" },
                    ].map((mode) => (
                      <label
                        key={mode.id}
                        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-border p-3 text-center transition-all hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-2 has-checked:ring-primary/20"
                      >
                        <input
                          type="radio"
                          name="serviceMode"
                          value={mode.id}
                          defaultChecked={mode.id === "DROP_OFF"}
                          className="sr-only"
                        />
                        <span className="text-xs font-semibold text-foreground">{mode.label}</span>
                        <span className="text-[11px] text-muted-foreground">{mode.sub}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full">
                  Submit Repair Request
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
