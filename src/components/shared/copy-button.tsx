"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { RefObject } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type CopyEnvironment = {
  clipboard?: Pick<Clipboard, "writeText">;
  fallback: (text: string) => boolean;
};

// Older browsers and blocked clipboard permissions still allow copying the
// current selection, so copy through a temporary off-screen textarea.
function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export async function copyText(
  text: string,
  environment: CopyEnvironment = {
    clipboard: navigator.clipboard,
    fallback: copyWithTextarea,
  },
): Promise<boolean> {
  if (environment.clipboard) {
    try {
      await environment.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard was refused; try the selection-based fallback.
    }
  }
  return environment.fallback(text);
}

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
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  // When copying fails, select the visible text so the person can copy it
  // with the keyboard or the context menu.
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
    const copied = await copyText(text);
    if (!copied) {
      selectTarget();
    }
    setStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), copied ? 2000 : 4000);
  }

  const announcement =
    status === "copied"
      ? copiedLabel
      : status === "failed"
        ? "Couldn't copy. Select the text to copy it."
        : "";

  if (iconOnly) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          aria-label={label}
          className="text-muted-foreground"
        >
          <HugeiconsIcon
            icon={status === "copied" ? Tick02Icon : Copy01Icon}
            strokeWidth={2}
            aria-hidden="true"
            className="size-3.5"
          />
        </Button>
        {status === "failed" ? (
          <span aria-hidden="true" className="text-xs text-destructive">
            Couldn&apos;t copy
          </span>
        ) : null}
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={status === "copied" ? "default" : "outline"}
        size="sm"
        onClick={copy}
      >
        {status === "copied"
          ? copiedLabel
          : status === "failed"
            ? "Couldn't copy"
            : label}
      </Button>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
