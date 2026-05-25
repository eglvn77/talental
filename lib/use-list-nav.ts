"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

/**
 * Shared listbox-keyboard-navigation hook. Powers every "type into
 * an input → arrow up/down through results → enter to pick" surface
 * in the app (search finders, comboboxes, autocompletes).
 *
 * Usage:
 *   const { highlight, setHighlight, onKeyDown } = useListNav(
 *     items,
 *     (item) => pick(item),
 *   );
 *   <input onKeyDown={onKeyDown} ... />
 *   {items.map((it, i) => (
 *     <button
 *       onMouseEnter={() => setHighlight(i)}
 *       className={i === highlight ? "bg-muted" : ""}
 *     >
 *       …
 *     </button>
 *   ))}
 *
 * - ArrowDown / ArrowUp move the highlight (clamped to the bounds).
 * - Enter fires `onSelect(items[highlight])` and prevents the
 *   browser's default form-submit behaviour.
 * - Highlight resets to 0 whenever the items reference changes, so
 *   a newly-filtered list always lands its arrow keys on the top
 *   match.
 */
export function useListNav<T>(
  items: ReadonlyArray<T>,
  onSelect: (item: T) => void,
) {
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setHighlight(0);
  }, [items]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const item = items[highlight];
      if (item !== undefined) {
        e.preventDefault();
        onSelect(item);
      }
    }
  }

  return { highlight, setHighlight, onKeyDown };
}
