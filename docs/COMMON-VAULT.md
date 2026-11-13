# 지원한눈 · Cloudflare 공통 계정 / 이전 보관소

**전환일: 2026-11-13** · 운영 주소: https://policyfundfinder.designboard.net/

## 로그인·회원가입

- 기본 계정 로그인 및 회원가입은 Cloudflare `softm-hannun-account` Worker에서 수행합니다.
- 상단 사용자 아이콘을 눌러 **로그인** 또는 **회원가입**을 선택합니다.
- SNS 로그인 수단은 Google·카카오·네이버이며, 실제로 활성화된 수단만 계정 서버에서 선택할 수 있습니다. 네이버는 공개 승인 전 비활성화될 수 있습니다.
- 로그인 전에는 사용자 아이콘, 로그인 후에는 SNS 사진(없으면 이니셜)이 표시됩니다. 계정 정보와 로그아웃은 동일 메뉴에 있습니다.
- 공통 식별자(UID)를 사용하되 다른 서비스의 개인정보나 보관소를 자동으로 합치지 않습니다. 인증 세션은 브라우저 세션 범위에 한정됩니다.

## 개인 기록 보관 원칙

- 사업 프로필·관심사업·신청 준비·메모는 기존대로 `localStorage['jiwonhannun-v1']`에 저장됩니다.
- **공통 계정 로그인은 개인 기록을 Cloudflare로 자동 백업·복원·동기화하지 않습니다.** 현재 설치된 검색/공고 수집과 로컬 기록 기능은 유지됩니다.
- 향후 동기화를 개발하면 **지원한눈 전용 Worker와 별도 D1**을 사용하고, 공통 인증 Worker에는 서비스 개인 데이터를 저장하지 않습니다. 사용자가 선택하기 전 로컬 자료를 원격 기록으로 덮어쓰지 않습니다.

## 이전 Firebase 보관소

- 기존 Firebase 암호화 백업은 삭제하거나 자동 이전하지 않았습니다.
- 기존 데이터를 직접 확인해야 할 때만 **[이전 보관소 열기](https://policyfundfinder.designboard.net/?legacyAccount=1)**를 사용합니다. 기존 공통 Firebase SDK 및 암호화 보관소 UI를 명시적으로 불러옵니다.
- 이전 보관소의 UID/암호와 새로운 Cloudflare UID는 자동 병합되지 않습니다. 복원·백업을 사용하기 전에 데이터 내용을 확인하십시오.
- 기본 화면으로 돌아가려면 URL의 `?legacyAccount=1`을 제거합니다.

## 구현 위치

- Cloudflare 기본 부트: `softm/softm.github.io/shared/platform/v1/cloudflare-site-boot.mjs`
- 사이트 인증 어댑터: `softm/softm.github.io/shared/platform/v1/cloudflare-site-sdk.mjs`
- OAuth/API 클라이언트: `softm/softm.github.io/services/cloudflare-account/src/client.mjs`
- 지원한눈 진입점: `softm/softm.policyfundfinder/index.html`
- PC `.topbar .header-actions`, 모바일 `.mobile-header`에 동일 계정 메뉴를 배치합니다. 사이트의 공고 검색·광고·기기 저장 데이터에는 변경을 가하지 않습니다.

## 운영 확인

GitHub Pages 배포 성공 여부와 브라우저에서 SNS 로그인/회원가입·복귀·로그아웃을 각각 확인해야 실제 운영 완료로 판정합니다.
