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

## 첨부 다운로드·바로보기와 태그 조회

기업마당 API의 `fileNm`/`flpthNm`에 `@`로 연결된 여러 파일을 파일별 이름·주소로 분리합니다. 공식 다운로드는 `fileDown.do`를 사용하고, PDF 캐시는 원래 `getImageFile.do` URL 기준을 유지합니다. 이전 수집본의 합쳐진 링크도 정적 조회 단계에서 보정합니다.

Actions는 공식 공고 HTML에 공개된 파일 ID·물리 경로를 읽어 HWP·HWPX·PDF 등 지원 형식의 문서 뷰어 링크를 보관합니다. 브라우저에서 해당 뷰어를 레이어 팝업으로 표시하며 새 창 보기와 다운로드를 함께 제공합니다. ZIP은 다운로드만 제공합니다. 뷰어 연결이 미수집되었거나 제공처 장애가 있으면 공식 원문을 사용합니다. 뷰어 메타데이터는 `data/attachment-views-<timestamp>.json.gz`이며 전체 목록 갱신 시 직전 링크를 보존하면서 150개 공고를 확인합니다. 초기 일괄 확인은 `ATTACHMENT_LIMIT=2000 node scripts/enrich-attachments.mjs`로 실행합니다.

태그 링크는 `?tag=기술`, `?tag=서울`, `?tag=전남광주`처럼 공고의 원문 태그를 정확히 조회합니다. 일반 지역·분야 필터와 조합할 수 있고 태그 해제로 취소합니다. 제목·본문에만 해당 단어가 있는 공고를 태그로 잘못 포함하지 않습니다.


## 2026-10-16 Pages 중복 배포 방지

GitHub 저장소에서 Pages Source가 브랜치 기반으로 설정되어 있으면 `pages build and deployment`(Jekyll 자동 배포)와 이 저장소의 `Collect notices and deploy Pages`(정적 검증본 배포)가 동시에 실행됩니다. 전자가 나중에 종료하면 사이트의 `/data/manifest.json`이 404가 되고 상세 팝업이 오래된 초기 데이터로 표시될 수 있습니다. 정상 동작은 `/data/manifest.json`이 응답하고 `/data/…/details/*.json.gz`을 반환하는 상태입니다.

**영구 해결**: [Pages 설정](https://github.com/softm/softm.policyfundfinder/settings/pages) → Build and deployment → Source를 **GitHub Actions**로 지정합니다. 현재 커스텀 워크플로는 Push 배포 전에 동일 커밋의 Jekyll 자동 배포 완료를 기다리는 우회 보호장치를 추가했지만, 근본적으로 브랜치 기반 배포를 해제하는 것이 안전합니다. Actions만 사용하면 중복 Pages 실행이 사라집니다.

수집 또는 소스 변경 후 [워크플로 현황](https://github.com/softm/softm.policyfundfinder/actions/workflows/pages.yml)에서 build/deploy가 성공했는지 확인하고, 운영 URL에서 /data/manifest.json이 HTTP 200인지와 필드 목록이 정상인지 확인합니다.

## AdFit 광고 운영 (2026-10-22)

광고 설정은 [`public/adfit-config.js`](public/adfit-config.js), 배치·운영 기준은 [docs/ADFIT.md](docs/ADFIT.md)에 보관합니다. [AdFit 광고관리](https://adfit.kakao.com/adManagement)에서 지원한눈 Web 매체의 URL이 `policyfundfinder.designboard.net`인지 확인하고 해당 매체에서 발급된 광고단위만 연결합니다.

| 운영 항목 | 기준 |
| --- | --- |
| 하단 광고 | 모바일 320×50, PC 728×90 중 가용 폭에 맞는 1개. 접기·펼치기 버튼은 광고 영역 밖에 배치 |
| 목록 광고 | 목록 6번째 공고 뒤 320×100 1개, 공고가 최소 7개일 때 표시 |
| 요청 제한 | `enabled`, `allowedHosts`, 발급된 광고단위 ID를 확인. 미리보기·미허용 호스트·미발급 단위에서는 외부 광고 요청 없음 |
| 반복 요청 | 검색·페이지 이동·접기·펼치기만으로 강제 새로고침하지 않음. 앱에서 자동 재요청 타이머를 추가하지 않음 |
| 미송출 | 실패 콜백과 로드 오류를 처리해 빈 광고 공간을 정리. 무한 재시도하지 않음 |
| 자료 처리 | 공고 수집, 검색, 개인 기록 보관 경로는 유지. 개인 프로필·관심사업·준비 메모를 광고 요청 필드에 넣지 않음 |

설정과 UI 수정은 기존 Pages 빌드·배포를 사용합니다. 자료 재수집이 필요하지 않은 변경은 기존 검증된 수집 자료로 배포합니다.

```sh
npm run test:pages
node scripts/build-pages.mjs
```

배포 후 [광고 미리보기](https://policyfundfinder.designboard.net/?adPreview=1)에서 모바일·PC 배치, 접기 상태 복원, 상세·뷰어·검색 입력과의 동작을 확인합니다. 일반 운영 URL에서는 실제 광고 스크립트·광고단위 연결을 확인합니다. 광고 소재를 클릭해서 검증하지 않습니다.

**배포 완료, 광고 호출 확인, 매체 심사 승인, 실제 광고 송출은 각각 확인합니다.** AdFit은 발급된 광고단위를 설치하고 광고 호출이 발생한 뒤 매체 심사를 진행하므로, 미승인 상태만을 이유로 등록된 운영 도메인의 최초 호출을 막지 않습니다. 광고 미송출만으로 코드 배포 실패 또는 매체 승인 여부를 단정하지 않습니다.

웹 광고 도입 고지는 `/privacy.html`, `/google-play-privacy-policy.html`과 이전 공개 경로에도 동일하게 반영합니다. Google Play Console의 광고 포함 여부·데이터 보안 답변은 이 저장소의 HTML 수정만으로 변경되지 않으므로, 실제 앱에서 운영 웹서비스를 표시하는 배포 범위와 맞는지 별도로 확인합니다.
