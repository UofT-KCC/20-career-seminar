"use client";

import { useEffect, useRef, useState } from "react";
import { FORKS } from "@/lib/event";
import { END_START, ENV_W, FORK_COUNT, IMG_W, T, TOTAL, forkStart } from "@/lib/scene/constants";
import { createCrossroadScene, type Choice } from "@/lib/scene";
import { segment } from "@/lib/useScrollProgress";
import styles from "./CrossroadStage.module.css";

type Props = {
  choices: Choice[];
  onChoose: (fork: number, option: 0 | 1) => void;
};

/** Where the camera stands square to each fork's signs: the ride after a choice stops here, and touch scrolling settles here. */
const CHOOSE_AT = Array.from({ length: FORK_COUNT }, (_, k) => forkStart(k) + T.dwell * 0.7);

/** The opening frame fits the envelope to 62% of the width; its image is this much of the screen's width. */
const STILL_WIDTH = `${((0.62 * IMG_W) / ENV_W) * 100}%`;

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
  const stillRef = useRef<HTMLImageElement>(null);
  /** The sign under the pointer, mirrored into React only when it changes. */
  const [hover, setHover] = useState<{ fork: number; option: 0 | 1 } | null>(null);
  const hoverRef = useRef(hover);
  /** Last pointer position on the canvas, so hover follows the camera too. */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const sceneRef = useRef<ReturnType<typeof createCrossroadScene> | null>(null);
  const uRef = useRef(0);
  const chooseRef = useRef(onChoose);
  /** Set while the page rides on to the next fork after a choice: the camera follows more softly. */
  const ridingRef = useRef(false);

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

    // The page opens on a still of the envelope, sized to match the first 3D
    // frame exactly; it gives way once the scene has its art and has drawn.
    let ready = false;
    scene.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          ready = true;
          stillRef.current?.classList.add(styles.stillGone);
        }),
      ),
    );

    const start = performance.now();
    let last = start;
    const scrollU = () => Math.max(0, Math.min(TOTAL, -section.getBoundingClientRect().top / window.innerHeight));
    // The scene follows the scroll position through a critically damped spring
    // with a speed limit: a notch, a slow drag and a hard flick all become one
    // even glide, never a jump. The page itself is never moved from here, so
    // the scene can't pull against a finger.
    let u = scrollU();
    let vel = 0;
    const frame = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const target = scrollU();
      if (still) {
        u = target;
        vel = 0;
      } else {
        // a long jump (reload, End key) skips ahead and only rides the last screen
        if (Math.abs(target - u) > 6) {
          u = target - Math.sign(target - u);
          vel = 0;
        }
        const riding = ridingRef.current;
        const w = riding ? 2.4 : 5;
        const vmax = riding ? 2.2 : 3.2;
        for (let left = dt; left > 0; left -= 1 / 120) {
          const h = Math.min(left, 1 / 120);
          vel += (w * w * (target - u) - 2 * w * vel) * h;
          vel = Math.max(-vmax, Math.min(vmax, vel));
          u += vel * h;
        }
        if (Math.abs(target - u) < 1e-4 && Math.abs(vel) < 1e-3) {
          u = target;
          vel = 0;
        }
        if (riding && Math.abs(target - u) < 0.02) ridingRef.current = false;
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
        set(el, window4(u, s - 0.3, s + 0.05, s + T.dwell + 0.45, s + T.dwell + 0.85), -10);
      });
      set(endRef.current, window4(u, END_START + 0.3, END_START + 0.7, TOTAL - 0.75, TOTAL - 0.45));
      if (fadeRef.current) fadeRef.current.style.opacity = String(segment(u, TOTAL - 0.55, TOTAL - 0.05));
      hintRef.current?.classList.toggle(styles.hidden, u > 0.05);
      // if the art is slow to arrive, never let the still sit over a scene that has moved on
      if (!ready && u > 0.15) stillRef.current?.classList.add(styles.stillGone);

      // Re-pick every frame: the signs move under a still pointer while riding.
      const pt = pointerRef.current;
      const hit = pt && !ridingRef.current ? scene.pick(pt.x, pt.y, u) : null;
      canvas.style.cursor = hit ? "pointer" : "";
      const was = hoverRef.current;
      if (hit?.fork !== was?.fork || hit?.option !== was?.option) {
        hoverRef.current = hit ? { ...hit } : null;
        setHover(hoverRef.current);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      scene.renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
    });
    io.observe(section);

    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return scene.pick(e.clientX - r.left, e.clientY - r.top, uRef.current, e.pointerType !== "mouse");
    };
    const onMove = (e: PointerEvent) => {
      // touch has no hover: a tap chooses straight away
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      pointerRef.current = null;
    };
    const onClick = (e: PointerEvent) => {
      const hit = point(e);
      if (hit) chooseRef.current(hit.fork, hit.option);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onClick);

    // Taking the scroll back ends the softer ride-along; the browser stops its
    // own smooth scroll on its own.
    const cancelRide = () => {
      ridingRef.current = false;
    };
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) cancelRide();
    };
    window.addEventListener("wheel", cancelRide, { passive: true });
    window.addEventListener("touchstart", cancelRide, { passive: true });
    window.addEventListener("keydown", onKey);

    return () => {
      io.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerup", onClick);
      window.removeEventListener("wheel", cancelRide);
      window.removeEventListener("touchstart", cancelRide);
      window.removeEventListener("keydown", onKey);
      cancelRide();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  /**
   * After a choice, ride down the chosen path to the next fork. The browser
   * scrolls the page there smoothly and the camera follows it softly, so a
   * finger can take over at any point without the scene snapping back.
   */
  const choose = (k: number, option: 0 | 1) => {
    onChoose(k, option);
    const section = sectionRef.current;
    // ride on until the next signpost stands square in frame, ready to choose again
    const to = k + 1 < FORK_COUNT ? CHOOSE_AT[k + 1] : END_START + 1;
    if (!section || to <= uRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ridingRef.current = true;
    window.scrollTo({ top: section.offsetTop + to * window.innerHeight, behavior: "smooth" });
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
      {/* on touch screens the page settles at each fork, so a flick doesn't sail past the signs */}
      {CHOOSE_AT.map((at) => (
        <span key={at} className={styles.settle} style={{ top: `${at * 100}vh` }} aria-hidden="true" />
      ))}
      <div className={styles.sticky}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={stillRef}
          className={styles.still}
          src="/images/envelope-back.png"
          alt=""
          style={{ width: STILL_WIDTH }}
          fetchPriority="high"
        />

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
            <p className={styles.label}>
              <span className={styles.labelNum}>No. {String(k + 1).padStart(2, "0")}</span>
              <span className={styles.labelTopic}>{fork.label.split(" · ")[1]}</span>
            </p>
            <h3 className={styles.question}>{fork.question}</h3>
            <span className={styles.rule} aria-hidden="true" />
            {/* hovering a sign previews it here; otherwise the prompt, or the choice's echo */}
            <p className={styles.cardHint} key={hover?.fork === k ? hover.option : "rest"}>
              {hover?.fork === k ? (
                <>
                  <strong>{fork.options[hover.option]}</strong> — {fork.details[hover.option]}
                </>
              ) : choices[k] === null ? (
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
                  {opt} — {fork.details[i]}
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
