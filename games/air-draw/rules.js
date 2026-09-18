// ════════════════════════════════════════════════════════════
//  rules.js — 공중 그림 퀴즈의 규칙: 손 모양 → 펜 상태, 제시어
//  손가락이 펴졌는지는 project1 손가락 퀴즈의 규칙을 다시 써요.
//  👉 WORDS에 우리 반만의 제시어를 넣어 보세요!
// ════════════════════════════════════════════════════════════
import { FINGERS, isFingerOpen } from "../../project1/finger-quiz/rules.js";

export const TIP = 8; // 검지 끝

// 👇 바꿔 볼 수 있는 숫자들
export const ROUND_SECONDS = 60; // 한 문제 그리는 시간(초)
export const PEEK_SECONDS = 3; // 제시어를 보여 주는 시간(초)
export const ERASE_SECONDS = 1; // 보(✋)를 이만큼 유지하면 모두 지우기
export const START_SECONDS = 1; // 시작 화면에서 보(✋)를 이만큼 유지하면 다음 문제
export const SMOOTHING = 0.5; // 0~1: 작을수록 선이 부드럽지만 늦게 따라와요
export const MIN_STEP = 0.004; // 이보다 조금 움직이면 점을 찍지 않아요 (화면 높이 비율)

export const WORDS = {
  동물: ["고양이", "강아지", "물고기", "토끼", "거북이", "뱀", "기린", "코끼리", "달팽이", "나비"],
  음식: ["사과", "바나나", "아이스크림", "피자", "햄버거", "수박", "도넛", "김밥", "케이크", "당근"],
  학교: ["연필", "책", "가위", "시계", "칠판", "의자", "가방", "지우개", "공", "우산"],
  자연: ["해", "달", "별", "구름", "무지개", "나무", "꽃", "산", "비", "눈사람"],
};

/**
 * 손 모양 → 펜 상태
 *  ☝️ 검지만 폄 → "draw"(그리기) · ✋ 네 손가락 폄 → "erase"(지우개) · 그 밖(✌️, ✊) → "hover"(펜 들기)
 */
export function penMode(hand) {
  const open = FINGERS.map((finger) => isFingerOpen(hand, finger)); // [검지, 중지, 약지, 소지]
  if (open[0] && !open[1] && !open[2] && !open[3]) return "draw";
  if (open.every(Boolean)) return "erase";
  return "hover";
}

/** 이전 위치에서 새 위치로 조금씩 다가가 손떨림을 줄여요 */
export function smoothPoint(prev, next, amount = SMOOTHING) {
  if (!prev) return { ...next };
  return { x: prev.x + (next.x - prev.x) * amount, y: prev.y + (next.y - prev.y) * amount };
}

/** 이미 나온 제시어는 빼고 하나 골라요. 모두 나왔으면 처음부터 다시 */
export function pickWord(used, random = Math.random) {
  const all = Object.entries(WORDS).flatMap(([category, words]) => words.map((word) => ({ category, word })));
  const left = all.filter((w) => !used.has(w.word));
  const pool = left.length ? left : all;
  if (!left.length) used.clear();
  return pool[Math.floor(random() * pool.length)];
}
