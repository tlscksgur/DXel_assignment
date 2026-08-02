# DXel 명함관리

명함 사진을 업로드하면 로컬 AI가 이름, 회사, 연락처 등의 정보를 추출하고 SQLite 주소록에 저장하는 웹 도구입니다. 외부 AI API를 사용하지 않으며, 최초 설치와 모델 다운로드를 마친 뒤에는 인터넷 연결 없이 사용할 수 있습니다.

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
| 운영체제 | macOS 권장. 현재 사용하는 MLX 모델은 Apple Silicon Mac 환경을 기준으로 함 |
| Node.js | `20.17.0 이상` 또는 `22.9.0 이상` |
| npm | Node.js에 포함된 npm 사용 |
| 로컬 AI | LM Studio와 `qwen3.5-9b-mlx` 모델 |
| 메모리 | 9B 모델 실행을 위해 통합 메모리 16GB 이상 권장 |
| 저장 공간 | 모델 및 패키지 설치를 위한 여유 공간 10GB 이상 권장 |
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
LM_STUDIO_ENDPOINT=http://127.0.0.1:1234/v1/chat/completions
LM_STUDIO_STATUS_URL=http://127.0.0.1:1234/v1/models
LM_STUDIO_MODEL=qwen3.5-9b-mlx
```

## LM Studio 설정

1. LM Studio를 설치합니다.
2. `qwen3.5-9b-mlx` 모델을 내려받아 불러옵니다.
3. LM Studio의 로컬 서버를 실행합니다.
4. 서버 주소가 `http://127.0.0.1:1234`인지 확인합니다.

모델 다운로드에는 인터넷 연결이 필요하지만, 다운로드를 마친 뒤에는 오프라인으로 실행할 수 있습니다. 별도의 외부 API 키는 필요하지 않습니다.

## 실행 방법

LM Studio의 로컬 서버를 먼저 실행한 뒤, 프로젝트 폴더에서 다음 명령어를 실행합니다.

```bash
node server.js
```

터미널에 다음 메시지가 나오면 실행된 것입니다.

```text
SQLite connected
Server running at http://localhost:3000
```

SQLite 데이터베이스 파일 `database/businesscard.db`와 이미지 저장 폴더 `uploads/`는 필요한 경우 자동으로 생성됩니다.

## PC에서 접속하기

브라우저에서 다음 주소로 접속합니다.

<http://localhost:3000>

- 명함 등록: <http://localhost:3000/cardAdd.html>
- 명함관리: <http://localhost:3000/BCM.html>

## 핸드폰에서 접속하기

1. 개발 PC와 핸드폰을 같은 Wi-Fi에 연결합니다.
2. 개발 PC에서 LM Studio와 `node server.js`를 실행합니다.
3. 핸드폰 브라우저에서 다음 주소로 접속합니다.

<http://172.30.3.61:3000>

Wi-Fi가 바뀌면 개발 PC의 IP 주소도 변경될 수 있습니다. macOS에서는 다음 명령어로 현재 Wi-Fi IP를 확인할 수 있습니다.

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

서버를 실행한 터미널에서 `Control + C`를 누르고 LM Studio의 로컬 서버도 중지합니다.

## 문제 해결

### Local AI 상태가 준비되지 않음으로 표시되는 경우

- LM Studio가 실행 중인지 확인합니다.
- `qwen3.5-9b-mlx` 모델이 불러와져 있는지 확인합니다.
- LM Studio 로컬 서버의 포트가 `1234`인지 확인합니다.
- `.env`의 모델명과 LM Studio에 표시된 모델명이 같은지 확인합니다.

### 핸드폰에서 페이지가 열리지 않는 경우

- PC와 핸드폰이 같은 Wi-Fi인지 확인합니다.
- `node server.js`가 실행 중인지 확인합니다.
- PC의 현재 IP 주소가 `172.30.3.61`과 같은지 확인합니다.
- 주소를 `https://`가 아닌 `http://`로 입력했는지 확인합니다.

### 명함 분석이 오래 걸리는 경우

고해상도 사진은 브라우저에서 크기를 줄인 뒤 Local AI로 전달되지만, 개발 PC의 메모리와 모델 상태에 따라 처리 시간이 달라질 수 있습니다. LM Studio에서 다른 요청이 실행 중인지 확인한 뒤 한 장씩 다시 시도합니다.
