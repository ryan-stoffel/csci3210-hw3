// Canvas rendering for the dino runner. Sprites are pixel art where each "#" is a 2x2 px cell.
import {
  DINO_X, GROUND_Y, HEIGHT, WIDTH,
  dinoBoxes, dinoSprite, dinoTop, isNight, obstacleBoxes, score,
} from "./engine";

const INK = "#535353";
const PAPER = "#fff";
const CELL = 2;

const DINO_HEAD = [
  "............########",
  "...........##########",
  "...........##########",
  "...........##########",
  "...........#####",
  "...........########",
  "#.........#####",
  "#........######",
  "##.....#########",
  "###...##########",
  "##############.##",
  "#############...#",
  ".############",
  "..##########",
  "...########",
  "....######",
];
const DINO_LEGS = [
  ["....###.##", "....##...#", "....#....#", "....##...##"], // standing
  ["....###.##", "....##..##", "....#", "....##"],
  ["....###.##", "....##...#", ".........#", ".........##"],
];
const DUCK_BODY = [
  "....................#########",
  "#...........#################",
  "##.......####################",
  "###########################",
  "########################",
  ".######################",
  "..####################",
  "...################.#",
  "....##########......#",
];
const DUCK_LEGS = [
  ["....##..##", "....#....##", "....##"],
  ["....##..##", "....##...#", ".........##"],
];
// Eye holes per expression, as [col, row] cells punched out of the head.
const EYES = {
  running: { normal: [[13, 1]], alarmed: [[13, 1], [14, 1], [13, 2], [14, 2]], dead: [[12, 0], [14, 0], [13, 1], [12, 2], [14, 2]] },
  ducking: { normal: [[22, 1]], alarmed: [[22, 1], [23, 1], [22, 2], [23, 2]], dead: [[21, 0], [23, 0], [22, 1], [21, 2], [23, 2]] },
};

const CACTUS_SMALL = [
  "...##", "..####", "..####", "#.####", "#.####.#", "#.####.#", "#.####.#", "######.#", ".#######",
  ...Array(9).fill("..####"),
];
const CACTUS_LARGE = [
  "....###", "...#####", "...#####", "##.#####",
  ...Array(5).fill("##.#####.##"),
  "########.##", ".#######.##", "...########", "...#######",
  ...Array(12).fill("...#####"),
];
const BIRD_BODY = ["..####################", "######################", "......#############", ".......##########"];
const BIRD = [
  [".........##", ".........###", ".........####", "....##...#####", "...###...######", ...BIRD_BODY],
  ["", "", "", "....##", "...###", ...BIRD_BODY, ".........######", ".........####", ".........###", ".........##"],
];
const SHIELD = ["..####..", ".#....#.", "#..##..#", "#.####.#", "#.####.#", "#..##..#", ".#....#.", "..####.."];
const CLOUD = ["......####", "...###....##", ".##.........#", "#............##", "################"];

function sprite(ctx, rows, x, y) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "#") ctx.fillRect(x + c * CELL, y + r * CELL, CELL, CELL);
  });
}

function holes(ctx, cells, x, y) {
  ctx.fillStyle = PAPER;
  for (const [c, r] of cells) ctx.fillRect(x + c * CELL, y + r * CELL, CELL, CELL);
  ctx.fillStyle = INK;
}

// Wide eyes when an obstacle is close ahead, X eyes after a crash.
function expression(g) {
  if (g.status === "crashed") return "dead";
  const near = g.obstacles.some((o) => !o.smashed && o.x > DINO_X && o.x - DINO_X < 110);
  return near ? "alarmed" : "normal";
}

function drawDino(ctx, g) {
  const d = g.dino;
  const x = DINO_X;
  const y = Math.round(dinoTop(g));
  const step = Math.floor(d.anim / 100) % 2;
  const pose = d.ducking ? "ducking" : "running";
  if (d.ducking) sprite(ctx, [...DUCK_BODY, ...DUCK_LEGS[step]], x, y);
  else sprite(ctx, [...DINO_HEAD, ...DINO_LEGS[d.jumping || g.status !== "running" ? 0 : step + 1]], x, y);
  holes(ctx, EYES[pose][expression(g)], x, y);
  if (g.shield) {
    const { w, h } = dinoSprite(g);
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 + 8, h / 2 + 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawSky(ctx, g) {
  ctx.fillStyle = "#c8c8c8";
  for (const c of g.clouds) sprite(ctx, CLOUD, Math.round(c.x), Math.round(c.y));
  if (!isNight(g)) return;
  // Drawn dark because the night filter inverts the whole canvas.
  ctx.fillStyle = "#666";
  ctx.beginPath();
  ctx.arc(g.moonX, 30, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(g.moonX + 7, 26, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#888";
  for (const [sx, sy] of [[120, 20], [260, 45], [400, 15], [540, 55]]) {
    ctx.fillRect((sx + g.moonX * 0.5 + WIDTH) % WIDTH, sy, 2, 2);
  }
}

function drawGround(ctx, g) {
  ctx.fillRect(0, GROUND_Y - 3, WIDTH, 1);
  for (let i = 0; i < 24; i++) {
    const x = (((i * 53 - g.distance) % WIDTH) + WIDTH) % WIDTH;
    ctx.fillRect(x, GROUND_Y + (i % 3) * 3, 2 + (i % 4), 1);
  }
}

function drawText(ctx, g, hi) {
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "right";
  const pad = (n) => String(n).padStart(5, "0");
  ctx.fillText(`${g.shield ? "SHIELD  " : ""}HI ${pad(hi)}  ${pad(score(g))}`, WIDTH - 10, 18);
  ctx.textAlign = "center";
  if (g.status === "waiting") ctx.fillText("PRESS SPACE TO START", WIDTH / 2, 60);
  if (g.status === "crashed") {
    ctx.font = "bold 18px monospace";
    ctx.fillText("G A M E   O V E R", WIDTH / 2, 55);
    ctx.font = "12px monospace";
    ctx.fillText("PRESS SPACE TO RESTART", WIDTH / 2, 78);
  }
}

function drawBoxes(ctx, g) {
  ctx.strokeStyle = "red";
  for (const b of dinoBoxes(g)) ctx.strokeRect(...b);
  ctx.strokeStyle = "green";
  for (const o of g.obstacles) for (const b of obstacleBoxes(o)) ctx.strokeRect(...b);
  ctx.strokeStyle = INK;
}

export function draw(ctx, g, hi) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawSky(ctx, g);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  drawGround(ctx, g);
  for (const o of g.obstacles) {
    if (o.smashed) continue;
    const x = Math.round(o.x);
    if (o.type === "bird") sprite(ctx, BIRD[Math.floor(g.time / 150) % 2], x, o.y);
    else for (let i = 0; i < o.size; i++) sprite(ctx, o.type === "cactusSmall" ? CACTUS_SMALL : CACTUS_LARGE, x + i * o.w, o.y);
  }
  if (g.item && Math.floor(g.time / 200) % 4) sprite(ctx, SHIELD, Math.round(g.item.x), g.item.y);
  drawDino(ctx, g);
  drawText(ctx, g, hi);
  if (g.debug) drawBoxes(ctx, g);
}
