// ════════════════════════════════════════════════════════════
//  스쿼트 카운터 (신체활동 도우미)
//  ① 카메라 켜기 → ② AI 모델 불러오기 → ③ 매 프레임 몸 찾기
//  → ④ 규칙으로 무릎 각도·상태 판단(rules.js) → ⑤ 개수 세기·화면 표시
// ════════════════════════════════════════════════════════════
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import { LEGS, DOWN_ANGLE, UP_ANGLE, isLegVisible, kneeAngle, smooth, nextState } from "./rules.js";

// MediaPipe 실행 파일(WebAssembly)과 자세 인식 AI 모델의 주소
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const drawer = new DrawingUtils(ctx);
let poseLandmarker = null;

// ───────────── ① 카메라 켜기 ─────────────
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("INSECURE");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $("stage").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
}

// ───────────── ② AI 모델 불러오기 ─────────────
async function loadModel() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1, // 한 사람만 찾기
  });
  try {
    return await PoseLandmarker.createFromOptions(vision, options("GPU"));
  } catch (error) {
    console.warn("GPU를 쓸 수 없어 CPU로 실행합니다.", error);
    return await PoseLandmarker.createFromOptions(vision, options("CPU"));
  }
}

// ───────────── ③ 매 프레임 몸 찾기 ─────────────
let lastVideoTime = -1;

function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = poseLandmarker.detectForVideo(video, performance.now());
    const landmarks = result.landmarks[0]; // 화면 좌표(0~1) 33개 점, 사람이 없으면 undefined
    drawPose(landmarks);
    updateCounter(landmarks);
  }
  requestAnimationFrame(loop);
}

function drawPose(landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
    color: "rgba(255,255,255,0.7)",
    lineWidth: 3,
  });
  // 규칙에 쓰는 다리(엉덩이-무릎-발목)를 굵게 강조
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#FF6A3D";
  for (const leg of LEGS) {
    if (!isLegVisible(landmarks, leg)) continue;
    ctx.beginPath();
    leg.forEach((index, k) => {
      const x = landmarks[index].x * canvas.width;
      const y = landmarks[index].y * canvas.height;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  drawer.drawLandmarks(landmarks, { color: "#FF6A3D", fillColor: "#FFFFFF", lineWidth: 2, radius: 4 });
}

// ───────────── ④⑤ 규칙 적용 → 개수 세기 ─────────────
let state = "UP"; // 처음엔 서 있다고 가정
let count = 0;
let angle = NaN; // 부드럽게 만든 무릎 각도

function updateCounter(landmarks) {
  if (!landmarks) {
    angle = NaN;
    return render("몸 전체가 화면에 나오게 서 주세요");
  }
  const aspect = video.videoWidth / video.videoHeight; // 영상의 가로÷세로 비율
  angle = smooth(angle, kneeAngle(landmarks, aspect));
  if (Number.isNaN(angle)) {
    return render("무릎과 발목이 보이도록 조금 뒤로 물러나 주세요");
  }
  const next = nextState(state, angle);
  if (state === "DOWN" && next === "UP") {
    count += 1; // 앉았다가 일어선 순간 = 1개!
    celebrate();
  }
  state = next;
  render(state === "DOWN" ? "좋아요! 이제 일어나세요 ⬆" : "천천히 앉아 보세요 ⬇");
}

// ───────────── 화면 그리기 ─────────────
function render(message) {
  const goal = Math.max(1, Number($("goal").value) || 10);
  $("count").textContent = count;
  $("goalBar").style.width = `${Math.min(count / goal, 1) * 100}%`;
  $("goalText").textContent = count >= goal ? "🎉 목표 달성!" : `목표까지 ${goal - count}개`;
  $("statePill").textContent = state === "DOWN" ? "앉음" : "서 있음";
  $("statePill").className = `pill ${state === "DOWN" ? "down" : "up"}`;
  const known = !Number.isNaN(angle);
  $("angle").textContent = known ? `${Math.round(angle)}°` : "–";
  $("needle").hidden = !known;
  if (known) $("needle").style.left = `${(Math.min(angle, 180) / 180) * 100}%`;
  $("message").textContent = message;
}

function celebrate() {
  $("count").animate([{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 300 });
  const goal = Number($("goal").value) || 10;
  beep(count === goal ? 1320 : 880);
}

let audio = null;
function beep(frequency, seconds = 0.12) {
  if (!$("sound").checked) return;
  audio ??= new AudioContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = frequency;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + seconds);
}

// 게이지에 기준선 위치 표시 (rules.js의 숫자를 바꾸면 게이지도 따라 바뀜)
$("downZone").style.width = `${(DOWN_ANGLE / 180) * 100}%`;
$("upZone").style.left = `${(UP_ANGLE / 180) * 100}%`;
$("downLabel").textContent = `${DOWN_ANGLE}°`;
$("downLabel").style.left = `${(DOWN_ANGLE / 180) * 100}%`;
$("upLabel").textContent = `${UP_ANGLE}°`;
$("upLabel").style.left = `${(UP_ANGLE / 180) * 100}%`;

// ───────────── 버튼 ─────────────
$("resetBtn").addEventListener("click", () => {
  count = 0;
  state = "UP";
  render("다시 시작! 천천히 앉아 보세요 ⬇");
});
$("goal").addEventListener("input", () => render($("message").textContent));

$("startBtn").addEventListener("click", async () => {
  $("startBtn").disabled = true;
  try {
    $("overlayMsg").textContent = "카메라를 켜는 중…";
    await startCamera();
    $("overlayMsg").textContent = "AI 모델을 불러오는 중… (처음에는 몇 초 걸려요)";
    poseLandmarker = await loadModel();
    $("overlay").hidden = true;
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    $("overlayMsg").textContent = explainError(error);
    $("startBtn").disabled = false;
  }
});

function explainError(error) {
  if (error.message === "INSECURE")
    return "카메라는 http://localhost 또는 https 주소에서만 켜져요. README의 ‘실행 방법’을 확인하세요.";
  if (error.name === "NotAllowedError")
    return "카메라 권한이 거부됐어요. 주소창의 카메라 아이콘에서 ‘허용’으로 바꾼 뒤 다시 눌러 주세요.";
  if (error.name === "NotFoundError") return "연결된 카메라를 찾지 못했어요.";
  if (error.name === "NotReadableError")
    return "다른 프로그램이 카메라를 쓰고 있어요. 화상회의 앱 등을 닫고 다시 시도하세요.";
  return "AI 모델을 불러오지 못했어요. 인터넷 연결(학교 방화벽)을 확인하세요. 자세한 내용은 F12 → Console에 있어요.";
}

render("카메라 옆으로 돌아서서, 발끝까지 화면에 나오게 서 주세요");
