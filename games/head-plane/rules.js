// ════════════════════════════════════════════════════════════
//  rules.js — 고개 비행기의 규칙: 고개 기울기 → 비행기 위치
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꿔 보며 게임을 쉽게, 또는 어렵게 만들어 보세요!
// ════════════════════════════════════════════════════════════

// Face Landmarker 점 478개 중 두 눈의 바깥쪽 끝 번호
export const EYE_OUTER = [33, 263];

// 👇 바꿔 볼 수 있는 숫자들 (위치는 화면 가로·세로를 1로 본 비율이에요)
export const MAX_TILT = 22; // 고개를 이 각도(도)만큼 기울이면 비행기가 화면 끝까지 가요
export const DEAD_ZONE = 3; // 이보다 작은 기울기는 "똑바로"로 봐요
export const START_TILT = 12; // 시작 전에 좌우로 이만큼씩 기울여 보기
export const SMOOTHING = 0.25; // 0~1: 클수록 비행기가 빨리 따라와요
export const MAX_HITS = 3; // 이만큼 부딪히면 게임 끝
export const PLANE_Y = 0.8; // 비행기 높이
export const START_SPEED = 0.35; // 장애물이 내려오는 처음 속도 (화면 높이/초)
export const MAX_SPEED = 0.9;
export const SPEED_GAIN = 0.01; // 1초마다 빨라지는 정도
export const STAR_CHANCE = 0.45; // 별이 나올 확률 (나머지는 장애물)

/**
 * 고개 기울기(도): 화면에서 두 눈을 잇는 선이 얼마나 기울었나
 * 양수 = 화면 오른쪽으로 기울임, 음수 = 왼쪽으로 기울임
 * (화면이 거울처럼 보이므로, 내가 오른쪽 어깨로 기울이면 화면에서도 오른쪽이에요)
 */
export function tiltAngle(a, b) {
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  return (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI;
}

/** 기울기 → 비행기가 가야 할 가로 위치 (0 = 왼쪽 끝, 0.5 = 가운데, 1 = 오른쪽 끝) */
export function targetX(tilt) {
  if (Math.abs(tilt) < DEAD_ZONE) return 0.5;
  const k = (tilt - Math.sign(tilt) * DEAD_ZONE) / (MAX_TILT - DEAD_ZONE);
  return Math.min(1, Math.max(0, 0.5 + k / 2));
}

/** 시간이 지날수록 장애물이 빨리 내려와요 */
export function fallSpeed(elapsed) {
  return Math.min(MAX_SPEED, START_SPEED + elapsed * SPEED_GAIN);
}

export function spawnInterval(elapsed) {
  return Math.max(0.55, 1.3 - elapsed * 0.012);
}

/**
 * 새로 나올 물건: 별은 목 스트레칭이 되도록 화면 가장자리에 많이 나와요
 * → { kind: "star" | "bird" | "storm", x }
 */
export function spawnItem(random = Math.random) {
  if (random() < STAR_CHANCE) {
    const edge = random() < 0.5 ? 0.08 : 0.77;
    return { kind: "star", x: edge + 0.15 * random() };
  }
  return { kind: random() < 0.5 ? "bird" : "storm", x: 0.1 + 0.8 * random() };
}

/** 두 원이 겹치나? */
export function circlesTouch(a, ar, b, br) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= ar + br;
}
