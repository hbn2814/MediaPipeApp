// ════════════════════════════════════════════════════════════
//  과일 닌자
//  매 프레임: 검지 끝 찾기 → 빠르게 움직였으면 "칼" → 칼자국이 과일에 닿았나(rules.js)
// ════════════════════════════════════════════════════════════
import { createGame, drawBanner, drawEmoji, drawHint, setText, unit, FONT } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import {
  TIP,
  GAME_SECONDS,
  MAX_BOMBS,
  TRAIL_SECONDS,
  COMBO_SECONDS,
  GRAVITY,
  FRUIT_SIZE,
  BOMB_CHANCE,
  segmentHitsCircle,
  isSlicing,
  comboBonus,
  spawnInterval,
  spawnCount,
  launch,
} from "./rules.js";

const FRUITS = [
  ["🍎", "#ff4d4d"],
  ["🍊", "#ff9f1c"],
  ["🍉", "#ff5d73"],
  ["🍇", "#9b5de5"],
  ["🍋", "#ffe14d"],
  ["🍓", "#ff3355"],
  ["🥝", "#8ac926"],
  ["🍑", "#ffae8a"],
  ["🍍", "#ffd23f"],
];

let best = 0; // 오늘의 최고 점수 (새로고침하면 사라져요)
let game = newGame("ready");
const trails = new Map(); // 손마다 칼자국 점들 { x, y, t }
let noHandSeconds = 0;

function newGame(phase) {
  return {
    phase, // "ready" | "play" | "over"
    score: 0,
    bombs: 0,
    timeLeft: GAME_SECONDS,
    elapsed: 0,
    spawnIn: 0.6,
    overWait: 0,
    shake: 0,
    objects: [], // 날아다니는 과일·폭탄·시작 수박
    halves: [], // 잘린 과일 반쪽
    particles: [], // 과즙 튀는 알갱이
    popups: [], // "+1" 같은 글자
    combo: { count: 0, timer: 0, x: 0, y: 0 },
  };
}

/** 가운데에 떠 있는 "베면 시작하는" 큰 수박 */
function startTarget(stage) {
  return { kind: "start", emoji: "🍉", color: "#ff5d73", x: stage.W / 2, y: stage.H * 0.62, vx: 0, vy: 0, r: stage.H * 0.11, rot: 0, vr: 0.8, fixed: true };
}

function toReady(stage) {
  game = newGame("ready");
  game.objects.push(startTarget(stage));
}

function begin() {
  game = newGame("play");
  sfx.start();
}

function endGame() {
  game.phase = "over";
  game.overWait = 1.2; // 1.2초 뒤에 "다시 하기" 수박이 나와요
  game.objects = [];
  best = Math.max(best, game.score);
  sfx.over();
}

const stage = createGame({
  kind: "hand",
  options: { numHands: 2 }, // 두 손 모두 칼이 될 수 있어요
  onStart: (s) => toReady(s),
  onRestart: () => toReady(stage),
  frame,
});

function frame({ dt, now, result, fresh, stage }) {
  const { ctx } = stage;
  ctx.save();
  if (game.shake > 0) {
    game.shake -= dt;
    ctx.translate((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
  }
  stage.drawVideo(0.35);
  if (fresh) swing(result, now, stage);
  update(dt, stage);
  draw(now, stage);
  ctx.restore();

  const hands = result?.landmarks?.length ?? 0;
  noHandSeconds = hands ? 0 : noHandSeconds + dt;
  if (noHandSeconds > 1) drawHint(stage, "✋ 손을 카메라에 보여 주세요");

  setText("score", game.score);
  setText("time", Math.ceil(game.timeLeft));
  setText("bombs", `${game.bombs} / ${MAX_BOMBS}`);
  setText("best", best);
}

// ───────────── 칼 휘두르기 ─────────────
function swing(result, now, stage) {
  const seen = new Set();
  (result?.landmarks ?? []).forEach((hand, i) => {
    const key = result.handednesses?.[i]?.[0]?.categoryName ?? String(i); // 왼손/오른손 구별
    seen.add(key);
    const point = { ...stage.toScreen(hand[TIP]), t: now };
    const trail = trails.get(key) ?? [];
    const prev = trail[trail.length - 1];
    trail.push(point);
    trails.set(key, trail);
    if (prev && isSlicing(prev, point, (point.t - prev.t) / 1000, stage.H)) {
      point.fast = true;
      for (const obj of game.objects) {
        if (!obj.cut && segmentHitsCircle(prev, point, obj, obj.r)) slice(obj, prev, point, stage);
      }
    }
  });
  for (const key of [...trails.keys()]) if (!seen.has(key)) trails.delete(key);
}

function slice(obj, a, b, stage) {
  obj.cut = true;
  if (obj.kind === "start") {
    burst(obj, obj.color, 26, stage);
    begin();
    return;
  }
  if (game.phase !== "play") return;
  if (obj.kind === "bomb") {
    game.bombs += 1;
    game.shake = 0.45;
    burst(obj, "#ffb020", 36, stage);
    popup(obj.x, obj.y, "💥 펑!", "#ff6b6b");
    sfx.bad();
    if (game.bombs >= MAX_BOMBS) endGame();
    return;
  }
  game.score += 1;
  sfx.slice();
  popup(obj.x, obj.y - obj.r, "+1", "#ffffff");
  burst(obj, obj.color, 16, stage);
  game.combo.count += 1;
  game.combo.timer = COMBO_SECONDS;
  game.combo.x = obj.x;
  game.combo.y = obj.y;
  // 칼이 지나간 방향으로 과일을 두 쪽으로 나눠요
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const push = stage.H * 0.35;
  for (const side of [-1, 1]) {
    game.halves.push({
      emoji: obj.emoji,
      x: obj.x,
      y: obj.y,
      r: obj.r,
      cutAngle: angle,
      rot: obj.rot,
      spin: 0,
      side,
      vx: obj.vx + Math.cos(angle + Math.PI / 2) * push * side,
      vy: obj.vy * 0.4 + Math.sin(angle + Math.PI / 2) * push * side,
    });
  }
}

function burst(obj, color, count, stage) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = stage.H * (0.2 + Math.random() * 0.6);
    game.particles.push({ x: obj.x, y: obj.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, color });
  }
}

function popup(x, y, text, color) {
  game.popups.push({ x, y, text, color, life: 0.9 });
}

// ───────────── 움직이기 ─────────────
function update(dt, stage) {
  const { W, H } = stage;
  const g = GRAVITY * H;

  if (game.phase === "play") {
    game.elapsed += dt;
    game.timeLeft -= dt;
    game.spawnIn -= dt;
    if (game.spawnIn <= 0) {
      const n = spawnCount(game.elapsed);
      for (let i = 0; i < n; i++) {
        const bomb = Math.random() < BOMB_CHANCE + game.elapsed * 0.002;
        const [emoji, color] = bomb ? ["💣", "#ffb020"] : FRUITS[Math.floor(Math.random() * FRUITS.length)];
        game.objects.push({ kind: bomb ? "bomb" : "fruit", emoji, color, ...launch(W, H), r: FRUIT_SIZE * H, rot: 0, vr: (Math.random() - 0.5) * 6 });
      }
      game.spawnIn = spawnInterval(game.elapsed);
    }
    if (game.combo.count > 0) {
      game.combo.timer -= dt;
      if (game.combo.timer <= 0) {
        const bonus = comboBonus(game.combo.count);
        if (bonus > 0) {
          game.score += bonus;
          popup(game.combo.x, game.combo.y - H * 0.12, `${game.combo.count}콤보! +${bonus}`, "#ffd23f");
          sfx.good();
        }
        game.combo.count = 0;
      }
    }
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      endGame();
    }
  } else if (game.phase === "over" && game.overWait > 0) {
    game.overWait -= dt;
    if (game.overWait <= 0) game.objects.push(startTarget(stage));
  }

  for (const obj of game.objects) {
    obj.rot += obj.vr * dt;
    if (obj.fixed) continue;
    obj.vy += g * dt;
    obj.x += obj.vx * dt;
    obj.y += obj.vy * dt;
  }
  game.objects = game.objects.filter((o) => !o.cut && !(o.vy > 0 && o.y > H + o.r * 2));

  for (const h of game.halves) {
    h.vy += g * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.spin += h.side * 3 * dt;
  }
  game.halves = game.halves.filter((h) => h.y < H + h.r * 2);

  for (const p of game.particles) {
    p.vy += g * 0.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);

  for (const p of game.popups) {
    p.y -= H * 0.12 * dt;
    p.life -= dt;
  }
  game.popups = game.popups.filter((p) => p.life > 0);
}

// ───────────── 그리기 ─────────────
function draw(now, stage) {
  const { ctx, W, H } = stage;
  const s = unit(stage);

  for (const p of game.particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const h of game.halves) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.cutAngle + h.spin);
    ctx.beginPath();
    ctx.rect(-h.r * 1.6, h.side < 0 ? -h.r * 1.6 : 0, h.r * 3.2, h.r * 1.6);
    ctx.clip();
    ctx.rotate(-h.cutAngle + h.rot);
    drawEmoji(ctx, h.emoji, 0, 0, h.r * 2);
    ctx.restore();
  }

  for (const obj of game.objects) {
    if (obj.kind === "start") {
      const pulse = 1 + Math.sin(now / 250) * 0.04;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 210, 63, 0.9)";
      ctx.lineWidth = 6 * s;
      ctx.setLineDash([14 * s, 12 * s]);
      ctx.lineDashOffset = -now / 30;
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.r * 1.35 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawEmoji(ctx, obj.emoji, obj.x, obj.y, obj.r * 2 * pulse, obj.rot * 0.2);
      ctx.save();
      ctx.font = `800 ${30 * s}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(game.phase === "over" ? "휘둘러서 다시 하기!" : "휘둘러서 시작!", obj.x, obj.y + obj.r * 1.35 + 44 * s);
      ctx.restore();
    } else {
      drawEmoji(ctx, obj.emoji, obj.x, obj.y, obj.r * 2, obj.rot);
    }
  }

  // 칼자국: 빠르게 움직인 구간은 밝고 굵게
  for (const trail of trails.values()) {
    while (trail.length && now - trail[0].t > TRAIL_SECONDS * 1000) trail.shift();
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "#7fe7ff";
    ctx.shadowBlur = 18 * s;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      const age = 1 - (now - b.t) / (TRAIL_SECONDS * 1000);
      ctx.strokeStyle = b.fast ? `rgba(255,255,255,${age})` : `rgba(127,231,255,${age * 0.5})`;
      ctx.lineWidth = (b.fast ? 14 : 6) * s * age;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    const tip = trail[trail.length - 1];
    if (tip) {
      ctx.fillStyle = "#7fe7ff";
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 10 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const p of game.popups) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.font = `900 ${40 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }

  if (game.phase === "ready") {
    drawBanner(stage, "✂️ 과일 닌자", ["검지를 빠르게 휘둘러 과일을 베세요", "💣 폭탄을 3번 베면 끝나요"], { y: 0.22 });
  } else if (game.phase === "over") {
    drawBanner(stage, "게임 끝!", [`점수 ${game.score}점`, `오늘의 최고 ${best}점`], { y: 0.24, color: "#ffd23f" });
  }
}
