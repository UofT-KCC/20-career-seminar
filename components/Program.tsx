"use client";

import { TRACKS, type Track } from "@/lib/event";
import styles from "./Program.module.css";

type Props = {
  track: Track | null;
  onTrack: (t: Track) => void;
};

export default function Program({ track, onTrack }: Props) {
  return (
    <section className={styles.program} aria-labelledby="program-title">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Program</p>
        <h2 id="program-title" className={styles.heading}>
          이제, 선배님들의 갈림길로
        </h2>
      </header>

      <ol className={styles.parts}>
        <li className={styles.part}>
          <span className={styles.num} aria-hidden="true">
            01
          </span>
          <div>
            <p className={styles.kind}>Panel</p>
            <h3 className={styles.title}>갈림길에 섰던 순간</h3>
            <p className={styles.desc}>
              선배님 한 분 한 분이 인생의 결정적 갈림길 2–3개를 꼽고, 무엇을 기준으로
              골랐는지, 지금 돌아보면 어떤지 이야기합니다.
            </p>
          </div>
        </li>

        <li className={styles.part}>
          <span className={styles.num} aria-hidden="true">
            02
          </span>
          <div>
            <p className={styles.kind}>Breakout Room</p>
            <h3 className={styles.title}>나의 길, 선배의 길</h3>
            <p className={styles.desc}>
              선배님별 경로로 방을 나눠, 내 상황에 꼭 맞는 질문을 가까이에서 나눕니다.
            </p>
            <p className={styles.pickLabel} id="track-label">
              가장 궁금한 길은?
            </p>
            <div className={styles.tracks} role="group" aria-labelledby="track-label">
              {TRACKS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={track === t}
                  className={`${styles.track} ${track === t ? styles.trackOn : ""}`}
                  onClick={() => onTrack(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
