# 모바일 반응형 구현 계획

> **자동화 작업자 참고:** 필수 하위 기술로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 이 계획을 작업별로 구현한다. 진행 상황은 체크박스(`- [ ]`) 형식으로 관리한다.

**목표:** 휴대폰에서 홈, 명함 등록, 명함관리 화면을 정상적으로 사용할 수 있는 반응형 레이아웃을 만든다.

**설계:** 기존 HTML과 JavaScript는 유지하고 공통 CSS와 페이지별 CSS에 미디어 쿼리를 추가한다. 900px에서는 큰 레이아웃을 한 열로 전환하고 680px에서는 모바일 간격과 폼 배치를 적용한다.

**기술 구성:** HTML, CSS, Node.js 내장 테스트 러너

---

### 작업 1: 반응형 요구사항 고정

**파일:**
- 생성: `test/responsive-layout.test.js`

- [ ] 모바일 viewport 설정과 CSS 미디어 쿼리를 검사하는 실패 테스트를 작성한다.
- [ ] `node --test test/responsive-layout.test.js`를 실행해 미디어 쿼리 부재로 실패하는지 확인한다.

### 작업 2: 공통 화면 반응형

**파일:**
- 수정: `public/css/style.css`

- [ ] 900px 이하에서 공통 간격을 줄인다.
- [ ] 680px 이하에서 헤더를 줄바꿈하고 홈 카드와 푸터를 모바일 너비로 바꾼다.

### 작업 3: 명함 등록 및 관리 반응형

**파일:**
- 수정: `public/css/cardAdd.css`
- 수정: `public/css/BCM.css`

- [ ] 등록 화면을 900px 이하에서 한 열로 변경한다.
- [ ] 등록 폼을 680px 이하에서 한 열로 변경한다.
- [ ] BCM 검색 도구와 중복 그룹이 모바일 너비에 맞도록 조정한다.

### 작업 4: 검증

**파일:**
- 테스트: `test/responsive-layout.test.js`
- 테스트: `test/card-management.test.js`
- 테스트: `test/upload-flow.test.js`

- [ ] `npm test`를 실행해 전체 테스트가 통과하는지 확인한다.
- [ ] `git diff --check`로 CSS 공백 오류를 확인한다.
