"use client";

import { useEffect, useState } from "react";
import {
  EVENT_START,
  FORKS,
  LINKS,
  type TimezoneKey,
  type Track,
  ZOOM_ID,
  ZOOM_PASSCODE,
} from "@/lib/event";
import { PERSONAS, typeCode } from "@/lib/persona";
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

  const chosen = FORKS.map((f) => picks[f.id] ?? null);
  const code = typeCode(chosen);
  const persona = PERSONAS[code];
  const left = chosen.filter((c) => c === null).length;
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!persona) return;
    const text = `나의 커리어 유형은 ${code} · ${persona.name}\n"${persona.motto}"\nUTKCC Career Seminar 2026 · Crossroad`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: nothing to do
    }
  };

  return (
    <section className={styles.destination} aria-labelledby="dest-title">
      <p className={styles.eyebrow}>Destination</p>
      <h2 id="dest-title" className={styles.heading}>
        어느 길을 골랐든,
        <br />
        같은 자리에서 만나요
      </h2>

      <Ticket tz={tz} onTz={setTz} countdown={cd} />

      {/* the one thing to keep from this page: how to get in on the day */}
      <div id="zoom" className={styles.zoom}>
        <a className={styles.zoomBtn} href={LINKS.zoom} target="_blank" rel="noreferrer">
          <svg
            className={styles.zoomIcon}
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
            <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
          </svg>
          Zoom으로 입장하기
          <span className={styles.zoomArrow} aria-hidden="true">→</span>
        </a>
        {ZOOM_ID || ZOOM_PASSCODE ? (
          <p className={styles.zoomMeta}>
            {ZOOM_ID ? (
              <span>
                회의 ID <strong>{ZOOM_ID}</strong>
              </span>
            ) : null}
            {ZOOM_PASSCODE ? (
              <span>
                암호 <strong>{ZOOM_PASSCODE}</strong>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {/* the route you walked, as a line map whose stations spell your type */}
      <div className={styles.route}>
        <p className={styles.label}>나의 갈림길</p>
        <ol className={styles.stops}>
          {FORKS.map((f, i) => {
            const c = chosen[i];
            return (
              <li key={f.id} className={`${styles.stop} ${c !== null ? styles.stopOn : ""}`}>
                <span className={styles.stopDot} aria-hidden="true">
                  {c !== null ? f.codes[c][0] : ""}
                </span>
                <span className={styles.stopTopic}>{f.label.split(" · ")[1]}</span>
                <span className={styles.stopPick}>{c !== null ? f.options[c] : "—"}</span>
              </li>
            );
          })}
        </ol>

        <div className={`${styles.type} ${persona ? styles.typeOn : ""}`} aria-live="polite">
          <p className={styles.typeLabel}>My Career Type</p>
          <p className={styles.code} aria-label={persona ? `유형 ${code}` : "아직 정해지지 않은 유형"}>
            {FORKS.map((f, i) => {
              const c = chosen[i];
              return (
                <span key={f.id} className={styles.codeCell}>
                  <span className={styles.codeLetter}>{c !== null ? f.codes[c][0] : "?"}</span>
                  <span className={styles.codeWord}>{c !== null ? f.codes[c][1] : "\u00a0"}</span>
                </span>
              );
            })}
          </p>
          {persona ? (
            <>
              <h3 className={styles.typeName}>{persona.name}</h3>
              <p className={styles.motto}>“{persona.motto}”</p>
              <span className={styles.rule} aria-hidden="true" />
              <p className={styles.about}>{persona.about}</p>
              <ul className={styles.tags}>
                {persona.tags.map((t) => (
                  <li key={t}>#{t}</li>
                ))}
              </ul>
              <div className={styles.ask}>
                <p className={styles.askLabel}>선배님께 꼭 물어보세요</p>
                <p className={styles.askText}>{persona.ask}</p>
              </div>
              <button type="button" className={styles.share} onClick={share}>
                {copied ? "복사했어요 ✓" : "내 유형 복사하기"}
              </button>
            </>
          ) : (
            <p className={styles.pending}>
              갈림길 {FORKS.length}개 중 <strong>{FORKS.length - left}개</strong>를 골랐어요.
              <br />
              위로 돌아가 남은 길을 고르면 나의 커리어 유형이 나와요.
            </p>
          )}
          <p className={styles.fine}>16가지 유형은 재미로 보는 결과예요. 정답은 선배님들의 이야기 속에!</p>
        </div>

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

      <footer className={styles.footer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/utkcc-logo.png" alt="" className={styles.footLogo} />
        <span>UTKCC · Career Seminar 2026</span>
      </footer>
    </section>
  );
}
