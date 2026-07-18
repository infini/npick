# NPICK

NPICK은 Number Pick의 줄임말입니다. 매주 로또 6/45 추천 3세트를 고정 생성하고, 다음 회차 결과가 발표되면 세트별 적중을 평가한 뒤 새 3세트를 만드는 정적 PWA입니다.

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

당첨번호는 `data/lotto-data.js`, 주간 추천과 평가 기록은 `data/weekly-recommendations.js`에 들어 있습니다. 아래 스크립트는 최신 당첨번호를 갱신하고, 지난 3세트를 평가한 후 다음 회차 3세트를 생성합니다.

```bash
node scripts/update-lotto-data.mjs
```

GitHub Actions는 한국시간 일요일 03:00, 06:00, 09:00에 공식 동행복권 결과를 재확인합니다. 공식 결과가 아직 없거나 데이터 검증에 실패하면 기존 파일을 유지하고 새 추천을 만들지 않습니다.

추천은 매주 정확히 3세트이며 세 세트의 18개 번호가 서로 겹치지 않습니다. 지난 적중 결과와 빈도 통계는 분석 화면에만 사용하고 다음 번호 가중치에는 사용하지 않습니다.

핵심 추천 로직은 [docs/core-logic.md](docs/core-logic.md)에 정리합니다. 추천 알고리즘을 바꿀 때는 이 문서도 함께 갱신합니다.

기능별 파일 분리 원칙은 [docs/architecture.md](docs/architecture.md)에 정리합니다.
