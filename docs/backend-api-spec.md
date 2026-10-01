# 명함관리 API 빠른 연동 명세

기준 구현: `server.js`, `auth/routes.js` (2026-10-01)

## 공통

- 기본 주소는 현재 접속한 웹 앱과 같은 origin입니다. 개발 기본값은 `http://localhost:3000`이며, 메일 인증 링크에는 `APP_BASE_URL`이 사용됩니다.
- JSON 요청은 `Content-Type: application/json`, 로그인 상태는 HttpOnly 쿠키 `bcm_session`으로 유지합니다. 브라우저 fetch는 기본 same-origin 쿠키를 사용하세요.
- 변경 요청은 `Origin` 검사에 통과해야 합니다. 로그인·가입·명함 변경을 다른 origin에서 직접 호출하지 마세요.
- 기본 오류 형식: `{ "success": false, "message": "오류 설명" }`. 성공은 각 API 설명을 따릅니다.
- 비로그인 사용자도 활성 명함 전체 정보를 조회할 수 있습니다. 등록·수정·삭제는 인증/권한 규칙에 따릅니다.

## 계정 API

| 메서드 / 경로 | 로그인 | 입력 | 성공 |
|---|---:|---|---|
| `POST /api/auth/signup` | 불필요 | `{displayName,email,password}` | `201 {success,message,user}`; 이메일 인증 메일 발송 |
| `POST /api/auth/verify` | 불필요 | `{token}` | `200 {success,message}` |
| `POST /api/auth/verification/resend` | 불필요 | `{email}` 또는 `{token}` | `202 {success,message}`; 계정 존재 여부 비공개 |
| `POST /api/auth/login` | 불필요 | `{email,password}` | `200 {success,user}` + 세션 쿠키 |
| `POST /api/auth/logout` | 선택 | 없음 | `200 {success,message}` + 쿠키 만료 |
| `GET /api/auth/me` | 선택 | 없음 | `200 {success,user}`; 비로그인은 `user:null` |
| `PATCH /api/auth/profile` | 필요 | `{displayName}` | `200 {success,user}` |
| `PATCH /api/auth/password` | 필요 | `{currentPassword,newPassword}` | `200 {success,message}`; 기존 세션 갱신 |
| `POST /api/auth/password-reset/request` | 불필요 | `{email}` | `202 {success,message}`; 가입 이메일로 링크 발송 |
| `POST /api/auth/password-reset/complete` | 불필요 | `{token,newPassword}` | `200 {success,message}`; 기존 세션 전부 만료 |

- 이름 1~60자, 이메일 최대 254자, 비밀번호 5~128자(UTF-8 최대 512바이트). 이메일 인증·비밀번호 재설정 링크는 30분/1회용입니다.
- 인증 메일 재발송과 비밀번호 재설정은 계정당 60초 제한. 로그인 시도 초과는 `429`입니다.
- 주요 상태 코드: 입력 오류 `400`, 로그인 필요/자격 증명 오류 `401`, 출처·권한 오류 `403`, 중복 이메일 `409`, 메일 설정/발송 사용 불가 `503`.
- 현재 `PATCH /api/auth/password`는 비밀번호 최소 5자를 허용하지만 오류 메시지에는 10자라고 표시되는 문구 불일치가 있습니다.

## 명함 데이터

주요 필드:

```json
{
  "name":"홍길동", "company":"DXel", "department":"개발팀", "position":"과장",
  "mobile":"010-1234-5678", "phone":"02-123-4567", "email":"hong@example.com",
  "address":"서울", "website":"https://example.com",
  "image_path":"/uploads/card.jpg", "logo_path":"/uploads/logo.png",
  "meeting_date":"2026-10-01T09:00", "meeting_place":"서울",
  "meeting_purpose":"미팅", "meeting_note":"후속 연락", "tags":["고객"]
}
```

이름·회사·휴대폰·이메일 중 적어도 하나는 필요합니다. 이메일 여러 개는 줄바꿈으로 전달합니다. 홈페이지에 scheme이 없으면 `https://`를 붙입니다. 목적은 최대 50자, 메모 500자. 허용 태그는 `고객`, `잠재 고객`, `협력사`, `공급업체`, `파트너사`, `내부`, `기타`입니다.

## 명함 API

| 메서드 / 경로 | 인증 / 권한 | 요청 또는 결과 |
|---|---|---|
| `GET /api/status` | 공개 | `{sqlite,localAi}` 상태 |
| `GET /api/cards?q=검색어` | 공개 | 전체 활성 명함 최신순. `q`/`keyword`는 이름·회사·전화·이메일·태그 검색 |
| `GET /api/cards?trash=1` | 로그인, 본인 것만 | 내 휴지통 |
| `GET /api/cards/:id` | 공개 | `{success,card}` 활성 명함 상세 |
| `GET /api/cardSelect` | 공개 | 활성 명함 전체 목록(레거시 별칭; `/api/cards` 권장) |
| `GET /api/cards/duplicates?...` | 공개 | 명함 필드 query로 중복 후보 조회; `excludeId` 선택 |
| `POST /api/cards` | 로그인 | 명함 JSON 저장; 성공 `201 {success,message,id}` |
| `POST /api/cardStorage` | 로그인 | `/api/cards`와 같은 레거시 주소; 신규 연동은 `/api/cards` 사용 |
| `PUT /api/cards/:id` | 로그인, 등록자만 | 명함 필드 수정; 중복이면 기본 `409`, 허용 시 `allowDuplicate:true` |
| `PATCH /api/cards/:id/favorite` | 로그인 | `{isFavorite:boolean}`; 로그인 사용자 개인 즐겨찾기 |
| `PATCH /api/cards/groups` | 로그인 | `{cardIds:[...],groupName:"그룹"}`; 빈 이름은 그룹 해제, 최대 40자 |
| `GET /api/cards/groups` | 로그인 | 내 그룹명 목록 `{success,groups}` |
| `PATCH /api/cards/:id/tags` | 로그인, 등록자만 | `{tags:[...]}`; 태그 전체 교체 |
| `POST /api/cards/import/preview` | 로그인 | `{cards:[...]}`; 최대 500개, 유효성·중복 미리보기 |
| `POST /api/cards/import` | 로그인 | `{cards:[...],duplicateAction:"add"}`; 그 외 duplicateAction은 중복 건너뜀 |
| `POST /api/cards/merge-group` | 로그인, 모두 등록자 본인 | `{cardIds:[두 개 이상]}`; 중복 행 병합 후 삭제 |
| `POST /api/cards/:id/merge` | 로그인, 등록자만 | 명함 JSON; 비어 있지 않은 입력 필드를 기존 정보에 반영 |
| `DELETE /api/cards/:id` | 로그인, 등록자만 | 명함을 휴지통으로 이동 |
| `POST /api/cards/bulk-delete` | 로그인, 모두 등록자 본인 | `{cardIds:[...]}`; 휴지통 이동 |
| `PATCH /api/cards/:id/restore` | 로그인, 등록자만 | 휴지통 명함 복원 |
| `POST /api/cards/bulk-restore` | 로그인, 모두 등록자 본인 | `{cardIds:[...]}`; 휴지통 명함 복원 |
| `DELETE /api/cards/:id/permanent` | 로그인, 등록자만 | 휴지통 명함 영구 삭제 |
| `POST /api/cards/bulk-permanent-delete` | 로그인, 모두 등록자 본인 | `{cardIds:[...]}`; 휴지통 항목 영구 삭제 |
| `GET /api/cards/export/csv?ids=1,2` | 로그인 | 선택 또는 전체 활성 주소록 CSV 다운로드 |
| `GET /api/cards/export/vcard?ids=1,2` | 로그인 | 선택 또는 전체 활성 주소록 vCard 다운로드 |

### 빠른 호출 예시

```js
const response = await fetch("/api/cards/123/favorite", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ isFavorite: true })
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
```

### 조회 데이터 모양

```json
{"success":true,"cards":[{"id":123,"name":"홍길동","tags":"[\"고객\"]","can_edit":1,"can_manage_personal":1,"is_favorite":0,"group_name":""}]}
```

카드 응답은 명함 필드와 `created_at`, `deleted_at`을 포함합니다. `tags`는 JSON 배열이 아니라 JSON 문자열입니다. `can_edit`, `can_manage_personal`, `is_favorite`는 정수 `0`/`1`; 즐겨찾기와 `group_name`은 현재 로그인 사용자 기준입니다. 현재 목록은 페이지네이션 없이 전체를 반환합니다.

중복 기준: 정규화된 휴대폰 번호가 겹치거나 이름과 회사가 모두 일치. `POST /api/cards` 및 `PUT`의 중복 응답은 `409`와 `duplicates:[{id,name,company,mobile,phone,email}]`입니다.

불러오기 응답 예: `201 {success:true,savedCount:1,savedIds:[123],skipped:[{index:1,reason:"기존 명함과 중복"}]}`. 불러오기 API는 현재 태그를 저장하지 않고, `groupName`은 로그인 사용자 개인 그룹으로 저장합니다.

## 이미지 분석 및 크롭

업로드는 `multipart/form-data`의 `image` 필드, JPEG/PNG/WebP/GIF, 최대 10 MiB입니다.

1. `POST /api/cards/extract`에 명함 이미지 업로드 (로그인 필요).
2. 응답 `extracted`를 입력 폼에 채우고, `cropBounds`/`logoBounds`로 브라우저 canvas에서 원본 이미지의 명함과 로고를 자릅니다.
3. 크롭된 명함은 `POST /api/cards/cropped-image`에 `image`와 `originalPath=<extract 응답 file.path>`로 업로드합니다.
4. 크롭된 로고는 `POST /api/cards/logo-image`에 `image`로 업로드합니다. 두 업로드 응답의 `file.path`를 명함 저장에 사용합니다.

분석 응답 핵심:

```json
{
  "success":true,
  "file":{"originalName":"card.jpg","filename":"...jpg","path":"/uploads/...jpg","size":12345},
  "cropBounds":{"x":0.1,"y":0.2,"width":0.8,"height":0.5},
  "logoBounds":{"x":0.65,"y":0.25,"width":0.18,"height":0.12},
  "uprightRotation":90,
  "extracted":{"name":"홍길동","company":"DXel","department":"","position":"","mobile":"","phone":"","email":"","address":"","website":""}
}
```

좌표는 원본 업로드 이미지 기준 0~1 비율이며, 회전 적용 후 좌표가 아닙니다. `uprightRotation`은 글씨를 바로 세우는 시계 방향 회전 각도(0/90/180/270)입니다. 영역을 못 찾으면 bounds는 `null`입니다. `temporary=true` 분석은 서버 이미지를 지우며 크롭 연결도 남기지 않습니다. 일반 분석 후 크롭 원본 연결은 사용자별로 30분간 유효하고 한 번만 쓸 수 있습니다.

`POST /api/cards/extract`는 명함이 아니면 `422`, AI 분석 실패면 `502`. 파일 누락은 `400`, 크기/MIME 거부는 현재 공통 오류 처리에 따라 `500`으로 올 수 있고, 크롭 원본 권한 오류는 `403`입니다.

## 권한·주의사항

- 그룹과 즐겨찾기는 로그인 사용자 개인 데이터라 다른 사용자의 화면에는 보이지 않습니다. 다른 사용자가 등록한 활성 명함에도 개인 그룹/즐겨찾기를 지정할 수 있습니다.
- 등록자 정보가 없는 과거 명함은 수정/삭제 권한자가 없습니다.
- 그룹 병합은 최신 명함을 대표로 하고 비어 있는 필드만 다른 행에서 채우지만, 나머지 행은 실제 삭제합니다. 중복 행의 태그·그룹·즐겨찾기는 합쳐지지 않아 사라질 수 있습니다.
- 조회와 내보내기는 전체 활성 명함 기준입니다. 로그인 사용자는 CSV/vCard로 모든 활성 명함을 내보낼 수 있습니다.
- `APP_BASE_URL`을 실제 서비스 주소로 설정해야 합니다. 운영 시 HTTPS가 필수이며 SMTP 설정도 필요합니다. DB와 `uploads/`는 영속 저장해야 합니다.
- 로그인 실패 제한 및 크롭 원본 연결 일부는 프로세스 메모리에 있어 현재 구성은 여러 서버 인스턴스 확장에 적합하지 않습니다.

## 코드 위치

- API: `server.js`, `auth/routes.js`
- 인증/권한: `auth/card-access.js`, `auth/security.js`, `auth/password-reset.js`
- 업로드: `upload.js`
- DB 스키마: `database/schema.js`
