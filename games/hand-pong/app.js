// ════════════════════════════════════════════════════════════
//  손 탁구 대결
//  매 프레임: 손 2개 찾기 → 왼쪽 손은 왼쪽 라켓, 오른쪽 손은 오른쪽 라켓(rules.js)
//  → 공 움직이기 → 라켓에 맞으면 튕기기
//  좌표는 "화면 높이 = 1"로 계산하고, 그릴 때만 픽셀로 바꿔요.
// ════════════════════════════════════════════════════════════
import { createGame, modePicker, drawBanner, drawHint, setText, unit, roundedRect, FONT } from "../shared/engine.js";
import { sfx } from "../shared/sound.js";
import {
  PALM,
  WIN_SCORE,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_MARGIN,
  BALL_RADIUS,
  START_SPEED,
  assignHands,
  smoothTo,
  clampPaddle,
  paddleBounce,
  moveBall,
  hitsPaddle,
  cpuFollow,
} from "./rules.js";

const COLORS = { left: "#3ecbff", right: "#ff4f7b" };
const getMode = modePicker();
let vsCpu = false;
let aspect = 16 / 9; // 화면 가로 ÷ 세로
let game = newGame("ready");
let wins = { left: 0, right: 0 }; // 오늘의 승리 수 (새로고침하면 사라져요)

function newGame(phase) {
  return {
    phase, // "ready" | "serve" | "play" | "point" | "over"
    score: { left: 0, right: 0 },
    paddles: { left: 0.5, right: 0.5 },
    seen: { left: 0, right: 0 }, // 손이 보인 시간(초)
    ball: { x: aspect / 2, y: 0.5, vx: 0, vy: 0, speed: START_SPEED },
    trail: [],
    timer: 0,
    serveTo: Math.random() < 0.5 ? -1 : 1,
    winner: null,
  };
}

createGame({
  kind: "hand",
  options: { numHands: 2 },
  onStart(stage) {
    vsCpu = getMode() === "cpu";
    aspect = stage.W / stage.H;
    game = newGame("ready");
  },
  onRestart: () => (game = newGame("ready")),
  frame,
});

const paddleX = (side) => (side === "left" ? PADDLE_MARGIN : aspect - PADDLE_MARGIN);

function serve() {
  game.phase = "serve";
  game.timer = 1.0;
  game.ball = { x: aspect / 2, y: 0.5, vx: 0, vy: 0, speed: START_SPEED };
  game.trail = [];
}

function launchBall() {
  const angle = ((Math.random() * 50 - 25) * Math.PI) / 180;
  game.ball.vx = Math.cos(angle) * START_SPEED * game.serveTo;
  game.ball.vy = Math.sin(angle) * START_SPEED;
  game.phase = "play";
}

function frame({ dt, result, stage }) {
  // ── 손 → 라켓 ──
  const hands = (result?.landmarks ?? []).map((hand) => {
    const p = stage.toScreen(hand[PALM]);
    return { x: p.x / stage.W, y: p.y / stage.H };
  });
  const sides = assignHands(hands);
  for (const side of ["left", "right"]) {
    if (vsCpu && side === "right") continue;
    if (sides[side] !== null) {
      game.paddles[side] = clampPaddle(smoothTo(game.paddles[side], sides[side]));
      game.seen[side] += dt;
    } else {
      game.seen[side] = 0;
    }
  }
  if (vsCpu) {
    const target = game.ball.vx > 0 ? game.ball.y : 0.5; // 공이 올 때만 따라가요
    game.paddles.right = cpuFollow(game.paddles.right, target, dt);
    game.seen.right = 99;
  }

  // ── 게임 진행 ──
  if (game.phase === "ready" || game.phase === "over") {
    // 두 선수의 손이 1초 동안 보이면 시작 (게임이 끝난 뒤에는 결과를 3초 보여 준 다음)
    game.timer -= dt;
    if (game.timer <= 0 && game.seen.left >= 1 && game.seen.right >= 1) {
      game = newGame("ready");
      sfx.start();
      serve();
    }
  } else if (game.phase === "serve") {
    game.timer -= dt;
    if (game.timer <= 0) launchBall();
  } else if (game.phase === "play") {
    stepBall(dt);
  } else if (game.phase === "point") {
    game.timer -= dt;
    if (game.timer <= 0) serve();
  }

  draw(stage, sides);
  setText("scoreLeft", game.score.left);
  setText("scoreRight", game.score.right);
  setText("winsLeft", wins.left);
  setText("winsRight", wins.right);
}

function stepBall(dt) {
  // 빠른 공이 라켓을 뚫고 지나가지 않게 잘게 나눠서 움직여요
  const steps = Math.max(1, Math.ceil((game.ball.speed * dt) / (BALL_RADIUS * 0.8)));
  for (let i = 0; i < steps; i++) {
    const ball = moveBall(game.ball, dt / steps);
    if (ball.bounced) sfx.tick();
    for (const side of ["left", "right"]) {
      const direction = side === "left" ? 1 : -1; // 맞으면 날아갈 방향
      const coming = Math.sign(ball.vx) === -direction;
      if (coming && hitsPaddle(ball, paddleX(side), game.paddles[side])) {
        const offset = (ball.y - game.paddles[side]) / (PADDLE_HEIGHT / 2);
        Object.assign(ball, paddleBounce(ball.speed, offset, direction));
        ball.x = paddleX(side) + direction * (PADDLE_WIDTH / 2 + BALL_RADIUS);
        sfx.hit();
      }
    }
    game.ball = ball;
    if (ball.x < -BALL_RADIUS) return point("right");
    if (ball.x > aspect + BALL_RADIUS) return point("left");
  }
  game.trail.push({ x: game.ball.x, y: game.ball.y });
  if (game.trail.length > 10) game.trail.shift();
}

function point(side) {
  game.score[side] += 1;
  game.serveTo = side === "left" ? 1 : -1; // 점수를 잃은 쪽으로 서브
  if (game.score[side] >= WIN_SCORE) {
    game.phase = "over";
    game.winner = side;
    game.timer = 3;
    wins[side] += 1;
    sfx.over();
  } else {
    game.phase = "point";
    game.timer = 1.0;
    game.lastPoint = side;
    sfx.good();
  }
}

// ───────────── 그리기 ─────────────
function draw(stage, sides) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const px = (v) => v * H; // 계산 좌표 → 픽셀
  stage.drawVideo(0.45);

  // 가운데 점선
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 4 * s;
  ctx.setLineDash([18 * s, 16 * s]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.restore();

  // 큰 점수
  ctx.save();
  ctx.font = `900 ${120 * s}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillText(game.score.left, W * 0.25, 70 * s);
  ctx.fillText(game.score.right, W * 0.75, 70 * s);
  ctx.restore();

  // 라켓
  for (const side of ["left", "right"]) {
    const x = px(paddleX(side));
    const y = px(game.paddles[side]);
    const w = px(PADDLE_WIDTH);
    const h = px(PADDLE_HEIGHT);
    ctx.save();
    ctx.shadowColor = COLORS[side];
    ctx.shadowBlur = 24 * s;
    ctx.fillStyle = COLORS[side];
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, w / 2);
    ctx.fill();
    ctx.restore();
    // 손 위치 표시
    const handY = sides[side];
    if (handY !== null && !(vsCpu && side === "right")) {
      ctx.strokeStyle = COLORS[side];
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.arc(side === "left" ? W * 0.2 : W * 0.8, px(handY), 16 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 공과 꼬리
  if (game.phase === "play" || game.phase === "serve") {
    game.trail.forEach((t, i) => {
      ctx.fillStyle = `rgba(255,255,255,${(i / game.trail.length) * 0.3})`;
      ctx.beginPath();
      ctx.arc(px(t.x), px(t.y), px(BALL_RADIUS) * (i / game.trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 20 * s;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px(game.ball.x), px(game.ball.y), px(BALL_RADIUS), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const leftName = "왼쪽";
  const rightName = vsCpu ? "컴퓨터" : "오른쪽";
  if (game.phase === "ready") {
    const need = vsCpu ? "왼쪽 선수가 손을 보여 주면 시작!" : "두 사람 모두 손을 보여 주면 시작!";
    drawBanner(stage, "🏓 손 탁구 대결", ["손을 위아래로 움직여 라켓을 조종해요", need], { y: 0.5 });
  } else if (game.phase === "over") {
    const name = game.winner === "left" ? leftName : rightName;
    const next = game.timer > 0 ? "잠시 후 새 게임을 할 수 있어요" : "손을 보여 주면 새 게임 시작";
    drawBanner(stage, `${name} 승리! 🏆`, [`${game.score.left} : ${game.score.right}`, next], { y: 0.5, color: COLORS[game.winner] });
  } else if (game.phase === "point") {
    ctx.save();
    ctx.font = `900 ${64 * s}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS[game.lastPoint];
    ctx.fillText(`${game.lastPoint === "left" ? leftName : rightName} 득점!`, W / 2, H * 0.5);
    ctx.restore();
  }

  if (game.phase !== "over" && game.phase !== "ready") {
    if (sides.left === null) drawHint(stage, "왼쪽 선수의 손이 안 보여요");
    else if (!vsCpu && sides.right === null) drawHint(stage, "오른쪽 선수의 손이 안 보여요");
  }
}
