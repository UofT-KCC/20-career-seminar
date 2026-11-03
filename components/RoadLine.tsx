"use client";

import { ReactNode, useRef } from "react";
import { useDrawProgress } from "@/lib/useScrollProgress";
import styles from "./Road.module.css";

/**
 * A straight stretch of road that inks itself in as you scroll past.
 * `note` is a margin annotation that sits beside the road once `noteShown`.
 */
export default function RoadLine({
  height = 120,
  dot = false,
  note,
  noteShown = false,
}: {
  height?: number;
  dot?: boolean;
  note?: ReactNode;
  noteShown?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);

  useDrawProgress(ref, (p) => {
    if (inkRef.current) inkRef.current.style.transform = `scaleY(${p})`;
  });

  return (
    <div ref={ref} className={styles.line} style={{ height }}>
      <span ref={inkRef} className={styles.lineInk} aria-hidden="true" />
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {note && (
        <p className={`${styles.note} ${noteShown ? styles.noteShown : ""}`} aria-live="polite">
          {noteShown ? note : null}
        </p>
      )}
    </div>
  );
}
