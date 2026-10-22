"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { RefObject } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  targetRef,
  label = "Copy",
  copiedLabel = "Copied",
  iconOnly = false,
}: {
  text: string;
  targetRef?: RefObject<HTMLElement | null>;
  label?: string;
  copiedLabel?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // When the clipboard is unavailable, select the visible text so the
  // person can copy it with the keyboard or the context menu.
  function selectTarget() {
    const node = targetRef?.current;
    if (!node) {
      return;
    }
    if (node instanceof HTMLInputElement) {
      node.focus();
      node.select();
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  async function copy() {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        // Clipboard was refused; fall back to selecting the text below.
      }
    }
    selectTarget();
  }

  if (iconOnly) {
    return (
      <span className="inline-flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          aria-label={label}
          className="text-muted-foreground"
        >
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            strokeWidth={2}
            aria-hidden="true"
            className="size-3.5"
          />
        </Button>
        <span aria-live="polite" className="sr-only">
          {copied ? copiedLabel : ""}
        </span>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant={copied ? "default" : "outline"}
      size="sm"
      onClick={copy}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
