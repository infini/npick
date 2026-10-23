# NPICK Architecture

NPICK은 정적 PWA이며 기능별 책임을 분리한다. 새 코드를 추가할 때는 기존 기능의 책임을 침범하지 않는 위치에 둔다.

## 폴더 책임

- `src/app.js`: 앱 초기화, 상태 연결, 이벤트 바인딩, 가벼운 UI 설정 저장만 담당한다.
- `src/core/`: 주간 1세트 추천, 평가 사이클, 통계, 난수, 숫자 유틸 같은 순수 로직을 둔다. DOM 접근을 금지한다.
- `src/core/recommendation-engine.js`: 기존 v1/v2 재현과 단일 세트 검증을 보존한다. v2 함수와 버전 상수는 기존 비교 기준이며 새 주간 추천을 선택하는 진입점이 아니다.
- `src/core/hot104-engine.js`: v3의 104회 빈도 선택, 동률 처리, 입력 기간과 저장 번호 검증을 담당한다.
- `src/core/recommendation-comparison.js`: 기존 v2 비교 번호의 동시 생성·무결성 검사와 동일 회차 성적 요약을 담당한다.
- `src/core/weekly-cycle.js`: 적용 회차에 따른 엔진 선택, 기존 기록 보존, 두 방식 평가와 52회 기록 보관을 조율한다.
- `src/core/recommendation-performance.js`: 적중의 정확한 이론 분포, 실제 추천 성적, 무작위 예상 범위를 계산한다. 추천 생성이나 DOM을 참조하지 않는다.
- `src/ui/`: HTML 렌더링과 화면 표시 규칙을 둔다. 추천 점수 계산을 금지한다.
- `src/ui/performance.js`: 추천 성적과 과거 전략 비교를 표시한다. 실제 기록과 과거 재현 결과를 분리하고 오래된 보고서는 표시하지 않는다.
- `src/ui/strategy-comparison.js`: 새 방식과 기존 방식의 동일 회차 비교 표 및 평가 대기 상태만 렌더링한다. 점수 계산은 core에 위임한다.
- `src/pwa/`: 설치 프롬프트, 서비스 워커 등록 등 앱 설치 관련 브라우저 기능을 둔다.
- `data/`: 생성된 당첨번호, 주간 추천/평가, 분석 보고서와 사전 실험 원장을 둔다. 직접 수정하지 않고 각 생성 스크립트로 갱신한다.
- `scripts/`: 개발, 데이터 갱신, 자동 push, 스모크 테스트처럼 앱 런타임 밖의 작업을 둔다.
- `scripts/analysis/`: 고정 후보 전략과 시계열 순차 검증을 담당한다. 브라우저 번들에서 참조하지 않고 추천 엔진을 바꾸지 않는다.
- `scripts/analyze-recommendations.mjs`: 생성 데이터 읽기와 분석 보고서 쓰기만 담당한다. 보고서 JS와 JSON을 함께 생성한다.
- `scripts/research/features.py`: 당첨 데이터 검증과 과거 자료 전용 입력 특성 생성.
- `scripts/research/models.py`: 고정 통계/학습 모델과 이전 실적만 보는 적응형 선택.
- `scripts/research/evaluation.py`: 과거 지표, 정확한 귀무분포, 보정 p값, 구간 추정과 분포 진단.
- `scripts/research/prospective.py`: 추첨 전 고정 원장 검증·누적 평가·e-process. 추천 엔진이나 파일 IO에 의존하지 않는다.
- `scripts/research/run.py`: 위 모듈을 연결하고 연구 생성물을 저장하는 CLI. Python 의존성은 연구/CI에만 사용한다.
- `scripts/deep-research/pattern_models.py`: 번호순 동률의 고정 패턴 후보와 과거 성적 기반 선택만 담당한다.
- `scripts/deep-research/pattern_evaluation.py`: 과거 세 지표 평가, 다중 비교 보정, 동률 민감도, 균등 대조군과 검정력을 계산한다.
- `scripts/deep-research/pattern_diagnostics.py`: 전체 탐색을 포함한 분포 진단의 모의실험 보정만 담당한다.
- `scripts/deep-research/pattern_prospective.py`: 새 연구의 세 목표별 e-process와 오류 예산을 집계한다. 기존 연구의 판정 규칙은 수정하지 않는다.
- `scripts/deep-research/run.py`: 기존 데이터 검증·불변 원장 검증을 재사용하고 새 보고서·별도 원장만 기록한다. `source-audit.mjs`는 공식 자료 표본 대조만 담당한다.
- `scripts/publish-pages.sh`: 배포 브랜치를 복제해 일반 커밋과 push를 수행한다. force-push를 사용하지 않는다.
- `.github/workflows/`: GitHub Pages 배포와 주간 당첨번호 데이터 갱신 자동화를 둔다.
- `docs/`: 핵심 로직과 구조 결정 사항을 문서화한다.

## 변경 규칙

- 추천 알고리즘을 바꾸면 `docs/core-logic.md`도 함께 갱신한다.
- 새 화면 컴포넌트는 `src/ui/`에 추가하고, 이벤트 연결은 `src/app.js`에서 한다.
- 새 비즈니스 규칙은 `src/core/`에 추가하고, 브라우저 API나 DOM을 직접 참조하지 않는다.
- 사용자가 선택한 분석 회차는 통계 표시 범위로만 사용하며 추천 알고리즘 입력으로 전달하지 않는다. v3의 추천 기간 104회는 엔진 규칙으로 별도 고정한다.
- 회차별 추천 기록과 평가 결과는 생성 데이터에 저장하고, `src/core/weekly-cycle.js`에서 평가와 누적 요약을 계산한다.
- 추천은 회차당 정확히 1세트다. 1248회부터 신규 생성에는 v3를 사용하고 이미 발행한 기록은 원래 엔진으로 검증한다. 비교용 v2는 `comparison` 하위 필드에 별도 보관하며 추천 세트 수나 실제 추천 요약에 더하지 않는다.
- PWA 설치, 캐시, 오프라인 동작은 `src/pwa/` 또는 `service-worker.js`에서만 다룬다.
- 생성 파일인 `data/lotto-data.*`와 `data/weekly-recommendations.*`는 수동 편집하지 않는다.
- `data/recommendation-analysis.*`도 생성 파일이다. 당첨 데이터가 바뀌면 분석을 다시 실행하고 `npm run check`로 산출물 재현성을 확인한다.
- `data/research-analysis.*`와 `data/research-shadow-records.json`은 `npm run research`로 갱신한다. 원장은 재생성을 위해 삭제하지 않는다. 현재 앱은 이 파일을 불러오지 않으며 주간 추천 배포와 연구 계산을 분리한다.
- 연구 코드는 `npm run research:test`, 생성 파일은 `npm run check`로 검증한다. 연구 보고서가 한 주 늦어도 기본 데이터 갱신은 가능하되, 보고서 내부의 프로토콜·번호·해시 불일치는 허용하지 않는다.
- 과거 비교 성적을 실제 추천 성적으로 합치거나 최고 기록만 골라 보고하지 않는다. 알고리즘 채택은 과거 점수로 자동화하지 않는다.
- 연구의 `current` ID와 기본 분석 보고서의 `referenceStrategy`는 기존 v2를 뜻한다. 새 엔진 적용으로 기존 연구 프로토콜·seed·원장의 의미를 바꾸지 않는다.
- 새 패턴 연구는 `data/deep-research-analysis.json`, `data/deep-research-shadow-records.json`을 사용한다. `npm run research:patterns:test`와 `npm run check`로 검증하며 기존 원장에 합치지 않는다. 새 연구의 `hot-104`만 운영 v3와 같은 동률 규칙이다. 후보와 판정 기준은 별도 프로토콜에 고정하고 추가 연구마다 오류 예산을 초기화하지 않는다.

## UI 표시 규칙

- 최신 회차 아래 요약 지표는 `최신 회차`, `데이터 수`, `최다 출현`, `최장 미출현`을 보여준다.
- `최다 출현`과 `최장 미출현`은 각각 상위 6개 번호를 보여준다.
- 요약 지표의 번호는 `번` 접미사를 붙이지 않고 숫자만 표시한다.
- 요약 지표의 번호 6개는 3개씩 2줄로 나누어 표시한다.
- 번호별 출현 빈도는 출현 횟수 내림차순, 번호 오름차순으로 정렬하고 각 번호의 출현 횟수를 숫자로 표시한다.
- 당첨 이력은 기본 상태에서 최근 5회차만 보여주고, 검색 시 일치하는 결과를 확장해서 보여준다.
- 주간 데이터 갱신 시 다음 회차 1세트를 한 번만 생성한다.
- 앱은 보관된 1세트와 평가 대기 상태를 보여주며 번호 재생성 버튼을 제공하지 않는다.
- 평가된 추천이 있으면 해당 1세트의 적중 번호, 적중 수, 등수와 누적 주간 요약을 보여준다.
- 추천 성적은 별도 전체 너비 영역에 숫자 표로 표시하고, 전략별 과거 비교는 접을 수 있는 표로 제공한다. 통계 표시 범위 슬라이더는 이 검증 구간을 변경하지 않는다.
- 방식별 비교는 현재 보관된 최근 52개 회차 기록 중 두 방식의 유효한 평가가 함께 있는 회차만 쓴다. 0개 적중을 제외하지 않으며 평가 전에는 0%가 아닌 대기 상태를 표시한다.
- PWA 화면 탐색은 network-first로 처리하고 네트워크 실패 시 캐시된 index로 복구한다. 오래된 버전 쿼리가 붙은 설치 앱도 오프라인에서 진입할 수 있다. 기존 서비스 워커의 제어권이 바뀌면 한 번 새로고침하여 새 HTML과 코드를 맞춘다.
