# 지원한눈 데이터 수집·정리 기술 보고서

기준일: 2026-10-16
배포 스냅샷: v-20261015234354779-5a1dbce2a0 (2026-10-16 08:43:54 KST)
운영 서비스: https://policyfundfinder.designboard.net/
GitHub: https://github.com/softm/softm.policyfundfinder

## 01. 전체 수집 현황

| 항목 | 건수 | 설명 |
| --- | --- | --- |
| 통합 공고 | 40,119 | 기업마당 + Npay 중복 제거 후 |
| Npay 원천 전체 | 40,211 | 목록 API 전체 응답 |
| Npay 원천 진행중 | 3,366 | isActive=Y 기준 |
| 상세 확보 집계 | 4,452 | 기업마당 또는 Npay 상세 확보 |
| Npay 상세 미확보 | 35,667 | 과거 공고 다수 포함 |
| 진행중 상세 미확보 | 1 | 우선 재수집 대상 |
| 캐시 PDF | 151 | PDF 형식 검증 후 저장 |
| 첨부 바로보기 | 2,894 | 첨부 뷰어 연결 |

건수는 특정 버전의 스냅샷이며 실시간 수치가 아니다. 상세 수집 완료가 원문의 조건과 모든 필드의 사실 일치를 뜻하지는 않는다.

## 02. 출처와 API 인증

| 원천 | 접근 및 인증 | 주요 제한 |
| --- | --- | --- |
| 네이버페이 마이비즈 | 공개 접근 가능한 partner/api/subvention JSON, 별도 키 없이 GET | 공식 외부 API 이용권한·재배포 허가 확인되지 않음 |
| 기업마당 | 공식 RSS/JSON 공고 API, crtfcKey 인증 | 현재 인증키 미설정, 이전 성공본 재사용 |

Npay 기본 주소: https://ica.pay.naver.com/partner/api/subvention

| 조회 목적 | 상대 요청 경로 |
| --- | --- |
| 전체 공고 수 | /list/count?isActive=N&searchType=all |
| 진행중 공고 수 | /list/count?isActive=Y&searchType=all |
| 첫 페이지(500개) | /list?page=0&pageSize=500&isActive=N&searchType=all |
| 두 번째 페이지 | /list?page=1&pageSize=500&isActive=N&searchType=all |
| 특정 공고 상세 | /detail/PRV_97_66082 |

현재 구현에서 isActive=N은 전체 목록 수집, isActive=Y는 진행중 원천 건수 확인에 사용한다.  인증 없이 응답한다는 사실과 외부 개발자용 공식 개방·상업적 재사용 허가는 다르다.

기업마당 API: https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do
주요 파라미터는 crtfcKey, dataType=json, searchCnt=0이며 필요 시 pageIndex 및 pageUnit=200으로 반복 요청한다. 인증키는 저장소 파일이 아닌 BIZINFO_API_KEY GitHub Secret에만 보관해야 한다.

## 03. 전체 목록 및 상세 데이터 수집 순서

| 단계 | 동작 | 검증 |
| --- | --- | --- |
| 1 | 목록/count 전체 건수 파악 | 정수·허용 범위 검증 |
| 2 | page=0부터 500개씩, 동시 3개 호출 | 페이지 번호, 응답 건수 검증 |
| 3 | subventionId 목록 취합 | 중복 ID, 수집 전후 원천 건수 일치 |
| 4 | 공통 필드 정규화 | 원천 ID 및 제공기관 보존 |
| 5 | 기업마당과 Npay 병합 | 제목+마감일 기반 중복 제거 |
| 6 | 진행중·상세 미확보 공고부터 상세 API 조회 | ID·제목·본문 존재 검증 |
| 7 | 압축 인덱스·32개 상세 파일 및 첨부 생성 | SHA256·파일 크기·ID 참조 검증 |

전체 40,211건을 500개 단위로 수집하면 81페이지를 순회한다. 목록은 전량 수집하지만 상세는 전량 재조회하지 않는다. 상세 조회는 실행당 최대 1,200건·동시 4개이며, 동일 ID·제목·기관의 이전 상세를 조건부로 재사용한다.

## 04. Npay 원천 필드 정규화

| 표준 데이터 | 원천 JSON 필드 | 의미 |
| --- | --- | --- |
| externalId / id | subventionId | 원천 ID와 NPAY_ 접두 내부 ID |
| title / agency | subventionTitleName / receptionInstitutionName | 공고명·기관 |
| region / category | subventionAreaList / subventionCompanyTypeCodeList | 지역·분야 |
| end / periodText | receptionEndYmd / receptionTermContent | 마감일·접수기간 원문 |
| amountMax / supportText | supportAmount / supportHtmlContent | 지원금·지원내용 |
| overview / target | businessOverviewHtmlContent / supportQualificationHtmlContent | 사업개요·지원자격 |
| method / application | applicationWayHtmlContent / subventionUrlAddress | 신청방법·접수처 |
| tags / sourceActive | hashCodeList / isActive | 보조 태그·상태 |
| attachments / sourceUrl | subventionFileList / pblancDetailUrl | 첨부·원문 링크 |

필드가 누락되면 임의로 지원금이나 자격을 추정하지 않는다. 상세 미확보 공고에는 원문 확인 안내가 표시된다.

## 05. 수집 분야와 자동 분류

| 차원 | 제공 카테고리 |
| --- | --- |
| 지원 분야 | 금융, 기술, 인력, 수출, 내수, 창업, 경영, 소상공인, 기타, 분류 미제공 |
| 지원 유형 | 지원금, 정책융자, 이자지원, 바우처, 서비스·현물, 금융지원, 복합지원, 지원사업 |
| 지원 목적 | 사업자금, 운영비, 시설·장비, 판로·홍보, 창업, ESG·기술, 기타 |
| 중분류 | 원천 중분류 또는 보조금·융자·보증·이차보전 등 보수적 보완 |

| 지원 유형 | 스냅샷 건수 |
| --- | --- |
| 지원사업(방식 미확인) | 19,515 |
| 지원금 | 11,763 |
| 서비스·현물 | 4,589 |
| 정책융자 | 1,671 |
| 금융지원 | 1,564 |
| 복합지원 | 569 |
| 바우처 | 236 |
| 이자지원 | 212 |

원천 분야는 유지하고, 제목·지원방식 코드·태그·확보된 본문으로 지원 유형·목적·세부분류를 추론한다. 대출과 보조금이 함께 있는 공고는 복합지원으로 표시할 수 있다. 자동 분류는 법적 신청자격이나 선정 가능성 판단이 아니다.

## 06. 중복 제거 및 데이터 검증

중복 키는 공고 제목을 NFKC 정규화, 공백 제거, 소문자화한 뒤 마감일을 붙여 만든다. 기업마당 공고가 대표 공고로 우선하며 다른 원천 ID는 별칭(aliases)으로 연결된다. 이전 성공본은 일부 archive로 보존할 수 있다.

| 검증 영역 | 내용 |
| --- | --- |
| 목록 | 페이지 번호·건수·중복 ID·수집 전후 총건수 |
| 상세 | 요청 ID와 반환 ID·제목·내용 존재 확인 |
| 압축 파일 | 검색 index와 32개 상세 샤드 ID 일치 |
| 무결성 | JSON gzip별 SHA-256·파일 바이트 |
| PDF | PDF 헤더 확인·다운로드 용량 제한 |
| 실패 처리 | 검증 실패 시 이전 성공 배포 유지 |

현재는 파일 손상·누락 중심 검증이다. 실제 신청조건·지원금액·접수방법·마감시각에 대해 원문과 필드별로 비교하는 기능은 추가 과제다. 제목+마감일만으로 서로 다른 공고를 잘못 합칠 위험도 있다.

## 07. 본문 개행, 파일 및 뷰어

Npay JSON의 상세 설명은 줄바꿈 없이 ㅇ 지원내용, - 항목, * 주의사항, ㅇ 지원금액 등이 이어지는 경우가 있다. public/notice-text.js에서 저장된 데이터에도 문단·제목·항목·주의사항 구조를 복원한다. 상단의 큰 지원내용은 핵심 금액 중심으로 짧게 표시하고 전문은 본문에 둔다.

탄소중립 실천기업 공고(PRV_97_66082): 광명시 제조업자 대상, 친환경·에너지 설비 개선, 설치비 10%·업체당 최대 500만원. 방문 또는 등기우편 신청. 최종 자격과 제한 사항은 네이버 원문 및 광명시 공고를 확인한다.

PDF 다운로드는 실행당 최대 40개 요청, 파일당 최대 10MB, 누적 약 120MB 제한을 사용한다. 첨부 원본 링크는 보존하며 HWP/HWPX 등은 공식 제공 뷰어를 연동한다.

## 08. 저장·갱신·배포 및 운영

| 항목 | 위치/설정 |
| --- | --- |
| 검색 인덱스 | data/{version}/index.json.gz |
| 상세 | data/{version}/details/0..31.json.gz |
| 배포 manifest | data/manifest.json |
| 첨부 뷰어 | data/attachment-views-*.json.gz |
| PDF 캐시 | data/pdf/{sha256}.pdf |
| 검색 처리 | 브라우저 Web Worker / static-client.js |
| 일일 갱신 | 06:17 KST, GitHub Actions cron: 17 21 * * * |
| 수동 갱신 | Actions에서 refresh=true |
| 일반 푸시 | 이전 검증 데이터로 소스 빌드 |
| 기업마당 인증 | GitHub Secret BIZINFO_API_KEY |

브랜치 기반 Jekyll 배포와 맞춤 Actions 배포를 동시에 운영하면 data/manifest.json이 이전 자료로 덮일 수 있다. GitHub Pages Source=GitHub Actions로 일원화하고 HTTP 200 및 최신 버전을 확인한다.

## 09. 개선 과제 및 소스 위치

| 우선순위 | 과제 |
| --- | --- |
| P0 | 네이버 내부 JSON 사용·재배포 허용 범위 확인 |
| P0 | 기업마당 인증키 복구 및 수집 실패 알림 |
| P0 | 진행중 상세 미확보 공고 재수집 |
| P0 | GitHub Pages 배포 한 방식으로 정리 |
| P1 | 원문과 금액·자격·접수방식·마감시간 정합성 대조 |
| P1 | 기관·공고 ID·개정 관계를 반영한 중복 제거 |
| P2 | 과거 공고 상세 단계적 보강 |

주요 파일: scripts/collect-pages.mjs, server/catalog.mjs, server/bizinfo.mjs, public/notice-classification.js, public/notice-text.js, scripts/static-catalog.mjs, .github/workflows/pages.yml.

기준 URL: https://github.com/softm/softm.policyfundfinder
운영 manifest: https://policyfundfinder.designboard.net/data/manifest.json
원문 예시: https://mybiz.pay.naver.com/subvention/detail/PRV_97_66082

본 문서는 공개 가능한 기술보고서이며 비밀번호, 개인 사업 프로필, API 인증키를 포함하지 않는다. 건수는 2026-10-16 08:43:54 KST 수집 스냅샷 기준이다.
