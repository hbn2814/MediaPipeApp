// ════════════════════════════════════════════════════════════
//  sound.js — 효과음 (소리 파일 없이 브라우저가 직접 만들어요)
// ════════════════════════════════════════════════════════════
let audio = null;
let muted = false;

/** 브라우저는 사용자가 버튼을 누른 뒤에만 소리를 낼 수 있어요. 시작 버튼에서 불러 주세요 */
export function unlockSound() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch (error) {
    audio = null;
  }
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

/** 삑 소리 하나: freq = 높이(Hz), duration = 길이(초), slide = 끝으로 갈수록 바뀌는 높이 */
function tone(freq, duration, { type = "sine", volume = 0.12, delay = 0, slide = 0 } = {}) {
  if (!audio || muted) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** 음표 하나 연주 (배경 음악용) */
export function playNote(freq, duration, options) {
  tone(freq, duration, options);
}

export const sfx = {
  slice: () => tone(900, 0.07, { type: "triangle", volume: 0.09, slide: 500 }),
  hit: () => tone(520, 0.05, { type: "square", volume: 0.05 }),
  good: () => {
    tone(660, 0.09);
    tone(990, 0.13, { delay: 0.08 });
  },
  bad: () => tone(170, 0.32, { type: "sawtooth", volume: 0.09, slide: -70 }),
  start: () => {
    tone(523, 0.1);
    tone(659, 0.1, { delay: 0.1 });
    tone(784, 0.18, { delay: 0.2 });
  },
  over: () => {
    tone(392, 0.16);
    tone(330, 0.16, { delay: 0.16 });
    tone(262, 0.32, { delay: 0.32 });
  },
  tick: () => tone(1250, 0.03, { volume: 0.05 }),
};
