"use client";

import Link from "next/link";
import { useRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your request link</CardTitle>
        <CardDescription>
          Customers send repair requests through this link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <code
          ref={urlRef}
          title={url}
          className="block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-sm select-all"
        >
          {url}
        </code>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={url} targetRef={urlRef} />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          {acceptingRequests ? "Accepting requests" : "Not accepting requests"}
          {" · "}
          <Link
            href="/dashboard/settings"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Settings → Business
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
