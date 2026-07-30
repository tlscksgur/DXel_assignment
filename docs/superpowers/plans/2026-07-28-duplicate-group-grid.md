# 중복 그룹 그리드 구현 계획

> **자동화 작업자 참고:** 필수 하위 기술로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 이 계획을 작업별로 구현한다. 진행 상황은 체크박스(`- [ ]`) 형식으로 관리한다.

**목표:** 중복 후보 그룹을 가운데에서 시작해 한 줄에 최대 3개씩 배치한다.

**설계:** 기존 HTML 생성 로직은 유지하고 `duplicateMode` 컨테이너를 가운데 정렬된 `flex-wrap` 레이아웃으로 변경한다. 그룹 너비를 400px로 유지해 1280px 컨테이너에는 최대 3개가 들어가며, 나머지는 다음 줄로 자동 배치한다.

**기술 구성:** HTML, CSS, Node.js 내장 테스트 러너

---

### 작업 1: 반응형 중복 그룹 배치

**파일:**
- 수정: `test/card-management.test.js`
- 수정: `public/css/BCM.css`

- [ ] **단계 1: 실패하는 CSS 회귀 테스트 작성**

`duplicateMode`가 가운데 정렬된 flex-wrap이고 그룹 기준 너비가 400px인지 정규식으로 검사한다.

- [ ] **단계 2: 테스트가 올바르게 실패하는지 확인**

실행: `node --test test/card-management.test.js`

예상 결과: 기존 고정 열 그리드 때문에 가운데에서 시작하는 `flex-wrap` 테스트가 실패한다.

- [ ] **단계 3: 최소 CSS 구현**

`.bcmBoard.duplicateMode`를 가운데 정렬된 flex-wrap으로 바꾼다. `.duplicateGroup`은 400px 기준 너비와 100% 최대 너비를 사용하며 기존 카드 크기는 유지한다.

- [ ] **단계 4: 전체 테스트 실행**

실행: `npm test`

예상 결과: 모든 테스트가 통과한다.

- [ ] **단계 5: 정적 검증**

실행: `git diff --check`

예상 결과: 공백 오류가 없다.
