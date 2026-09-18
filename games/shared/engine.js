// ════════════════════════════════════════════════════════════
//  engine.js — 게임 코너 공통 뼈대
//  ① 카메라 켜기 → ② AI 모델 불러오기 → ③ 매 프레임 게임의 frame() 부르기
//  각 게임의 app.js는 frame() 안에서 "규칙 적용 → 그리기"만 하면 돼요.
// ════════════════════════════════════════════════════════════
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  FaceLandmarker,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import { unlockSound, toggleMute } from "./sound.js";

export { HandLandmarker, PoseLandmarker, FaceLandmarker };

// MediaPipe 실행 파일(WebAssembly)과 AI 모델의 주소
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELS = {
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};
const TASKS = { hand: HandLandmarker, pose: PoseLandmarker, face: FaceLandmarker };

export const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export const $ = (id) => document.getElementById(id);

// ───────────── ① 카메라 켜기 ─────────────
async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("INSECURE");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

// ───────────── ② AI 모델 불러오기 ─────────────
async function loadLandmarker(kind, options) {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const make = (delegate) =>
    TASKS[kind].createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODELS[kind], delegate },
      runningMode: "VIDEO", // 연속된 영상 프레임을 처리
      ...options,
    });
  try {
    return await make("GPU");
  } catch (error) {
    console.warn("GPU를 쓸 수 없어 CPU로 실행합니다.", error);
    return await make("CPU");
  }
}

function explainError(error) {
  if (error.message === "INSECURE")
    return "카메라는 http://localhost 또는 https 주소에서만 켜져요. 파일을 더블클릭하지 말고 웹 주소로 열어 주세요.";
  if (error.name === "NotAllowedError")
    return "카메라 권한이 거부됐어요. 주소창의 카메라 아이콘에서 ‘허용’으로 바꾼 뒤 다시 눌러 주세요.";
  if (error.name === "NotFoundError") return "연결된 카메라를 찾지 못했어요.";
  if (error.name === "NotReadableError")
    return "다른 프로그램이 카메라를 쓰고 있어요. 화상회의 앱이나 다른 탭을 닫고 다시 시도하세요.";
  return "AI 모델을 불러오지 못했어요. 인터넷 연결(학교 방화벽)을 확인하세요. 자세한 내용은 F12 → Console에 있어요.";
}

/**
 * 게임 시작하기
 * kind      : "hand" | "pose" | "face" — 어떤 AI를 쓸지
 * options   : AI 옵션 (예: { numHands: 2 })
 * onStart   : 카메라와 AI가 준비됐을 때 한 번 (stage를 받아요)
 * frame     : 매 프레임마다 ({ dt, now, result, fresh, stage })
 *             dt = 지난 프레임 이후 흐른 시간(초), fresh = AI 결과가 새로 나왔나
 * onRestart : 다시 하기 버튼이나 스페이스바를 눌렀을 때
 */
export function createGame({ kind, options = {}, onStart, frame, onRestart }) {
  const video = $("video");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const stage = {
    ctx,
    canvas,
    video,
    W: canvas.width,
    H: canvas.height,
    drawer: new DrawingUtils(ctx),
    /** AI가 준 점(0~1)을 거울처럼 뒤집은 화면 좌표(픽셀)로 */
    toScreen: (p) => ({ x: (1 - p.x) * stage.W, y: p.y * stage.H }),
    /** 카메라 영상을 거울처럼 그리고, dim만큼 어둡게 덮기 */
    drawVideo(dim = 0.3) {
      ctx.save();
      ctx.translate(stage.W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, stage.W, stage.H);
      ctx.restore();
      if (dim > 0) {
        ctx.fillStyle = `rgba(6, 10, 20, ${dim})`;
        ctx.fillRect(0, 0, stage.W, stage.H);
      }
    },
    /** 거울 좌표계에서 그리기 (MediaPipe의 DrawingUtils를 쓸 때) */
    mirrored(draw) {
      ctx.save();
      ctx.translate(stage.W, 0);
      ctx.scale(-1, 1);
      draw();
      ctx.restore();
    },
  };

  let landmarker = null;
  let result = null;
  let lastVideoTime = -1;
  let last = 0;

  // ───────────── ③ 매 프레임 ─────────────
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    let fresh = false;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      // 새 영상 프레임이 들어왔을 때만 AI를 돌려요
      lastVideoTime = video.currentTime;
      result = landmarker.detectForVideo(video, now);
      fresh = true;
    }
    frame({ dt, now, result, fresh, stage });
    requestAnimationFrame(loop);
  }

  $("startBtn").addEventListener("click", async () => {
    $("startBtn").disabled = true;
    unlockSound();
    try {
      $("overlayMsg").textContent = "카메라를 켜는 중…";
      await startCamera(video);
      stage.W = canvas.width = video.videoWidth;
      stage.H = canvas.height = video.videoHeight;
      $("stage").style.aspectRatio = `${stage.W} / ${stage.H}`;
      $("overlayMsg").textContent = "AI 모델을 불러오는 중… (처음에는 몇 초 걸려요)";
      landmarker = await loadLandmarker(kind, options);
      $("overlay").hidden = true;
      $("restartBtn").hidden = false;
      onStart?.(stage);
      last = performance.now();
      requestAnimationFrame(loop);
    } catch (error) {
      console.error(error);
      $("overlayMsg").textContent = explainError(error);
      $("startBtn").disabled = false;
    }
  });

  // 다시 하기: 버튼 또는 스페이스바·엔터
  $("restartBtn").addEventListener("click", () => onRestart?.());
  window.addEventListener("keydown", (event) => {
    if (!landmarker || event.target.closest?.("button")) return;
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      onRestart?.();
    }
  });

  // 전체 화면, 소리 끄기
  $("fsBtn").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $("stage").requestFullscreen?.();
  });
  $("muteBtn").addEventListener("click", () => {
    const muted = toggleMute();
    $("muteBtn").textContent = muted ? "🔇 소리 켜기" : "🔊 소리 끄기";
  });

  return stage;
}

/** 시작 화면의 모드 버튼(data-mode)을 고르는 도구. 지금 고른 모드를 돌려주는 함수를 줘요 */
export function modePicker() {
  const buttons = [...document.querySelectorAll("[data-mode]")];
  let mode = buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.mode;
  buttons.forEach((button) =>
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    }),
  );
  return () => mode;
}

/** 화면 크기에 맞춘 글자 크기 배율 (720px 높이 기준) */
export const unit = (stage) => stage.H / 720;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
export { roundedRect };

/** 가운데 안내판: 큰 제목 + 여러 줄 설명. y = 안내판 가운데 높이(화면 비율) */
export function drawBanner(stage, title, lines = [], { y = 0.5, color = "#ffffff" } = {}) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  const width = Math.min(W * 0.86, 820 * s);
  const height = (104 + lines.length * 44) * s;
  const left = (W - width) / 2;
  const top = H * y - height / 2;
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 24, 0.8)";
  roundedRect(ctx, left, top, width, height, 26 * s);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = `800 ${50 * s}px ${FONT}`;
  ctx.fillText(title, W / 2, top + 56 * s);
  ctx.fillStyle = "#dbe4f0";
  ctx.font = `600 ${27 * s}px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, top + 114 * s + i * 44 * s));
  ctx.restore();
}

/** 화면 아래쪽 작은 안내 문구 */
export function drawHint(stage, text) {
  const { ctx, W, H } = stage;
  const s = unit(stage);
  ctx.save();
  ctx.font = `700 ${26 * s}px ${FONT}`;
  const width = ctx.measureText(text).width + 40 * s;
  ctx.fillStyle = "rgba(8, 12, 24, 0.75)";
  roundedRect(ctx, (W - width) / 2, H - 70 * s, width, 48 * s, 24 * s);
  ctx.fill();
  ctx.fillStyle = "#ffe066";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H - 46 * s);
  ctx.restore();
}

/** 이모지 그리기 (size = 지름 픽셀) */
export function drawEmoji(ctx, emoji, x, y, size, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 0, size * 0.06);
  ctx.restore();
}

/** HUD(점수판) 글자는 바뀌었을 때만 고치기 */
export function setText(id, text) {
  const el = $(id);
  if (el && el.textContent !== String(text)) el.textContent = text;
}
