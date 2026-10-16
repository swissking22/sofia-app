import type { KeyboardEvent, RefObject } from "react";

/**
 * Parse a mark field value, clamped to [0, maxScore].
 * Empty → null. Non-numeric → previous (caller keeps prior when null returned with invalid flag).
 */
export function clampScoreInput(
  value: string,
  maxScore: number,
): number | null {
  if (value.trim() === "") return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  const max = maxScore > 0 ? maxScore : 0;
  if (num < 0) return 0;
  if (num > max) return max;
  return num;
}

/**
 * Score grid keyboard: ArrowUp / ArrowDown / Enter move between fields
 * (instead of changing the number). Enter and ArrowDown go to the next student.
 */
export function handleScoreGridKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  index: number,
  refs: RefObject<(HTMLInputElement | null)[]>,
) {
  const down =
    event.key === "ArrowDown" || event.key === "Enter";
  const up = event.key === "ArrowUp";
  if (!down && !up) return;
  event.preventDefault();
  const next = down ? index + 1 : index - 1;
  const target = refs.current?.[next];
  if (!target) return;
  target.focus();
  target.select();
}
