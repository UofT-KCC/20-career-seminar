"use client";

import { useEffect, useState } from "react";
import {
  EVENT_START,
  FORKS,
  LINKS,
  type TimezoneKey,
  type Track,
} from "@/lib/event";
import Ticket from "./Ticket";
import styles from "./Destination.module.css";

type Props = {
  picks: Record<string, 0 | 1 | null>;
  track: Track | null;
};

function useCountdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, EVENT_START.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (left === null) return null;
  const s = Math.floor(left / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

export default function Destination({ picks, track }: Props) {
  const [tz, setTz] = useState<TimezoneKey>("est");
  const cd = useCountdown();

  const path = FORKS.map((f) => {
    const v = picks[f.id];
    return v === null || v === undefined ? null : f.options[v];
  });

  return (
    <section className={styles.destination} aria-labelledby="dest-title">
      <p className={styles.eyebrow}>Destination</p>
      <h2 id="dest-title" className={styles.heading}>
        어느 길을 골랐든,
        <br />
        같은 자리에서 만나요
      </h2>

      <Ticket tz={tz} onTz={setTz} countdown={cd} />

      {/* the route you walked, as a line map */}
      <div className={styles.route}>
        <p className={styles.label}>나의 갈림길</p>
        <ol className={styles.stops}>
          {FORKS.map((f, i) => (
            <li key={f.id} className={`${styles.stop} ${path[i] ? styles.stopOn : ""}`}>
              <span className={styles.stopTopic}>{f.label.split(" · ")[1]}</span>
              <span className={styles.stopPick}>{path[i] ?? "—"}</span>
            </li>
          ))}
        </ol>
        <p className={styles.routeFoot}>
          {track ? (
            <>
              가장 궁금한 길 · <strong>{track}</strong>
              <br />
            </>
          ) : null}
          선배님들은 어떤 길을 골랐을까요? 11월 21일에 직접 물어보세요.
        </p>
      </div>

      <div className={styles.ctas}>
        <a className={styles.primary} href={LINKS.signup} target="_blank" rel="noreferrer">
          세미나 신청하기
          <span aria-hidden="true">→</span>
        </a>
        <a className={styles.secondary} href={LINKS.story} target="_blank" rel="noreferrer">
          익명 사연 보내기
        </a>
      </div>

      <footer className={styles.footer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/utkcc-logo.png" alt="" className={styles.footLogo} />
        <span>UTKCC · Career Seminar 2026</span>
      </footer>
    </section>
  );
}
