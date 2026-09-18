// ════════════════════════════════════════════════════════════
//  body.js — 여러 게임이 함께 쓰는 몸 규칙
// ════════════════════════════════════════════════════════════

// Pose Landmarker 점 번호: 0 코, 15·16 손목
const NOSE = 0;
const WRISTS = [15, 16];

/** 두 손목이 모두 코보다 위에 있나? (만세, 손 들기) — 화면 아래로 갈수록 y가 커져요 */
export function handsUp(body, minVisibility = 0.5) {
  const nose = body[NOSE];
  return WRISTS.every((i) => (body[i].visibility ?? 1) >= minVisibility && body[i].y < nose.y);
}
