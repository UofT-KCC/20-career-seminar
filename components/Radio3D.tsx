"use client";

import { useEffect, useRef } from "react";
import { createRadio } from "@/lib/radio";
import styles from "./Program.module.css";

/** The 3D radio at the top of Part 3; it tilts toward the pointer anywhere on the card. */
export default function Radio3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const radio = createRadio(canvas, canvas.closest("article") ?? canvas);
    return radio.dispose;
  }, []);

  return <canvas ref={ref} className={styles.radioCanvas} aria-hidden="true" />;
}
