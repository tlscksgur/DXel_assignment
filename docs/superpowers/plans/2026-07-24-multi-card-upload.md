# 여러 명함 업로드 구현 계획

> **자동화 작업자 참고:** 필수 하위 기술로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 이 계획을 작업별로 구현한다. 진행 상황은 체크박스(`- [ ]`) 형식으로 관리한다.

**목표:** 사용자가 여러 명함 이미지를 선택하고 한 장씩 확인하여 저장한 뒤, 대기열의 다음 명함을 자동으로 계속 처리할 수 있게 한다.

**설계:** 기존 단일 이미지 백엔드 엔드포인트를 유지한다. 선택한 `File`, 미리보기 URL, 추출 결과, 서버 이미지 경로 및 처리 상태를 보관하는 브라우저 대기열을 추가한다. 활성 항목만 처리하여 로컬 비전 모델에 요청이 동시에 전달되지 않게 한다.

**기술 구성:** 브라우저 JavaScript, Fetch/FormData, 기존 Express API, Node.js 내장 테스트 러너

---

### 작업 1: 테스트로 대기열 처리 흐름 고정

**파일:**
- 수정: `test/upload-flow.test.js`

- [ ] 파일 두 개를 선택하면 모두 대기열에 표시되고 첫 번째 파일만 분석되는지 확인하는 브라우저 테스트를 추가한다.
- [ ] 첫 번째 준비 완료 명함을 저장하면 두 번째 명함이 활성화되어 분석되는지 확인하는 브라우저 테스트를 추가한다.
- [ ] 활성 대기열 항목을 건너뛰거나 제거하는 브라우저 테스트를 추가한다.
- [ ] `node --test test/upload-flow.test.js`를 실행해 대기열 기능이 없어서 새 테스트가 실패하는지 확인한다.

### 작업 2: 대기열 상태 및 순차 추출 구현

**파일:**
- 수정: `public/js/cardAdd.js`

- [ ] `uploadedImagePath`를 `uploadQueue`, `currentQueueIndex`, `isAnalyzing`으로 교체한다.
- [ ] 선택한 파일을 `waiting`, `processing`, `ready`, `saved`, `error` 상태를 가진 대기열 항목으로 변환한다.
- [ ] 활성 항목만 `/api/cards/extract`를 호출하도록 `renderQueue()`, `showQueueItem()`, `analyzeCurrentCard()`를 추가한다.
- [ ] 같은 파일을 다시 선택할 수 있도록 대기열 추가 후 파일 입력값을 비운다.
- [ ] `node --test test/upload-flow.test.js`를 실행해 추출 및 대기열 테스트가 통과하는지 확인한다.

### 작업 3: 확인 후 다음 대기열 항목으로 이동

**파일:**
- 수정: `public/js/cardAdd.js`

- [ ] `getCardFormData()`에서 활성 대기열 항목의 `image_path`를 읽는다.
- [ ] `submitCard()`가 성공 여부를 반환하게 하고 기존 409 중복 처리 흐름을 유지한다.
- [ ] 저장에 성공하면 활성 항목을 `saved`로 표시하고 다음 미저장 항목으로 이동한다.
- [ ] “다음 명함” 버튼을 확인 후 활성 항목을 건너뛰도록 연결한다.
- [ ] “취소” 버튼을 활성 항목 제거 및 미리보기 URL 해제 동작에 연결한다.
- [ ] 업로드 페이지를 벗어나지 않고 전체 처리 완료 상태를 표시한다.

### 작업 4: 대기열 스타일 적용 및 검증

**파일:**
- 수정: `public/css/cardAdd.css`
- 테스트: `test/upload-flow.test.js`

- [ ] 스크롤 가능한 대기열 목록 스타일, 활성 행 강조 및 상태 색상을 추가한다.
- [ ] `npm test`를 실행해 실패가 없는지 확인한다.
- [ ] `node --check public/js/cardAdd.js`와 `git diff --check`를 실행한다.
- [ ] 파일 두 개 선택, 첫 번째 분석, 저장, 두 번째 분석, 저장, 완료 순서가 정상인지 확인한다.
