// ════════════════════════════════════════════════════════════
//  rules.js — 손 탁구의 규칙: 손 위치 → 라켓, 공이 튕기는 방법
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꿔 보며 게임을 쉽게, 또는 어렵게 만들어 보세요!
// ════════════════════════════════════════════════════════════

export const PALM = 9; // 손의 점 21개 중 "가운데손가락 뿌리"(손바닥 가운데쯤)

// 👇 바꿔 볼 수 있는 숫자들 (길이는 화면 높이를 1로 본 비율이에요)
export const WIN_SCORE = 5; // 먼저 이 점수를 내면 승리
export const PADDLE_HEIGHT = 0.22; // 라켓 길이
export const PADDLE_WIDTH = 0.03; // 라켓 두께
export const PADDLE_MARGIN = 0.06; // 화면 끝에서 라켓까지 거리
export const BALL_RADIUS = 0.02; // 공 반지름
export const START_SPEED = 0.8; // 처음 공 속도 (화면 높이/초)
export const SPEED_UP = 1.07; // 칠 때마다 이 배수만큼 빨라져요
export const MAX_SPEED = 2.2; // 공의 최고 속도
export const MAX_BOUNCE = 55; // 라켓 끝에 맞으면 이 각도(도)까지 꺾여 나가요
export const SMOOTHING = 0.45; // 0~1: 클수록 손을 빨리 따라가고, 작을수록 부드러워요
export const CPU_SPEED = 0.75; // 컴퓨터 라켓이 움직이는 속도 (화면 높이/초)

/**
 * 찾은 손들을 화면 왼쪽 선수와 오른쪽 선수에게 나눠 줘요.
 * hands = [{ x, y }] (화면 비율 0~1, 이미 거울처럼 뒤집은 좌표)
 * → { left: y 또는 null, right: y 또는 null }
 */
export function assignHands(hands) {
  const sides = { left: null, right: null };
  for (const hand of hands) {
    const side = hand.x < 0.5 ? "left" : "right";
    if (sides[side] === null) sides[side] = hand.y;
  }
  return sides;
}

/** 지금 위치에서 목표 위치로 조금씩 다가가기 (떨림 줄이기) */
export function smoothTo(current, target, amount = SMOOTHING) {
  return current + (target - current) * amount;
}

/** 라켓이 화면 밖으로 나가지 않게 (y = 라켓 가운데, 화면 비율) */
export function clampPaddle(y) {
  const half = PADDLE_HEIGHT / 2;
  return Math.min(1 - half, Math.max(half, y));
}

/**
 * 라켓의 어디에 맞았나에 따라 튕겨 나가는 각도(도)
 * offset = -1(라켓 위쪽 끝) ~ 0(가운데) ~ 1(아래쪽 끝)
 */
export function bounceAngle(offset) {
  const o = Math.max(-1, Math.min(1, offset));
  return o * MAX_BOUNCE;
}

/** 라켓에 맞은 뒤의 새 속도. direction = 1(오른쪽으로) 또는 -1(왼쪽으로) */
export function paddleBounce(speed, offset, direction) {
  const next = Math.min(MAX_SPEED, speed * SPEED_UP);
  const rad = (bounceAngle(offset) * Math.PI) / 180;
  return { vx: Math.cos(rad) * next * direction, vy: Math.sin(rad) * next, speed: next };
}

/**
 * 공을 dt초만큼 움직이고, 위아래 벽에 닿으면 튕겨요.
 * 좌표는 화면 높이를 1로 본 값 (가로는 aspect까지)
 */
export function moveBall(ball, dt) {
  let { x, y, vx, vy } = ball;
  x += vx * dt;
  y += vy * dt;
  let bounced = false;
  if (y < BALL_RADIUS) {
    y = BALL_RADIUS + (BALL_RADIUS - y);
    vy = Math.abs(vy);
    bounced = true;
  } else if (y > 1 - BALL_RADIUS) {
    y = 1 - BALL_RADIUS - (y - (1 - BALL_RADIUS));
    vy = -Math.abs(vy);
    bounced = true;
  }
  return { ...ball, x, y, vx, vy, bounced };
}

/** 공이 라켓에 닿았나? paddleX = 라켓 가운데 x, paddleY = 라켓 가운데 y */
export function hitsPaddle(ball, paddleX, paddleY) {
  return (
    Math.abs(ball.x - paddleX) <= PADDLE_WIDTH / 2 + BALL_RADIUS &&
    Math.abs(ball.y - paddleY) <= PADDLE_HEIGHT / 2 + BALL_RADIUS
  );
}

/** 컴퓨터 라켓: 공 쪽으로 정해진 속도까지만 따라가요 (그래서 이길 수 있어요) */
export function cpuFollow(paddleY, ballY, dt) {
  const step = CPU_SPEED * dt;
  return clampPaddle(paddleY + Math.max(-step, Math.min(step, ballY - paddleY)));
}
