// ════════════════════════════════════════════════════════════
//  표정 챌린지
//  매 프레임: 얼굴 찾기 → 표정 점수 52개 → 제시된 표정을 지었나(rules.js)
// ════════════════════════════════════════════════════════════
import { createGame, drawBanner, drawEmoji, drawHint, setText, unit, roundedRect, FONT, FaceLandmarker } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import { EXPRESSIONS, HOLD_SECONDS, MAX_MISSES, START_SMILE, toScores, progress, isDoing, timeLimit, nextExpression } from "./rules.js";

const SMILE = EXPRESSIONS[0];
let best = 0; // 오늘의 최고 점수 (새로고침하면 사라져요)
let game = newGame("ready");

function newGame(phase) {
  return {
    phase, // "ready" | "play" | "result" | "over"
    score: 0,
    misses: 0,
    level: 0,
    expression: SMILE,
    limit: timeLimit(0),
    timeLeft: timeLimit(0),
    hold: 0,
    result: { ok: false, timer: 0 },
  };
}

createGame({
  kind: "face",
  options: { numFaces: 1, outputFaceBlendshapes: true },
  onStart: () => (game = newGame("ready")),
  onRestart: () => (game = newGame("ready")),
  frame,
});

function ask() {
  game.expression = nextExpression(game.expression.id);
  game.limit = timeLimit(game.level);
  game.timeLeft = game.limit;
  game.hold = 0;
  game.phase = "play";
}

function frame({ dt, result, stage }) {
  const face = result?.faceLandmarks?.[0];
  const scores = toScores(result?.faceBlendshapes?.[0]?.categories);

  if (game.phase === "ready" || game.phase === "over") {
    // 활짝 웃으면 시작 (끝난 뒤에는 결과를 2초 보여 준 다음)
    game.result.timer -= dt;
    game.hold = face && isDoing(SMILE, scores) ? game.hold + dt : 0;
    if (game.result.timer <= 0 && game.hold >= START_SMILE) {
      game = newGame("play");
      sfx.start();
      ask();
    }
  } else if (game.phase === "play") {
    game.timeLeft -= dt;
    game.hold = face && isDoing(game.expression, scores) ? game.hold + dt : 0;
    if (game.hold >= HOLD_SECONDS) {
      game.score += 1;
      game.level += 1;
      game.result = { ok: true, timer: 0.7 };
      game.phase = "result";
      sfx.good();
    } else if (game.timeLeft <= 0) {
      game.misses += 1;
      game.result = { ok: false, timer: 1.0 };
      game.phase = "result";
      sfx.bad();
    }
  } else if (game.phase === "result") {
    game.result.timer -= dt;
    if (game.result.timer <= 0) {
      if (game.misses >= MAX_MISSES) {
        game.phase = "over";
        game.expression = SMILE;
        game.hold = 0;
        game.result.timer = 2;
        best = Math.max(best, game.score);
        sfx.over();
      } else {
        ask();
      }
    }
  }

  draw(stage, face, scores);
  setText("score", game.score);
  setText("misses", "❤️".repeat(MAX_MISSES - game.misses) + "🖤".repeat(game.misses));
  setText("best", best);
}

// ───────────── 그리기 ─────────────
function draw(stage, face, scores) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  stage.drawVideo(0.12);

  // 얼굴 윤곽선 (눈·눈썹·입술)
  if (face) {
    stage.mirrored(() => {
      stage.drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_CONTOURS, { color: "rgba(255,255,255,0.55)", lineWidth: 2 });
    });
  }

  if (game.phase === "ready") {
    drawBanner(stage, "😜 표정 챌린지", ["화면에 나오는 표정을 제한 시간 안에 따라 해요", "😁 활짝 웃으면 시작!"], { y: 0.2 });
    drawMeter(stage, SMILE, scores);
  } else if (game.phase === "over") {
    const next = game.result.timer > 0 ? "잠시 후 다시 할 수 있어요" : "😁 활짝 웃으면 다시 시작";
    drawBanner(stage, "게임 끝!", [`성공 ${game.score}개 · 오늘의 최고 ${best}개`, next], { y: 0.2, color: "#ffd23f" });
    drawMeter(stage, SMILE, scores);
  } else {
    drawCard(stage);
    drawMeter(stage, game.expression, scores);
    if (game.phase === "result") {
      ctx.save();
      ctx.font = `900 ${96 * s}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 10 * s;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      const text = game.result.ok ? "좋아요! 🎉" : "시간 초과 ⏰";
      ctx.strokeText(text, W / 2, H * 0.5);
      ctx.fillStyle = game.result.ok ? "#3ddc97" : "#ff4f7b";
      ctx.fillText(text, W / 2, H * 0.5);
      ctx.restore();
    }
  }

  if (!face) drawHint(stage, "🙂 얼굴이 화면 가운데에 보이게 해 주세요");
}

/** 위쪽 문제 카드: 이모지 + 표정 이름 + 남은 시간 막대 */
function drawCard(stage) {
  const { ctx, W } = stage;
  const s = unit(stage);
  const e = game.expression;
  const w = Math.min(W * 0.8, 640 * s);
  const x = (W - w) / 2;
  const y = 70 * s;
  const h = 150 * s;
  ctx.save();
  ctx.fillStyle = "rgba(8,12,24,0.8)";
  roundedRect(ctx, x, y, w, h, 24 * s);
  ctx.fill();
  drawEmoji(ctx, e.emoji, x + 80 * s, y + h / 2 - 8 * s, 96 * s);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${50 * s}px ${FONT}`;
  ctx.fillText(e.name, x + 150 * s, y + 52 * s);
  ctx.fillStyle = "#b9c6d8";
  ctx.font = `600 ${24 * s}px ${FONT}`;
  ctx.fillText(e.hint, x + 150 * s, y + 98 * s);
  // 남은 시간
  const ratio = Math.max(0, game.timeLeft / game.limit);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(x + 20 * s, y + h - 18 * s, w - 40 * s, 8 * s);
  ctx.fillStyle = ratio > 0.3 ? "#ffd23f" : "#ff4f7b";
  ctx.fillRect(x + 20 * s, y + h - 18 * s, (w - 40 * s) * ratio, 8 * s);
  ctx.restore();
}

/** 아래쪽 표정 게이지: 지금 얼마나 그 표정을 짓고 있나 (선을 넘으면 성공) */
function drawMeter(stage, expression, scores) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const w = Math.min(W * 0.6, 520 * s);
  const x = (W - w) / 2;
  const y = H - 130 * s;
  const p = progress(expression, scores);
  ctx.save();
  ctx.fillStyle = "rgba(8,12,24,0.75)";
  roundedRect(ctx, x - 16 * s, y - 40 * s, w + 32 * s, 76 * s, 18 * s);
  ctx.fill();
  ctx.fillStyle = "#cfd9e8";
  ctx.font = `700 ${20 * s}px ${FONT}`;
  ctx.fillText(`${expression.emoji} 표정 게이지`, x, y - 14 * s);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundedRect(ctx, x, y, w, 20 * s, 10 * s);
  ctx.fill();
  ctx.fillStyle = p >= 1 ? "#3ddc97" : "#3ecbff";
  roundedRect(ctx, x, y, Math.max(20 * s, w * p), 20 * s, 10 * s);
  ctx.fill();
  // 유지 시간 표시
  const need = game.phase === "play" ? HOLD_SECONDS : START_SMILE;
  if (game.hold > 0) {
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(x, y + 24 * s, w * Math.min(1, game.hold / need), 5 * s);
  }
  ctx.restore();
}
