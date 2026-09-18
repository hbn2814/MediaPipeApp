// 게임 규칙(rules.js)이 생각한 대로 동작하는지 확인하는 테스트
// 실행: games 폴더에서 npm test   (카메라 없이, 가짜 좌표로 검사합니다)
import test from "node:test";
import assert from "node:assert/strict";
import * as fruit from "../fruit-ninja/rules.js";
import * as wall from "../hole-wall/rules.js";
import * as pong from "../hand-pong/rules.js";
import * as face from "../face-challenge/rules.js";
import * as rps from "../reverse-rps/rules.js";

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≠ ${expected}`);
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// ───────── 과일 닌자 ─────────
test("칼자국이 과일을 지나가면 벤 것으로 본다", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  assert.ok(fruit.segmentHitsCircle(a, b, { x: 5, y: 2 }, 3)); // 가운데를 스침
  assert.ok(!fruit.segmentHitsCircle(a, b, { x: 5, y: 4 }, 3)); // 너무 멂
  assert.ok(!fruit.segmentHitsCircle(a, b, { x: 15, y: 0 }, 3)); // 선분 끝을 넘어감
  assert.ok(fruit.segmentHitsCircle(a, a, { x: 1, y: 1 }, 2)); // 길이 0인 칼자국
});

test("천천히 움직이면 베지 못하고, 빠르게 휘둘러야 벤다", () => {
  const h = 720;
  assert.ok(!fruit.isSlicing({ x: 0, y: 0 }, { x: 10, y: 0 }, 1 / 30, h)); // 1초에 화면의 0.4배
  assert.ok(fruit.isSlicing({ x: 0, y: 0 }, { x: 40, y: 0 }, 1 / 30, h)); // 1초에 화면의 1.7배
  assert.equal(fruit.tipSpeed({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, h), 0);
});

test("콤보 보너스는 연속 개수보다 1 적다", () => {
  assert.equal(fruit.comboBonus(1), 0);
  assert.equal(fruit.comboBonus(3), 2);
});

test("과일은 화면 안까지 올라왔다가 화면 안으로 떨어진다", () => {
  const W = 1280;
  const H = 720;
  const g = fruit.GRAVITY * H;
  for (const r of [0, 0.5, 0.999]) {
    const o = fruit.launch(W, H, () => r);
    const peakY = o.y - (o.vy * o.vy) / (2 * g);
    assert.ok(peakY >= H * 0.12 - 1e-6 && peakY <= H * 0.45 + 1e-6, `peak=${peakY}`);
    const landX = o.x + o.vx * ((2 * -o.vy) / g);
    assert.ok(landX >= 0 && landX <= W, `land=${landX}`);
  }
});

// ───────── 벽 통과 챌린지 ─────────
// 자세(각도)대로 가짜 몸 점 33개를 만들어요. 화면은 거울이라 x를 거꾸로 계산해요.
function fakeBody(angles, aspect, visibility = 1) {
  const body = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  const place = (i, x, y) => (body[i] = { x, y, z: 0, visibility });
  const extend = (from, to, deg, len) => {
    const rad = (deg * Math.PI) / 180;
    place(to, body[from].x - (Math.cos(rad) * len) / aspect, body[from].y + Math.sin(rad) * len);
  };
  place(11, 0.55, 0.3); // 사람의 왼쪽 어깨는 원래 영상에서 오른쪽에 있어요
  place(12, 0.45, 0.3);
  place(23, 0.53, 0.55);
  place(24, 0.47, 0.55);
  for (const limb of wall.LIMBS) extend(limb.from, limb.to, angles[limb.key], 0.12);
  return body;
}

test("자세와 똑같으면 통과, 한 팔을 반대로 들면 실패", () => {
  const aspect = 16 / 9;
  const tee = wall.POSES.find((p) => p.id === "tee");
  const ok = wall.matchPose(fakeBody(tee.angles, aspect), tee, { aspect, seated: false });
  assert.equal(ok.matched, 8);
  assert.ok(ok.pass);
  const wrong = { ...tee.angles, lUpper: 90, lFore: 90, rUpper: 90, rFore: 90 }; // 두 팔을 내림
  assert.ok(!wall.matchPose(fakeBody(wrong, aspect), tee, { aspect, seated: false }).pass);
});

test("화면 방향과 각도: 사람이 왼팔을 들면 화면 왼쪽 위(-90도 근처)를 가리킨다", () => {
  const aspect = 16 / 9;
  const leftUp = wall.POSES.find((p) => p.id === "leftUp");
  const body = fakeBody(leftUp.angles, aspect);
  near(wall.limbAngle(body[11], body[13], aspect), -90);
  assert.ok(body[13].y < body[11].y); // 팔꿈치가 어깨보다 위
});

test("서서 하기는 팔다리 1개까지 틀려도 봐주고, 앉아서 하기는 다리를 보지 않는다", () => {
  const aspect = 16 / 9;
  const hooray = wall.POSES[0];
  const oneLegOff = { ...hooray.angles, lShin: 0 };
  assert.ok(wall.matchPose(fakeBody(oneLegOff, aspect), hooray, { aspect, seated: false }).pass);
  const legsCrazy = { ...hooray.angles, lThigh: 0, lShin: 0, rThigh: 180, rShin: 180 };
  assert.ok(!wall.matchPose(fakeBody(legsCrazy, aspect), hooray, { aspect, seated: false }).pass);
  const seated = wall.matchPose(fakeBody(legsCrazy, aspect), hooray, { aspect, seated: true });
  assert.equal(seated.needed, 4);
  assert.ok(seated.pass);
});

test("안 보이는 팔다리는 맞은 것으로 치지 않는다", () => {
  const aspect = 16 / 9;
  const tee = wall.POSES.find((p) => p.id === "tee");
  const result = wall.matchPose(fakeBody(tee.angles, aspect, 0.2), tee, { aspect, seated: false });
  assert.equal(result.matched, 0);
  assert.ok(result.limbs.every((l) => !l.visible));
});

test("각도 차이는 0~180도로 계산한다", () => {
  near(wall.angleDiff(179, -179), 2);
  near(wall.angleDiff(-90, 90), 180);
  near(wall.angleDiff(10, 10), 0);
});

test("앉아서 하기에는 다리 자세가 나오지 않고, 같은 자세가 연달아 나오지 않는다", () => {
  assert.ok(wall.posesFor(true).every((p) => !p.standingOnly));
  for (let i = 0; i < 30; i++) assert.notEqual(wall.nextPose(false, "tee").id, "tee");
  assert.ok(wall.wallSeconds(100) >= 2.4);
});

// ───────── 손 탁구 ─────────
test("화면 왼쪽 손은 왼쪽 선수, 오른쪽 손은 오른쪽 선수", () => {
  assert.deepEqual(pong.assignHands([{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 }]), { left: 0.3, right: 0.7 });
  assert.deepEqual(pong.assignHands([{ x: 0.9, y: 0.4 }]), { left: null, right: 0.4 });
  assert.deepEqual(pong.assignHands([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.9 }]), { left: 0.2, right: null });
});

test("라켓 끝에 맞을수록 크게 꺾이고, 속도는 최고 속도를 넘지 않는다", () => {
  assert.equal(pong.bounceAngle(0), 0);
  assert.equal(pong.bounceAngle(1), pong.MAX_BOUNCE);
  assert.equal(pong.bounceAngle(-5), -pong.MAX_BOUNCE);
  const v = pong.paddleBounce(pong.MAX_SPEED, 0, -1);
  near(v.speed, pong.MAX_SPEED);
  assert.ok(v.vx < 0);
});

test("공은 위아래 벽에서 튕긴다", () => {
  const up = pong.moveBall({ x: 0.5, y: 0.03, vx: 0, vy: -1 }, 0.05);
  assert.ok(up.bounced && up.vy > 0 && up.y >= pong.BALL_RADIUS);
  const down = pong.moveBall({ x: 0.5, y: 0.97, vx: 0, vy: 1 }, 0.05);
  assert.ok(down.bounced && down.vy < 0 && down.y <= 1 - pong.BALL_RADIUS);
});

test("라켓은 화면 밖으로 나가지 않고, 컴퓨터는 정해진 속도까지만 움직인다", () => {
  assert.equal(pong.clampPaddle(-1), pong.PADDLE_HEIGHT / 2);
  assert.equal(pong.clampPaddle(2), 1 - pong.PADDLE_HEIGHT / 2);
  near(pong.cpuFollow(0.5, 0.9, 0.1), 0.5 + pong.CPU_SPEED * 0.1);
  assert.ok(pong.hitsPaddle({ x: 0.1, y: 0.5 }, 0.1, 0.55));
  assert.ok(!pong.hitsPaddle({ x: 0.1, y: 0.9 }, 0.1, 0.5));
});

// ───────── 표정 챌린지 ─────────
test("표정 점수로 표정을 판단한다", () => {
  const get = (id) => face.EXPRESSIONS.find((e) => e.id === id);
  const scores = face.toScores([
    { categoryName: "eyeBlinkLeft", score: 0.9 },
    { categoryName: "eyeBlinkRight", score: 0.1 },
    { categoryName: "jawOpen", score: 0.2 },
  ]);
  assert.ok(face.isDoing(get("wink"), scores)); // 한쪽 눈만 감음
  assert.ok(!face.isDoing(get("jaw"), scores));
  near(face.progress(get("jaw"), scores), 0.4);
  const bothClosed = face.toScores([
    { categoryName: "eyeBlinkLeft", score: 0.9 },
    { categoryName: "eyeBlinkRight", score: 0.9 },
  ]);
  assert.ok(!face.isDoing(get("wink"), bothClosed)); // 두 눈을 다 감으면 윙크가 아님
  assert.equal(face.progress(get("smile"), {}), 0); // 점수가 없으면 0
});

test("제한 시간은 점점 짧아지지만 최소 시간보다 짧아지지 않고, 같은 표정이 연달아 나오지 않는다", () => {
  assert.equal(face.timeLimit(0), face.START_LIMIT);
  assert.equal(face.timeLimit(1000), face.MIN_LIMIT);
  for (let i = 0; i < 30; i++) assert.notEqual(face.nextExpression("smile").id, "smile");
});

// ───────── 거꾸로 가위바위보 ─────────
// 손목(0,0)에서 위로 뻗은 가짜 손 (project1 테스트와 같은 방법)
function fakeHand(open) {
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const fingers = [
    { pip: 6, tip: 8 },
    { pip: 10, tip: 12 },
    { pip: 14, tip: 16 },
    { pip: 18, tip: 20 },
  ];
  fingers.forEach((f, i) => {
    const x = (i - 1.5) * 0.25;
    hand[f.pip] = { x, y: -1.5, z: 0 };
    hand[f.tip] = open[i] ? { x, y: -2.1, z: 0 } : { x, y: -1.0, z: 0 };
  });
  return hand;
}

test("손가락으로 가위·바위·보를 읽는다 (project1 규칙 재사용)", () => {
  assert.equal(rps.gestureOf(fakeHand([false, false, false, false])), "rock");
  assert.equal(rps.gestureOf(fakeHand([true, true, false, false])), "scissors");
  assert.equal(rps.gestureOf(fakeHand([true, true, true, true])), "paper");
  assert.equal(rps.gestureOf(fakeHand([true, false, false, false])), null);
});

test("승부와 지시에 맞는 정답을 계산한다", () => {
  assert.equal(rps.judge("rock", "scissors"), "win");
  assert.equal(rps.judge("rock", "paper"), "lose");
  assert.equal(rps.judge("paper", "paper"), "draw");
  assert.equal(rps.answerFor("rock", "lose"), "scissors");
  assert.equal(rps.answerFor("rock", "win"), "paper");
  assert.equal(rps.answerFor("rock", "draw"), "rock");
});

test("처음 몇 문제는 '져라'만 나오고, 정답이 앞 문제와 같지 않다", () => {
  for (let round = 0; round < rps.LOSE_ONLY_ROUNDS; round++) {
    assert.equal(rps.makeRound(round, "paper").order, "lose");
  }
  for (let i = 0; i < 50; i++) {
    const q = rps.makeRound(10, "rock");
    assert.notEqual(q.answer, "rock");
    assert.equal(rps.answerFor(q.computer, q.order), q.answer);
  }
  const unlucky = rps.makeRound(0, "scissors", sequence(0)); // 늘 같은 값만 나오는 경우
  assert.notEqual(unlucky.answer, "scissors");
  assert.equal(rps.judge(unlucky.answer, unlucky.computer), unlucky.order);
});

// ════════════ 두 번째 묶음 ════════════
import * as plane from "../head-plane/rules.js";
import * as draw from "../air-draw/rules.js";
import * as balloon from "../balloon-pop/rules.js";
import * as freeze from "../freeze-dance/rules.js";
import * as pinch from "../pinch-order/rules.js";
import { handsUp } from "../shared/body.js";

// ───────── 고개 비행기 ─────────
test("두 눈을 잇는 선으로 고개 기울기를 잰다", () => {
  near(plane.tiltAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  near(plane.tiltAngle({ x: 0, y: 0 }, { x: 10, y: 10 }), 45); // 오른쪽이 아래 = 오른쪽으로 기울임
  near(plane.tiltAngle({ x: 10, y: 10 }, { x: 0, y: 0 }), 45); // 점 순서가 바뀌어도 같아요
  assert.ok(plane.tiltAngle({ x: 0, y: 10 }, { x: 10, y: 0 }) < 0);
});

test("기울기에 따라 비행기 위치가 정해지고, 작은 기울기는 무시한다", () => {
  assert.equal(plane.targetX(0), 0.5);
  assert.equal(plane.targetX(plane.DEAD_ZONE - 0.1), 0.5);
  assert.equal(plane.targetX(plane.MAX_TILT), 1);
  assert.equal(plane.targetX(-plane.MAX_TILT * 2), 0);
  assert.ok(plane.targetX(10) > 0.5 && plane.targetX(10) < 1);
});

test("별은 가장자리에 나오고, 속도는 최고 속도를 넘지 않는다", () => {
  const star = plane.spawnItem(sequence(0, 0, 0.5));
  assert.equal(star.kind, "star");
  assert.ok(star.x < 0.25);
  assert.equal(plane.spawnItem(sequence(0.99, 0.1, 0.5)).kind, "bird");
  assert.equal(plane.fallSpeed(10000), plane.MAX_SPEED);
});

// ───────── 공중 그림 퀴즈 ─────────
test("손 모양으로 펜 상태를 정한다", () => {
  assert.equal(draw.penMode(fakeHand([true, false, false, false])), "draw");
  assert.equal(draw.penMode(fakeHand([true, true, true, true])), "erase");
  assert.equal(draw.penMode(fakeHand([true, true, false, false])), "hover");
  assert.equal(draw.penMode(fakeHand([false, false, false, false])), "hover");
});

test("손떨림을 줄이며 따라가고, 제시어는 겹치지 않게 고른다", () => {
  assert.deepEqual(draw.smoothPoint(null, { x: 1, y: 1 }), { x: 1, y: 1 });
  const p = draw.smoothPoint({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.5);
  near(p.x, 0.5);
  const used = new Set();
  const total = Object.values(draw.WORDS).flat().length;
  for (let i = 0; i < total; i++) {
    const w = draw.pickWord(used);
    assert.ok(!used.has(w.word), `${w.word} 중복`);
    used.add(w.word);
  }
  const again = draw.pickWord(used); // 다 쓰면 처음부터
  assert.ok(again.word);
  assert.equal(used.size, 0);
});

// ───────── 풍선 팡팡 ─────────
test("풍선마다 터뜨릴 수 있는 몸 부위가 다르다", () => {
  assert.ok(balloon.canPop("any", "hand"));
  assert.ok(balloon.canPop("foot", "foot"));
  assert.ok(!balloon.canPop("foot", "hand"));
  assert.ok(!balloon.canPop("head", "foot"));
});

test("몸 점이 풍선에 닿았는지 가로세로 비율을 고려해 판단한다", () => {
  const b = { x: 0.5, y: 0.5 };
  assert.ok(balloon.touching({ x: 0.5, y: 0.5 + balloon.BALLOON_SIZE }, b, 16 / 9));
  assert.ok(!balloon.touching({ x: 0.5 + 0.1, y: 0.5 }, b, 16 / 9)); // 가로 0.1은 높이로 0.178
});

test("앉아서 하기에는 발 풍선이 없고, 풍선은 부위에 맞는 높이에 나온다", () => {
  for (let i = 0; i < 200; i++) assert.notEqual(balloon.pickType(true, 30), "foot");
  assert.ok(balloon.spawnPosition("head", false, () => 0.99).y < 0.31);
  assert.ok(balloon.spawnPosition("foot", false, () => 0).y >= 0.78);
});

test("양손이 코보다 위에 있으면 손을 든 것이다", () => {
  const body = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  body[0] = { x: 0.5, y: 0.3, visibility: 1 };
  body[15] = { x: 0.4, y: 0.2, visibility: 1 };
  body[16] = { x: 0.6, y: 0.2, visibility: 1 };
  assert.ok(handsUp(body));
  body[16] = { x: 0.6, y: 0.6, visibility: 1 };
  assert.ok(!handsUp(body));
});

// ───────── 얼음 땡 ─────────
function standingBody(dx = 0, scale = 1) {
  const body = Array.from({ length: 33 }, () => ({ x: 0.5 + dx, y: 0.5, visibility: 1 }));
  const set = (i, x, y) => (body[i] = { x: 0.5 + dx + x * scale, y: 0.5 + y * scale, visibility: 1 });
  set(0, 0, -0.3);
  set(11, -0.05, -0.2); set(12, 0.05, -0.2);
  set(13, -0.08, -0.08); set(14, 0.08, -0.08);
  set(15, -0.09, 0.02); set(16, 0.09, 0.02);
  set(23, -0.04, 0.05); set(24, 0.04, 0.05);
  set(25, -0.04, 0.2); set(26, 0.04, 0.2);
  set(27, -0.04, 0.35); set(28, 0.04, 0.35);
  return body;
}

test("가만히 있으면 움직이지 않은 것, 팔을 크게 들면 움직인 것", () => {
  const aspect = 16 / 9;
  const ref = standingBody();
  assert.ok(!freeze.isMoved(ref, standingBody(), aspect));
  const jitter = standingBody(0.003); // 아주 작은 떨림
  assert.ok(!freeze.isMoved(ref, jitter, aspect));
  const waved = standingBody();
  waved[15] = { x: 0.3, y: 0.15, visibility: 1 };
  waved[13] = { x: 0.38, y: 0.3, visibility: 1 };
  assert.ok(freeze.isMoved(ref, waved, aspect));
});

test("멀리 있는 사람(작게 보이는 사람)도 같은 기준으로 판단한다", () => {
  const aspect = 16 / 9;
  const small = standingBody(0, 0.5);
  const smallMoved = standingBody(0, 0.5);
  smallMoved[15] = { x: smallMoved[15].x - 0.06, y: smallMoved[15].y - 0.08, visibility: 1 };
  smallMoved[16] = { x: smallMoved[16].x + 0.06, y: smallMoved[16].y - 0.08, visibility: 1 };
  assert.ok(freeze.isMoved(small, smallMoved, aspect));
  near(freeze.moveScore(small, small, aspect), 0);
});

test("프레임마다 같은 사람끼리 짝짓는다", () => {
  const aspect = 16 / 9;
  const tracks = [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.3 }];
  assert.deepEqual(freeze.matchPeople(tracks, [{ x: 0.71, y: 0.31 }, { x: 0.21, y: 0.3 }], aspect), [1, 0]);
  assert.deepEqual(freeze.matchPeople(tracks, [{ x: 0.45, y: 0.9 }], aspect), [-1]); // 새로 들어온 사람
  const smoothed = freeze.smoothBody([{ x: 0, y: 0 }], [{ x: 1, y: 1, visibility: 1 }], 0.5);
  near(smoothed[0].x, 0.5);
  const d = freeze.danceSeconds(() => 0.5);
  assert.ok(d >= 5 && d <= 11);
});

// ───────── 순서대로 집게 ─────────
function pinchHand(gap) {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  hand[0] = { x: 0.5, y: 0.8 };
  hand[9] = { x: 0.5, y: 0.6 }; // 손 크기 0.2
  hand[4] = { x: 0.45, y: 0.5 };
  hand[8] = { x: 0.45 + gap, y: 0.5 };
  return hand;
}

test("엄지-검지 거리를 손 크기로 나눠 집기를 판단한다", () => {
  near(pinch.pinchRatio(pinchHand(0.1)), 0.5);
  let state = pinch.updatePinch(false, pinch.pinchRatio(pinchHand(0.02)));
  assert.deepEqual(state, { pinched: true, clicked: true });
  state = pinch.updatePinch(true, 0.4); // 경계 근처 떨림: 여전히 집은 상태, 다시 누르지 않음
  assert.deepEqual(state, { pinched: true, clicked: false });
  state = pinch.updatePinch(true, 0.6);
  assert.deepEqual(state, { pinched: false, clicked: false });
  near(pinch.pinchPoint(pinchHand(0.1)).x, 0.5);
});

test("글자는 겹치지 않게 화면 안에 흩어 놓는다", () => {
  const aspect = 16 / 9;
  for (const set of Object.values(pinch.SETS)) {
    const spots = pinch.layout(set.items.length, aspect);
    assert.equal(spots.length, set.items.length);
    for (const p of spots) assert.ok(p.x >= 0.08 && p.x <= 0.92 && p.y >= 0.24 && p.y <= 0.9);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        assert.ok(Math.hypot((spots[i].x - spots[j].x) * aspect, spots[i].y - spots[j].y) >= pinch.ITEM_SIZE * 2);
  }
});

test("집은 위치에서 가장 가까운 글자를 찾고, 이미 모은 글자는 건너뛴다", () => {
  const aspect = 16 / 9;
  const items = [{ x: 0.3, y: 0.5, done: false }, { x: 0.32, y: 0.5, done: false }, { x: 0.8, y: 0.5, done: true }];
  assert.equal(pinch.hitIndex({ x: 0.318, y: 0.5 }, items, aspect), 1);
  assert.equal(pinch.hitIndex({ x: 0.8, y: 0.5 }, items, aspect), -1);
  assert.equal(pinch.SETS.hangul.items.length, 14);
});
