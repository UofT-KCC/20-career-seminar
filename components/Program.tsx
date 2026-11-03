"use client";

import { LINKS, STORY_DEADLINE, TRACKS, type Track } from "@/lib/event";
import Radio3D from "./Radio3D";
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

      <article className={styles.radio} aria-labelledby="radio-title">
        <Radio3D />
        <div className={styles.radioText}>
          <p className={styles.kind}>
            <span className={styles.numInline}>03</span> Radio
          </p>
          <h3 id="radio-title" className={styles.radioTitle}>
            갈림길 라디오
          </h3>
          <p className={styles.desc}>
            여러분의 익명 고민 사연에 선배님들이
            <br />
            <strong>&ldquo;나라면 이렇게 한다&rdquo;</strong>로 답해드립니다.
          </p>
          <a className={styles.storyBtn} href={LINKS.story} target="_blank" rel="noreferrer">
            익명 사연 보내기
            <span aria-hidden="true">→</span>
          </a>
          <p className={styles.deadline}>사연 마감 · {STORY_DEADLINE}</p>
        </div>
      </article>
    </section>
  );
}
