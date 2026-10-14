import React, { useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS, HEIGHT, WIDTH, addScore, createGame, isNight, press, release, score, update } from "../../game/engine";
import { draw } from "../../game/draw";
import "./Dino.css";

const KEYS = { Space: "jump", ArrowUp: "jump", ArrowDown: "duck" };

// localStorage can throw (private browsing, disabled storage). The game still works without it.
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

// Runs the game loop on a canvas and shows the saved leaderboard and achievements beside it.
function Dino() {
  const canvasRef = useRef(null);
  const gameRef = useRef(createGame());
  const [board, setBoard] = useState(() => load("dino.leaderboard", []));
  const [unlocked, setUnlocked] = useState(() => load("dino.achievements", []));
  const [toast, setToast] = useState("");
  const boardRef = useRef(board);
  const unlockedRef = useRef(unlocked);

  useEffect(() => {
    window.dino = gameRef.current; // Exposed for check.cjs.
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let last = performance.now();
    let frame;
    const loop = (now) => {
      const g = gameRef.current;
      const wasRunning = g.status === "running";
      update(g, now - last);
      last = now;

      if (g.status === "running") {
        const earned = ACHIEVEMENTS.filter((a) => !unlockedRef.current.includes(a.id) && a.met(g));
        if (earned.length) {
          unlockedRef.current = [...unlockedRef.current, ...earned.map((a) => a.id)];
          save("dino.achievements", unlockedRef.current);
          setUnlocked(unlockedRef.current);
          setToast(earned.map((a) => a.name).join(", "));
        }
      }
      if (wasRunning && g.status === "crashed") {
        boardRef.current = addScore(boardRef.current, { score: score(g), date: new Date().toLocaleDateString() });
        save("dino.leaderboard", boardRef.current);
        setBoard(boardRef.current);
      }

      canvas.classList.toggle("night", isNight(g));
      draw(ctx, g, Math.max(boardRef.current[0]?.score ?? 0, score(g)));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (!KEYS[e.code]) return;
      e.preventDefault(); // Stop Space and arrows from scrolling the page.
      if (!e.repeat) press(gameRef.current, KEYS[e.code]);
    };
    const up = (e) => KEYS[e.code] && release(gameRef.current, KEYS[e.code]);
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <main className="dino-page">
      <h1>Dino Run</h1>
      <p className="toast" role="status">
        {toast && `Achievement unlocked: ${toast}`}
      </p>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label="Dino game. Press Space to jump and Down to duck."
        onPointerDown={() => press(gameRef.current, "jump")}
        onPointerUp={() => release(gameRef.current, "jump")}
      />
      <p className="controls">
        <kbd>Space</kbd> or <kbd>Up</kbd> jump (hold for a higher jump) · <kbd>Down</kbd> duck, or slam down mid-air ·
        jump into a shield to survive one hit
      </p>
      <section className="panels">
        <div>
          <h2>Leaderboard</h2>
          {board.length ? (
            <ol>
              {board.map((entry, i) => (
                <li key={i}>
                  <span>{entry.score}</span> <small>{entry.date}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No runs yet.</p>
          )}
        </div>
        <div>
          <h2>
            Achievements {unlocked.length}/{ACHIEVEMENTS.length}
          </h2>
          <ul className="achievements">
            {ACHIEVEMENTS.map((a) => (
              <li key={a.id} className={unlocked.includes(a.id) ? "done" : ""}>
                <strong>{a.name}</strong> <small>{a.desc}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

export default Dino;
