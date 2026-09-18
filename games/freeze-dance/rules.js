// ════════════════════════════════════════════════════════════
//  rules.js — 얼음 땡의 규칙: "얼음!" 뒤에 몸이 움직였나?
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 MOVE_LIMIT을 바꾸면 심판이 엄격해지거나 너그러워져요!
//
//  AI가 찾은 점은 가만히 있어도 조금씩 떨려요. 그래서
//  ① 점을 부드럽게 만든 다음 ② "얼음!" 순간의 자세와 비교하고
//  ③ 키가 달라도 공평하도록 몸통 길이로 나눠요.
// ════════════════════════════════════════════════════════════

// Pose Landmarker 점 번호: 0 코 · 11~16 어깨·팔꿈치·손목 · 23~28 엉덩이·무릎·발목
export const KEY_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// 👇 바꿔 볼 수 있는 숫자들
export const MAX_PEOPLE = 5; // 한 번에 찾는 최대 인원
export const GRACE_SECONDS = 0.8; // "얼음!" 뒤 멈출 시간
export const JUDGE_SECONDS = 3; // 멈춰 있어야 하는 시간
export const MOVE_LIMIT = 0.3; // 가장 많이 움직인 점 3개의 평균이 몸통 길이의 이 배수보다 크면 "움직임"
export const SMOOTHING = 0.5; // 0~1: 작을수록 떨림이 줄지만 늦게 따라가요
export const MIN_VISIBILITY = 0.5;
export const MATCH_DISTANCE = 0.25; // 같은 사람으로 볼 최대 이동 거리 (화면 높이 비율)

/** 춤추는 시간: 언제 멈출지 모르게 5~11초 사이에서 골라요 */
export function danceSeconds(random = Math.random) {
  return 5 + 6 * random();
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/** 몸통 길이 (어깨 가운데 ~ 엉덩이 가운데, 화면 높이 비율) */
export function torsoLength(body, aspect) {
  return Math.max(0.05, dist(mid(body[11], body[12]), mid(body[23], body[24]), aspect));
}

/** 사람의 위치 = 어깨 가운데 */
export function center(body) {
  return mid(body[11], body[12]);
}

/** 떨림 줄이기: 이전 몸과 새 몸을 섞어요 */
export function smoothBody(prev, next, amount = SMOOTHING) {
  if (!prev) return next.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 1 }));
  return next.map((p, i) => ({
    x: prev[i].x + (p.x - prev[i].x) * amount,
    y: prev[i].y + (p.y - prev[i].y) * amount,
    visibility: p.visibility ?? 1,
  }));
}

/**
 * 움직임 점수: 기준 자세(ref)에서 지금 자세(now)까지
 * 가장 많이 움직인 점 3개의 이동 거리 평균 ÷ 몸통 길이
 */
export function moveScore(ref, now, aspect) {
  const moves = KEY_POINTS.filter(
    (i) => (ref[i].visibility ?? 1) >= MIN_VISIBILITY && (now[i].visibility ?? 1) >= MIN_VISIBILITY,
  ).map((i) => dist(ref[i], now[i], aspect));
  if (!moves.length) return 0;
  const top = moves.sort((a, b) => b - a).slice(0, 3);
  return top.reduce((a, b) => a + b, 0) / top.length / torsoLength(ref, aspect);
}

export function isMoved(ref, now, aspect) {
  return moveScore(ref, now, aspect) > MOVE_LIMIT;
}

/**
 * 이번 프레임의 사람들을 지난 프레임의 사람(track)과 짝지어요 (가까운 짝부터)
 * → centers마다 짝지은 track 번호, 짝이 없으면 -1
 */
export function matchPeople(trackCenters, centers, aspect, maxDistance = MATCH_DISTANCE) {
  const pairs = [];
  centers.forEach((c, ci) => trackCenters.forEach((t, ti) => pairs.push({ ci, ti, d: dist(c, t, aspect) })));
  pairs.sort((a, b) => a.d - b.d);
  const result = centers.map(() => -1);
  const usedTracks = new Set();
  for (const { ci, ti, d } of pairs) {
    if (d > maxDistance || result[ci] !== -1 || usedTracks.has(ti)) continue;
    result[ci] = ti;
    usedTracks.add(ti);
  }
  return result;
}
