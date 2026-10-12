# GitHub Pages 운영

## Pages 설정

https://github.com/softm/softm.policyfundfinder/settings/pages

- Build and deployment → Source: **GitHub Actions**
- Custom domain: **policyfundfinder.designboard.net**
- HTTPS 인증이 완료되면 Enforce HTTPS 사용
- DNS의 `policyfundfinder` CNAME 대상은 **softm.github.io**입니다. 기존 연결이 이 값이면 유지합니다. ChatGPT Sites용 `custom-domains.chatgpt.site`를 Pages용 DNS 대상으로 사용하지 않습니다.

기존 브랜치 기반 Pages 게시에서도 루트 `index.html`이 실제 앱 화면을 직접 표시합니다. 정적 리소스는 `public/`에서 읽으며 브라우저 주소는 도메인 루트에 유지됩니다. 이전 `/public/` 링크는 검색 조건과 공고 ID를 보존해 루트로 이동합니다. 사용자 정의 Actions 배포는 `_site/`를 도메인 루트에 게시합니다. CNAME 파일만으로 사용자 정의 Actions의 도메인 설정이 바뀌지는 않으므로 Pages 설정 화면의 도메인을 보존합니다.

## 기업마당 인증키

https://github.com/softm/softm.policyfundfinder/settings/secrets/actions

New repository secret → 이름 **BIZINFO_API_KEY**, 값은 발급받은 기업마당 API 인증키입니다. 기존 키가 있으면 유지합니다. 키는 Actions 실행 환경에서만 사용하고 공개 파일·로그·브라우저에 넣지 않습니다. 키가 없거나 기관 응답이 실패하면 마지막 기업마당 성공본을 유지하고 Npay 전체 목록 수집을 계속합니다. 갱신 상태 화면에 기업마당의 마지막 성공 시각과 지연 사유를 표시합니다.

## 실행

https://github.com/softm/softm.policyfundfinder/actions/workflows/pages.yml

- `Collect notices and deploy Pages` → Run workflow → `refresh=true`: 최신 전체 목록과 진행중 상세를 수집·검증한 뒤 배포
- `refresh=false`: 마지막 완전한 수집 자료로 화면 코드만 배포
- `main` 푸시: 마지막 완전한 수집 자료로 배포
- 매일 06:17 KST: 최신 수집 후 배포. 예약 실행은 지연될 수 있습니다.

수집본을 `.catalog-cache`에 캐시합니다. 캐시가 없어도 저장소의 검증된 초기 통합본으로 시작합니다. 최신 자료·직전 세대·초기 자료를 함께 배포하여 배포 직전에 열린 탭의 상세 연결을 보존합니다. 수집 실패는 워크플로우 실패로 처리하고 배포 단계를 실행하지 않습니다. 진행중 상세 개별 실패는 마지막 성공 상세 또는 원문 링크를 유지합니다. 예약 작업의 실제 첫 실행은 Actions 성공 내역과 배포된 `data/manifest.json`의 완료 시각으로 확인합니다.

## 파일과 검증

- `public/data/manifest.json`: 마지막 성공 시각, 원천/통합 건수, 카테고리 검색 자료 버전, 파일 SHA-256, 공고 ID 별칭
- `public/data/<version>/index.json.gz`: 검색용 경량 공고 목록
- `public/data/<version>/details/<0..31>.json.gz`: 상세 분할 파일과 이전 관심사업 조회용 보관 공고
- `public/data/pdf/<sha256>.pdf`: 등록된 공식 첨부 URL 기준 PDF
- `.github/workflows/pages.yml`: 예약·수동 수집 및 Pages 배포

`node scripts/build-pages.mjs`는 전체 검색 건수, 상세 ID/분할, 별칭, 파일 해시와 저장된 PDF 서명을 검증합니다. PDF는 10MB/파일 이하, 공식 허용 호스트의 HTTPS만 자동 수집하며 회당 요청 수와 전체 예산을 제한합니다. 다른 첨부는 공식 원문 링크를 제공합니다. 카테고리와 신청자격·금액은 제공된 원문만 사용합니다.

운영 사이트에서 전체 검색, 지역+기술 분류, 이전 관심사업, 샘플 `?notice=PBLN_000000000127057`, 저장 PDF와 원문 링크, 개인 기록 백업/복원을 확인합니다. 새로운 도메인에서는 브라우저 저장 공간이 다르므로 기존 사이트에서 백업 후 새 사이트에서 가져오기를 사용합니다.
