import type { KeyboardEvent, RefObject } from "react";

/** ArrowUp / ArrowDown move between score fields instead of changing the number. */
export function handleScoreGridKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  index: number,
  refs: RefObject<(HTMLInputElement | null)[]>,
) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const next = event.key === "ArrowDown" ? index + 1 : index - 1;
  const target = refs.current?.[next];
  if (!target) return;
  target.focus();
  target.select();
}
