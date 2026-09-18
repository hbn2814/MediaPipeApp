// ════════════════════════════════════════════════════════════
//  rules.js — 표정 챌린지의 규칙: 표정 점수 52개 → "이 표정을 지었나?"
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 기준값(threshold)을 바꾸거나, 새 표정을 EXPRESSIONS에 추가해 보세요!
//
//  Face Landmarker는 표정마다 0(안 함) ~ 1(아주 크게 함) 점수를 줘요.
//  예) jawOpen = 입 벌림, mouthSmileLeft = 왼쪽 입꼬리 올림, eyeBlinkLeft = 왼눈 감음
// ════════════════════════════════════════════════════════════

// 👇 바꿔 볼 수 있는 숫자들
export const HOLD_SECONDS = 0.35; // 표정을 이만큼(초) 유지해야 성공
export const START_LIMIT = 4; // 첫 문제의 제한 시간(초)
export const MIN_LIMIT = 1.8; // 가장 짧은 제한 시간(초)
export const LIMIT_STEP = 0.15; // 성공할 때마다 줄어드는 시간(초)
export const MAX_MISSES = 3; // 이만큼 놓치면 게임 끝
export const START_SMILE = 0.8; // 활짝 웃음을 이만큼(초) 유지하면 시작

const get = (scores, name) => scores[name] ?? 0;
const avg = (scores, a, b) => (get(scores, a) + get(scores, b)) / 2;

export const EXPRESSIONS = [
  { id: "smile", emoji: "😁", name: "활짝 웃기", hint: "입꼬리를 귀까지 올려요", threshold: 0.6, value: (s) => avg(s, "mouthSmileLeft", "mouthSmileRight") },
  { id: "jaw", emoji: "😮", name: "입 크게 벌리기", hint: "아~ 하고 크게 벌려요", threshold: 0.5, value: (s) => get(s, "jawOpen") },
  { id: "wink", emoji: "😉", name: "윙크", hint: "한쪽 눈만 감아요", threshold: 0.45, value: (s) => Math.abs(get(s, "eyeBlinkLeft") - get(s, "eyeBlinkRight")) },
  { id: "pucker", emoji: "😗", name: "뽀뽀 입", hint: "입술을 쭉 내밀어요", threshold: 0.6, value: (s) => get(s, "mouthPucker") },
  { id: "brow", emoji: "😲", name: "눈썹 올리기", hint: "깜짝 놀란 듯 눈썹을 올려요", threshold: 0.45, value: (s) => (get(s, "browInnerUp") + avg(s, "browOuterUpLeft", "browOuterUpRight")) / 2 },
  { id: "frown", emoji: "😠", name: "찡그리기", hint: "미간에 힘을 줘요", threshold: 0.45, value: (s) => avg(s, "browDownLeft", "browDownRight") },
  { id: "side", emoji: "😏", name: "입 삐죽", hint: "입을 한쪽으로 옮겨요", threshold: 0.45, value: (s) => Math.max(get(s, "mouthLeft"), get(s, "mouthRight")) },
];

/** MediaPipe가 준 [{ categoryName, score }] 목록 → { 이름: 점수 } */
export function toScores(categories = []) {
  return Object.fromEntries(categories.map((c) => [c.categoryName, c.score]));
}

/** 이 표정을 얼마나 했나: 0 ~ 1 (1이면 기준을 넘음) */
export function progress(expression, scores) {
  return Math.max(0, Math.min(1, expression.value(scores) / expression.threshold));
}

export function isDoing(expression, scores) {
  return expression.value(scores) >= expression.threshold;
}

/** 성공할수록 제한 시간이 짧아져요 */
export function timeLimit(level) {
  return Math.max(MIN_LIMIT, START_LIMIT - level * LIMIT_STEP);
}

/** 다음 표정 고르기 (방금 나온 표정은 빼고) */
export function nextExpression(previousId, random = Math.random) {
  const options = EXPRESSIONS.filter((e) => e.id !== previousId);
  return options[Math.floor(random() * options.length)];
}
