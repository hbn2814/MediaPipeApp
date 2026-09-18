// ════════════════════════════════════════════════════════════
//  풍선 팡팡
//  매 프레임: 몸의 점 33개 찾기 → 손·머리·발 위치 → 맞는 풍선에 닿았나(rules.js)
// ════════════════════════════════════════════════════════════
import { createGame, modePicker, drawBanner, drawEmoji, drawHint, setText, unit, FONT } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import { handsUp } from "../shared/body.js";
import {
  PARTS,
  TYPES,
  GAME_SECONDS,
  BALLOON_SIZE,
  LIFE_SECONDS,
  MAX_BALLOONS,
  MIN_VISIBILITY,
  canPop,
  touching,
  pickType,
  spawnPosition,
  spawnInterval,
} from "./rules.js";

const PART_COLORS = { hand: "#3ecbff", head: "#ffd23f", foot: "#3ddc97" };
const getMode = modePicker();
let seated = false;
let best = 0; // 오늘의 최고 점수 (새로고침하면 사라져요)
let game = newGame("ready");

function newGame(phase) {
  return { phase, score: 0, popped: 0, timeLeft: GAME_SECONDS, elapsed: 0, spawnIn: 0.5, balloons: [], bursts: [], hold: 0, wait: 0, shake: 0 };
}

createGame({
  kind: "pose",
  options: { numPoses: 1 },
  onStart() {
    seated = getMode() === "seated";
    game = newGame("ready");
  },
  onRestart: () => (game = newGame("ready")),
  frame,
});

function frame({ dt, result, stage }) {
  const aspect = stage.W / stage.H;
  const body = result?.landmarks?.[0];
  // 몸 부위 점들 (잘 보이는 점만, 화면 비율 좌표)
  const points = [];
  if (body) {
    for (const [part, ids] of Object.entries(PARTS)) {
      if (seated && part === "foot") continue;
      for (const i of ids) {
        if ((body[i].visibility ?? 1) < MIN_VISIBILITY) continue;
        const p = stage.toScreen(body[i]);
        points.push({ part, x: p.x / stage.W, y: p.y / stage.H });
      }
    }
  }

  if (game.phase === "ready" || game.phase === "over") {
    // 양손을 머리 위로 1초 들면 시작
    game.wait -= dt;
    game.hold = body && game.wait <= 0 && handsUp(body) ? game.hold + dt : 0;
    if (game.hold >= 1) {
      game = newGame("play");
      sfx.start();
    }
  } else if (game.phase === "play") {
    update(dt, points, aspect);
  }

  for (const b of game.bursts) b.life -= dt;
  game.bursts = game.bursts.filter((b) => b.life > 0);

  draw(stage, points, body);
  setText("score", game.score);
  setText("time", Math.ceil(game.timeLeft));
  setText("best", best);
}

function update(dt, points, aspect) {
  game.elapsed += dt;
  game.timeLeft -= dt;
  game.spawnIn -= dt;
  if (game.spawnIn <= 0 && game.balloons.length < MAX_BALLOONS) {
    const type = pickType(seated, game.elapsed);
    game.balloons.push({ type, ...spawnPosition(type, seated), age: 0, wobble: Math.random() * 6 });
    game.spawnIn = spawnInterval(game.elapsed);
  }
  for (const balloon of game.balloons) {
    balloon.age += dt;
    // 시간이 다 되면 위로 날아가 버려요
    if (balloon.age > LIFE_SECONDS) balloon.y -= 0.6 * dt;
    const hit = points.find((p) => canPop(balloon.type, p.part) && touching(p, balloon, aspect));
    if (hit && balloon.age > 0.25) {
      balloon.popped = true;
      const t = TYPES[balloon.type];
      game.score = Math.max(0, game.score + t.points);
      game.bursts.push({ x: balloon.x, y: balloon.y, color: t.color, text: t.points > 0 ? `+${t.points}` : `${t.points}`, life: 0.6 });
      if (t.points > 0) {
        game.popped += 1;
        sfx.slice();
      } else {
        game.shake = 0.35;
        sfx.bad();
      }
    }
  }
  game.balloons = game.balloons.filter((b) => !b.popped && b.y > -0.2);
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    game.phase = "over";
    game.balloons = [];
    game.wait = 2;
    best = Math.max(best, game.score);
    sfx.over();
  }
}

// ───────────── 그리기 ─────────────
function draw(stage, points, body) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  ctx.save();
  if (game.shake > 0) {
    game.shake -= 1 / 60;
    ctx.translate((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
  }
  stage.drawVideo(0.3);

  for (const balloon of game.balloons) drawBalloon(stage, balloon);

  // 터지는 효과
  for (const b of game.bursts) {
    const k = 1 - b.life / 0.6;
    ctx.save();
    ctx.globalAlpha = b.life / 0.6;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 6 * s;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r1 = H * BALLOON_SIZE * (0.6 + k);
      const r2 = H * BALLOON_SIZE * (0.9 + k * 1.4);
      ctx.beginPath();
      ctx.moveTo(b.x * W + Math.cos(a) * r1, b.y * H + Math.sin(a) * r1);
      ctx.lineTo(b.x * W + Math.cos(a) * r2, b.y * H + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.font = `900 ${44 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(b.text, b.x * W, b.y * H - H * 0.1 * k);
    ctx.restore();
  }

  // 풍선을 터뜨리는 몸 부위
  for (const p of points) {
    ctx.fillStyle = PART_COLORS[p.part];
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, 11 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (game.phase === "ready") {
    const lines = seated
      ? ["손과 머리로 풍선을 터뜨려요", "🙌 양손을 머리 위로 1초 들면 시작!"]
      : ["손·머리·발로 풍선을 터뜨려요", "🙌 양손을 머리 위로 1초 들면 시작!"];
    drawBanner(stage, "🎈 풍선 팡팡", lines, { y: 0.24 });
    drawLegend(stage);
  } else if (game.phase === "over") {
    const next = game.wait > 0 ? "잠시 후 다시 할 수 있어요" : "🙌 양손을 머리 위로 들면 다시 시작";
    drawBanner(stage, "게임 끝!", [`점수 ${game.score}점 (풍선 ${game.popped}개) · 오늘의 최고 ${best}점`, next], { y: 0.24, color: "#ffd23f" });
  }

  if (!body) drawHint(stage, seated ? "상반신이 카메라에 보이게 앉아 주세요" : "온몸이 카메라에 보이게 뒤로 물러나 주세요");
}

function drawBalloon(stage, balloon) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const t = TYPES[balloon.type];
  const grow = Math.min(1, balloon.age / 0.25);
  const r = H * BALLOON_SIZE * grow;
  const x = balloon.x * W + Math.sin(balloon.age * 2 + balloon.wobble) * 6 * s;
  const y = balloon.y * H + Math.cos(balloon.age * 2.4 + balloon.wobble) * 5 * s;
  if (balloon.type === "bomb") {
    drawEmoji(ctx, "💣", x, y, r * 2.1);
    return;
  }
  ctx.save();
  // 끈
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.15);
  ctx.quadraticCurveTo(x - 10 * s, y + r * 1.6, x + 4 * s, y + r * 2.1);
  ctx.stroke();
  // 풍선
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, t.color);
  g.addColorStop(1, t.color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.9, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.color;
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y + r * 1.15);
  ctx.lineTo(x + 7 * s, y + r * 1.15);
  ctx.lineTo(x, y + r * 1.02);
  ctx.fill();
  ctx.restore();
  if (t.icon) drawEmoji(ctx, t.icon, x, y, r * 0.95);
}

/** 풍선 종류 안내 */
function drawLegend(stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const items = Object.entries(TYPES).filter(([key]) => !(seated && key === "foot"));
  const gap = 230 * s;
  let x = W / 2 - ((items.length - 1) * gap) / 2;
  for (const [key, t] of items) {
    drawBalloon(stage, { type: key, x: x / W, y: 0.6, age: 1, wobble: 0 });
    ctx.save();
    ctx.font = `800 ${24 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    const how = key === "any" ? "아무 데나" : key === "head" ? "머리로만" : key === "foot" ? "발로만" : "피하세요!";
    ctx.fillText(`${t.name} ${t.points > 0 ? "+" : ""}${t.points}`, x, H * 0.6 + H * BALLOON_SIZE * 2.6);
    ctx.fillStyle = "#b9c6d8";
    ctx.fillText(how, x, H * 0.6 + H * BALLOON_SIZE * 2.6 + 32 * s);
    ctx.restore();
    x += gap;
  }
}
