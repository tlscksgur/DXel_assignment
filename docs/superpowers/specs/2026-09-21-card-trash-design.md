# 명함 휴지통 설계

## 목표

실수로 삭제한 명함을 복원할 수 있도록 일반 삭제를 휴지통 이동으로 바꾸고, 휴지통에서 복원 또는 영구 삭제할 수 있게 한다.

## 동작

- `business_cards.deleted_at`에 삭제 시각을 기록한 명함은 휴지통 명함이다.
- 일반 목록, 검색, 그룹, 중복 판정과 내보내기는 `deleted_at IS NULL`인 명함만 사용한다.
- 헤더의 휴지통 버튼은 휴지통 페이지로 이동하며 삭제된 명함 수를 표시한다.
- 휴지통 페이지는 삭제된 명함을 보여 주고, 각 명함과 선택한 여러 명함을 복원하거나 영구 삭제할 수 있다.
- 영구 삭제는 되돌릴 수 없음을 명시한 브라우저 확인 후 실행한다.

## API

- `GET /api/cards?trash=1`: 휴지통 명함 목록.
- `PATCH /api/cards/:id/restore`: 명함 한 장 복원.
- `POST /api/cards/bulk-restore`: 선택 명함 복원.
- 기존 `DELETE /api/cards/:id`, `POST /api/cards/bulk-delete`: 실제 행 삭제 대신 `deleted_at`을 기록.
- `DELETE /api/cards/:id/permanent`, `POST /api/cards/bulk-permanent-delete`: 실제 행 영구 삭제.

## 범위

기존 명함 상세 화면의 삭제는 휴지통 이동으로 문구를 수정한다. 휴지통은 별도 페이지로 두어 일반 명함관리의 검색·선택 UI를 복잡하게 만들지 않는다.
