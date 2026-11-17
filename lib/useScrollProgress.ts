"use client";

export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));

/** Maps p in [a, b] to [0, 1]. */
export const segment = (p: number, a: number, b: number) =>
  clamp((p - a) / (b - a));

export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
