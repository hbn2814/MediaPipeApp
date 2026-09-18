// ════════════════════════════════════════════════════════════
//  집중 타이머 (자기주도학습 도우미)
//  ① 카메라 켜기 → ② AI 모델 불러오기 → ③ 매 프레임 얼굴 찾기
//  → ④ 규칙으로 상태 판단(rules.js) → ⑤ 집중 시간 기록·화면 표시
// ════════════════════════════════════════════════════════════
import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import {
  FACE,
  EYES_CLOSED_SCORE,
  TURN_LIMIT,
  HEAD_DOWN_RATIO,
  readFace,
  classify,
  newTracker,
  updateTracker,
} from "./rules.js";

// MediaPipe 실행 파일(WebAssembly)과 얼굴 인식 AI 모델의 주소
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const drawer = new DrawingUtils(ctx);
let faceLandmarker = null;

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
    numFaces: 1, // 얼굴 하나만 찾기
    outputFaceBlendshapes: true, // 눈 깜빡임 같은 "표정 점수"도 받기
  });
  try {
    return await FaceLandmarker.createFromOptions(vision, options("GPU"));
  } catch (error) {
    console.warn("GPU를 쓸 수 없어 CPU로 실행합니다.", error);
    return await FaceLandmarker.createFromOptions(vision, options("CPU"));
  }
}

// ───────────── ③ 매 프레임 얼굴 찾기 ─────────────
let lastVideoTime = -1;
let lastTimestamp = 0;

function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const dt = Math.min((now - lastTimestamp) / 1000, 1); // 흐른 시간(초). 탭을 떠났다 오면 최대 1초만 인정
    lastTimestamp = now;

    const result = faceLandmarker.detectForVideo(video, now);
    const face = result.faceLandmarks[0]; // 점 478개 (얼굴이 없으면 undefined)
    const shapes = result.faceBlendshapes[0]?.categories; // 표정 점수 52가지
    const info = face && shapes ? readFace(face, shapes) : null;
    drawFace(face);
    updateFocus(info, dt);
  }
  requestAnimationFrame(loop);
}

function drawFace(face) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!face) return;
  drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "rgba(255,255,255,0.7)", lineWidth: 2 });
  drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "#3DDC97", lineWidth: 2 });
  drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "#3DDC97", lineWidth: 2 });
  // 규칙에 쓰는 5개 점(코끝·이마·턱·얼굴 양옆)을 크게 표시
  const keyPoints = Object.values(FACE).map((index) => face[index]);
  drawer.drawLandmarks(keyPoints, { color: "#13A07A", fillColor: "#FFFFFF", lineWidth: 3, radius: 7 });
}

// ───────────── ④⑤ 규칙 적용 → 집중 시간 기록 ─────────────
let tracker = newTracker();
let finished = false;
let alarmWait = 0;

const STATUS = {
  FOCUS: { label: "집중 중", message: "잘하고 있어요. 이대로 계속!" },
  AWAY: { label: "자리 비움", message: "자리를 비웠어요. 돌아오면 타이머가 다시 흘러요." },
  DISTRACTED: { label: "딴 곳 보는 중", message: "화면이나 책 쪽을 바라보면 다시 시작돼요." },
  DROWSY: { label: "졸음 주의!", message: "눈을 오래 감고 있어요. 일어나서 기지개를 켜 볼까요?" },
};

const goalSeconds = () => Number($("goalSelect").value) * 60;

function updateFocus(info, dt) {
  if (!finished) {
    tracker = updateTracker(tracker, classify(info), dt);
    if (tracker.focusSeconds >= goalSeconds()) finish();
  }
  render(info);
  soundAlarm(dt);
}

function finish() {
  finished = true;
  beep(1320, 0.4);
}

function soundAlarm(dt) {
  if (finished || tracker.status !== "DROWSY") {
    alarmWait = 0;
    return;
  }
  alarmWait -= dt;
  if (alarmWait <= 0) {
    beep(660, 0.25); // 졸음 상태가 이어지는 동안 1초마다 삐-
    alarmWait = 1;
  }
}

// ───────────── 화면 그리기 ─────────────
function render(info) {
  const status = STATUS[tracker.status];
  $("time").textContent = formatTime(tracker.focusSeconds);
  $("ring").style.strokeDasharray = `${Math.min(tracker.focusSeconds / goalSeconds(), 1) * 100} 100`;
  $("status").textContent = finished ? "목표 달성" : status.label;
  $("status").className = `pill ${finished ? "done" : tracker.status.toLowerCase()}`;
  $("message").textContent = finished
    ? `🎉 목표한 ${$("goalSelect").value}분 집중 완료! 5분 쉬고 다시 시작해요.`
    : status.message;
  document.body.classList.toggle("alert", !finished && tracker.status === "DROWSY");

  // AI가 보고 있는 숫자들
  showMeter("eyes", info?.eyesClosed);
  showMeter("turn", info?.turn);
  showMeter("tilt", info?.tilt);

  // 기록
  $("total").textContent = formatTime(tracker.totalSeconds);
  $("rate").textContent =
    tracker.totalSeconds >= 1 ? `${Math.round((tracker.focusSeconds / tracker.totalSeconds) * 100)}%` : "–";
  $("awayCount").textContent = tracker.counts.AWAY ?? 0;
  $("distractedCount").textContent = tracker.counts.DISTRACTED ?? 0;
  $("drowsyCount").textContent = tracker.counts.DROWSY ?? 0;
}

function showMeter(name, value) {
  const known = Number.isFinite(value);
  $(`${name}Value`).textContent = known ? value.toFixed(2) : "–";
  $(`${name}Dot`).hidden = !known;
  if (known) $(`${name}Dot`).style.left = `${Math.max(0, Math.min(value, 1)) * 100}%`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

let audio = null;
function beep(frequency, seconds) {
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

// 측정 막대에 "상태가 바뀌는 구간" 칠하기 (rules.js의 숫자를 바꾸면 따라 바뀜)
function paintZone(id, from, to) {
  $(id).style.left = `${from * 100}%`;
  $(id).style.width = `${(to - from) * 100}%`;
}
paintZone("eyesZone", EYES_CLOSED_SCORE, 1);
paintZone("turnZoneLeft", 0, 0.5 - TURN_LIMIT);
paintZone("turnZoneRight", 0.5 + TURN_LIMIT, 1);
paintZone("tiltZone", HEAD_DOWN_RATIO, 1);

// ───────────── 버튼 ─────────────
$("resetBtn").addEventListener("click", () => {
  tracker = newTracker();
  finished = false;
  render(null);
});
$("goalSelect").addEventListener("change", () => render(null));

$("startBtn").addEventListener("click", async () => {
  $("startBtn").disabled = true;
  try {
    $("overlayMsg").textContent = "카메라를 켜는 중…";
    await startCamera();
    $("overlayMsg").textContent = "AI 모델을 불러오는 중… (처음에는 몇 초 걸려요)";
    faceLandmarker = await loadModel();
    $("overlay").hidden = true;
    lastTimestamp = performance.now();
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

render(null);
