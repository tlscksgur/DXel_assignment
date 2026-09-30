# DXel 명함관리

명함 사진을 업로드하면 사내 AI 서버가 이름, 회사, 연락처 등의 정보를 추출하고 SQLite 주소록에 저장하는 웹 도구입니다. 외부 AI API를 사용하지 않으며 사내망에서 동작합니다.

## 주요 기능

- 휴대폰 촬영 및 데스크톱 이미지 업로드
- 여러 명함의 순차 분석
- 이름, 회사, 부서, 직책, 휴대폰, 유선전화, 이메일, 주소, 홈페이지 추출
- 추출 결과 확인 및 수정 후 저장
- 이름·회사 검색, 중복 확인, 수정 및 삭제
- 한글이 깨지지 않는 CSV 내보내기

## 요구 사양

| 구분 | 요구 사항 |
| --- | --- |
| 운영체제 | macOS 권장 |
| Node.js | `20.17.0 이상` 또는 `22.9.0 이상` |
| npm | Node.js에 포함된 npm 사용 |
| AI 서버 | 사내 AI 서버와 `unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_M` 모델 |
| 네트워크 | 개발 PC에서 사내 AI 서버에 접속할 수 있어야 함 |
| 저장 공간 | Node.js 패키지와 업로드 이미지를 저장할 여유 공간 필요 |
| 브라우저 | 최신 Chrome 또는 Safari |
| 휴대폰 접속 | 개발 PC와 휴대폰이 같은 Wi-Fi에 연결되어 있어야 함 |

SQLite는 npm 패키지로 설치되므로 별도로 설치할 필요가 없습니다.

## 설치 방법

### 1. 저장소 내려받기

```bash
git clone https://github.com/tlscksgur/DXel_assignment.git
cd DXel_assignment
```

이미 소스 코드를 내려받았다면 프로젝트 폴더에서 다음 단계부터 진행합니다.

### 2. Node.js 패키지 설치

```bash
npm install
```

### 3. 환경변수 설정

프로젝트 최상위 폴더에 `.env` 파일을 만들고 다음 내용을 입력합니다.

```env
PORT=3000
AI_SERVER_ENDPOINT=http://<AI_SERVER_IP>:<PORT>/v1/chat/completions
AI_SERVER_STATUS_URL=http://<AI_SERVER_IP>:<PORT>/health
AI_SERVER_MODEL=unsloth/Qwen3.8-27B-GGUF
AI_REQUEST_TIMEOUT_MS=300000
APP_BASE_URL=http://localhost:3000

# 로컬 개발 중에는 비워 둬도 됩니다. 계정 메일 기능을 쓸 때 회사 SMTP 값을 설정합니다.
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
```

`<AI_SERVER_IP>`와 `<PORT>`에는 실제 사내 AI 서버의 주소와 포트를 입력합니다. 실제 서버 주소나 인증 정보가 포함된 `.env` 파일은 Git에 커밋하지 않습니다. 현재 사내 AI 서버는 별도의 API 키 없이 접속하도록 설정되어 있습니다.

## 계정 기능 및 회사 서버 설정

- 누구나 이름·이메일·비밀번호로 가입할 수 있습니다. 이메일 인증을 마치면 로그인할 수 있고, 인증 링크는 30분 동안 유효합니다. 인증 메일이 오지 않거나 링크가 만료되면 인증 화면에서 다시 요청할 수 있습니다.
- 비밀번호를 잊었을 때 가입한 이메일로 1회용 재설정 링크를 보냅니다. 링크는 30분 후 만료됩니다.
- 로그인하지 않아도 활성 명함의 전체 정보와 사진을 볼 수 있습니다. 명함 등록·가져오기·내보내기는 로그인해야 하며, 명함 수정·태그 변경·삭제는 등록자만 할 수 있습니다. 그룹과 즐겨찾기는 로그인 계정마다 따로 저장됩니다.
- 운영 서버에서는 `NODE_ENV=production`, `APP_BASE_URL=https://<서비스 주소>`와 회사 SMTP의 `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`을 설정해야 합니다. 운영 모드 서버는 HTTPS 주소와 SMTP가 빠져 있으면 시작하지 않습니다. 비밀번호가 포함된 `.env`는 저장소에 올리지 마세요.
- 회사 SMTP에 실제로 연결해 가입 인증 메일과 비밀번호 재설정 메일을 주고받기 전에는 계정 기능이 운영 준비를 마친 것으로 보지 마세요. `.env.example`에는 변수 이름만 있습니다.
- 기존 계정이 없는 예전 명함은 등록자가 지정되지 않은 상태로 보존되며, 누구도 수정하거나 삭제할 수 없습니다. 테스트 명함을 운영 주소록에 남기지 않으려면 운영 DB를 준비할 때 기존 `database/businesscard.db`를 그대로 복사하지 말고, 필요한 경우 별도로 보관한 뒤 새 DB로 시작하세요. 앱은 기존 명함이나 DB를 자동 삭제하지 않습니다.
- 로그인 실패 및 인증 메일 재요청 제한은 현재 Node 프로세스 메모리에 일부 저장됩니다. 운영에서는 Node 서버를 단일 프로세스로 실행하고, 여러 프로세스나 서버로 확장하기 전에 공유 저장소 기반 제한으로 바꾸세요.

## 사내 AI 서버 실행

### 1. 맥에서 회사 AI 서버에 SSH 접속

```bash
ssh <SSH_USER>@<AI_SERVER_IP>
```

### 2. AI 서버에서 Qwen API 서버 실행

```bash
llama serve -hf unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_M --host 0.0.0.0 --port 8080
```

모델을 새로 다운로드하지 않고 서버 캐시에 저장된 모델을 불러옵니다. 다음 메시지가 나오면 준비된 것입니다.

```text
model loaded
listening on http://0.0.0.0:8080
```

이 터미널은 끄지 않고 그대로 둡니다. `Control + C`를 누르면 AI 서버가 종료됩니다.

### 3. 맥에서 새 터미널을 열고 연결 확인

```bash
curl http://<AI_SERVER_IP>:<PORT>/health
```

다음 응답이 나오면 정상입니다.

```json
{"status":"ok"}
```

## 실행 방법

사내 AI 서버가 실행 중인지 확인한 뒤 프로젝트 폴더에서 다음 명령어를 실행합니다.

```bash
npm start
```

터미널에 다음 메시지가 나오면 실행된 것입니다.

```text
SQLite connected
Server running at http://localhost:3000
```

SQLite 데이터베이스 파일 `database/businesscard.db`와 이미지 저장 폴더 `uploads/`는 필요한 경우 자동으로 생성됩니다.

## 회사 서버 배포 시 데이터 보존

`database/businesscard.db`와 `uploads/`는 Git에 포함되지 않는 운영 데이터입니다. 새 서버에 코드를 내려받는 것만으로 기존 명함과 이미지는 옮겨지지 않습니다. 서버의 재배포·재시작 후에도 두 경로가 유지되도록 설정하고, 두 경로를 같은 시점에 정기 백업하세요.

일관된 백업을 만들려면 웹 서버의 명함 쓰기를 중지한 뒤 DB 파일과 `uploads/` 전체를 함께 복사하고, 복사가 끝나면 서버를 다시 시작합니다. 복원할 때도 웹 서버를 중지하고 **같은 백업 시점의 DB와 이미지 폴더를 함께** 복원한 뒤 시작하세요. 백업은 서버와 다른 접근 제한 저장소에 보관하고, 실제 복원 시험으로 이미지와 명함 데이터가 함께 열리는지 확인해야 합니다. Git 커밋은 운영 데이터의 백업 수단이 아닙니다.

AI 서버가 응답하지 않을 때 분석 요청은 기본 5분 후 중단됩니다. 필요하면 `.env`의 `AI_REQUEST_TIMEOUT_MS`를 밀리초 단위로 조정할 수 있습니다.

## PC에서 접속하기

브라우저에서 다음 주소로 접속합니다.

<http://localhost:3000>

- 명함 등록: <http://localhost:3000/cardAdd.html>
- 명함관리: <http://localhost:3000/BCM.html>

## 핸드폰에서 접속하기

1. 개발 PC와 핸드폰을 같은 Wi-Fi에 연결합니다.
2. 사내 AI 서버를 실행하고 개발 PC에서 `npm start`를 실행합니다.
3. 핸드폰 브라우저에서 다음 주소로 접속합니다.

<http://172.30.3.61:3000>

Wi-Fi가 바뀌면 개발 PC의 IP 주소도 변경될 수 있습니다. macOS에서는 다음 명령어로 현재 Wi-Fi IP를 확인할 수 있습니다.

휴대폰에서 로그인·회원가입을 시험하려면 `.env`의 `APP_BASE_URL`도 휴대폰이 접속하는 주소와 똑같이 맞춘 뒤 서버를 다시 시작하세요. 예: `APP_BASE_URL=http://172.30.3.61:3000`. 이때 인증 메일을 받으려면 SMTP 설정도 필요합니다.

```bash
ipconfig getifaddr en0
```

IP가 변경됐다면 `http://현재-IP:3000` 형식으로 접속합니다. 휴대폰에서는 HTTPS가 아니라 `http://`로 입력합니다.

## 테스트 방법

전체 자동화 테스트를 실행합니다.

```bash
npm test
```

## 종료 방법

웹 서버를 실행한 터미널에서 `Control + C`를 누릅니다. AI 서버도 종료하려면 SSH 터미널에서 `Control + C`를 누릅니다.

## 문제 해결

### Local AI 상태가 준비되지 않음으로 표시되는 경우

- SSH 터미널에서 Qwen API 서버가 실행 중인지 확인합니다.
- `curl http://<AI_SERVER_IP>:<PORT>/health`가 `{"status":"ok"}`를 반환하는지 확인합니다.
- AI 서버 실행 포트와 `.env`에 적힌 포트가 같은지 확인합니다.
- `.env`의 모델명이 `unsloth/Qwen3.8-27B-GGUF`인지 확인합니다.

### 핸드폰에서 페이지가 열리지 않는 경우

- PC와 핸드폰이 같은 Wi-Fi인지 확인합니다.
- `npm start`가 실행 중인지 확인합니다.
- PC의 현재 IP 주소가 `172.30.3.61`과 같은지 확인합니다.
- 주소를 `https://`가 아닌 `http://`로 입력했는지 확인합니다.

### 명함 분석이 오래 걸리는 경우

고해상도 사진은 브라우저에서 크기를 줄인 뒤 사내 AI 서버로 전달됩니다. AI 서버에서 다른 요청이 실행 중인지 확인한 뒤 한 장씩 다시 시도합니다.
