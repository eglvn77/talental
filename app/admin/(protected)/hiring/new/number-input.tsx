"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Text input that displays a number with US thousand separators (50,000)
 * but submits the bare integer in a hidden field so the form action sees a
 * plain number. Allows empty.
 */
export function NumberInputWithCommas({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: number | null;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState<string>(
    defaultValue != null ? defaultValue.toLocaleString("en-US") : "",
  );
  const [raw, setRaw] = useState<string>(
    defaultValue != null ? String(defaultValue) : "",
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const stripped = e.target.value.replace(/[^\d]/g, "");
    setRaw(stripped);
    if (!stripped) {
      setDisplay("");
      return;
    }
    const n = Number(stripped);
    setDisplay(Number.isFinite(n) ? n.toLocaleString("en-US") : stripped);
  }

  return (
    <>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={onChange}
        placeholder={placeholder}
      />
      <input type="hidden" name={name} value={raw} />
    </>
  );
}
