// Plays the production build in Chromium and recreates screenshots/.
// Run `npm run build` first, then `node check.cjs` with Playwright installed,
// or set PLAYWRIGHT_MODULE to an existing copy.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.join(__dirname, "build");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

// Presses jump for cacti, low birds, and shield items. Ducks under middle birds.
function autopilot() {
  const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.autopilot = setInterval(() => {
    const g = window.dino;
    if (g.status !== "running") return;
    const front = 92;
    const ahead = g.obstacles.filter((o) => !o.smashed && o.x + o.w * o.size > 40).sort((a, b) => a.x - b.x)[0];
    const dist = ahead ? ahead.x - front : Infinity;
    const midBird = ahead && ahead.type === "bird" && ahead.y === 85;
    const highBird = ahead && ahead.type === "bird" && ahead.y === 55;
    if (midBird && dist < g.speed * 12) {
      if (!g.dino.ducking && !g.dino.jumping) key("keydown", "ArrowDown");
      return;
    }
    if (g.dino.ducking) key("keyup", "ArrowDown");
    const itemDist = g.item ? g.item.x - front : Infinity;
    const jumpFor = (d) => d > -10 && d < g.speed * 6;
    if (!g.dino.jumping && ((ahead && !highBird && jumpFor(dist)) || jumpFor(itemDist))) {
      key("keydown", "Space");
      setTimeout(() => key("keyup", "Space"), 250);
    }
  }, 10);
}

async function main() {
  const server = http.createServer((request, response) => {
    const file = path.join(root, request.url === "/" ? "index.html" : request.url.split("?")[0]);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, content) => {
      if (error) return response.writeHead(404).end();
      response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      response.end(content);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const shots = path.join(__dirname, "screenshots");
    fs.mkdirSync(shots, { recursive: true });
    const shot = (name, target = page) => target.screenshot({ path: path.join(shots, name) });
    const canvas = page.locator("canvas");
    const game = (fn, arg) => page.evaluate(fn, arg);
    const waitFor = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 50 });

    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await waitFor(() => window.dino && window.dino.status === "waiting");
    await page.keyboard.press("ArrowDown"); // Ducking before the start does nothing.
    assert.equal(await game(() => window.dino.status), "waiting");

    // Two short runs without help: each crashes into a cactus and lands on the leaderboard.
    for (let run = 1; run <= 2; run++) {
      await page.keyboard.press("Space");
      await waitFor(() => window.dino.status === "crashed");
      await page.waitForTimeout(800);
      assert.equal(await page.locator("ol li").count(), run);
    }

    // Space restarts after a crash. The autopilot plays a long run.
    await page.keyboard.press("Space");
    await game(autopilot);
    await waitFor(() => window.dino.time > 6000 && window.dino.obstacles.some((o) => o.x < 450));
    await shot("application.png");

    await game(() => (window.dino.debug = true));
    await shot("collision-boxes.png", canvas);
    await game(() => (window.dino.debug = false));

    // Shields spawn at random. Place one ahead if none has appeared after 30 s.
    await waitFor(() => window.dino.shield, 30000).catch(() =>
      game(() => (window.dino.item = { x: 600, y: 70 })).then(() => waitFor(() => window.dino.shield))
    );
    await shot("shield.png", canvas);

    // Skip ahead to the first night at a speed where pterodactyls spawn.
    await game(() => Object.assign(window.dino, { distance: 690 / 0.025, speed: 9 }));
    await waitFor(() => document.querySelector("canvas.night") && window.dino.obstacles.some((o) => o.type === "bird" && o.x < 520));
    await page.waitForTimeout(900); // Let the invert transition finish.
    await shot("night-pterodactyl.png", canvas);

    // One cactus short of Cactus Clearer.
    await game(() => (window.dino.stats.cacti = Math.max(window.dino.stats.cacti, 49)));
    await page.getByText("Achievement unlocked: Cactus Clearer").waitFor();
    await shot("achievement.png");

    await game(() => clearInterval(window.autopilot));
    await waitFor(() => window.dino.status === "crashed");
    await page.waitForTimeout(900);
    assert.equal(await page.locator("ol li").count(), 3);
    assert.equal(await page.locator(".achievements li.done").count() >= 1, true);
    await shot("game-over.png");

    assert.deepEqual(errors, []);
    console.log("check passed:", await game(() => JSON.parse(localStorage.getItem("dino.leaderboard"))));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
