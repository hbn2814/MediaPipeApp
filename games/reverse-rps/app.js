// ════════════════════════════════════════════════════════════
//  거꾸로 가위바위보
//  매 프레임: 손 찾기 → 가위·바위·보 판단(rules.js, project1 규칙 재사용)
//  → 지시("져라!")대로 냈나 확인
// ════════════════════════════════════════════════════════════
import { createGame, drawBanner, drawEmoji, drawHint, setText, unit, roundedRect, FONT, HandLandmarker } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import {
  GESTURES,
  ORDERS,
  HOLD_SECONDS,
  WRONG_SECONDS,
  GRACE_SECONDS,
  MAX_MISSES,
  gestureOf,
  timeLimit,
  makeRound,
} from "./rules.js";

const START_HOLD = 1.0; // 보(✋)를 이만큼 유지하면 시작
let best = 0; // 오늘의 최고 기록 (새로고침하면 사라져요)
let game = newGame("ready");

function newGame(phase) {
  return {
    phase, // "ready" | "play" | "result" | "over"
    round: 0,
    score: 0,
    misses: 0,
    q: null, // { computer, order, answer }
    limit: 0,
    elapsed: 0,
    hold: { gesture: null, seconds: 0, startedAt: 0 },
    result: { ok: false, text: "", timer: 0 },
    lastAnswer: "paper", // 시작할 때 보를 내고 있으니 첫 정답은 보가 아니게
  };
}

createGame({
  kind: "hand",
  options: { numHands: 1 },
  onStart: () => (game = newGame("ready")),
  onRestart: () => (game = newGame("ready")),
  frame,
});

function ask() {
  game.q = makeRound(game.round, game.lastAnswer);
  game.limit = timeLimit(game.round);
  game.elapsed = 0;
  game.hold = { gesture: null, seconds: 0, startedAt: 0 };
  game.phase = "play";
  sfx.tick();
}

function finish(ok, text) {
  game.result = { ok, text, timer: ok ? 0.7 : 1.1 };
  game.phase = "result";
  game.lastAnswer = game.q.answer;
  game.round += 1;
  if (ok) {
    game.score += 1;
    sfx.good();
  } else {
    game.misses += 1;
    sfx.bad();
  }
}

function frame({ dt, result, stage }) {
  const hand = result?.landmarks?.[0];
  const gesture = hand ? gestureOf(hand) : null;

  // 같은 손 모양을 얼마나 오래 유지했나
  if (gesture === game.hold.gesture) game.hold.seconds += dt;
  else game.hold = { gesture, seconds: 0, startedAt: game.elapsed };

  if (game.phase === "ready" || game.phase === "over") {
    game.result.timer -= dt;
    if (game.result.timer <= 0 && game.hold.gesture === "paper" && game.hold.seconds >= START_HOLD) {
      game = newGame("play");
      sfx.start();
      ask();
    }
  } else if (game.phase === "play") {
    game.elapsed += dt;
    const { gesture: held, seconds, startedAt } = game.hold;
    if (held === game.q.answer && seconds >= HOLD_SECONDS) {
      finish(true, "정답! 🎉");
    } else if (held && held !== game.q.answer && seconds >= WRONG_SECONDS && startedAt >= GRACE_SECONDS) {
      finish(false, `땡! ${GESTURES[game.q.answer].emoji}를 내야 해요`);
    } else if (game.elapsed >= game.limit) {
      finish(false, `시간 초과! 정답은 ${GESTURES[game.q.answer].emoji}`);
    }
  } else if (game.phase === "result") {
    game.result.timer -= dt;
    if (game.result.timer <= 0) {
      if (game.misses >= MAX_MISSES) {
        game.phase = "over";
        game.result.timer = 2;
        best = Math.max(best, game.score);
        sfx.over();
      } else {
        ask();
      }
    }
  }

  draw(stage, hand, gesture);
  setText("score", game.score);
  setText("misses", "❤️".repeat(MAX_MISSES - game.misses) + "🖤".repeat(game.misses));
  setText("best", best);
}

// ───────────── 그리기 ─────────────
function draw(stage, hand, gesture) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  stage.drawVideo(0.4);

  if (hand) {
    stage.mirrored(() => {
      stage.drawer.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: "rgba(255,255,255,0.8)", lineWidth: 3 });
      stage.drawer.drawLandmarks(hand, { color: "#3ecbff", fillColor: "#ffffff", lineWidth: 2, radius: 3 });
    });
    // 내 손 모양 이름표
    const wrist = stage.toScreen(hand[0]);
    const label = gesture ? `${GESTURES[gesture].emoji} ${GESTURES[gesture].name}` : "❓ 모르겠어요";
    ctx.save();
    ctx.font = `800 ${30 * s}px ${FONT}`;
    const w = ctx.measureText(label).width + 30 * s;
    ctx.fillStyle = "rgba(8,12,24,0.8)";
    roundedRect(ctx, wrist.x - w / 2, wrist.y + 20 * s, w, 48 * s, 24 * s);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, wrist.x, wrist.y + 44 * s);
    ctx.restore();
  }

  if (game.phase === "ready") {
    drawBanner(stage, "✊ 거꾸로 가위바위보", ["컴퓨터가 낸 손을 보고 지시대로 내요", "✋ 보를 1초 보여 주면 시작!"], { y: 0.22 });
  } else if (game.phase === "over") {
    const next = game.result.timer > 0 ? "잠시 후 다시 할 수 있어요" : "✋ 보를 1초 보여 주면 다시 시작";
    drawBanner(stage, "게임 끝!", [`맞힌 문제 ${game.score}개 · 오늘의 최고 ${best}개`, next], { y: 0.22, color: "#ffd23f" });
  } else {
    drawQuestion(stage);
  }

  if (!hand && game.phase !== "result") drawHint(stage, "✋ 손을 카메라에 보여 주세요");
}

/** 오른쪽 문제판: 컴퓨터의 손 + 지시 + 남은 시간 */
function drawQuestion(stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const q = game.q;
  const order = ORDERS[q.order];
  const w = 330 * s;
  const x = W - w - 30 * s;
  const y = 80 * s;
  const h = 400 * s;
  ctx.save();
  ctx.fillStyle = "rgba(8,12,24,0.82)";
  roundedRect(ctx, x, y, w, h, 28 * s);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#b9c6d8";
  ctx.font = `700 ${24 * s}px ${FONT}`;
  ctx.fillText("컴퓨터", x + w / 2, y + 36 * s);
  drawEmoji(ctx, GESTURES[q.computer].emoji, x + w / 2, y + 140 * s, 150 * s);
  ctx.fillStyle = order.color;
  ctx.font = `900 ${72 * s}px ${FONT}`;
  ctx.fillText(order.text, x + w / 2, y + 290 * s);
  if (game.phase === "play") {
    const ratio = Math.max(0, 1 - game.elapsed / game.limit);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x + 30 * s, y + h - 40 * s, w - 60 * s, 12 * s);
    ctx.fillStyle = ratio > 0.3 ? "#ffd23f" : "#ff4f7b";
    ctx.fillRect(x + 30 * s, y + h - 40 * s, (w - 60 * s) * ratio, 12 * s);
  }
  ctx.restore();

  if (game.phase === "result") {
    ctx.save();
    ctx.font = `900 ${64 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    const cx = (W - w - 30 * s) / 2;
    ctx.strokeText(game.result.text, cx, H * 0.2);
    ctx.fillStyle = game.result.ok ? "#3ddc97" : "#ff4f7b";
    ctx.fillText(game.result.text, cx, H * 0.2);
    ctx.restore();
  }
}
