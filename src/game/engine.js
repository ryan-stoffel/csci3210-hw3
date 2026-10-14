// Pure game logic for the dino runner. No DOM access, so it can be unit tested.
// Speeds are px per frame at 60 FPS. Every update scales them by elapsed time.

export const FPS = 60;
export const WIDTH = 600;
export const HEIGHT = 150;
export const GROUND_Y = 137; // Bottom edge of the dino and the cacti.
export const DINO_X = 50;
export const NIGHT_EVERY = 700; // Points per day or night.
export const RESTART_DELAY = 750; // ms after a crash before Space restarts.

export const CONFIG = {
  GRAVITY: 0.6,
  INITIAL_JUMP_VELOCITY: 10,
  DROP_VELOCITY: 5,
  MIN_JUMP_HEIGHT: 30,
  MAX_JUMP_HEIGHT: 63,
  SPEED_DROP_COEFFICIENT: 3,
  SPEED: 6,
  ACCELERATION: 0.001,
  MAX_SPEED: 13,
  CLEAR_TIME: 3000,
  MAX_OBSTACLE_LENGTH: 3,
  MAX_OBSTACLE_DUPLICATION: 2,
  GAP_COEFFICIENT: 0.6,
  MAX_GAP_COEFFICIENT: 1.5,
  SHIELD_CHANCE: 0.12,
};

// Collision boxes are [x, y, width, height] relative to the sprite's top-left corner.
export const DINO = {
  running: { w: 42, h: 40, boxes: [[22, 0, 20, 12], [20, 12, 12, 4], [0, 16, 32, 8], [2, 24, 22, 8], [8, 32, 12, 8]] },
  ducking: { w: 58, h: 24, boxes: [[0, 0, 58, 24]] },
};

export const OBSTACLES = {
  cactusSmall: { w: 16, h: 36, multipleSpeed: 4, minGap: 120, minSpeed: 0, boxes: [[4, 0, 8, 36], [0, 6, 4, 10], [12, 8, 4, 10]] },
  cactusLarge: { w: 22, h: 50, multipleSpeed: 7, minGap: 120, minSpeed: 0, boxes: [[6, 0, 10, 50], [0, 6, 6, 16], [16, 8, 6, 16]] },
  // Low birds must be jumped, middle birds must be ducked, high birds fly over.
  bird: { w: 44, h: 26, multipleSpeed: 999, minGap: 150, minSpeed: 8.5, heights: [111, 85, 55], boxes: [[0, 6, 12, 8], [12, 10, 32, 8]] },
};

export const ITEM_SIZE = 16;

export const ACHIEVEMENTS = [
  { id: "cactus-clearer", name: "Cactus Clearer", desc: "Jump over 50 cacti in one run", met: (g) => g.stats.cacti >= 50 },
  { id: "bird-dodger", name: "Bird Dodger", desc: "Get past 10 pterodactyls in one run", met: (g) => g.stats.birds >= 10 },
  { id: "night-owl", name: "Night Owl", desc: "Survive a full night", met: (g) => score(g) >= NIGHT_EVERY * 2 },
  { id: "saved", name: "Saved by the Shield", desc: "Let a shield absorb a crash", met: (g) => g.stats.blocked > 0 },
  { id: "top-speed", name: "Top Speed", desc: "Reach maximum speed", met: (g) => g.speed >= CONFIG.MAX_SPEED },
];

export function createGame(rand = Math.random) {
  return {
    rand,
    status: "waiting", // waiting | running | crashed
    time: 0,
    sinceCrash: 0,
    speed: CONFIG.SPEED,
    distance: 0,
    dino: { h: 0, vy: 0, jumping: false, ducking: false, speedDrop: false, reachedMin: false, anim: 0 },
    downHeld: false,
    obstacles: [],
    history: [],
    item: null,
    shield: false,
    clouds: [{ x: 300, y: 40 }],
    moonX: 480,
    stats: { cacti: 0, birds: 0, blocked: 0 },
    debug: false,
  };
}

export const score = (g) => Math.floor(g.distance * 0.025);
export const isNight = (g) => Math.floor(score(g) / NIGHT_EVERY) % 2 === 1;
export const dinoSprite = (g) => (g.dino.ducking ? DINO.ducking : DINO.running);
export const dinoTop = (g) => GROUND_Y - dinoSprite(g).h - g.dino.h;

// Jump starts or restarts the game. Duck fast-falls mid-air and ducks on the ground.
export function press(g, action) {
  const d = g.dino;
  if (action === "jump") {
    if (g.status === "crashed") {
      if (g.sinceCrash < RESTART_DELAY) return;
      Object.assign(g, createGame(g.rand));
    }
    g.status = "running";
    if (!d.jumping && !d.ducking) Object.assign(d, { jumping: true, vy: CONFIG.INITIAL_JUMP_VELOCITY, reachedMin: false, speedDrop: false });
  } else if (action === "duck" && g.status === "running") {
    g.downHeld = true;
    if (d.jumping) Object.assign(d, { speedDrop: true, vy: -1 });
    else d.ducking = true;
  }
}

// Releasing jump early cuts the jump short once the minimum height is reached.
export function release(g, action) {
  const d = g.dino;
  if (action === "jump") endJump(d);
  else if (action === "duck") {
    g.downHeld = false;
    d.ducking = false;
    d.speedDrop = false;
  }
}

function endJump(d) {
  if (d.jumping && d.reachedMin && d.vy > CONFIG.DROP_VELOCITY) d.vy = CONFIG.DROP_VELOCITY;
}

export function update(g, dt) {
  dt = Math.min(dt, 100); // A backgrounded tab would otherwise teleport everything.
  const frames = dt / (1000 / FPS);
  if (g.status === "crashed") g.sinceCrash += dt;
  if (g.status !== "running") return;

  g.time += dt;
  g.speed = Math.min(CONFIG.MAX_SPEED, g.speed + CONFIG.ACCELERATION * frames);
  g.distance += g.speed * frames;
  updateDino(g, dt, frames);
  updateScenery(g, frames);
  if (g.time > CONFIG.CLEAR_TIME) updateObstacles(g, frames);
  updateItem(g, frames);

  const hit = hitObstacle(g);
  if (!hit) return;
  if (g.shield) {
    g.shield = false;
    hit.smashed = true;
    g.stats.blocked++;
  } else {
    g.status = "crashed";
  }
}

function updateDino(g, dt, frames) {
  const d = g.dino;
  d.anim += dt;
  if (!d.jumping) return;
  d.h += d.vy * (d.speedDrop ? CONFIG.SPEED_DROP_COEFFICIENT : 1) * frames;
  d.vy -= CONFIG.GRAVITY * frames;
  if (d.h > CONFIG.MIN_JUMP_HEIGHT || d.speedDrop) d.reachedMin = true;
  if (d.h > CONFIG.MAX_JUMP_HEIGHT || d.speedDrop) endJump(d);
  if (d.h <= 0) Object.assign(d, { h: 0, vy: 0, jumping: false, speedDrop: false, ducking: g.downHeld });
}

function updateScenery(g, frames) {
  for (const c of g.clouds) c.x -= g.speed * 0.15 * frames;
  g.clouds = g.clouds.filter((c) => c.x > -50);
  const last = g.clouds[g.clouds.length - 1];
  if (!last || last.x < WIDTH - 100 - g.rand() * 300) g.clouds.push({ x: WIDTH, y: 15 + g.rand() * 50 });
  g.moonX -= 0.25 * frames;
  if (g.moonX < -40) g.moonX = WIDTH;
}

function updateObstacles(g, frames) {
  for (const o of g.obstacles) {
    o.x -= (g.speed + o.speedOffset) * frames;
    if (!o.passed && o.x + o.w * o.size < DINO_X) {
      o.passed = true;
      if (o.smashed) continue;
      if (o.type === "bird") g.stats.birds++;
      else g.stats.cacti += o.size;
    }
  }
  g.obstacles = g.obstacles.filter((o) => o.x + o.w * o.size > 0);
  const last = g.obstacles[g.obstacles.length - 1];
  if (!last || last.x + last.w * last.size + last.gap < WIDTH) addObstacle(g);
}

// Applies the fairness rules: speed-gated types and clusters, speed-scaled gaps, no triple repeats.
export function addObstacle(g) {
  const choices = Object.keys(OBSTACLES).filter(
    (t) => g.speed >= OBSTACLES[t].minSpeed && !isTripleRepeat(g.history, t)
  );
  const type = choices[Math.floor(g.rand() * choices.length)];
  const def = OBSTACLES[type];
  const size = g.speed > def.multipleSpeed ? 1 + Math.floor(g.rand() * CONFIG.MAX_OBSTACLE_LENGTH) : 1;
  const minGap = Math.round(def.w * size * g.speed + def.minGap * CONFIG.GAP_COEFFICIENT);
  const gap = minGap + g.rand() * minGap * (CONFIG.MAX_GAP_COEFFICIENT - 1);
  const isBird = type === "bird";
  g.obstacles.push({
    type,
    x: WIDTH,
    y: isBird ? def.heights[Math.floor(g.rand() * def.heights.length)] : GROUND_Y - def.h,
    w: def.w,
    h: def.h,
    size,
    gap,
    speedOffset: isBird ? (g.rand() > 0.5 ? 0.8 : -0.8) : 0,
    passed: false,
    smashed: false,
  });
  g.history = [type, ...g.history].slice(0, CONFIG.MAX_OBSTACLE_DUPLICATION);
  // Shields sit halfway through the gap after a cactus, high enough that only a jump reaches them.
  if (!isBird && !g.item && !g.shield && g.rand() < CONFIG.SHIELD_CHANCE) {
    g.item = { x: WIDTH + def.w * size + gap / 2, y: 70 };
  }
}

const isTripleRepeat = (history, type) =>
  history.length >= CONFIG.MAX_OBSTACLE_DUPLICATION && history.every((t) => t === type);

function updateItem(g, frames) {
  if (!g.item) return;
  g.item.x -= g.speed * frames;
  const top = dinoTop(g);
  const { w, h } = dinoSprite(g);
  if (overlaps([DINO_X, top, w, h], [g.item.x, g.item.y, ITEM_SIZE, ITEM_SIZE])) {
    g.shield = true;
    g.item = null;
  } else if (g.item.x < -ITEM_SIZE) {
    g.item = null;
  }
}

const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const offset = (box, x, y) => [box[0] + x, box[1] + y, box[2], box[3]];

// World-space collision boxes. Cactus clusters repeat the single-cactus boxes per copy.
export function dinoBoxes(g) {
  return dinoSprite(g).boxes.map((b) => offset(b, DINO_X, dinoTop(g)));
}

export function obstacleBoxes(o) {
  const boxes = [];
  for (let i = 0; i < o.size; i++) for (const b of OBSTACLES[o.type].boxes) boxes.push(offset(b, o.x + i * o.w, o.y));
  return boxes;
}

// Two-phase check: a cheap outer-box test, then every dino box against every obstacle box.
export function hitObstacle(g) {
  const { w, h } = dinoSprite(g);
  const outer = [DINO_X, dinoTop(g), w, h];
  const mine = dinoBoxes(g);
  return g.obstacles.find(
    (o) =>
      !o.smashed &&
      overlaps(outer, [o.x, o.y, o.w * o.size, o.h]) &&
      obstacleBoxes(o).some((b) => mine.some((m) => overlaps(m, b)))
  );
}

// Keeps the five best scores, highest first.
export function addScore(board, entry) {
  return [...board, entry].sort((a, b) => b.score - a.score).slice(0, 5);
}
