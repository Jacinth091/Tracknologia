"use client";

import type { RefObject } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  targetRef,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  text: string;
  targetRef?: RefObject<HTMLElement | null>;
  label?: string;
  copiedLabel?: string;
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
