"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

/** Кнопка «копіювати» з короткою підтвердною анімацією. */
export function CopyButton({
  text,
  label = "Копіювати",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard недоступний — тихо ігноруємо */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={[
        "inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[12px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-honey)]/40 hover:text-[var(--color-fg)]",
        className,
      ].join(" ")}
      aria-label={label}
    >
      {copied ? (
        <CheckIcon width={13} height={13} className="text-[var(--color-online)]" />
      ) : (
        <CopyIcon width={13} height={13} />
      )}
      {copied ? "Скопійовано" : label}
    </button>
  );
}
