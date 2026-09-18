// ════════════════════════════════════════════════════════════
//  손가락 퀴즈 (학습 도우미)
//  ① 카메라 켜기 → ② AI 모델 불러오기 → ③ 매 프레임 손 찾기
//  → ④ 규칙으로 손가락 개수 세기(rules.js) → ⑤ 퀴즈 진행·화면 표시
// ════════════════════════════════════════════════════════════
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import {
  FINGERS,
  HOLD_SECONDS,
  RESTART_SECONDS,
  isFingerOpen,
  countOpenFingers,
  updateHold,
} from "./rules.js";
import { QUESTIONS } from "./questions.js";

// MediaPipe 실행 파일(WebAssembly)과 손 인식 AI 모델의 주소
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const drawer = new DrawingUtils(ctx);
let handLandmarker = null;

// ───────────── ① 카메라 켜기 ─────────────
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("INSECURE");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  // 그림판(canvas) 크기를 영상 크기와 똑같이 맞춰야 점이 제자리에 그려져요
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $("stage").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
}

// ───────────── ② AI 모델 불러오기 ─────────────
async function loadModel() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO", // 사진 한 장이 아니라 연속된 영상 프레임을 처리
    numHands: 1, // 손 하나만 찾기
  });
  try {
    return await HandLandmarker.createFromOptions(vision, options("GPU"));
  } catch (error) {
    console.warn("GPU를 쓸 수 없어 CPU로 실행합니다.", error);
    return await HandLandmarker.createFromOptions(vision, options("CPU"));
  }
}

// ───────────── ③ 매 프레임 손 찾기 ─────────────
let lastVideoTime = -1;
let lastTimestamp = 0;

function loop() {
  if (video.currentTime !== lastVideoTime) {
    // 새 프레임이 들어왔을 때만 처리
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const dt = Math.min((now - lastTimestamp) / 1000, 0.5); // 지난 프레임 이후 흐른 시간(초)
    lastTimestamp = now;

    const result = handLandmarker.detectForVideo(video, now);
    const hand = result.landmarks[0]; // 점 21개짜리 배열 (손이 없으면 undefined)
    drawHand(hand);
    updateQuiz(hand, dt);
  }
  requestAnimationFrame(loop);
}

function drawHand(hand) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!hand) return;
  drawer.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
    color: "rgba(255,255,255,0.85)",
    lineWidth: 3,
  });
  drawer.drawLandmarks(hand, { color: "#2F6BFF", fillColor: "#FFFFFF", lineWidth: 2, radius: 3 });
  // 규칙이 내린 판단을 손끝에 표시: 펴짐 = 초록 / 접힘 = 회색
  for (const finger of FINGERS) {
    const tip = hand[finger.tip];
    ctx.beginPath();
    ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 12, 0, Math.PI * 2);
    ctx.fillStyle = isFingerOpen(hand, finger) ? "#0F9F6E" : "rgba(148,160,176,0.9)";
    ctx.fill();
  }
}

// ───────────── ④⑤ 규칙 적용 → 퀴즈 진행 ─────────────
const newHold = () => ({ count: -1, seconds: 0, glitch: 0 });
const quiz = { index: 0, score: 0, phase: "asking", wait: 0, hold: newHold() };

function updateQuiz(hand, dt) {
  const count = hand ? countOpenFingers(hand) : -1; // -1 = 손이 안 보임
  quiz.hold = updateHold(quiz.hold, count, dt);
  $("fingerBadge").textContent = hand ? `펴진 손가락 ${count}개` : "손을 보여 주세요";

  if (quiz.phase === "asking") {
    const question = QUESTIONS[quiz.index];
    const held = quiz.hold.count;
    const isChoice = held >= 1 && held <= question.choices.length;
    showHolding(isChoice ? held : 0, isChoice ? quiz.hold.seconds / HOLD_SECONDS : 0);
    if (isChoice && quiz.hold.seconds >= HOLD_SECONDS) answer(held);
  } else if (quiz.phase === "result") {
    quiz.wait -= dt;
    if (quiz.wait <= 0) nextQuestion();
  } else if (quiz.phase === "finished") {
    // 주먹(펴진 손가락 0개)을 쥐고 있으면 다시 시작
    if (quiz.hold.count === 0 && quiz.hold.seconds >= RESTART_SECONDS) restart();
  }
}

function answer(choice) {
  const question = QUESTIONS[quiz.index];
  const correct = choice === question.answer;
  if (correct) quiz.score += 1;
  quiz.phase = "result";
  quiz.wait = 2.5; // 결과를 2.5초 동안 보여 주기
  showResult(choice, question.answer, correct);
}

function nextQuestion() {
  quiz.index += 1;
  quiz.hold = newHold();
  if (quiz.index < QUESTIONS.length) {
    quiz.phase = "asking";
    showQuestion();
  } else {
    quiz.phase = "finished";
    showFinished();
  }
}

function restart() {
  Object.assign(quiz, { index: 0, score: 0, phase: "asking", wait: 0, hold: newHold() });
  showQuestion();
}

// ───────────── 화면 그리기 ─────────────
function showQuestion() {
  const question = QUESTIONS[quiz.index];
  $("qNum").textContent = quiz.index + 1;
  $("qTotal").textContent = QUESTIONS.length;
  $("score").textContent = quiz.score;
  $("question").textContent = question.question;
  $("choices").replaceChildren(
    ...question.choices.map((text, i) => {
      const item = document.createElement("li");
      item.className = "choice";
      item.innerHTML = `<span class="fill"></span><span class="num">${i + 1}</span><span class="text"></span>`;
      item.querySelector(".text").textContent = text;
      return item;
    }),
  );
  setMessage("정답 번호만큼 손가락을 펴 보세요");
  $("restartBtn").hidden = true;
}

function showHolding(choice, progress) {
  [...$("choices").children].forEach((item, i) => {
    const active = i + 1 === choice;
    item.classList.toggle("holding", active);
    item.querySelector(".fill").style.width = active ? `${Math.min(progress, 1) * 100}%` : "0%";
  });
}

function showResult(choice, answerNumber, correct) {
  [...$("choices").children].forEach((item, i) => {
    item.classList.remove("holding");
    item.querySelector(".fill").style.width = "0%";
    if (i + 1 === answerNumber) item.classList.add("correct");
    else if (i + 1 === choice) item.classList.add("wrong");
  });
  $("score").textContent = quiz.score;
  if (correct) setMessage("정답이에요! 🎉", "good");
  else setMessage(`아쉬워요. 정답은 ${answerNumber}번이에요.`, "bad");
}

function showFinished() {
  $("question").textContent = `끝! ${QUESTIONS.length}문제 중 ${quiz.score}문제를 맞혔어요`;
  $("choices").replaceChildren();
  setMessage(`✊ 주먹을 ${RESTART_SECONDS}초 동안 쥐면 처음부터 다시 시작해요`);
  $("restartBtn").hidden = false;
}

function setMessage(text, tone = "") {
  $("message").textContent = text;
  $("message").className = `message ${tone}`;
}

// ───────────── 시작 버튼 ─────────────
$("restartBtn").addEventListener("click", restart);
$("startBtn").addEventListener("click", async () => {
  $("startBtn").disabled = true;
  try {
    $("overlayMsg").textContent = "카메라를 켜는 중…";
    await startCamera();
    $("overlayMsg").textContent = "AI 모델을 불러오는 중… (처음에는 몇 초 걸려요)";
    handLandmarker = await loadModel();
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

showQuestion();
