"use client";

import { useEffect, useRef } from "react";
import { FORKS } from "@/lib/event";
import { END_START, FORK_COUNT, T, TOTAL, forkStart } from "@/lib/scene/constants";
import { createCrossroadScene, type Choice } from "@/lib/scene";
import { segment } from "@/lib/useScrollProgress";
import styles from "./CrossroadStage.module.css";

type Props = {
  choices: Choice[];
  onChoose: (fork: number, option: 0 | 1) => void;
};

/** in → hold → out, as an opacity. */
const window4 = (u: number, a: number, b: number, c: number, d: number) =>
  Math.min(segment(u, a, b), 1 - segment(u, c, d));

export default function CrossroadStage({ choices, onChoose }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createCrossroadScene> | null>(null);
  const uRef = useRef(0);
  const chooseRef = useRef(onChoose);
  /** An automatic ride to the next fork, in scroll units, driven by the render loop. */
  const glideRef = useRef<{ from: number; to: number; t0: number; dur: number } | null>(null);

  useEffect(() => {
    sceneRef.current?.setChoices(choices);
  }, [choices]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

    const scene = createCrossroadScene(canvas, FORKS.map((f) => f.options));
    sceneRef.current = scene;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => scene.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let last = start;
    const scrollU = () => Math.max(0, Math.min(TOTAL, -section.getBoundingClientRect().top / window.innerHeight));
    // The scene follows the scroll position through a soft spring, so wheel
    // notches and flicks become one continuous glide.
    let u = scrollU();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const glide = glideRef.current;
      if (glide) {
        // Ride on one eased curve, frame-locked to the camera, and bring the
        // page along so the scroll position agrees when the ride ends.
        const t = Math.min(1, Math.max(0, (now - glide.t0) / glide.dur));
        // half sine, half ease-out: it pulls away at once, then settles softly
        const e = 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * t)) + 0.5 * (1 - (1 - t) * (1 - t));
        u = glide.from + (glide.to - glide.from) * e;
        window.scrollTo({ top: section.offsetTop + u * window.innerHeight, behavior: "instant" });
        if (t >= 1) glideRef.current = null;
      } else {
        const target = scrollU();
        // a long jump (reload, End key) skips ahead and only glides the last screen
        if (Math.abs(target - u) > 2) u = target - Math.sign(target - u);
        u = still ? target : u + (target - u) * (1 - Math.exp(-dt * 3.2));
        if (Math.abs(target - u) < 1e-4) u = target;
      }
      uRef.current = u;
      scene.update(u, still ? 0 : (now - start) / 1000, dt);

      const set = (el: HTMLElement | null, o: number, rise = 14) => {
        if (!el) return;
        el.style.opacity = String(o);
        el.style.visibility = o > 0.001 ? "visible" : "hidden";
        el.style.translate = `0 ${(1 - o) * rise}px`;
      };
      set(titleRef.current, window4(u, 5.0, 5.6, T.hero + 0.1, T.hero + 0.6));
      set(introRef.current, window4(u, T.hero + 0.45, T.hero + 0.85, forkStart(0) - 0.45, forkStart(0) - 0.1));
      cardRefs.current.forEach((el, k) => {
        const s = forkStart(k);
        set(el, window4(u, s - 0.3, s + 0.05, s + T.dwell + 0.05, s + T.dwell + 0.4), -10);
      });
      set(endRef.current, window4(u, END_START + 0.3, END_START + 0.7, TOTAL - 0.75, TOTAL - 0.45));
      if (fadeRef.current) fadeRef.current.style.opacity = String(segment(u, TOTAL - 0.55, TOTAL - 0.05));
      hintRef.current?.classList.toggle(styles.hidden, u > 0.05);
    };

    const io = new IntersectionObserver(([entry]) => {
      scene.renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
    });
    io.observe(section);

    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return scene.pick(e.clientX - r.left, e.clientY - r.top, uRef.current);
    };
    const onMove = (e: PointerEvent) => {
      canvas.style.cursor = point(e) ? "pointer" : "";
    };
    const onClick = (e: PointerEvent) => {
      const hit = point(e);
      if (hit) chooseRef.current(hit.fork, hit.option);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onClick);

    // A deliberate scroll takes over from an automatic glide. Trackpad
    // momentum still trickling in from before the click does not count.
    const cancelGlide = () => {
      glideRef.current = null;
    };
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
    const onWheel = (e: WheelEvent) => {
      const g = glideRef.current;
      if (g && performance.now() - g.t0 > 400 && Math.abs(e.deltaY) > 12) cancelGlide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) cancelGlide();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", cancelGlide, { passive: true });
    window.addEventListener("keydown", onKey);

    return () => {
      io.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onClick);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", cancelGlide);
      window.removeEventListener("keydown", onKey);
      cancelGlide();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  /** After a choice, ride down the chosen path to the next fork. */
  const choose = (k: number, option: 0 | 1) => {
    onChoose(k, option);
    const from = uRef.current;
    // ride on until the next signpost stands square in frame, ready to choose again
    const to = k + 1 < FORK_COUNT ? forkStart(k + 1) + T.dwell * 0.7 : END_START + 1;
    if (to <= from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    glideRef.current = {
      from,
      to,
      // a brief beat for the chosen sign to light, then ~0.8s per screen
      t0: performance.now() + 120,
      dur: Math.min(4200, Math.max(2200, (to - from) * 800)),
    };
  };
  useEffect(() => {
    chooseRef.current = choose;
  });

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      style={{ height: `${(TOTAL + 1) * 100}vh` }}
      aria-label="Crossroad, 갈림길에서"
    >
      <div className={styles.sticky}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

        <div ref={titleRef} className={`${styles.overlay} ${styles.title}`}>
          <p className={styles.badge}>UTKCC Career Seminar 2026</p>
          <h1 className={styles.heading}>Crossroad</h1>
          <p className={styles.brush}>갈림길에서</p>
          <p className={styles.meta}>2026.11.21 SAT · 8PM EST · Zoom</p>
        </div>

        <div ref={introRef} className={`${styles.overlay} ${styles.intro}`}>
          <p className={styles.kicker}>Dear UTKCC,</p>
          <h2 className={styles.introHeading}>모든 커리어에는 갈림길이 있습니다</h2>
          <p className={styles.introBody}>
            선배님들도 그 앞에 서 있었습니다.
            <br />
            먼저, 나의 갈림길부터 걸어볼까요?
          </p>
        </div>

        {FORKS.map((fork, k) => (
          <div
            key={fork.id}
            ref={(el) => {
              cardRefs.current[k] = el;
            }}
            className={`${styles.overlay} ${styles.card}`}
          >
            <p className={styles.label}>{fork.label}</p>
            <h3 className={styles.question}>{fork.question}</h3>
            <p className={styles.cardHint}>
              {choices[k] === null ? (
                "표지판을 눌러 길을 골라보세요"
              ) : (
                <>
                  <strong>{fork.options[choices[k]!]}</strong> — {fork.echo}
                </>
              )}
            </p>
          </div>
        ))}

        {/* keyboard / screen-reader path to the same choices */}
        <div className={styles.srOnly}>
          {FORKS.map((fork, k) => (
            <div key={fork.id} role="group" aria-label={fork.question}>
              {fork.options.map((opt, i) => (
                <button key={opt} type="button" aria-pressed={choices[k] === i} onClick={() => choose(k, i as 0 | 1)}>
                  {opt}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div ref={endRef} className={`${styles.overlay} ${styles.end}`}>
          <p className={styles.kicker}>Destination</p>
          <h2 className={styles.introHeading}>어느 길을 골랐든, 같은 곳에서 만나요</h2>
        </div>

        <div ref={hintRef} className={styles.hint} aria-hidden="true">
          <span>Scroll</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        <div ref={fadeRef} className={styles.fade} aria-hidden="true" />
      </div>
    </section>
  );
}
