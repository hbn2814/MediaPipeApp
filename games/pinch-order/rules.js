// ════════════════════════════════════════════════════════════
//  rules.js — 순서대로 집게의 규칙: "집었나?"와 글자 배치
//  카메라도, 화면도, MediaPipe도 모르는 순수한 계산만 모았습니다.
//  👉 SETS에 새 순서(요일, 행성, 구구단…)를 추가해 보세요!
// ════════════════════════════════════════════════════════════

// 손의 점 21개 중: 0 손목 · 4 엄지 끝 · 8 검지 끝 · 9 가운데손가락 뿌리
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const MIDDLE_BASE = 9;

// 👇 바꿔 볼 수 있는 숫자들
export const PINCH_CLOSE = 0.35; // 엄지-검지 거리가 손 크기의 이 비율보다 작아지면 "집음"
export const PINCH_OPEN = 0.5; // 이 비율보다 커지면 "놓음" (두 기준을 달리해서 떨림에 강해요)
export const ITEM_SIZE = 0.065; // 글자 원의 반지름 (화면 높이 비율)
export const PENALTY_SECONDS = 2; // 틀린 글자를 집으면 더해지는 시간
export const HINT_SECONDS = 5; // 이만큼 못 찾으면 다음 글자가 살짝 반짝여요

export const SETS = {
  number: { name: "숫자 1~15", items: Array.from({ length: 15 }, (_, i) => String(i + 1)) },
  hangul: { name: "한글 자음 ㄱ~ㅎ", items: ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] },
  alphabet: { name: "알파벳 A~O", items: "ABCDEFGHIJKLMNO".split("") },
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 엄지-검지 거리 ÷ 손 크기(손목~가운데손가락 뿌리). 손이 멀리 있어도 같은 기준이 돼요 */
export function pinchRatio(hand) {
  const size = dist(hand[WRIST], hand[MIDDLE_BASE]);
  return size > 0 ? dist(hand[THUMB_TIP], hand[INDEX_TIP]) / size : Infinity;
}

/** 집기 상태 업데이트 → { pinched: 지금 집고 있나, clicked: 방금 집었나 } */
export function updatePinch(pinched, ratio) {
  if (!pinched && ratio < PINCH_CLOSE) return { pinched: true, clicked: true };
  if (pinched && ratio > PINCH_OPEN) return { pinched: false, clicked: false };
  return { pinched, clicked: false };
}

/** 집는 위치 = 엄지 끝과 검지 끝의 가운데 */
export function pinchPoint(hand) {
  const a = hand[THUMB_TIP];
  const b = hand[INDEX_TIP];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 글자들을 서로 겹치지 않게 흩어 놓기 (화면 비율 좌표)
 * 위쪽 점수판 자리와 화면 가장자리는 피해요.
 */
export function layout(count, aspect, random = Math.random) {
  let gap = ITEM_SIZE * 2.5;
  for (let attempt = 0; attempt < 20; attempt++) {
    const points = [];
    for (let tries = 0; tries < 3000 && points.length < count; tries++) {
      const p = { x: 0.08 + 0.84 * random(), y: 0.24 + 0.66 * random() };
      if (points.every((q) => Math.hypot((p.x - q.x) * aspect, p.y - q.y) >= gap)) points.push(p);
    }
    if (points.length === count) return points;
    gap *= 0.9; // 자리가 모자라면 간격을 조금 줄여서 다시
  }
  throw new Error("글자를 놓을 자리가 부족해요");
}

/** 집은 위치에서 가장 가까운 글자 번호 (닿은 글자가 없으면 -1) */
export function hitIndex(point, items, aspect) {
  let best = -1;
  let bestD = ITEM_SIZE * 1.15;
  items.forEach((item, i) => {
    if (item.done) return;
    const d = Math.hypot((point.x - item.x) * aspect, point.y - item.y);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
