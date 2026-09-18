// ════════════════════════════════════════════════════════════
//  rules.js — 과일 닌자의 규칙: "언제 벤 걸로 볼까?"와 과일이 나는 방법
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꿔 보며 게임을 쉽게, 또는 어렵게 만들어 보세요!
// ════════════════════════════════════════════════════════════

export const TIP = 8; // 손의 점 21개 중 "검지 끝" 번호

// 👇 바꿔 볼 수 있는 숫자들 (길이는 화면 높이를 1로 본 비율이에요)
export const GAME_SECONDS = 60; // 한 판 시간(초)
export const MAX_BOMBS = 3; // 폭탄을 이만큼 베면 게임 끝
export const SLICE_SPEED = 1.2; // 손끝이 1초에 화면 높이의 이 배수 이상 움직여야 "베기"로 인정
export const TRAIL_SECONDS = 0.2; // 칼자국이 남아 있는 시간(초)
export const COMBO_SECONDS = 0.4; // 이 시간 안에 연달아 베면 콤보
export const GRAVITY = 1.5; // 중력 (화면 높이/초²)
export const FRUIT_SIZE = 0.065; // 과일 반지름 (화면 높이 비율)
export const BOMB_CHANCE = 0.15; // 폭탄이 나올 확률 (0~1)

/** 점 c(과일 가운데)가 선분 a-b(칼자국)에서 r 이하로 가까운가? */
export function segmentHitsCircle(a, b, c, r) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  // 선분 위에서 c와 가장 가까운 점의 위치 t (0 = a, 1 = b)
  let t = len2 === 0 ? 0 : ((c.x - a.x) * abx + (c.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(c.x - (a.x + abx * t), c.y - (a.y + aby * t)) <= r;
}

/** 손끝 속도: 1초에 화면 높이의 몇 배를 움직였나 (거리 ÷ 시간) */
export function tipSpeed(a, b, seconds, height) {
  if (seconds <= 0) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y) / height / seconds;
}

/** 충분히 빠르게 휘둘렀나? 천천히 갖다 대기만 하면 베지 못해요 */
export function isSlicing(a, b, seconds, height) {
  return tipSpeed(a, b, seconds, height) >= SLICE_SPEED;
}

/** 콤보 보너스: 2개 연속이면 +1, 3개 연속이면 +2 … */
export function comboBonus(count) {
  return Math.max(0, count - 1);
}

/** 시간이 지날수록 과일이 더 자주 나와요 (다음 과일까지 몇 초) */
export function spawnInterval(elapsed) {
  return Math.max(0.45, 1.1 - elapsed * 0.011);
}

/** 한 번에 던질 과일 개수: 처음엔 1개, 뒤로 갈수록 최대 3개 */
export function spawnCount(elapsed, random = Math.random) {
  const max = elapsed < 15 ? 1 : elapsed < 35 ? 2 : 3;
  return 1 + Math.floor(random() * max);
}

/**
 * 화면 아래에서 과일을 던지는 처음 위치와 속도 (포물선 운동)
 * 가장 높이 올라간 지점이 화면 위에서 12~45% 사이에 오도록 거꾸로 계산해요.
 *   최고 높이 h까지 올라가려면 처음 속도 v = √(2gh)
 */
export function launch(width, height, random = Math.random) {
  const g = GRAVITY * height;
  const x = width * (0.2 + 0.6 * random());
  const y = height * (1 + FRUIT_SIZE);
  const peakY = height * (0.12 + 0.33 * random());
  const vy = -Math.sqrt(2 * g * (y - peakY));
  const flight = (2 * -vy) / g; // 다시 처음 높이로 떨어질 때까지 걸리는 시간
  const landX = width * (0.15 + 0.7 * random());
  return { x, y, vx: (landX - x) / flight, vy };
}
