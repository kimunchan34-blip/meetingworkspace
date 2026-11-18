# 모아 회의록 관리

회의 기록 부터 실행까지 관리

Firebase Hosting과 Cloud Firestore를 사용하는 회의록 관리 시스템입니다.

GitHub Pages 서비스 주소는 https://kimunchan34-blip.github.io/meetingworkspace/ 입니다. Firebase Hosting 주소는 https://meetingworkspace-53ce4.web.app 입니다. 초기 화면에서 접속 비밀번호 4자리를 입력하면 PC와 모바일에서 같은 공용 회의록을 조회할 수 있습니다. Firestore 보안 규칙에서 접속 계정의 소유 권한을 확인합니다.

접속 비밀번호는 관리자에게 안내받습니다. 브라우저 세션 동안 접속을 유지하며, 로그아웃은 화면 왼쪽 하단에서 할 수 있습니다.

Firebase 프로젝트 ID는 `meetingworkspace-53ce4`이며 Firestore 위치는 서울 `asia-northeast3`입니다. 기본 카테고리는 첫 로그인 시 생성합니다.

로컬 미리보기는 Node.js 24 이상에서 실행합니다.

```powershell
npm start
```

브라우저에서 http://localhost:3000 에 접속합니다. `실행.cmd`를 더블클릭해 실행할 수도 있습니다. 로컬 미리보기도 같은 Firebase 프로젝트에 연결됩니다.

## 기능

- 추진반 회의, 부서내부 회의, P-DX 회의, PI 데이터거버넌스, PI 데이터레이크하우스, PI MDM, PI ODM 기본 카테고리
- 카테고리 추가, 이름 및 색상 수정, 삭제
- 회의 제목, 시작·종료 일시, 참석자, 논의 사항, Action Item, 기타 내용 등록과 수정
- Action Item 담당자, 마감일, 완료 상태 관리
- 회의 목록과 상세 조회, 통합 검색, 카테고리 및 기간 필터, 정렬과 페이지 이동
- Cloud Firestore 영구 저장 및 다른 기기의 변경 내용 실시간 반영
- 접속 비밀번호 입력과 공용 워크스페이스 접근 권한
- 동시 수정 충돌 확인
- 카테고리별 산출물명·URL 등록, 상세 조회, 수정 및 삭제
- 산출물 등록 창에서 입력 항목을 추가·삭제하고 같은 카테고리에 최대 50건을 한 번에 등록 (전체 항목을 함께 저장하며, 오류가 있으면 입력 내용을 유지)
- 산출물 내용·URL·카테고리 검색, 카테고리 필터, 최근 수정순 정렬과 페이지 이동
- 목록과 상세 화면에서 산출물 URL을 클릭하여 새 탭으로 열기 (http/https 지원)

회의 시간은 입력한 로컬 시간을 기준으로 저장합니다. 회의록이나 산출물이 등록된 카테고리는 해당 자료의 카테고리를 먼저 변경한 후 삭제할 수 있습니다. 인터넷 연결이 있어야 저장할 수 있으며, 저장 실패 시 입력 창을 유지합니다. 산출물 삭제는 등록 정보만 삭제하며 URL에 연결된 원본 자료는 유지합니다.

## 데이터 보관

공용 접속 계정의 회의록은 Firestore의 `users/{uid}/meetings`에, 산출물은 `users/{uid}/artifacts`에, 카테고리와 일련번호는 `users/{uid}/workspace/config`에 저장됩니다. 기존 워크스페이스도 산출물을 바로 추가할 수 있습니다. 기존 `data/meetings.db`는 이전 로컬 데이터이며 클라우드 버전에서 사용하지 않습니다. 전환 당시 등록된 회의록은 0건입니다.

## Firebase 설정과 배포

Firebase 콘솔 Authentication에서 이메일/비밀번호 로그인 제공자를 사용 설정합니다. 인증 승인 도메인에 `kimunchan34-blip.github.io`, `meetingworkspace-53ce4.web.app`, `meetingworkspace-53ce4.firebaseapp.com`과 로컬 미리보기를 위한 `localhost`를 등록합니다.

## GitHub Pages 배포

저장소는 https://github.com/kimunchan34-blip/meetingworkspace 입니다. `main` 브랜치의 `public` 폴더가 변경되면 GitHub Actions에서 JavaScript 문법을 검사한 후 GitHub Pages에 자동 배포합니다. 저장소 Settings → Pages의 배포 소스는 GitHub Actions로 설정합니다.

`public/firebase-config.js`에는 공개 웹 앱 설정만 저장합니다. 서비스 계정 키나 OAuth 토큰을 넣지 마세요.

```powershell
npx firebase-tools login
npx firebase-tools deploy --only firestore,hosting --project meetingworkspace-53ce4
```

회사 인증서를 사용하는 환경에서는 Node.js의 시스템 인증서 저장소를 적용한 후 실행할 수 있습니다.

```powershell
$env:NODE_USE_SYSTEM_CA='1'
```

## 확인

```powershell
npm run check
npm test
```

다른 포트를 사용할 때는 `$env:PORT=3001`을 설정한 후 실행합니다.
