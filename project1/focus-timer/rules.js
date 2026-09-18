// ════════════════════════════════════════════════════════════
//  rules.js — 얼굴 랜드마크·표정 점수 → "집중 / 자리 비움 / 딴 곳 / 졸음"
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 아래 숫자를 바꿔 보거나, 새로운 규칙을 만들어 보세요!
// ════════════════════════════════════════════════════════════

// Face Landmarker가 알려 주는 478개 점 중에서 사용하는 번호
export const FACE = {
  NOSE_TIP: 1, // 코끝
  FOREHEAD: 10, // 이마 위쪽 가운데
  CHIN: 152, // 턱 끝
  FACE_LEFT: 234, // 얼굴 가장자리 (사진의 왼쪽)
  FACE_RIGHT: 454, // 얼굴 가장자리 (사진의 오른쪽)
};

// 👇 바꿔 볼 수 있는 숫자들
export const EYES_CLOSED_SCORE = 0.5; // 눈 감음 점수(0~1)가 이보다 크면 "눈 감음"
export const TURN_LIMIT = 0.25; // 코가 얼굴 가운데(0.5)에서 이만큼 벗어나면 "고개 돌림"
export const HEAD_DOWN_RATIO = 0.65; // 코 높이 비율이 이보다 크면 "고개 숙임"(필기 중으로 봄). 정면은 약 0.5
export const AWAY_SECONDS = 3; // 얼굴이 이만큼 계속 안 보이면 "자리 비움"
export const TURN_SECONDS = 3; // 고개를 이만큼 계속 돌리고 있으면 "딴 곳 보는 중"
export const DROWSY_SECONDS = 2; // 눈을 이만큼 계속 감고 있으면 "졸음"

/** 얼굴 점 478개와 표정 점수 52개에서, 규칙에 필요한 숫자 3개만 뽑기 */
export function readFace(face, blendshapes) {
  const nose = face[FACE.NOSE_TIP];
  const left = face[FACE.FACE_LEFT];
  const right = face[FACE.FACE_RIGHT];
  const top = face[FACE.FOREHEAD];
  const chin = face[FACE.CHIN];
  const score = (name) => blendshapes.find((shape) => shape.categoryName === name)?.score ?? 0;
  return {
    // 고개 좌우: 코가 얼굴 폭의 어디쯤 있나? (0.5 = 정면)
    turn: (nose.x - left.x) / (right.x - left.x),
    // 고개 위아래: 코가 이마~턱 사이의 어디쯤 있나? (고개를 숙이면 커짐)
    tilt: (nose.y - top.y) / (chin.y - top.y),
    // 눈 감음: 왼눈·오른눈 "깜빡임" 점수의 평균 (0 = 뜸, 1 = 감음)
    eyesClosed: (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2,
  };
}

/** 이번 프레임의 모습을 한 단어로: "NO_FACE" | "TURNED" | "EYES_CLOSED" | "OK" */
export function classify(info) {
  if (!info) return "NO_FACE";
  if (Math.abs(info.turn - 0.5) > TURN_LIMIT) return "TURNED";
  const headDown = info.tilt > HEAD_DOWN_RATIO;
  // 고개를 숙이고 필기할 때는 눈이 감긴 것처럼 보여서, 이때는 졸음으로 보지 않아요
  if (info.eyesClosed > EYES_CLOSED_SCORE && !headDown) return "EYES_CLOSED";
  return "OK";
}

/** 빈 기록 만들기 */
export function newTracker() {
  return { status: "FOCUS", sign: "OK", signSeconds: 0, focusSeconds: 0, totalSeconds: 0, counts: {} };
}

/**
 * 시간을 고려해 상태를 정합니다.
 * 눈 깜빡임이나 잠깐 고개 돌리기는 무시하고, "몇 초 이상 계속될 때만" 상태를 바꿔요.
 * sign = 이번 프레임의 모습(classify 결과), dt = 지난 프레임 이후 흐른 시간(초)
 */
export function updateTracker(tracker, sign, dt) {
  const signSeconds = sign === tracker.sign ? tracker.signSeconds + dt : 0;

  let status = tracker.status;
  if (sign === "OK") status = "FOCUS";
  else if (sign === "NO_FACE" && signSeconds >= AWAY_SECONDS) status = "AWAY";
  else if (sign === "TURNED" && signSeconds >= TURN_SECONDS) status = "DISTRACTED";
  else if (sign === "EYES_CLOSED" && signSeconds >= DROWSY_SECONDS) status = "DROWSY";

  const counts = { ...tracker.counts };
  if (status !== tracker.status) counts[status] = (counts[status] ?? 0) + 1; // 상태별로 몇 번 바뀌었나

  return {
    status,
    sign,
    signSeconds,
    focusSeconds: tracker.focusSeconds + (status === "FOCUS" ? dt : 0),
    totalSeconds: tracker.totalSeconds + dt,
    counts,
  };
}
