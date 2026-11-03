"use client";

import { RefObject, useEffect, useRef } from "react";

export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));

/** Maps p in [a, b] to [0, 1]. */
export const segment = (p: number, a: number, b: number) =>
  clamp((p - a) / (b - a));

export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/**
 * Calls onProgress (inside rAF) with how far the "pen" has travelled through
 * the element. The pen sits at `penAt` of the viewport height, so every road
 * segment on the page draws in step with the same point on screen.
 */
export function useDrawProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress: (p: number) => void,
  penAt = 0.7,
) {
  const cb = useRef(onProgress);
  useEffect(() => {
    cb.current = onProgress;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cb.current(1);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const pen = window.innerHeight * penAt;
      cb.current(clamp((pen - rect.top) / Math.max(rect.height, 1)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, penAt]);
}
