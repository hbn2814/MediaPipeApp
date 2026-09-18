// 규칙(rules.js)이 생각한 대로 동작하는지 확인하는 테스트
// 실행: npm test   (카메라 없이, 가짜 좌표로 검사합니다)
import test from "node:test";
import assert from "node:assert/strict";
import * as quiz from "../finger-quiz/rules.js";
import * as squat from "../squat-counter/rules.js";
import * as focus from "../focus-timer/rules.js";

// ───────── 손가락 퀴즈 ─────────
// 손목(0,0)에서 위쪽(-y)으로 뻗은 가짜 손. open[i]가 false면 그 손가락 끝을 손바닥 쪽으로 접음
function fakeHand(open, rotation = 0) {
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  quiz.FINGERS.forEach((finger, i) => {
    const x = (i - 1.5) * 0.25;
    hand[finger.pip] = { x, y: -1.5, z: 0 };
    hand[finger.tip] = open[i] ? { x, y: -2.1, z: 0 } : { x, y: -1.0, z: 0 };
  });
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return hand.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: 0 }));
}

test("펴진 손가락 개수를 센다", () => {
  assert.equal(quiz.countOpenFingers(fakeHand([true, false, false, false])), 1);
  assert.equal(quiz.countOpenFingers(fakeHand([true, true, false, false])), 2);
  assert.equal(quiz.countOpenFingers(fakeHand([true, true, true, true])), 4);
  assert.equal(quiz.countOpenFingers(fakeHand([false, false, false, false])), 0);
});

test("손을 눕히거나 거꾸로 들어도 개수가 같다", () => {
  for (const rotation of [Math.PI / 2, Math.PI, -Math.PI / 3]) {
    assert.equal(quiz.countOpenFingers(fakeHand([true, true, true, false], rotation)), 3);
  }
});

test("같은 개수를 유지한 시간을 재고, 짧은 떨림은 무시한다", () => {
  let hold = { count: -1, seconds: 0, glitch: 0 };
  const step = (count, seconds, dt = 0.05) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) hold = quiz.updateHold(hold, count, dt);
  };
  step(2, 1.0);
  assert.equal(hold.count, 2);
  assert.ok(Math.abs(hold.seconds - 0.8) < 1e-6, `seconds=${hold.seconds}`); // 처음 0.2초는 새 값 확인 시간
  step(3, 0.1); // 0.1초 동안만 3개 → 떨림
  assert.equal(hold.count, 2);
  step(2, 0.5);
  assert.ok(hold.seconds >= quiz.HOLD_SECONDS - 0.2, `seconds=${hold.seconds}`);
  step(3, 0.5); // 0.5초 동안 3개 → 새 개수로 인정
  assert.equal(hold.count, 3);
});

// ───────── 스쿼트 카운터 ─────────
const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≠ ${expected}`);

test("세 점 사이의 각도를 구한다", () => {
  near(squat.angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90);
  near(squat.angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: -1 }), 180);
  near(squat.angleAt({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 45);
  assert.ok(Number.isNaN(squat.angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })));
});

const ASPECT = 16 / 9; // 1280×720 영상

// 옆모습 가짜 자세: bend=0 이면 다리가 곧음(180°), bend=90 이면 무릎이 직각 (실제 픽셀 비율 기준)
function fakePose({ leftVisible = true, rightVisible = true, bend = 0 } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const rad = (bend * Math.PI) / 180;
  for (const [leg, visible] of [
    [squat.LEGS[0], leftVisible],
    [squat.LEGS[1], rightVisible],
  ]) {
    const [hip, knee, ankle] = leg;
    landmarks[knee] = { x: 0.5, y: 0.6, z: 0 };
    landmarks[ankle] = { x: 0.5, y: 0.85, z: 0 }; // 무릎 바로 아래 발목
    // 허벅지가 뒤로 기울어짐. x는 화면 비율만큼 줄여야 실제 길이가 같아져요
    landmarks[hip] = { x: 0.5 - (0.25 * Math.sin(rad)) / ASPECT, y: 0.6 - 0.25 * Math.cos(rad), z: 0 };
    for (const i of leg) landmarks[i].visibility = visible ? 0.99 : 0.1;
  }
  return landmarks;
}

test("보이는 다리로 무릎 각도를 구한다", () => {
  near(squat.kneeAngle(fakePose(), ASPECT), 180, 1e-4);
  near(squat.kneeAngle(fakePose({ bend: 90, rightVisible: false }), ASPECT), 90, 1e-4);
  assert.ok(Number.isNaN(squat.kneeAngle(fakePose({ leftVisible: false, rightVisible: false }), ASPECT)));
});

test("가로세로 비율을 맞추지 않으면 각도가 틀린다", () => {
  const bent = fakePose({ bend: 60 });
  near(squat.kneeAngle(bent, ASPECT), 120, 1e-4);
  assert.ok(Math.abs(squat.kneeAngle(bent, 1) - 120) > 10); // 비율을 무시하면 10° 넘게 어긋남
});

test("각도가 기준선 근처에서 떨려도 스쿼트 3번은 3개로 센다", () => {
  const oneRep = [175, 150, 125, 112, 108, 111, 107, 95, 90, 100, 120, 145, 158, 161, 159, 162, 176];
  let state = "UP";
  let count = 0;
  let angle = NaN;
  for (const raw of [...oneRep, ...oneRep, ...oneRep]) {
    angle = squat.smooth(angle, raw, 1); // 부드럽게 하기 없이도
    const next = squat.nextState(state, angle);
    if (state === "DOWN" && next === "UP") count += 1;
    state = next;
  }
  assert.equal(count, 3);
});

test("부드럽게 하기는 이전 값과 새 값의 중간값을 준다", () => {
  assert.equal(squat.smooth(NaN, 120), 120);
  assert.equal(squat.smooth(100, 200, 0.5), 150);
  assert.ok(Number.isNaN(squat.smooth(100, NaN)));
});

// ───────── 집중 타이머 ─────────
function fakeFace({ noseX = 0.5, noseY = 0.47, eyes = 0.05 } = {}) {
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  face[focus.FACE.FACE_LEFT] = { x: 0.3, y: 0.5, z: 0 };
  face[focus.FACE.FACE_RIGHT] = { x: 0.7, y: 0.5, z: 0 };
  face[focus.FACE.FOREHEAD] = { x: 0.5, y: 0.2, z: 0 };
  face[focus.FACE.CHIN] = { x: 0.5, y: 0.8, z: 0 };
  face[focus.FACE.NOSE_TIP] = { x: 0.3 + 0.4 * noseX, y: 0.2 + 0.6 * noseY, z: 0 };
  const blendshapes = [
    { categoryName: "eyeBlinkLeft", score: eyes },
    { categoryName: "eyeBlinkRight", score: eyes },
  ];
  return focus.readFace(face, blendshapes);
}

test("얼굴에서 고개 방향과 눈 감음 점수를 읽는다", () => {
  const info = fakeFace({ noseX: 0.8, noseY: 0.7, eyes: 0.9 });
  near(info.turn, 0.8);
  near(info.tilt, 0.7);
  near(info.eyesClosed, 0.9);
});

test("프레임 하나의 모습을 분류한다", () => {
  assert.equal(focus.classify(null), "NO_FACE");
  assert.equal(focus.classify(fakeFace()), "OK");
  assert.equal(focus.classify(fakeFace({ noseX: 0.9 })), "TURNED");
  assert.equal(focus.classify(fakeFace({ eyes: 0.8 })), "EYES_CLOSED");
  assert.equal(focus.classify(fakeFace({ eyes: 0.8, noseY: 0.75 })), "OK"); // 고개 숙여 필기 중
});

test("몇 초 이상 계속될 때만 상태가 바뀌고, 집중 시간은 집중 중에만 쌓인다", () => {
  let tracker = focus.newTracker();
  const run = (sign, seconds, dt = 0.1) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) tracker = focus.updateTracker(tracker, sign, dt);
  };
  run("OK", 5);
  assert.equal(tracker.status, "FOCUS");
  run("EYES_CLOSED", 0.3); // 눈 깜빡임
  assert.equal(tracker.status, "FOCUS");
  run("NO_FACE", focus.AWAY_SECONDS - 0.5);
  assert.equal(tracker.status, "FOCUS");
  run("NO_FACE", 1);
  assert.equal(tracker.status, "AWAY");
  const focusBefore = tracker.focusSeconds;
  run("NO_FACE", 10);
  near(tracker.focusSeconds, focusBefore);
  run("OK", 1);
  assert.equal(tracker.status, "FOCUS");
  run("EYES_CLOSED", focus.DROWSY_SECONDS + 0.5);
  assert.equal(tracker.status, "DROWSY");
  assert.equal(tracker.counts.AWAY, 1);
  assert.equal(tracker.counts.DROWSY, 1);
  near(tracker.totalSeconds, 5 + 0.3 + (focus.AWAY_SECONDS - 0.5) + 1 + 10 + 1 + focus.DROWSY_SECONDS + 0.5, 1e-6);
});
