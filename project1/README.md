# MediaPipe 학교 앱 예제

구글 **MediaPipe**로 만든 교실용 웹앱 3종입니다. 설치 없이 브라우저에서 바로 동작하고,
카메라 영상은 **컴퓨터 밖으로 보내지 않습니다.** AI 계산이 모두 브라우저 안에서 이루어집니다.

| 앱 | 분야 | 사용한 MediaPipe 기능 | 핵심 원리 |
|---|---|---|---|
| [손가락 퀴즈](finger-quiz/) | 학습 | Hand Landmarker (손의 점 21개) | 거리를 비교해 손가락이 펴졌는지 판단, 유지 시간 재기 |
| [스쿼트 카운터](squat-counter/) | 신체활동 | Pose Landmarker (몸의 점 33개) | 벡터 내적으로 무릎 각도 계산, 상태 기계로 개수 세기 |
| [집중 타이머](focus-timer/) | 자기주도학습 | Face Landmarker (얼굴의 점 478개 + 표정 점수 52개) | 비율로 고개 방향 판단, "몇 초 이상 계속될 때만" 상태 바꾸기 |

## 실행 방법

카메라는 보안 때문에 `http://localhost` 또는 `https://` 주소에서만 켜집니다.
**`index.html`을 더블클릭해서 열면 동작하지 않아요.**

**방법 1: VS Code Live Server (추천)**
1. VS Code 확장(Extensions)에서 **Live Server**를 설치합니다.
2. 이 폴더를 VS Code로 열고, 오른쪽 아래 **Go Live**를 누릅니다.
3. 브라우저에서 앱을 고르고 **카메라 켜고 시작하기** → 카메라 권한 **허용**

**방법 2: 파이썬**
```bash
python -m http.server 5500
```
브라우저에서 <http://localhost:5500> 에 접속합니다.

> 처음 실행할 때 인터넷에서 MediaPipe 실행 파일과 AI 모델(4~8MB)을 내려받습니다.
> 학교 방화벽이 `cdn.jsdelivr.net`, `storage.googleapis.com`을 막고 있으면 동작하지 않으니 전산 담당 선생님께 확인하세요.

## 폴더 구조

```
MediaPipeApp/
├─ index.html              앱 목록
├─ guide/index.html        학생용 학습 자료 (아이디어·원리 실험·만드는 과정·설계 카드)
├─ finger-quiz/            손가락 퀴즈
│  ├─ index.html           화면 (HTML + CSS)
│  ├─ app.js               카메라 → 모델 → 매 프레임 감지 → 화면
│  ├─ rules.js             ★ 규칙: 손가락이 펴졌나? (학생이 고쳐 볼 곳)
│  └─ questions.js         퀴즈 문제 목록 (선생님이 바꿀 곳)
├─ squat-counter/          스쿼트 카운터 (index.html · app.js · rules.js)
├─ focus-timer/            집중 타이머 (index.html · app.js · rules.js)
└─ tests/rules.test.js     규칙 자동 테스트
```

세 앱은 모두 같은 흐름을 따릅니다.

1. 카메라 켜기
2. AI 모델 불러오기
3. 매 프레임마다 랜드마크(점) 찾기
4. **규칙(`rules.js`)으로 점을 의미로 바꾸기**
5. 화면과 소리로 알려 주기

`app.js`는 거의 그대로 두고 `rules.js`의 숫자와 규칙만 바꿔도 새로운 앱을 만들 수 있습니다.
폴더 하나가 앱 하나이므로, 새 앱을 만들 때는 가장 비슷한 폴더를 통째로 복사해서 시작하세요.

## 도전 과제

- **손가락 퀴즈**: 엄지까지 세어 5지선다 만들기 · O/X 퀴즈를 👍/👎 제스처(Gesture Recognizer)로 바꾸기
- **스쿼트 카운터**: 어깨-팔꿈치-손목 각도로 팔굽혀펴기나 덤벨 컬 세기 · 목표를 채우면 음성으로 칭찬하기
- **집중 타이머**: 날짜별 집중 기록을 저장해 그래프로 보여 주기 · 1분당 눈 깜빡임 횟수로 눈 피로 알림 만들기

## 규칙 테스트 (선택)

Node.js가 설치되어 있으면 카메라 없이 규칙을 검사할 수 있습니다.

```bash
npm test
```

## 문제 해결

| 증상 | 해결 방법 |
|---|---|
| "카메라는 localhost 또는 https 주소에서만 켜져요" | 파일을 더블클릭하지 말고 Live Server나 `python -m http.server`로 열기 |
| "카메라 권한이 거부됐어요" | 주소창 왼쪽 아이콘 → 카메라 **허용** → 새로고침 |
| "AI 모델을 불러오지 못했어요" | 인터넷과 방화벽 확인, `F12` → Console 탭에서 오류 확인 |
| 너무 느려요 | 다른 탭과 프로그램 닫기. 그래픽(GPU)을 못 쓰는 컴퓨터는 자동으로 CPU로 실행되어 느릴 수 있어요 |
| 스쿼트를 세지 않아요 | 카메라에 **옆모습**이 보이게 서고, 발끝까지 화면에 나오게 뒤로 물러나기. 게이지로 내 각도를 보고 `rules.js`의 `DOWN_ANGLE`·`UP_ANGLE` 조정 |
| 점은 나오는데 판단이 이상해요 | 조명을 밝게, 카메라와의 거리 조절. 그래도 이상하면 `rules.js`의 기준 숫자를 조정 |

## 사용한 기술

- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/guide) `@mediapipe/tasks-vision@1.0.1` (Apache-2.0)
- HTML · CSS · JavaScript만 사용 (빌드 도구 없음)
