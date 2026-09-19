# NPICK

NPICK은 Number Pick의 줄임말입니다. 매주 로또 6/45 추천 1세트를 고정 생성하고, 다음 회차 결과가 발표되면 적중을 평가한 뒤 새 1세트를 만드는 정적 PWA입니다.

## 실행

로컬 HTTP 서버를 실행합니다.

```bash
python3 -m http.server 4173
```

브라우저에서 아래 주소를 엽니다.

```bash
http://127.0.0.1:4173/index.html
```

## Android 설치

Galaxy S25에서는 HTTPS로 배포된 주소를 Chrome 또는 Samsung Internet에서 열어 설치합니다.

```text
https://infini.github.io/npick/
```

상단의 `설치` 버튼이 보이면 버튼을 누릅니다. 버튼이 보이지 않으면 브라우저 메뉴에서 `앱 설치` 또는 `홈 화면에 추가`를 선택합니다.

GitHub Pages가 404를 반환하면 저장소 설정에서 Pages source를 `Deploy from a branch`, branch를 `gh-pages`, folder를 `/root`로 지정합니다.

## 데이터 갱신

당첨번호는 `data/lotto-data.js`, 주간 추천과 평가 기록은 `data/weekly-recommendations.js`에 들어 있습니다. 아래 스크립트는 최신 당첨번호를 갱신하고, 지난 1세트를 평가한 후 다음 회차 1세트를 생성합니다.

```bash
npm run update:data
```

GitHub Actions는 한국시간 일요일 03:00, 06:00, 09:00에 공식 동행복권 결과를 재확인합니다. 공식 결과가 아직 없거나 데이터 검증에 실패하면 기존 파일을 유지하고 새 추천을 만들지 않습니다.

데이터 갱신 스크립트, 핵심 추천 로직, 테스트 또는 갱신 워크플로가 `main`에 변경되면 예약 시각을 기다리지 않고 동일한 갱신·검증 작업을 즉시 실행합니다. 자동 생성된 데이터 파일만 바뀐 커밋은 이 트리거 대상이 아니므로 반복 실행되지 않습니다.

추천은 매주 서로 다른 6개 번호로 구성된 정확히 1세트입니다. 지난 적중 결과와 빈도 통계는 분석 화면에만 사용하고 다음 번호 가중치에는 사용하지 않습니다.

## 적중 성능 검증

앱의 `추천 성적`에서 실제 사전 추천의 평균 적중 수, 0개 적중 비율, 3개 이상 적중 비율을 무작위 이론값과 비교합니다. 전략별 과거 검증 결과는 접어서 표시하며 실제 추천 기록과 구분합니다.

```bash
npm run analyze
npm run check
```

`analyze`는 기존 추천과 고정된 대안 8개를 회차 순서대로 검증하고 `data/recommendation-analysis.js/json`을 생성합니다. 매주 `update:data`가 같은 분석을 실행하며 CI는 보고서 재현성까지 검사합니다. 실행에 외부 분석 서비스나 추가 패키지는 필요하지 않습니다.

2026-09-20 분석에서는 적중률을 높인다는 근거를 찾지 못해 기존 추천 엔진과 확정 번호를 유지했습니다. 분석 방법, 수치, 한계는 [docs/recommendation-analysis.md](docs/recommendation-analysis.md)에 기록했습니다. 비교 결과가 좋더라도 자동으로 실사용 추천 엔진을 교체하지 않습니다.

추가로 통계·머신러닝·적응형 후보 52개를 982회에 걸쳐 검증했습니다. 후반 260회 사후 최고 평균은 0.827개였지만 무작위 기준 0.8개를 유의하게 넘지 못했고, 선행 구간에서 선택한 모델도 후반에는 0.769개로 하락했습니다. 자세한 결과와 재현 방법은 [docs/expanded-research.md](docs/expanded-research.md)에 기록했습니다.

1243회부터는 실사용 추천과 별도로 후보별 번호를 추첨 전에 고정하고, 매주 실제 결과를 누적 평가합니다. `data/research-shadow-records.json`에 생성 시각·번호·해시를 보관하며 이미 기록한 번호를 바꾸거나 놓친 회차를 사후 생성하지 않습니다. 후보 52개의 실험 번호는 구매용 추천이 아닙니다. 앱에 표시되는 추천은 계속 1세트입니다.

확장 연구는 Python 3.12와 `scripts/research/requirements.txt`의 고정 패키지가 필요합니다. `npm run research:test`로 연구 코드를 검사하고 `npm run research`로 분석합니다. `npm run update:all`은 당첨/추천 데이터와 연구를 함께 갱신합니다. GitHub Actions에서는 정상 주간 데이터 검증·배포를 먼저 마친 뒤 연구를 실행하므로 연구 계산 실패가 기존 추천 갱신을 막지 않습니다. 연구 결과는 저장소와 정적 배포 파일에 공개하며, 앱의 접이식 과거 비교 화면은 기존 8개 규칙 보고서를 유지합니다.

GitHub Pages 배포는 검증을 통과한 후 `scripts/publish-pages.sh`로 수행합니다. 두 워크플로는 같은 배포 대기열을 사용하고 `gh-pages`에 일반 커밋을 추가하므로 배포 이력을 덮어쓰지 않습니다.

핵심 추천 로직은 [docs/core-logic.md](docs/core-logic.md)에 정리합니다. 추천 알고리즘을 바꿀 때는 이 문서도 함께 갱신합니다.

기능별 파일 분리 원칙은 [docs/architecture.md](docs/architecture.md)에 정리합니다.
