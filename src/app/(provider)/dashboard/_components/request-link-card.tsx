"use client";

import Link from "next/link";
import { useRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/shared/copy-button";

export function RequestLinkCard({
  url,
  acceptingRequests,
}: {
  url: string;
  acceptingRequests: boolean;
}) {
  const urlRef = useRef<HTMLElement>(null);

  return (
    <Card className="min-w-0 space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Your request link</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers send repair requests through this link.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {acceptingRequests ? "Accepting requests" : "Not accepting requests"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 [&_button]:min-h-11 sm:[&_button]:min-h-8">
        <code
          ref={urlRef}
          title={url}
          className="block min-w-0 flex-1 basis-full truncate rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-xs select-all sm:basis-64 sm:text-sm"
        >
          {url}
        </code>
        <CopyButton text={url} targetRef={urlRef} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({
            variant: "outline",
            className: "shrink-0",
          })}
        >
          Open
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-9 items-center text-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Settings → Business
      </Link>
    </Card>
  );
}
