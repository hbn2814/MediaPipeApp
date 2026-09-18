// ════════════════════════════════════════════════════════════
//  고개 비행기
//  매 프레임: 얼굴 찾기 → 두 눈을 잇는 선의 기울기(rules.js) → 비행기 좌우 이동
//  → 별은 모으고, 새와 먹구름은 피하기
// ════════════════════════════════════════════════════════════
import { createGame, drawBanner, drawEmoji, drawHint, setText, unit, roundedRect, FONT } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import {
  EYE_OUTER,
  MAX_TILT,
  START_TILT,
  SMOOTHING,
  MAX_HITS,
  PLANE_Y,
  tiltAngle,
  targetX,
  fallSpeed,
  spawnInterval,
  spawnItem,
  circlesTouch,
} from "./rules.js";

const ICONS = { star: "⭐", bird: "🐦", storm: "⛈️" };
let best = 0; // 오늘의 최고 점수 (새로고침하면 사라져요)
let game = newGame("ready");
let tilt = 0;
let clouds = []; // 배경 구름 (부딪히지 않아요)

function newGame(phase) {
  return {
    phase, // "ready" | "play" | "over"
    planeX: 0.5,
    items: [],
    stars: 0,
    hits: 0,
    elapsed: 0,
    spawnIn: 1,
    safe: 0, // 부딪힌 뒤 잠깐 무적
    shake: 0,
    popups: [],
    triedLeft: false,
    triedRight: false,
    wait: 0,
  };
}

createGame({
  kind: "face",
  options: { numFaces: 1 },
  onStart() {
    game = newGame("ready");
    clouds = Array.from({ length: 6 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
  },
  onRestart: () => (game = newGame("ready")),
  frame,
});

const score = () => game.stars * 10 + Math.floor(game.elapsed);

function frame({ dt, result, stage }) {
  const { W, H } = stage;
  const face = result?.faceLandmarks?.[0];
  if (face) {
    const [a, b] = EYE_OUTER.map((i) => stage.toScreen(face[i]));
    tilt = tiltAngle(a, b);
  }

  if (game.phase === "ready" || game.phase === "over") {
    // 좌우로 한 번씩 기울여 보면 시작 (끝난 뒤에는 결과를 2초 보여 준 다음)
    game.wait -= dt;
    if (face && game.wait <= 0) {
      if (tilt <= -START_TILT) game.triedLeft = true;
      if (tilt >= START_TILT) game.triedRight = true;
      if (game.triedLeft && game.triedRight) {
        game = newGame("play");
        sfx.start();
      }
    }
  } else if (game.phase === "play") {
    update(dt, stage, face);
  }

  // 비행기는 시작 전에도 움직여서 조종을 연습할 수 있어요
  if (face) game.planeX += (targetX(tilt) - game.planeX) * SMOOTHING;

  draw(stage, face);
  setText("stars", game.stars);
  setText("score", score());
  setText("hits", "❤️".repeat(MAX_HITS - game.hits) + "🖤".repeat(game.hits));
  setText("best", best);
}

function update(dt, stage, face) {
  const { W, H } = stage;
  game.elapsed += dt;
  game.safe -= dt;
  game.spawnIn -= dt;
  if (game.spawnIn <= 0) {
    game.items.push({ ...spawnItem(), y: -0.08 });
    game.spawnIn = spawnInterval(game.elapsed);
  }
  const speed = fallSpeed(game.elapsed);
  const plane = { x: game.planeX * W, y: PLANE_Y * H };
  for (const item of game.items) {
    item.y += speed * dt;
    const pos = { x: item.x * W, y: item.y * H };
    if (item.done || !circlesTouch(plane, H * 0.05, pos, H * 0.045)) continue;
    if (item.kind === "star") {
      item.done = true;
      game.stars += 1;
      game.popups.push({ x: pos.x, y: pos.y, text: "+10", life: 0.8 });
      sfx.good();
    } else if (game.safe <= 0) {
      item.done = true;
      game.hits += 1;
      game.safe = 1.2;
      game.shake = 0.35;
      sfx.bad();
      if (game.hits >= MAX_HITS) {
        game.phase = "over";
        game.wait = 2;
        best = Math.max(best, score());
        sfx.over();
      }
    }
  }
  game.items = game.items.filter((i) => !i.done && i.y < 1.1);
  for (const p of game.popups) {
    p.y -= H * 0.1 * dt;
    p.life -= dt;
  }
  game.popups = game.popups.filter((p) => p.life > 0);
  for (const c of clouds) {
    c.y += speed * 0.4 * dt;
    if (c.y > 1.15) Object.assign(c, { y: -0.15, x: Math.random() });
  }
}

// ───────────── 그리기 ─────────────
function draw(stage, face) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  ctx.save();
  if (game.shake > 0) {
    game.shake -= 1 / 60;
    ctx.translate((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
  }
  stage.drawVideo(0.2);
  // 하늘색을 살짝 덮어요
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "rgba(40, 110, 220, 0.55)");
  sky.addColorStop(1, "rgba(120, 190, 255, 0.35)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.5;
  for (const c of clouds) drawEmoji(ctx, "☁️", c.x * W, c.y * H, 90 * s * c.s);
  ctx.globalAlpha = 1;

  // 눈을 잇는 선 (AI가 본 고개 기울기)
  if (face) {
    const [a, b] = [33, 263].map((i) => stage.toScreen(face[i]));
    ctx.strokeStyle = "rgba(255, 210, 63, 0.9)";
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const item of game.items) drawEmoji(ctx, ICONS[item.kind], item.x * W, item.y * H, 80 * s);

  // 비행기: 무적 시간에는 깜빡여요
  const blink = game.safe > 0 && Math.floor(game.safe * 10) % 2 === 0;
  if (!blink) {
    const lean = ((targetX(tilt) - game.planeX) * 2 + (game.planeX - 0.5) * 0.4) * 0.8;
    drawEmoji(ctx, "✈️", game.planeX * W, PLANE_Y * H, 100 * s, -Math.PI / 4 + lean);
  }

  for (const p of game.popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.font = `900 ${40 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd23f";
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawTiltGauge(stage, face);

  if (game.phase === "ready") {
    drawBanner(stage, "🪂 고개 비행기", ["고개를 옆으로 기울여 비행기를 움직여요", "⭐ 별은 모으고 🐦⛈️ 는 피해요"], { y: 0.2 });
    drawTryHint(stage);
  } else if (game.phase === "over") {
    drawBanner(stage, "게임 끝!", [`⭐ ${game.stars}개 · 점수 ${score()}점`, `오늘의 최고 ${best}점`], { y: 0.2, color: "#ffd23f" });
    if (game.wait <= 0) drawTryHint(stage);
  }
  if (!face) drawHint(stage, "🙂 얼굴이 화면에 보이게 해 주세요");
}

/** 시작 안내: 왼쪽 ◀ 오른쪽 ▶ 기울여 보기 */
function drawTryHint(stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const text = `고개를 ${game.triedLeft ? "✅" : "◀"} 왼쪽, ${game.triedRight ? "✅" : "▶"} 오른쪽으로 기울이면 시작!`;
  ctx.save();
  ctx.font = `800 ${30 * s}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(text, W / 2, H * 0.44);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, W / 2, H * 0.44);
  ctx.restore();
}

/** 아래쪽 기울기 게이지 */
function drawTiltGauge(stage, face) {
  if (!face) return;
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const w = Math.min(W * 0.5, 460 * s);
  const x = (W - w) / 2;
  const y = H - 40 * s;
  ctx.save();
  ctx.fillStyle = "rgba(8,12,24,0.6)";
  roundedRect(ctx, x, y - 8 * s, w, 16 * s, 8 * s);
  ctx.fill();
  const k = Math.max(-1, Math.min(1, tilt / MAX_TILT));
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(x + w / 2 + (k * w) / 2, y, 12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${18 * s}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(tilt)}°`, x + w / 2, y - 16 * s);
  ctx.restore();
}
