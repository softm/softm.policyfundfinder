# 지원한눈 공고 갱신

현재 Site는 소유자 전용 비공개이며, 공유 갱신 API는 Sites의 접근 제어를 사용한다. 공개 또는 외부 공유로 변경하기 전 관리 요청의 추가 인증을 구현해야 한다. 사용자 개인 기록은 브라우저에 저장하며 공고 검색 시 필요한 조건만 일시적으로 서버에서 비교한다.

## 최초 연결

앱의 **공고 데이터 연결**에서 기업마당 공식 API 인증키를 입력한다. 서버는 기업마당 실제 응답을 검증한 뒤 AES-GCM으로 암호화하여 D1에 보관한다. 암호화 마스터는 Sites의 `BIZINFO_KEY_ENCRYPTION_SECRET` 런타임 비밀 환경변수다. 이를 잃거나 교체하면 사용자가 인증키를 재연결해야 한다. `BIZINFO_API_KEY` 비밀 환경변수로도 연결할 수 있으며 이 설정이 우선한다. 키를 소스나 작업 프롬프트에 기록하지 않는다.

인증키는 https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi 에서 사용신청한다. 시스템 URL은 이 Site의 실제 URL을 입력한다.

## 클라우드 작업에서 갱신

1. 연결된 Site의 `get_site`를 호출하고 현재 URL·공유 상태를 확인한다. 소유자 전용 비공개 상태를 유지한다. 반환한 `siwc_bypass_bearer_token`을 세션 메모리에서만 취급한다.
2. 해당 Site의 `GET /api/data-status`에만 `OAI-Sites-Authorization: Bearer <반환 토큰>`을 보내 연결 상태를 확인한다. 이 헤더를 다른 호스트에 보내지 않는다.
3. `connected=false`이면 수집이나 성공 시각을 꾸미지 말고 인증키 연결이 필요하다고 알린다.
4. `POST /api/sync`를 같은 인증 방식으로 호출한다. 작업이 이미 실행 중(409)이면 중복 실행하지 않는다. 현재 작업 완료 또는 실패 상태를 읽는다.
5. `GET /api/data-status`로 `lastRun.status=success`, `count`, `lastSuccess`가 방금 실행 결과와 일치하는지 확인한다. 수집 응답은 `runId`를 포함한다. 실패 시 이전 자료를 유지하며 오류를 보고한다. 502 실패는 잠시 후 한 번만 재시도한다. API 키가 잘못되거나 미연결이면 반복하지 않는다.
6. 소스를 수정하거나 재배포할 필요는 없다. 실제 성공 시각·건수·실패 내용을 간결하게 보고한다.

## 범위와 갱신

공식 API의 `searchCnt=0`으로 제공 피드 전체를 요청한다. `totCnt`보다 적게 반환하면 `pageIndex`/`pageUnit`으로 끝까지 수집한다. 전체 수 변경·반복 페이지·식별자 누락·0건·건수 불일치 시 기존 자료를 유지한다. 수집한 완전한 세대를 저장한 후 한 번에 활성 자료로 교체한다. 관심사업 조회용으로 이전 공고의 마지막 수집본도 보관한다.

기업마당 API가 제공하지 않는 기관 공고, 전체 역사자료, 예산 소진 및 실시간 접수 상태를 보장하지 않는다. 최종 자격·한도·접수 상태는 공식 원문을 확인한다.

**예약 갱신은 인증키와 서비스 쓰기/읽기 경로를 실제 검증한 뒤 연결한다.** 예약 저장 자체로 수집 성공을 주장하지 않는다. 예약 전에는 앱의 직접 갱신 버튼을 사용한다.

사용자가 전체 수집과 자동 갱신을 요청했다. 인증키가 연결되면 최초 실제 수집과 읽기 검증을 완료하고, `get_site.automations`로 중복·정지 상태를 확인한 뒤 기존 적합한 예약을 사용하거나 매일 06:00 Asia/Seoul 예약을 연결한다. 네이티브 도구가 반환한 실제 예약 상태만 `POST /api/schedule-status`로 기록한다. 본문은 `{state:"enabled" 또는 "paused",title, time:"매일 06:00",timezone:"Asia/Seoul",taskId}`이며 동일한 Site 서비스 인증을 사용한다. 인증키나 서비스 토큰을 이 본문에 포함하지 않는다.

## 통합 공고 전체 갱신

기업마당 API 갱신 후 네이버 공개 전체 공고(지난 공고 포함)를 갱신한다. 네이버 경로는 사이트 공개 검색 화면이 사용하는 비공식 읽기 경로로 별도 로그인·인증키를 사용하지 않는다. 공개 경로가 변경되면 실패를 표시하고 기존 통합본을 유지한다.

- 원천: `https://ica.pay.naver.com/partner/api/subvention/list/count?isActive=N&searchType=all`, 진행중 건수는 `isActive=Y`.
- 페이지: `/subvention/list?page=0&pageSize=500&isActive=N&searchType=all`. `number`, `size`, 고유 `subventionId`, 최종 전체 건수를 검증한다.
- Site 서비스 인증은 앞서 설명한 같은 Site의 `OAI-Sites-Authorization: Bearer <token>`으로만 전송한다. 이 토큰을 네이버 또는 첨부 제공처에 전달하지 않는다.
- `POST /api/catalog-sync/start {}` → 반환 `id`를 `POST /api/catalog-sync/step {runId:id}`에 반복 전달한다. `done:true`까지 계속한다. 일부 단계만 실행한 것을 성공으로 보고하지 않는다. 단계 실패 시 이전 통합본이 활성 상태로 유지된다.
- Cloudflare의 외부 연결 실패 시 실행 환경에서 공개 원천을 읽고 `POST /api/catalog-import/start {expected,expectedActive}` → `POST /api/catalog-import/page {runId,rows}`(최대 500건씩) → `POST /api/catalog-import/finish {runId}`로 완전한 수집본을 전달한다. 페이지 번호·고유 ID 전체 건수·수집 시작과 종료 원천 건수 일치를 확인한 뒤 완료한다.
- `GET /api/data-status`의 `catalog.npaySourceCount`, `catalog.npayActiveCount`, `catalog.uniqueCount`, `catalog.lastSuccess`를 읽고 실제 완료 run과 일치하는지 확인한다. 기업마당 갱신이 실패해도 마지막 성공본을 사용하고 네이버 전체 수집은 계속한다. 실패를 별도로 보고한다.
- 소스 재배포 없이 자료만 갱신한다. 원천 원본은 gzip JSON으로 `POST /api/catalog-import/snapshot?runId=<id>`에 보관할 수 있다. 증분이 아닌 전체 수집이며 제목·마감일이 같은 공고는 기업마당 자료를 우선해 통합한다. 원천 건수와 통합 건수가 다를 수 있다.

## PDF 미리보기

공식 첨부 PDF는 검증 후 BUCKET에 보관한다. 저장 키는 공식 첨부 URL의 SHA-256이므로 URL이 바뀐 파일을 이전 파일로 대체하지 않는다. Cloudflare에서 제공처 파일 요청이 실패하면 실행 환경에서 원본 URL을 읽어 PDF 형식·크기를 검증하고 같은 Site의 `POST /api/attachment-cache?id=<notice-id>&index=<index>`에 파일 바이트를 전달할 수 있다. 등록된 공고의 첨부파일만 허용하며 20MB 이하 PDF만 저장한다. 뷰어는 JSON·HTML 오류 응답을 PDF로 표시하지 않는다.
