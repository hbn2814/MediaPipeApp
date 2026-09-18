// ════════════════════════════════════════════════════════════
//  rules.js — 몸 랜드마크(숫자) → 무릎 각도 → "앉음/서 있음" → 개수
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꿔 보거나, 다른 운동 규칙을 만들어 보세요!
// ════════════════════════════════════════════════════════════

// Pose Landmarker가 알려 주는 33개 점 중에서 사용하는 번호
export const POSE = {
  LEFT_HIP: 23, RIGHT_HIP: 24, // 엉덩이
  LEFT_KNEE: 25, RIGHT_KNEE: 26, // 무릎
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28, // 발목
};
export const LEGS = [
  [POSE.LEFT_HIP, POSE.LEFT_KNEE, POSE.LEFT_ANKLE],
  [POSE.RIGHT_HIP, POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE],
];

// 👇 바꿔 볼 수 있는 숫자들
export const DOWN_ANGLE = 110; // 무릎 각도가 이보다 작아지면 "앉음"
export const UP_ANGLE = 160; // 무릎 각도가 이보다 커지면 "서 있음" → 1개 완료
export const MIN_VISIBILITY = 0.5; // 보이는 정도(0~1)가 이보다 낮은 점은 계산에서 빼기
export const SMOOTHING = 0.5; // 0에 가까울수록 부드럽지만 느리게, 1이면 그대로

/**
 * 세 점 A-B-C에서 가운데 점 B의 각도 (0°~180°)
 * 벡터 BA와 BC의 내적 공식: cos θ = (BA·BC) / (|BA| × |BC|)
 */
export function angleAt(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const lengths = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
  if (lengths === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / lengths)); // 계산 오차로 ±1을 살짝 넘는 것 막기
  return (Math.acos(cos) * 180) / Math.PI; // 라디안 → 도
}

/** 다리 하나(엉덩이·무릎·발목)가 화면에 잘 보이나? */
export function isLegVisible(landmarks, leg) {
  return leg.every((i) => landmarks[i].visibility >= MIN_VISIBILITY);
}

/**
 * 무릎 각도: 잘 보이는 다리의 엉덩이-무릎-발목 각도 (두 다리가 다 보이면 평균)
 * landmarks  화면 좌표(0~1) 33개 점
 * aspect     영상의 가로÷세로 비율. x의 0~1이 y의 0~1보다 실제로 더 길어서, x에 곱해 맞춰요.
 * 카메라는 몸을 평면(2D)으로 보기 때문에, 옆모습일 때 무릎이 접히는 각도가 가장 잘 보여요.
 */
export function kneeAngle(landmarks, aspect = 1) {
  const point = (i) => ({ x: landmarks[i].x * aspect, y: landmarks[i].y });
  const angles = LEGS.filter((leg) => isLegVisible(landmarks, leg)).map(([hip, knee, ankle]) =>
    angleAt(point(hip), point(knee), point(ankle)),
  );
  if (angles.length === 0) return NaN; // 다리가 안 보임
  return angles.reduce((sum, angle) => sum + angle, 0) / angles.length;
}

/** 값이 들쭉날쭉하지 않게: 이전 값과 새 값을 섞기 (지수 이동 평균) */
export function smooth(previous, next, amount = SMOOTHING) {
  if (Number.isNaN(previous) || Number.isNaN(next)) return next;
  return previous + (next - previous) * amount;
}

/**
 * 상태 기계: 지금 상태 + 무릎 각도 → 다음 상태
 *   "UP"(서 있음)  --각도 < DOWN_ANGLE-->  "DOWN"(앉음)
 *   "DOWN"(앉음)   --각도 > UP_ANGLE-->    "UP"(서 있음)   ← 이 순간 1개!
 * 기준선이 두 개라서, 각도가 경계에서 떨려도 여러 번 세지 않아요.
 */
export function nextState(state, angle) {
  if (state === "UP" && angle < DOWN_ANGLE) return "DOWN";
  if (state === "DOWN" && angle > UP_ANGLE) return "UP";
  return state;
}
