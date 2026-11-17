"use client";

import { useEffect, useState } from "react";
import { LINKS } from "@/lib/event";
import styles from "./ZoomDock.module.css";

/**
 * A small Zoom link tucked into the corner, so it can be tapped the moment the
 * page opens. It steps aside while the main Zoom button is on screen.
 */
export default function ZoomDock({ target }: { target: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  return (
    <a
      className={`${styles.dock} ${hidden ? styles.hidden : ""}`}
      href={LINKS.zoom}
      target="_blank"
      rel="noreferrer"
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
        <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
      </svg>
      Zoom 입장
    </a>
  );
}
