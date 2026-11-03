"use client";

import { useState } from "react";
import { FORKS, type Track } from "@/lib/event";
import type { Choice } from "@/lib/scene";
import CrossroadStage from "./CrossroadStage";
import Destination from "./Destination";
import Program from "./Program";
import RoadLine from "./RoadLine";
import styles from "./Invitation.module.css";

export default function Invitation() {
  const [choices, setChoices] = useState<Choice[]>(() => FORKS.map(() => null));
  const [track, setTrack] = useState<Track | null>(null);

  const picks = Object.fromEntries(FORKS.map((f, k) => [f.id, choices[k]]));

  return (
    <main>
      <CrossroadStage
        choices={choices}
        onChoose={(k, option) => setChoices((prev) => prev.map((c, i) => (i === k ? option : c)))}
      />

      <section className={styles.letter} aria-labelledby="program-title">
        <p className={styles.body}>
          올해 커리어 세미나에서는 선배님들이 실제로 마주했던 선택의 순간과
          그때의 기준, 그리고 지금 돌아보는 이야기를 나눕니다.
        </p>
        <Program track={track} onTrack={setTrack} />
        <RoadLine height={140} />
      </section>

      <Destination picks={picks} track={track} />
    </main>
  );
}
