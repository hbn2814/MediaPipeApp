// ════════════════════════════════════════════════════════════
//  rules.js — 벽 통과 챌린지의 규칙: "내 자세가 구멍 모양과 같나?"
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꾸거나, 새 자세를 POSES에 추가해 보세요!
//
//  키나 서 있는 위치가 달라도 공평하도록, 몸의 "크기"가 아니라
//  팔다리가 "어느 방향을 가리키는지(각도)"만 비교해요.
// ════════════════════════════════════════════════════════════

// 👇 바꿔 볼 수 있는 숫자들
export const ANGLE_TOLERANCE = 35; // 팔다리 방향이 이 각도(도) 안으로 비슷하면 "맞음"
export const MIN_VISIBILITY = 0.5; // AI가 이 점수 이상으로 "보인다"고 한 점만 믿어요
export const START_HOLD = 1.0; // 시작 자세(만세)를 이만큼(초) 유지하면 시작
export const PASS_WINDOW = 0.35; // 벽이 닿기 직전 이 시간(초) 안에 맞으면 통과
export const MAX_MISSES = 3; // 이만큼 부딪히면 게임 끝

/** 벽이 다가오는 시간(초): 통과할수록 빨라져요 */
export function wallSeconds(level) {
  return Math.max(2.4, 5 - level * 0.2);
}

// Pose Landmarker가 알려 주는 33개 점 중에서 사용하는 번호 (왼쪽·오른쪽은 "사람 기준")
//   11·12 어깨, 13·14 팔꿈치, 15·16 손목, 23·24 엉덩이, 25·26 무릎, 27·28 발목
// 화면은 거울처럼 보여 주므로 사람의 왼쪽이 화면에서도 왼쪽에 보여요.
export const LIMBS = [
  { key: "lUpper", name: "왼쪽 위팔", from: 11, to: 13, arm: true },
  { key: "lFore", name: "왼쪽 아래팔", from: 13, to: 15, arm: true },
  { key: "rUpper", name: "오른쪽 위팔", from: 12, to: 14, arm: true },
  { key: "rFore", name: "오른쪽 아래팔", from: 14, to: 16, arm: true },
  { key: "lThigh", name: "왼쪽 허벅지", from: 23, to: 25, arm: false },
  { key: "lShin", name: "왼쪽 종아리", from: 25, to: 27, arm: false },
  { key: "rThigh", name: "오른쪽 허벅지", from: 24, to: 26, arm: false },
  { key: "rShin", name: "오른쪽 종아리", from: 26, to: 28, arm: false },
];

// 방향(도): 0 = 화면 오른쪽 →, 90 = 아래 ↓, -90 = 위 ↑, 180 = 왼쪽 ←
const LEGS_DOWN = { lThigh: 92, lShin: 90, rThigh: 88, rShin: 90 };

export const POSES = [
  { id: "hooray", name: "만세", emoji: "🙌", angles: { lUpper: -120, lFore: -115, rUpper: -60, rFore: -65, ...LEGS_DOWN } },
  { id: "tee", name: "T자 비행기", emoji: "✈️", angles: { lUpper: 180, lFore: 180, rUpper: 0, rFore: 0, ...LEGS_DOWN } },
  { id: "leftUp", name: "왼팔 번쩍", emoji: "🙋", angles: { lUpper: -90, lFore: -90, rUpper: 80, rFore: 88, ...LEGS_DOWN } },
  { id: "rightUp", name: "오른팔 번쩍", emoji: "🙋", angles: { lUpper: 100, lFore: 92, rUpper: -90, rFore: -90, ...LEGS_DOWN } },
  { id: "muscle", name: "근육맨", emoji: "💪", angles: { lUpper: 180, lFore: -90, rUpper: 0, rFore: -90, ...LEGS_DOWN } },
  { id: "slash", name: "대각선", emoji: "↗️", angles: { lUpper: 135, lFore: 135, rUpper: -45, rFore: -45, ...LEGS_DOWN } },
  { id: "heart", name: "머리 위 하트", emoji: "🫶", angles: { lUpper: -125, lFore: -40, rUpper: -55, rFore: -140, ...LEGS_DOWN } },
  { id: "star", name: "큰 별", emoji: "⭐", standingOnly: true, angles: { lUpper: -140, lFore: -140, rUpper: -40, rFore: -40, lThigh: 115, lShin: 115, rThigh: 65, rShin: 65 } },
  { id: "kick", name: "옆으로 다리 들기", emoji: "🦩", standingOnly: true, angles: { lUpper: 180, lFore: 180, rUpper: 0, rFore: 0, lThigh: 135, lShin: 135, rThigh: 90, rShin: 90 } },
];

/** 모드에 맞는 자세 목록 (앉아서 하면 다리 자세는 빼요) */
export function posesFor(seated) {
  return POSES.filter((pose) => !(seated && pose.standingOnly));
}

/** 두 점 a→b가 가리키는 화면 방향(도). aspect = 화면 가로 ÷ 세로 */
export function limbAngle(a, b, aspect) {
  const dx = -(b.x - a.x) * aspect; // 거울처럼 좌우를 뒤집고, 가로세로 비율을 맞춰요
  const dy = b.y - a.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** 두 방향의 차이(0~180도) */
export function angleDiff(a, b) {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/**
 * 내 자세가 구멍 모양과 얼마나 맞나?
 * landmarks = 몸의 점 33개, pose = POSES 중 하나, seated = 앉아서 모드
 * → { limbs: [{ key, visible, ok }], matched, needed, pass }
 */
export function matchPose(landmarks, pose, { aspect, seated }) {
  const limbs = LIMBS.filter((limb) => !seated || limb.arm).map((limb) => {
    const a = landmarks[limb.from];
    const b = landmarks[limb.to];
    const visible = (a.visibility ?? 1) >= MIN_VISIBILITY && (b.visibility ?? 1) >= MIN_VISIBILITY;
    const ok = visible && angleDiff(limbAngle(a, b, aspect), pose.angles[limb.key]) <= ANGLE_TOLERANCE;
    return { key: limb.key, visible, ok };
  });
  const matched = limbs.filter((l) => l.ok).length;
  const allowedMisses = seated ? 0 : 1; // 서서 할 때는 8개 중 1개는 틀려도 봐줘요
  return { limbs, matched, needed: limbs.length, pass: matched >= limbs.length - allowedMisses };
}

/** 다음 자세 고르기 (방금 나온 자세는 빼고) */
export function nextPose(seated, previousId, random = Math.random) {
  const options = posesFor(seated).filter((pose) => pose.id !== previousId);
  return options[Math.floor(random() * options.length)];
}
