"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RequestLinkCard({
  url,
  acceptingRequests,
}: {
  url: string;
  acceptingRequests: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLElement>(null);

  function selectUrl() {
    const node = urlRef.current;
    if (!node) {
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  async function copyUrl() {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        // Clipboard was refused; fall back to selecting the link below.
      }
    }
    selectUrl();
  }

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
          <button
            type="button"
            onClick={copyUrl}
            className={cn(
              buttonVariants({
                variant: copied ? "default" : "outline",
                size: "sm",
              }),
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
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
