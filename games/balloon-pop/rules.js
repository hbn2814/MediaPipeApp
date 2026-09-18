// ════════════════════════════════════════════════════════════
//  rules.js — 풍선 팡팡의 규칙: 어느 몸 부위로 어떤 풍선을 터뜨릴 수 있나
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 새 풍선 종류를 TYPES에 추가하거나 숫자를 바꿔 보세요!
// ════════════════════════════════════════════════════════════

// Pose Landmarker 점 번호: 0 코 · 15·16 손목 · 19·20 검지 · 27·28 발목 · 31·32 발끝
export const PARTS = {
  hand: [15, 16, 19, 20],
  head: [0],
  foot: [27, 28, 31, 32],
};

// 👇 바꿔 볼 수 있는 숫자들 (위치와 크기는 화면 높이를 1로 본 비율이에요)
export const GAME_SECONDS = 60;
export const BALLOON_SIZE = 0.075; // 풍선 반지름
export const TOUCH_MARGIN = 0.025; // 몸 점이 풍선에서 이만큼 떨어져 있어도 터진 걸로 봐줘요
export const LIFE_SECONDS = 3.5; // 풍선이 기다려 주는 시간
export const MAX_BALLOONS = 5; // 화면에 동시에 떠 있는 최대 개수
export const MIN_VISIBILITY = 0.5;

export const TYPES = {
  any: { name: "일반 풍선", color: "#ff4f7b", icon: "", by: ["hand", "head", "foot"], points: 1 },
  head: { name: "머리 풍선", color: "#ffd23f", icon: "🙆", by: ["head"], points: 3 },
  foot: { name: "발 풍선", color: "#3ddc97", icon: "🦶", by: ["foot"], points: 3 },
  bomb: { name: "폭탄", color: "#333a4d", icon: "💣", by: ["hand", "head", "foot"], points: -3 },
};

/** 이 몸 부위로 이 풍선을 터뜨릴 수 있나? */
export function canPop(type, part) {
  return TYPES[type].by.includes(part);
}

/** 몸 점(화면 비율 좌표)이 풍선에 닿았나? aspect = 가로 ÷ 세로 */
export function touching(point, balloon, aspect) {
  const dx = (point.x - balloon.x) * aspect;
  const dy = point.y - balloon.y;
  return Math.hypot(dx, dy) <= BALLOON_SIZE + TOUCH_MARGIN;
}

/** 어떤 풍선을 띄울까? 앉아서 하기에는 발 풍선이 없어요 */
export function pickType(seated, elapsed, random = Math.random) {
  const r = random();
  const bomb = 0.1 + Math.min(0.1, elapsed * 0.002);
  if (r < bomb) return "bomb";
  if (r < bomb + 0.18) return "head";
  if (!seated && r < bomb + 0.36) return "foot";
  return "any";
}

/**
 * 풍선이 나타날 위치 (화면 비율). 부위에 맞는 높이에 나와요.
 * 머리 풍선은 위쪽, 발 풍선은 아래쪽, 나머지는 팔이 닿는 곳
 */
export function spawnPosition(type, seated, random = Math.random) {
  if (type === "head") return { x: 0.3 + 0.4 * random(), y: 0.12 + 0.18 * random() };
  if (type === "foot") return { x: 0.2 + 0.6 * random(), y: 0.78 + 0.12 * random() };
  const top = seated ? 0.3 : 0.2;
  const bottom = seated ? 0.8 : 0.7;
  return { x: 0.1 + 0.8 * random(), y: top + (bottom - top) * random() };
}

/** 시간이 지날수록 풍선이 자주 나와요 */
export function spawnInterval(elapsed) {
  return Math.max(0.5, 1.1 - elapsed * 0.01);
}
