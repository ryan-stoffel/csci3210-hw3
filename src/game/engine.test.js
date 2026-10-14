import { CONFIG, OBSTACLES, addObstacle, addScore, createGame, hitObstacle, press, release, update } from "./engine";

const run = (g, ms, step) => {
  for (let i = 0; i < Math.round(ms / step); i++) update(g, step);
};

const peakJump = (releaseAfterMs) => {
  const g = createGame(() => 0.5);
  press(g, "jump");
  let peak = 0;
  for (let t = 0; t < 1000; t += 10) {
    if (t === releaseAfterMs) release(g, "jump");
    update(g, 10);
    peak = Math.max(peak, g.dino.h);
  }
  return peak;
};

test("distance depends on elapsed time, not frame rate", () => {
  const at60 = createGame(() => 0.5);
  const at144 = createGame(() => 0.5);
  at60.status = at144.status = "running";
  run(at60, 2000, 1000 / 60);
  run(at144, 2000, 1000 / 144);
  expect(Math.abs(at60.distance - at144.distance)).toBeLessThan(1);
});

test("releasing jump early gives a lower jump than holding it", () => {
  expect(peakJump(60)).toBeLessThan(peakJump(-1) - 20);
});

test("no obstacles spawn during the clear time", () => {
  const g = createGame();
  press(g, "jump");
  run(g, CONFIG.CLEAR_TIME - 100, 16);
  expect(g.obstacles).toHaveLength(0);
  run(g, 200, 16);
  expect(g.obstacles.length).toBeGreaterThan(0);
});

test("the same obstacle type never appears three times in a row", () => {
  const g = createGame(() => 0); // Always picks the first allowed type.
  for (let i = 0; i < 6; i++) addObstacle(g);
  expect(g.obstacles.map((o) => o.type)).toEqual([
    "cactusSmall", "cactusSmall", "cactusLarge", "cactusSmall", "cactusSmall", "cactusLarge",
  ]);
});

test("collision uses the detailed boxes, not just the outer rectangle", () => {
  const g = createGame();
  const bird = (x) => ({ type: "bird", x, y: OBSTACLES.bird.heights[0], w: 44, h: 26, size: 1, smashed: false });
  g.obstacles = [bird(84)]; // Outer boxes overlap, but the beak sits in the gap under the jaw.
  expect(hitObstacle(g)).toBeUndefined();
  g.obstacles = [bird(78)];
  expect(hitObstacle(g)).toBe(g.obstacles[0]);
});

test("a shield absorbs one crash", () => {
  const g = createGame();
  g.status = "running";
  g.shield = true;
  g.obstacles = [{ type: "cactusSmall", x: 60, y: 101, w: 16, h: 36, size: 1, speedOffset: 0, gap: 1000, smashed: false }];
  update(g, 16);
  expect(g.status).toBe("running");
  expect(g.shield).toBe(false);
  expect(g.stats.blocked).toBe(1);
  g.obstacles.push({ ...g.obstacles[0], x: 60, smashed: false });
  update(g, 16);
  expect(g.status).toBe("crashed");
});

test("leaderboard keeps the five best scores in order", () => {
  const board = [50, 10, 40, 30, 20, 60].reduce((b, s) => addScore(b, { score: s }), []);
  expect(board.map((e) => e.score)).toEqual([60, 50, 40, 30, 20]);
});
