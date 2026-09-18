// ════════════════════════════════════════════════════════════
//  rules.js — 손 랜드마크(숫자)를 "의미"로 바꾸는 규칙
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꿔 보거나, 새로운 규칙을 만들어 보세요!
// ════════════════════════════════════════════════════════════

// Hand Landmarker가 알려 주는 21개 점 중에서 사용하는 번호
//    0: 손목
//    6: 검지 가운데 마디   8: 검지 끝
//   10: 중지 가운데 마디  12: 중지 끝
//   14: 약지 가운데 마디  16: 약지 끝
//   18: 소지 가운데 마디  20: 소지 끝
export const WRIST = 0;
export const FINGERS = [
  { name: "검지", pip: 6, tip: 8 },
  { name: "중지", pip: 10, tip: 12 },
  { name: "약지", pip: 14, tip: 16 },
  { name: "소지", pip: 18, tip: 20 },
];

// 👇 바꿔 볼 수 있는 숫자들
export const OPEN_RATIO = 1.1; // 손끝이 마디보다 손목에서 이 배수 이상 멀면 "펴짐"
export const HOLD_SECONDS = 1.5; // 같은 개수를 이만큼 유지하면 답으로 인정
export const GLITCH_SECONDS = 0.2; // 이보다 짧게 바뀐 개수는 떨림으로 보고 무시
export const RESTART_SECONDS = 2; // 마지막 화면에서 주먹을 이만큼 쥐면 다시 시작

/** 두 점 사이의 거리 (피타고라스 정리) */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 손가락이 펴졌나?
 * 손목→손끝 거리가 손목→가운데 마디 거리보다 충분히 멀면 펴진 것입니다.
 * ("손끝이 마디보다 위에 있나?"로 비교하면 손을 옆으로 눕히거나 거꾸로 들 때 틀려요.
 *  거리로 비교하면 손의 방향과 상관없이 동작합니다.)
 */
export function isFingerOpen(hand, finger) {
  const wrist = hand[WRIST];
  return distance(wrist, hand[finger.tip]) > distance(wrist, hand[finger.pip]) * OPEN_RATIO;
}

/** 펴진 손가락 개수 (엄지는 세지 않음, 0~4) */
export function countOpenFingers(hand) {
  return FINGERS.filter((finger) => isFingerOpen(hand, finger)).length;
}

/**
 * 같은 개수를 얼마나 오래 유지했는지 기록합니다.
 * hold = { count: 지금 개수, seconds: 유지한 시간(초), glitch: 다른 값이 나온 시간(초) }
 * dt   = 지난 프레임 이후 흐른 시간(초)
 */
export function updateHold(hold, count, dt) {
  if (count === hold.count) {
    return { count, seconds: hold.seconds + dt, glitch: 0 };
  }
  if (hold.glitch + dt < GLITCH_SECONDS) {
    return { ...hold, glitch: hold.glitch + dt }; // 아주 잠깐 바뀜 → 떨림으로 보고 무시
  }
  return { count, seconds: 0, glitch: 0 }; // 계속 바뀌어 있음 → 새 개수로 인정
}
