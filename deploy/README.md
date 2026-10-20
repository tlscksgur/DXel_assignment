# Ubuntu 서버 배포

요청한 경로는 철자·대소문자를 포함해 `/businessCard/`입니다. 연결 구조는 외부 `61.39.70.66:7777` → Nginx 7777 → 명함 Node 127.0.0.1:3000입니다. 다른 웹은 같은 Nginx server 블록 안에 별도 location과 내부 포트로 추가할 수 있습니다. 두 프로그램을 모두 7777로 실행하지 마세요.

## 코드·환경 설정

서버 `/data/chshin/cksgur/DXel_assignment`에서 최신 코드를 받고 `npm ci`를 실행합니다. 기존 DB와 uploads는 유지합니다. Git에는 운영 DB·이미지·.env가 포함되지 않으므로 별도 백업이 필요합니다.

`.env`가 없는 경우 `deploy/ubuntu.env.example`을 `.env`로 복사하고 권한을 `chmod 600 .env`로 제한합니다. 기존 파일이 있다면 덮어쓰지 말고 편집합니다. SMTP_USER, SMTP_PASSWORD, MAIL_FROM은 실제 발신 계정 값으로 채웁니다. 비밀번호에 # 등이 있으면 dotenv 규칙에 따라 따옴표로 감쌉니다. AI_SERVER_MODEL도 현재 AI 서버 모델과 일치시킵니다.

`APP_BASE_URL`은 메일 수신자가 접속할 공개 주소입니다. `/businessCard`를 포함해야 하며 내부 IP나 localhost를 사용하지 않습니다. 이 값의 경로로 앱의 모든 페이지·API 경로를 정합니다. 환경 변수를 바꾼 후에는 Node 서비스를 재시작해야 합니다. 기존 메일 링크는 바뀌지 않으므로 다시 발송해야 합니다.

내부 IP로도 직접 로그인하려면 `APP_ALLOWED_ORIGINS=http://192.168.210.10:7777`을 설정합니다. 추가 주소는 쉼표로 구분하고 경로는 넣지 않습니다. 명시하지 않은 다른 출처는 계정 API에서 차단됩니다. 내부에서 가입해도 인증 메일은 APP_BASE_URL의 공개 주소로 생성됩니다. HTTPS 운영에서는 내부 접속도 HTTPS로 맞춰야 Secure 쿠키를 사용할 수 있습니다.

예시 env와 Nginx 설정은 HTTP 연결 점검용입니다. 실제 비밀번호·명함을 운영하기 전 회사의 인증서와 HTTPS 접속 주소를 준비하세요. Nginx의 7777 리스너에 TLS를 연결하고 APP_BASE_URL을 그 HTTPS 주소로 바꾼 뒤 NODE_ENV=production으로 설정합니다. 운영 모드는 HTTPS와 SMTP가 없으면 시작하지 않습니다. TRUST_PROXY=loopback은 같은 서버의 Nginx만 신뢰합니다. Node는 HOST=127.0.0.1로 외부 직접 접속을 막습니다.

## 지속 실행과 경로 분리

전체 명함을 관리할 계정은 서버 `.env`에 `CARD_ADMIN_EMAIL=chshin@dxel.co.kr`로 지정하고 명함 Node 서버를 재시작합니다. 설정된 이메일로 인증·로그인한 계정만 다른 등록자의 명함 수정, 태그 변경, 삭제, 휴지통 조회·복원·완전 삭제를 수행합니다. 비워 두면 기존처럼 등록자 본인만 변경할 수 있습니다. 개인 즐겨찾기와 그룹은 관리자에게도 다른 사용자의 설정을 보여주지 않습니다. 가입·프로필 화면에서 관리자 권한을 요청할 수 없으며, 서버 설정 파일 편집 권한을 제한해야 합니다.

1. 현재 터미널의 `PORT=7777 npm start`를 Ctrl+C로 종료합니다. 원격 데스크톱 로그아웃과 구분하세요.
2. `command -v node`로 Node 절대 경로를 확인하고 `deploy/businesscard.service`의 ExecStart가 그 경로를 가리키도록 맞춥니다. 가상환경에만 Node가 설치된 경우에도 실제 절대 경로가 필요합니다.
3. 아래 명령으로 서비스를 등록합니다.

```bash
sudo cp deploy/businesscard.service /etc/systemd/system/businesscard.service
sudo systemctl daemon-reload
sudo systemctl enable --now businesscard
sudo systemctl status businesscard --no-pager
curl -I http://127.0.0.1:3000/businessCard/
```

4. Nginx가 이미 설치되어 있으면 `sudo nginx -T`로 기존 7777 리스너·location을 먼저 확인합니다. 기존 설정을 덮어쓰거나 중복 리스너를 만들지 마세요. Nginx가 없으면 운영자 권한으로 설치합니다. 기존 웹이 없는 신규 구성에서는 다음을 실행합니다.

```bash
sudo cp deploy/nginx-businesscard.conf /etc/nginx/sites-available/businesscard
sudo ln -s /etc/nginx/sites-available/businesscard /etc/nginx/sites-enabled/businesscard
sudo nginx -t
sudo systemctl reload nginx
curl -I http://192.168.210.10:7777/businessCard/
```

TLS를 구성했다면 위 점검 URL도 HTTPS로 바꿉니다. 외부 포트 포워딩 대상은 계속 내부 서버 7777이며, 공유기 설정 변경은 필요하지 않습니다. 휴대폰 Wi-Fi를 끄고 외부 주소도 확인하세요.

5. 인증 메일의 링크가 공개 주소 + `/businessCard/verify-email.html?token=...`인지, 비밀번호 재설정은 `/businessCard/reset-password.html?token=...`인지 확인합니다. 가입 인증·재전송·로그인·재설정·명함 이미지·업로드·CSV/vCard·프로필·로그아웃을 확인합니다.

운영 로그는 `sudo journalctl -u businesscard -n 100 --no-pager`로 확인합니다. SMTP 비밀번호나 인증 링크의 토큰을 공유하지 마세요. 재배포는 코드 업데이트와 `npm ci` 후 `sudo systemctl restart businesscard`로 반영합니다. 원격 창을 닫아도 systemd 서비스는 유지되고 서버 재부팅 후 자동 실행됩니다.
