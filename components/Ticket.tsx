"use client";

import { useEffect, useRef } from "react";
import { TIMEZONES, type TimezoneKey } from "@/lib/event";
import styles from "./Ticket.module.css";

type Countdown = { days: number; hours: number; mins: number; secs: number } | null;

type Props = {
  tz: TimezoneKey;
  onTz: (tz: TimezoneKey) => void;
  countdown: Countdown;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The invitation as a 3D paper ticket: cream stock with notched perforation,
 * a gold-foil sheen, and a gentle tilt toward the pointer. It is built in CSS
 * 3D rather than WebGL so the text stays crisp and the controls stay real.
 */
export default function Ticket({ tz, onTz, countdown: cd }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const when = TIMEZONES[tz];

  useEffect(() => {
    const stage = stageRef.current;
    const face = faceRef.current;
    const main = mainRef.current;
    if (!stage || !face || !main) return;

    // cut the notches exactly where the perforation falls: across the top and
    // bottom when side by side, at the left and right edges when stacked
    const fit = () => {
      const stacked = main.offsetWidth >= face.clientWidth - 1;
      stage.style.setProperty("--n1", stacked ? `0 ${main.offsetHeight}px` : `${main.offsetWidth}px 0`);
      stage.style.setProperty("--n2", stacked ? `100% ${main.offsetHeight}px` : `${main.offsetWidth}px 100%`);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(face);
    fit();

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          stage.classList.add(styles.in);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(stage);
    if (still) {
      return () => {
        io.disconnect();
        ro.disconnect();
      };
    }

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      stage.style.setProperty("--ry", `${(nx - 0.5) * 16}deg`);
      stage.style.setProperty("--rx", `${(0.5 - ny) * 10}deg`);
      stage.style.setProperty("--mx", `${nx * 100}%`);
      stage.style.setProperty("--my", `${ny * 100}%`);
    };
    const onLeave = () => {
      stage.style.removeProperty("--ry");
      stage.style.removeProperty("--rx");
      stage.style.removeProperty("--mx");
      stage.style.removeProperty("--my");
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      io.disconnect();
      ro.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={stageRef} className={styles.stage}>
      <div className={styles.float}>
        <div className={styles.ticket}>
          <div ref={faceRef} className={styles.face}>
            <div ref={mainRef} className={styles.main}>
              <p className={styles.label}>Date &amp; Time</p>
              <p className={styles.date}>{when.date}</p>
              <p className={styles.time}>
                {when.time} {when.label} · Zoom
              </p>
              <div
                className={`${styles.tz} ${tz === "kst" ? styles.tzRight : ""}`}
                role="group"
                aria-label="시간대 선택"
              >
                <span className={styles.tzThumb} aria-hidden="true" />
                {(Object.keys(TIMEZONES) as TimezoneKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={tz === k}
                    className={`${styles.tzBtn} ${tz === k ? styles.tzOn : ""}`}
                    onClick={() => onTz(k)}
                  >
                    {TIMEZONES[k].label}
                  </button>
                ))}
              </div>
              <p className={styles.serial}>UTKCC Career Seminar · No. 1121</p>
            </div>

            <div className={styles.stub}>
              <p className={styles.label}>Departs in</p>
              <div className={styles.countdown} aria-live="off">
                {(
                  [
                    ["Days", cd?.days],
                    ["Hrs", cd?.hours],
                    ["Min", cd?.mins],
                    ["Sec", cd?.secs],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className={styles.cdCol}>
                    <span className={styles.cdValue}>{v === undefined ? "--" : pad(v)}</span>
                    <span className={styles.cdLabel}>{label}</span>
                  </div>
                ))}
              </div>
              <p className={styles.admit}>Admit one</p>
            </div>

            <span className={styles.sheen} aria-hidden="true" />
          </div>
        </div>
      </div>
      <span className={styles.shadow} aria-hidden="true" />
    </div>
  );
}
