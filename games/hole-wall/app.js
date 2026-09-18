// ════════════════════════════════════════════════════════════
//  벽 통과 챌린지
//  매 프레임: 몸의 점 33개 찾기 → 팔다리 방향이 구멍 모양과 같나(rules.js)
//  → 벽이 닿는 순간 맞으면 통과!
// ════════════════════════════════════════════════════════════
import { createGame, modePicker, drawBanner, drawHint, setText, unit, FONT } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import { LIMBS, POSES, START_HOLD, PASS_WINDOW, MAX_MISSES, wallSeconds, matchPose, nextPose } from "./rules.js";

const getMode = modePicker();
let seated = false;
let best = 0; // 오늘의 최고 기록 (새로고침하면 사라져요)
let game = newGame("ready");
let wallCanvas = null; // 벽에 구멍을 뚫기 위한 보조 그림판
let wallCtx = null;

function newGame(phase) {
  return {
    phase, // "ready" | "play" | "feedback" | "over"
    level: 0,
    passed: 0,
    misses: 0,
    pose: POSES[0], // 시작 자세는 만세
    wallT: 0,
    duration: wallSeconds(0),
    lastMatchT: -Infinity,
    hold: 0,
    feedback: { ok: false, timer: 0 },
    shake: 0,
    match: null,
  };
}

const stage = createGame({
  kind: "pose",
  options: { numPoses: 1 },
  onStart(s) {
    seated = getMode() === "seated";
    wallCanvas = document.createElement("canvas");
    wallCanvas.width = s.W;
    wallCanvas.height = s.H;
    wallCtx = wallCanvas.getContext("2d");
    game = newGame("ready");
  },
  onRestart: () => (game = newGame("ready")),
  frame,
});

function begin() {
  game = newGame("play");
  game.pose = nextPose(seated, "hooray");
  sfx.start();
}

function nextWall() {
  game.level += 1;
  game.pose = nextPose(seated, game.pose.id);
  game.duration = wallSeconds(game.level);
  game.wallT = 0;
  game.lastMatchT = -Infinity;
  game.phase = "play";
}

function frame({ dt, result, stage }) {
  const { ctx, W, H } = stage;
  const body = result?.landmarks?.[0];
  game.match = body ? matchPose(body, game.pose, { aspect: W / H, seated }) : null;
  const pass = game.match?.pass ?? false;

  if (game.phase === "ready" || game.phase === "over") {
    // 만세 자세를 잠깐 유지하면 시작
    game.hold = pass ? game.hold + dt : 0;
    if (game.hold >= START_HOLD) begin();
  } else if (game.phase === "play") {
    game.wallT += dt;
    if (pass) game.lastMatchT = game.wallT;
    if (game.wallT >= game.duration) {
      const ok = game.duration - game.lastMatchT <= PASS_WINDOW;
      game.feedback = { ok, timer: 1.1 };
      game.phase = "feedback";
      if (ok) {
        game.passed += 1;
        sfx.good();
      } else {
        game.misses += 1;
        game.shake = 0.4;
        sfx.bad();
      }
    }
  } else if (game.phase === "feedback") {
    game.feedback.timer -= dt;
    if (game.feedback.timer <= 0) {
      if (game.misses >= MAX_MISSES) {
        game.phase = "over";
        game.pose = POSES[0];
        game.hold = 0;
        best = Math.max(best, game.passed);
        sfx.over();
      } else {
        nextWall();
      }
    }
  }

  ctx.save();
  if (game.shake > 0) {
    game.shake -= dt;
    ctx.translate((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
  }
  stage.drawVideo(0.25);
  const k = wallScale();
  drawWall(stage, game.pose, k);
  if (body) drawBody(stage, body, game.match);
  ctx.restore();
  drawOverlayText(stage, body);

  setText("passed", game.passed);
  setText("misses", "❤️".repeat(MAX_MISSES - game.misses) + "🖤".repeat(game.misses));
  setText("poseName", `${game.pose.emoji} ${game.pose.name}`);
  setText("best", best);
}

/** 벽 크기: 멀리서 작게 → 가까이 올수록 빠르게 커져요 */
function wallScale() {
  if (game.phase === "ready" || game.phase === "over") return 0.5;
  if (game.phase === "feedback") return 1;
  const p = Math.min(1, game.wallT / game.duration);
  return 0.3 + 0.7 * p * p;
}

// ───────────── 구멍 모양(사람 모양) 만들기 ─────────────
const dir = (deg) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });

function figureJoints(pose, cx, cy, size) {
  const at = (x, y) => ({ x: cx + x * size, y: cy + y * size });
  const from = (p, deg, len) => {
    const d = dir(deg);
    return { x: p.x + d.x * len * size, y: p.y + d.y * len * size };
  };
  const j = {
    head: at(0, -0.3),
    lShoulder: at(-0.1, -0.19),
    rShoulder: at(0.1, -0.19),
    lHip: at(-0.065, 0.05),
    rHip: at(0.065, 0.05),
  };
  const a = pose.angles;
  j.lElbow = from(j.lShoulder, a.lUpper, 0.14);
  j.lWrist = from(j.lElbow, a.lFore, 0.13);
  j.rElbow = from(j.rShoulder, a.rUpper, 0.14);
  j.rWrist = from(j.rElbow, a.rFore, 0.13);
  j.lKnee = from(j.lHip, a.lThigh, 0.17);
  j.lAnkle = from(j.lKnee, a.lShin, 0.16);
  j.rKnee = from(j.rHip, a.rThigh, 0.17);
  j.rAnkle = from(j.rKnee, a.rShin, 0.16);
  return j;
}

function drawFigure(c, j, size, widthScale) {
  const w = size * 0.075 * widthScale;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = w;
  const line = (...points) => {
    c.beginPath();
    c.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) c.lineTo(p.x, p.y);
    c.stroke();
  };
  // 몸통
  c.beginPath();
  c.moveTo(j.lShoulder.x, j.lShoulder.y);
  c.lineTo(j.rShoulder.x, j.rShoulder.y);
  c.lineTo(j.rHip.x, j.rHip.y);
  c.lineTo(j.lHip.x, j.lHip.y);
  c.closePath();
  c.fill();
  c.stroke();
  line(j.lShoulder, j.lElbow, j.lWrist);
  line(j.rShoulder, j.rElbow, j.rWrist);
  line(j.lHip, j.lKnee, j.lAnkle);
  line(j.rHip, j.rKnee, j.rAnkle);
  c.beginPath();
  c.arc(j.head.x, j.head.y, size * 0.07 * widthScale + w * 0.2, 0, Math.PI * 2);
  c.fill();
}

function drawWall(stage, pose, k) {
  // 시작·끝 화면에서는 안내판에 가리지 않게 벽을 조금 아래에 그려요
  const waiting = game.phase === "ready" || game.phase === "over";
  const centerY = stage.H * (waiting ? 0.6 : 0.5);
  const { ctx, W, H } = stage;
  const c = wallCtx;
  const ww = W * 0.94 * k;
  const wh = H * 0.94 * k;
  const x = (W - ww) / 2;
  const y = centerY - wh / 2;
  c.clearRect(0, 0, W, H);

  // 벽돌 벽
  const tint = game.phase === "feedback" ? (game.feedback.ok ? "#1f9d6b" : "#c2413b") : "#c8743a";
  c.globalCompositeOperation = "source-over";
  c.fillStyle = tint;
  c.fillRect(x, y, ww, wh);
  c.strokeStyle = "rgba(40, 18, 6, 0.35)";
  c.lineWidth = Math.max(1, 3 * k);
  const rows = 9;
  const rowH = wh / rows;
  for (let r = 0; r <= rows; r++) {
    c.beginPath();
    c.moveTo(x, y + r * rowH);
    c.lineTo(x + ww, y + r * rowH);
    c.stroke();
    const brickW = rowH * 2.2;
    for (let bx = x + (r % 2 ? brickW / 2 : 0); bx < x + ww; bx += brickW) {
      c.beginPath();
      c.moveTo(bx, y + r * rowH);
      c.lineTo(bx, y + (r + 1) * rowH);
      c.stroke();
    }
  }

  // 사람 모양 구멍: 밝은 테두리를 먼저 그리고, 안쪽을 지워서 뚫어요
  const size = wh * 1.02;
  const joints = figureJoints(pose, W / 2, centerY + wh * 0.02, size);
  c.fillStyle = c.strokeStyle = "rgba(255, 244, 214, 0.95)";
  drawFigure(c, joints, size, 1.35);
  c.globalCompositeOperation = "destination-out";
  c.fillStyle = c.strokeStyle = "#000";
  drawFigure(c, joints, size, 1.12);
  c.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.globalAlpha = 0.35 + 0.55 * k;
  ctx.drawImage(wallCanvas, 0, 0);
  ctx.restore();
}

// ───────────── 내 몸 그리기: 맞은 팔다리는 초록, 틀린 팔다리는 빨강 ─────────────
function drawBody(stage, body, match) {
  const { ctx } = stage;
  const s = unit(stage);
  const ok = new Map((match?.limbs ?? []).map((l) => [l.key, l.ok]));
  const p = (i) => stage.toScreen(body[i]);
  ctx.save();
  ctx.lineCap = "round";
  // 몸통
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 8 * s;
  for (const [a, b] of [[11, 12], [11, 23], [12, 24], [23, 24]]) {
    ctx.beginPath();
    ctx.moveTo(p(a).x, p(a).y);
    ctx.lineTo(p(b).x, p(b).y);
    ctx.stroke();
  }
  for (const limb of LIMBS) {
    if (seated && !limb.arm) continue;
    const state = ok.get(limb.key);
    ctx.strokeStyle = state ? "#3ddc97" : "#ff4f7b";
    ctx.lineWidth = 14 * s;
    ctx.beginPath();
    ctx.moveTo(p(limb.from).x, p(limb.from).y);
    ctx.lineTo(p(limb.to).x, p(limb.to).y);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (seated && i >= 25) continue;
    ctx.beginPath();
    ctx.arc(p(i).x, p(i).y, 6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOverlayText(stage, body) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  if (game.phase === "ready") {
    drawBanner(stage, "🧱 벽 통과 챌린지", ["구멍과 같은 모양으로 몸을 맞춰요", `🙌 만세를 ${START_HOLD}초 유지하면 시작!`], { y: 0.16 });
    drawHoldBar(stage);
  } else if (game.phase === "over") {
    drawBanner(stage, "게임 끝!", [`통과한 벽 ${game.passed}개 · 오늘의 최고 ${best}개`, "🙌 만세를 하면 다시 시작"], { y: 0.16, color: "#ffd23f" });
    drawHoldBar(stage);
  } else if (game.phase === "feedback") {
    ctx.save();
    ctx.font = `900 ${110 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    const text = game.feedback.ok ? "통과! 🎉" : "쾅! 💥";
    ctx.strokeText(text, W / 2, H * 0.2);
    ctx.fillStyle = game.feedback.ok ? "#3ddc97" : "#ff4f7b";
    ctx.fillText(text, W / 2, H * 0.2);
    ctx.restore();
  }

  if (!body) {
    drawHint(stage, seated ? "상반신이 카메라에 보이게 앉아 주세요" : "온몸이 카메라에 보이게 뒤로 물러나 주세요");
  } else if (game.match && game.match.limbs.some((l) => !l.visible)) {
    drawHint(stage, seated ? "양팔이 모두 보이게 해 주세요" : "발끝까지 보이게 뒤로 물러나 주세요");
  }
}

function drawHoldBar(stage) {
  if (game.hold <= 0) return;
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const w = W * 0.3;
  ctx.fillStyle = "rgba(8,12,24,0.7)";
  ctx.fillRect((W - w) / 2, H * 0.3, w, 16 * s);
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect((W - w) / 2, H * 0.3, w * Math.min(1, game.hold / START_HOLD), 16 * s);
}
