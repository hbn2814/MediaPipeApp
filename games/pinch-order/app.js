// ════════════════════════════════════════════════════════════
//  순서대로 집게
//  매 프레임: 손 찾기 → 엄지와 검지로 집었나(rules.js) → 집은 곳의 글자가 순서에 맞나
// ════════════════════════════════════════════════════════════
import { createGame, modePicker, drawBanner, drawHint, setText, unit, FONT } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import {
  THUMB_TIP,
  INDEX_TIP,
  ITEM_SIZE,
  PENALTY_SECONDS,
  HINT_SECONDS,
  SETS,
  pinchRatio,
  updatePinch,
  pinchPoint,
  layout,
  hitIndex,
} from "./rules.js";

const getMode = modePicker();
let setKey = "number";
const best = {}; // 순서 종류별 오늘의 최고 기록(초) (새로고침하면 사라져요)
let pinched = false;
let cursor = null;
let game = newGame("ready");

function newGame(phase) {
  return { phase, items: [], next: 0, elapsed: 0, penalty: 0, sinceLast: 0, shake: 0, button: { x: 0.5, y: 0.62 }, wait: 0 };
}

createGame({
  kind: "hand",
  options: { numHands: 1 },
  onStart() {
    setKey = getMode() ?? "number";
    game = newGame("ready");
  },
  onRestart: () => (game = newGame("ready")),
  frame,
});

function begin(aspect) {
  const labels = SETS[setKey].items;
  const spots = layout(labels.length, aspect);
  game = newGame("play");
  game.items = labels.map((label, i) => ({ label, ...spots[i], done: false, flash: 0, pop: 0 }));
  sfx.start();
}

const total = () => game.elapsed + game.penalty;

function frame({ dt, result, stage }) {
  const aspect = stage.W / stage.H;
  const hand = result?.landmarks?.[0];
  let clicked = false;
  if (hand) {
    const state = updatePinch(pinched, pinchRatio(hand));
    pinched = state.pinched;
    clicked = state.clicked;
    const p = stage.toScreen(pinchPoint(hand));
    cursor = { x: p.x / stage.W, y: p.y / stage.H };
  } else {
    pinched = false;
    cursor = null;
  }

  if (game.phase === "ready" || game.phase === "done") {
    game.wait -= dt;
    // 가운데 "시작" 동그라미를 집으면 시작
    if (clicked && cursor && game.wait <= 0 && hitIndex(cursor, [{ ...game.button, done: false }], aspect) === 0) begin(aspect);
  } else if (game.phase === "play") {
    game.elapsed += dt;
    game.sinceLast += dt;
    if (clicked && cursor) {
      const i = hitIndex(cursor, game.items, aspect);
      if (i === game.next) {
        game.items[i].done = true;
        game.items[i].pop = 0.3;
        game.next += 1;
        game.sinceLast = 0;
        sfx.hit();
        if (game.next === game.items.length) finish();
      } else if (i >= 0) {
        game.penalty += PENALTY_SECONDS;
        game.items[i].flash = 0.5;
        game.shake = 0.25;
        sfx.bad();
      }
    }
  }
  for (const item of game.items) {
    item.flash = Math.max(0, item.flash - dt);
    item.pop = Math.max(0, item.pop - dt);
  }

  draw(stage, hand);
  const items = SETS[setKey].items;
  setText("next", game.phase === "play" ? items[game.next] : "-");
  setText("time", `${total().toFixed(1)}초`);
  setText("penalty", game.penalty ? `+${game.penalty}초` : "0초");
  setText("best", best[setKey] ? `${best[setKey].toFixed(1)}초` : "-");
}

function finish() {
  game.phase = "done";
  game.wait = 1;
  const time = total();
  game.newRecord = !best[setKey] || time < best[setKey];
  if (game.newRecord) best[setKey] = time;
  sfx.good();
}

// ───────────── 그리기 ─────────────
function draw(stage, hand) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const r = ITEM_SIZE * H;
  ctx.save();
  if (game.shake > 0) {
    game.shake -= 1 / 60;
    ctx.translate((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
  }
  stage.drawVideo(0.5);

  // 글자 동그라미
  const hint = game.phase === "play" && game.sinceLast > HINT_SECONDS;
  game.items.forEach((item, i) => {
    const x = item.x * W;
    const y = item.y * H;
    if (item.done) {
      if (item.pop > 0) {
        ctx.globalAlpha = item.pop / 0.3;
        ctx.strokeStyle = "#3ddc97";
        ctx.lineWidth = 6 * s;
        ctx.beginPath();
        ctx.arc(x, y, r * (1.6 - item.pop), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      return;
    }
    const pulse = hint && i === game.next ? 1 + Math.sin(performance.now() / 120) * 0.08 : 1;
    ctx.fillStyle = item.flash > 0 ? "#ff4f7b" : "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = item.flash > 0 ? "#ffffff" : "#16203a";
    ctx.font = `900 ${r * 1.05}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, x, y + r * 0.05);
  });
  ctx.restore();

  if (game.phase === "ready" || game.phase === "done") {
    const title = game.phase === "ready" ? "🔢 순서대로 집게" : game.newRecord ? "🎉 새 기록!" : "완성!";
    const lines = game.phase === "ready"
      ? [`${SETS[setKey].name}, 순서대로 집어요`, "🤏 엄지와 검지로 가운데 동그라미를 집으면 시작"]
      : [`기록 ${total().toFixed(1)}초 (벌칙 ${game.penalty}초 포함)`, `오늘의 최고 ${best[setKey].toFixed(1)}초`];
    drawBanner(stage, title, lines, { y: 0.28, color: game.phase === "done" ? "#ffd23f" : "#ffffff" });
    if (game.wait <= 0) drawStartButton(stage, game.phase === "ready" ? "시작" : "다시");
  }

  // 커서: 엄지와 검지 사이 선 + 집는 위치
  if (hand && cursor) {
    const a = stage.toScreen(hand[THUMB_TIP]);
    const b = stage.toScreen(hand[INDEX_TIP]);
    ctx.save();
    ctx.strokeStyle = pinched ? "#ffd23f" : "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = pinched ? "#ffd23f" : "rgba(255,255,255,0.35)";
    ctx.strokeStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(cursor.x * W, cursor.y * H, (pinched ? 12 : 18) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (!hand) drawHint(stage, "🤏 손을 카메라에 보여 주세요");
}

function drawStartButton(stage, text) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const r = ITEM_SIZE * H * 1.15;
  const x = game.button.x * W;
  const y = game.button.y * H;
  const pulse = 1 + Math.sin(performance.now() / 250) * 0.05;
  ctx.save();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1300";
  ctx.font = `900 ${34 * s}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}
