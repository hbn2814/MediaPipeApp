// ════════════════════════════════════════════════════════════
//  rules.js — 거꾸로 가위바위보의 규칙
//  손가락이 펴졌는지는 project1 손가락 퀴즈에서 만든 규칙을 그대로 다시 써요!
//  👉 이미 만든 규칙을 새 게임에 재사용하는 것도 프로그래밍의 힘이에요.
// ════════════════════════════════════════════════════════════
import { FINGERS, isFingerOpen } from "../../project1/finger-quiz/rules.js";

// 👇 바꿔 볼 수 있는 숫자들
export const HOLD_SECONDS = 0.3; // 손 모양을 이만큼(초) 유지해야 인정
export const WRONG_SECONDS = 0.45; // 틀린 손 모양을 이만큼(초) 유지하면 실패
export const GRACE_SECONDS = 0.7; // 문제가 나온 뒤 이 시간(초) 동안은 틀린 손 모양도 봐줘요 (손 바꿀 시간)
export const LOSE_ONLY_ROUNDS = 5; // 처음 이만큼은 "져라!"만 나와요
export const MAX_MISSES = 3; // 이만큼 틀리면 게임 끝

export const GESTURES = {
  rock: { emoji: "✊", name: "바위" },
  scissors: { emoji: "✌️", name: "가위" },
  paper: { emoji: "✋", name: "보" },
};

export const ORDERS = {
  lose: { text: "져라!", color: "#ff4f7b" },
  win: { text: "이겨라!", color: "#3ecbff" },
  draw: { text: "비겨라!", color: "#ffd23f" },
};

// 왼쪽이 오른쪽을 이겨요: 바위 > 가위, 가위 > 보, 보 > 바위
const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };

/** 손 모양 읽기: 펴진 손가락(엄지 빼고 4개)으로 가위·바위·보 판단. 모르면 null */
export function gestureOf(hand) {
  const open = FINGERS.map((finger) => isFingerOpen(hand, finger)); // [검지, 중지, 약지, 소지]
  const count = open.filter(Boolean).length;
  if (count === 0) return "rock";
  if (count === 4) return "paper";
  if (open[0] && open[1] && !open[2] && !open[3]) return "scissors";
  return null;
}

/** 승부: 내가 player, 컴퓨터가 computer를 냈을 때 → "win" | "lose" | "draw" */
export function judge(player, computer) {
  if (player === computer) return "draw";
  return BEATS[player] === computer ? "win" : "lose";
}

/** 지시(order)를 따르려면 무엇을 내야 하나? */
export function answerFor(computer, order) {
  return Object.keys(GESTURES).find((g) => judge(g, computer) === order);
}

/** 제한 시간: 라운드가 갈수록 짧아져요 */
export function timeLimit(round) {
  return Math.max(1.4, 3 - round * 0.1);
}

/**
 * 새 문제 만들기. 정답이 바로 앞 문제의 정답과 같지 않게 골라요.
 * (그래야 손을 그대로 두고 공짜로 맞히는 일이 없어요)
 */
export function makeRound(round, previousAnswer, random = Math.random) {
  const names = Object.keys(GESTURES);
  const orders = Object.keys(ORDERS);
  for (let tries = 0; tries < 50; tries++) {
    const computer = names[Math.floor(random() * names.length)];
    const order = round < LOSE_ONLY_ROUNDS ? "lose" : orders[Math.floor(random() * orders.length)];
    const answer = answerFor(computer, order);
    if (answer !== previousAnswer) return { computer, order, answer };
  }
  // 운이 아주 나쁠 때를 대비한 안전장치
  const answer = names.find((g) => g !== previousAnswer);
  return { computer: BEATS[answer], order: "win", answer };
}
