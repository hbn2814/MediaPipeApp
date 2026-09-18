// ════════════════════════════════════════════════════════════
//  공중 그림 퀴즈
//  매 프레임: 손 찾기 → 손 모양으로 펜 상태 판단(rules.js) → 검지 끝으로 선 긋기
//  퀴즈 모드: 그리는 사람만 제시어를 보고, 친구들이 맞혀요
// ════════════════════════════════════════════════════════════
import { createGame, modePicker, drawBanner, drawHint, setText, unit, roundedRect, FONT, $ } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import {
  TIP,
  ROUND_SECONDS,
  PEEK_SECONDS,
  ERASE_SECONDS,
  START_SECONDS,
  MIN_STEP,
  penMode,
  smoothPoint,
  pickWord,
} from "./rules.js";

const COLORS = ["#ffd23f", "#3ecbff", "#ff4f7b", "#3ddc97", "#c77dff", "#ff9f43"];
const getMode = modePicker();
let quiz = true;
let strokes = []; // [{ color, points: [{x, y}] }] (화면 비율 좌표)
let current = null; // 지금 긋고 있는 선
let cursor = null;
let mode = "hover";
let eraseHold = 0;
let colorIndex = 0;
const used = new Set();
let game = newGame();

function newGame() {
  return { phase: "ready", score: 0, round: 0, word: null, timer: 0, hold: 0, message: "" };
}

createGame({
  kind: "hand",
  options: { numHands: 1 },
  onStart() {
    quiz = getMode() === "quiz";
    game = newGame();
    if (!quiz) game.phase = "free";
    updateButtons();
  },
  onRestart() {
    clearCanvas();
    game = newGame();
    if (!quiz) game.phase = "free";
    updateButtons();
  },
  frame,
});

// 정답·넘기기: 버튼 또는 O / X 키
$("correctBtn").addEventListener("click", () => finishRound(true));
$("skipBtn").addEventListener("click", () => finishRound(false));
window.addEventListener("keydown", (event) => {
  if (event.target.closest?.("button")) return;
  if (event.code === "KeyO") finishRound(true);
  if (event.code === "KeyX") finishRound(false);
});

function updateButtons() {
  const drawing = game.phase === "draw";
  $("correctBtn").hidden = !drawing;
  $("skipBtn").hidden = !drawing;
}

function clearCanvas() {
  strokes = [];
  current = null;
}

function startRound() {
  clearCanvas();
  game.word = pickWord(used);
  used.add(game.word.word);
  game.round += 1;
  game.phase = "peek";
  game.timer = PEEK_SECONDS;
  colorIndex = (colorIndex + 1) % COLORS.length;
  sfx.start();
}

function finishRound(correct) {
  if (game.phase !== "draw") return;
  if (correct) {
    game.score += 1;
    sfx.good();
  } else {
    sfx.bad();
  }
  game.message = correct ? `정답! 🎉 "${game.word.word}"` : `정답은 "${game.word.word}"`;
  game.phase = "reveal";
  game.timer = 3;
  game.hold = 0;
  updateButtons();
}

function frame({ dt, result, stage }) {
  const hand = result?.landmarks?.[0];
  mode = hand ? penMode(hand) : "none";

  // ── 펜 ──
  if (hand) {
    const tip = stage.toScreen(hand[TIP]);
    cursor = smoothPoint(cursor, { x: tip.x / stage.W, y: tip.y / stage.H });
  }
  const canDraw = game.phase === "draw" || game.phase === "free";
  if (canDraw && mode === "draw" && cursor) {
    if (!current) {
      current = { color: quiz ? COLORS[colorIndex] : COLORS[strokes.length % COLORS.length], points: [] };
      strokes.push(current);
    }
    const last = current.points[current.points.length - 1];
    if (!last || Math.hypot(cursor.x - last.x, (cursor.y - last.y) * 1) > MIN_STEP) current.points.push({ ...cursor });
  } else {
    current = null;
  }
  if (canDraw && mode === "erase") {
    eraseHold += dt;
    if (eraseHold >= ERASE_SECONDS) {
      clearCanvas();
      eraseHold = 0;
      sfx.tick();
    }
  } else {
    eraseHold = 0;
  }

  // ── 퀴즈 진행 ──
  if (game.phase === "ready") {
    game.hold = mode === "erase" ? game.hold + dt : 0;
    if (game.hold >= START_SECONDS) startRound();
  } else if (game.phase === "peek") {
    game.timer -= dt;
    if (game.timer <= 0) {
      game.phase = "draw";
      game.timer = ROUND_SECONDS;
      updateButtons();
    }
  } else if (game.phase === "draw") {
    game.timer -= dt;
    if (game.timer <= 0) {
      game.message = `시간 끝! 정답은 "${game.word.word}"`;
      game.phase = "reveal";
      game.timer = 3;
      sfx.over();
      updateButtons();
    }
  } else if (game.phase === "reveal") {
    game.timer -= dt;
    if (game.timer <= 0) {
      game.phase = "ready";
      game.hold = 0;
    }
  }

  draw(stage);
  setText("score", game.score);
  setText("round", game.round);
  setText("time", game.phase === "draw" ? `${Math.ceil(game.timer)}초` : "-");
  setText("hint", game.phase === "draw" ? `${game.word.category} · ${game.word.word.length}글자` : "-");
}

// ───────────── 그리기 ─────────────
function draw(stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  stage.drawVideo(0.55);

  // 그림
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 16 * s;
  for (const stroke of strokes) {
    if (stroke.points.length < 1) continue;
    ctx.strokeStyle = ctx.shadowColor = stroke.color;
    ctx.lineWidth = 12 * s;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * W, stroke.points[0].y * H);
    for (const p of stroke.points) ctx.lineTo(p.x * W, p.y * H);
    if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * W + 0.1, stroke.points[0].y * H);
    ctx.stroke();
  }
  ctx.restore();

  // 커서: 그리기 = 꽉 찬 원, 펜 들기 = 빈 원, 지우개 = 빨간 원 + 진행 표시
  if (cursor && mode !== "none") {
    const x = cursor.x * W;
    const y = cursor.y * H;
    ctx.save();
    ctx.lineWidth = 4 * s;
    if (mode === "draw") {
      ctx.fillStyle = quiz ? COLORS[colorIndex] : COLORS[strokes.length % COLORS.length];
      ctx.beginPath();
      ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (mode === "erase") {
      ctx.strokeStyle = "#ff4f7b";
      ctx.beginPath();
      ctx.arc(x, y, 30 * s, 0, Math.PI * 2);
      ctx.stroke();
      const need = game.phase === "ready" ? START_SECONDS : ERASE_SECONDS;
      const hold = game.phase === "ready" ? game.hold : eraseHold;
      ctx.lineWidth = 8 * s;
      ctx.beginPath();
      ctx.arc(x, y, 30 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, hold / need));
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (game.phase === "ready") {
    const lines = game.round === 0
      ? ["그릴 사람이 카메라 앞에 앉아요", "✋ 보를 1초 보여 주면 제시어가 나와요"]
      : [`맞힌 그림 ${game.score}개 / ${game.round}문제`, "✋ 보를 1초 보여 주면 다음 문제"];
    drawBanner(stage, "🎨 공중 그림 퀴즈", lines, { y: 0.3 });
  } else if (game.phase === "peek") {
    drawPeek(stage);
  } else if (game.phase === "reveal") {
    drawBanner(stage, game.message, ["잠시 후 다음 문제로 넘어가요"], { y: 0.5, color: "#ffd23f" });
  } else if (game.phase === "draw" && game.timer <= 10) {
    ctx.save();
    ctx.font = `900 ${90 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 79, 123, 0.6)";
    ctx.fillText(Math.ceil(game.timer), W / 2, H * 0.22);
    ctx.restore();
  }

  if (!cursor || mode === "none") drawHint(stage, "☝️ 손을 카메라에 보여 주세요");
  else if (game.phase === "draw" || game.phase === "free") drawLegend(stage);
}

/** 제시어 보여 주기: 친구들은 눈을 감아요 */
function drawPeek(stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 18, 0.92)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff4f7b";
  ctx.font = `800 ${34 * s}px ${FONT}`;
  ctx.fillText("🙈 친구들은 눈을 감아요! 그릴 사람만 보세요", W / 2, H * 0.22);
  ctx.fillStyle = "#b9c6d8";
  ctx.font = `700 ${30 * s}px ${FONT}`;
  ctx.fillText(`[${game.word.category}]`, W / 2, H * 0.4);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${120 * s}px ${FONT}`;
  ctx.fillText(game.word.word, W / 2, H * 0.56);
  ctx.fillStyle = "#ffd23f";
  ctx.font = `800 ${36 * s}px ${FONT}`;
  ctx.fillText(`${Math.ceil(game.timer)}초 뒤에 사라져요`, W / 2, H * 0.78);
  ctx.restore();
}

/** 아래쪽 손 모양 안내 */
function drawLegend(stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const items = [
    ["☝️ 그리기", mode === "draw"],
    ["✌️ 펜 들기", mode === "hover"],
    ["✋ 1초 = 지우기", mode === "erase"],
  ];
  ctx.save();
  ctx.font = `700 ${22 * s}px ${FONT}`;
  ctx.textBaseline = "middle";
  const widths = items.map(([t]) => ctx.measureText(t).width + 28 * s);
  let x = (W - widths.reduce((a, b) => a + b + 10 * s, -10 * s)) / 2;
  items.forEach(([text, active], i) => {
    ctx.fillStyle = active ? "rgba(255, 210, 63, 0.95)" : "rgba(8, 12, 24, 0.7)";
    roundedRect(ctx, x, H - 64 * s, widths[i], 40 * s, 20 * s);
    ctx.fill();
    ctx.fillStyle = active ? "#1b1300" : "#ffffff";
    ctx.fillText(text, x + 14 * s, H - 44 * s);
    x += widths[i] + 10 * s;
  });
  ctx.restore();
}
