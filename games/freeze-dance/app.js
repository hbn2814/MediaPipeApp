// ════════════════════════════════════════════════════════════
//  얼음 땡
//  음악이 나오면 춤추고, 음악이 멈추면 "얼음!"
//  매 프레임: 여러 사람의 몸 찾기 → 사람마다 "얼음!" 순간 자세와 비교(rules.js)
//  → 움직인 사람은 빨간색으로 알려 줘요 (AI 심판)
// ════════════════════════════════════════════════════════════
import { createGame, drawBanner, drawHint, setText, unit, roundedRect, FONT } from "../shared/engine.js";
import { sfx, playNote } from "../shared/sound.js";
import { handsUp } from "../shared/body.js";
import {
  MAX_PEOPLE,
  GRACE_SECONDS,
  JUDGE_SECONDS,
  danceSeconds,
  center,
  smoothBody,
  moveScore,
  isMoved,
  matchPeople,
} from "./rules.js";

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const DANCE_COLORS = ["#ff4f7b", "#ffd23f", "#3ecbff", "#3ddc97", "#c77dff"];
let game = newGame("ready");
let tracks = []; // 얼음 판정 중인 사람들 { body, ref, moved, seen }

function newGame(phase) {
  return { phase, round: 0, timer: 0, hold: 0, t: 0, movedCount: 0, survived: 0 };
}

createGame({
  kind: "pose",
  options: { numPoses: MAX_PEOPLE },
  onStart: () => (game = newGame("ready")),
  onRestart() {
    stopMusic();
    game = newGame("ready");
  },
  frame,
});

// ───────────── 배경 음악 (소리 파일 없이 음표로 연주) ─────────────
const C = 523.25, D = 587.33, E = 659.25, F = 698.46, G = 783.99, A = 880, B = 987.77, C2 = 1046.5;
const MELODY = [C, E, G, E, A, G, E, 0, D, F, A, F, B, A, F, 0, E, G, C2, G, A, G, E, C, D, E, F, D, C, 0, G, 0];
const BASS = [130.81, 130.81, 146.83, 146.83, 164.81, 164.81, 146.83, 196];
let musicTimer = null;
let step = 0;

function startMusic() {
  stopMusic();
  step = 0;
  musicTimer = setInterval(() => {
    const note = MELODY[step % MELODY.length];
    if (note) playNote(note, 0.16, { type: "square", volume: 0.035 });
    if (step % 4 === 0) playNote(BASS[(step / 4) % BASS.length], 0.3, { type: "triangle", volume: 0.09 });
    step += 1;
  }, 180);
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

function startDance() {
  game.round += 1;
  game.phase = "dance";
  game.timer = danceSeconds();
  tracks = [];
  startMusic();
}

function frame({ dt, result, fresh, stage }) {
  const aspect = stage.W / stage.H;
  const bodies = result?.landmarks ?? [];

  if (game.phase === "ready") {
    // 누구든 양손을 머리 위로 1초 들면 시작
    game.hold = bodies.some((b) => handsUp(b)) ? game.hold + dt : 0;
    if (game.hold >= 1) {
      sfx.start();
      startDance();
    }
  } else if (game.phase === "dance") {
    game.timer -= dt;
    if (game.timer <= 0) {
      stopMusic();
      sfx.bad();
      game.phase = "freeze";
      game.t = 0;
      tracks = [];
    }
  } else if (game.phase === "freeze") {
    game.t += dt;
    if (fresh) judge(bodies, aspect);
    if (game.t >= GRACE_SECONDS + JUDGE_SECONDS) {
      game.movedCount = tracks.filter((t) => t.moved).length;
      game.survived = tracks.length - game.movedCount;
      game.phase = "result";
      game.timer = 2.5;
      if (game.movedCount === 0) sfx.good();
      else sfx.over();
    }
  } else if (game.phase === "result") {
    game.timer -= dt;
    if (game.timer <= 0) startDance();
  }

  draw(stage, bodies);
  setText("round", game.round);
  setText("people", bodies.length);
  setText("moved", game.phase === "freeze" || game.phase === "result" ? tracks.filter((t) => t.moved).length : "-");
}

/** 얼음 판정: 사람마다 "얼음!" 순간의 자세를 기억하고, 그 뒤로 얼마나 움직였나 */
function judge(bodies, aspect) {
  const centers = bodies.map(center);
  const match = matchPeople(tracks.map((t) => center(t.body)), centers, aspect);
  bodies.forEach((body, i) => {
    let track = tracks[match[i]];
    if (!track) {
      track = { body: null, ref: null, moved: false, score: 0 };
      tracks.push(track);
    }
    track.body = smoothBody(track.body, body);
    if (game.t < GRACE_SECONDS || !track.ref) {
      track.ref = track.body; // 멈출 시간 동안은 기준 자세를 계속 새로 잡아요
    } else {
      track.score = moveScore(track.ref, track.body, aspect);
      if (isMoved(track.ref, track.body, aspect)) track.moved = true;
    }
  });
}

// ───────────── 그리기 ─────────────
function draw(stage, bodies) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  stage.drawVideo(game.phase === "dance" ? 0.25 : 0.4);

  if (game.phase === "freeze" || game.phase === "result") {
    // 얼음 판정 중: 기억해 둔 사람별로 초록(성공) / 빨강(움직임)
    for (const track of tracks) {
      const judging = game.t >= GRACE_SECONDS;
      const color = track.moved ? "#ff4f7b" : judging ? "#3ddc97" : "#ffffff";
      drawSkeleton(stage, track.body, color);
      const head = stage.toScreen(track.body[0]);
      label(stage, head.x, head.y - 70 * s, track.moved ? "🚨 움직였어요!" : judging ? "🧊 얼음 성공" : "멈춰!", color);
    }
  } else {
    bodies.forEach((body, i) => drawSkeleton(stage, body, DANCE_COLORS[i % DANCE_COLORS.length]));
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (game.phase === "dance") {
    const beat = 1 + Math.sin(performance.now() / 90) * 0.06;
    ctx.font = `900 ${80 * s * beat}px ${FONT}`;
    ctx.fillStyle = "#ffd23f";
    ctx.lineWidth = 8 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText("💃 춤춰요! 🕺", W / 2, H * 0.14);
    ctx.fillText("💃 춤춰요! 🕺", W / 2, H * 0.14);
  } else if (game.phase === "freeze") {
    const judging = game.t >= GRACE_SECONDS;
    ctx.font = `900 ${110 * s}px ${FONT}`;
    ctx.lineWidth = 10 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = "#7fe7ff";
    ctx.strokeText("🧊 얼음!", W / 2, H * 0.14);
    ctx.fillText("🧊 얼음!", W / 2, H * 0.14);
    if (judging) {
      const left = Math.max(0, GRACE_SECONDS + JUDGE_SECONDS - game.t);
      ctx.font = `800 ${34 * s}px ${FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`AI 심판이 보고 있어요… ${left.toFixed(1)}초`, W / 2, H * 0.26);
    }
  }
  ctx.restore();

  if (game.phase === "ready") {
    drawBanner(stage, "🧊 얼음 땡", ["음악이 나오면 춤추고, 멈추면 얼음!", "🙌 누구든 양손을 머리 위로 1초 들면 시작"], { y: 0.3 });
  } else if (game.phase === "result") {
    const title = tracks.length === 0 ? "아무도 안 보여요" : game.movedCount === 0 ? "모두 얼음 성공! 🎉" : `움직인 사람 ${game.movedCount}명`;
    const line = game.movedCount > 0 ? "빨간색으로 표시된 사람은 자리에 앉아요" : `${game.survived}명 모두 통과!`;
    drawBanner(stage, title, [line, "곧 다음 라운드가 시작돼요"], { y: 0.5, color: game.movedCount ? "#ff4f7b" : "#3ddc97" });
  }

  if (!bodies.length && game.phase !== "result") drawHint(stage, "카메라에 몸이 보이게 서 주세요 (최대 5명)");
}

function drawSkeleton(stage, body, color) {
  const { ctx } = stage;
  const s = unit(stage);
  const p = (i) => stage.toScreen(body[i]);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 9 * s;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(p(a).x, p(a).y);
    ctx.lineTo(p(b).x, p(b).y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(p(0).x, p(0).y, 22 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function label(stage, x, y, text, color) {
  const { ctx } = stage;
  const s = unit(stage);
  ctx.save();
  ctx.font = `800 ${26 * s}px ${FONT}`;
  const w = ctx.measureText(text).width + 28 * s;
  ctx.fillStyle = "rgba(8,12,24,0.85)";
  roundedRect(ctx, x - w / 2, y - 22 * s, w, 44 * s, 22 * s);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}
