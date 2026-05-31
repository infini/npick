# NPICK

NPICK은 Number Pick의 줄임말입니다. 역대 로또 6/45 1등 당첨번호를 기반으로 추천 조합을 생성하는 정적 웹 앱이며, Android에서 설치 가능한 PWA로 동작합니다.

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

당첨번호 데이터는 `data/lotto-data.js`에 들어 있습니다. 최신 데이터로 갱신할 때만 아래 스크립트를 실행합니다.

```bash
node scripts/update-lotto-data.mjs
```

앱은 추천 결과가 당첨을 보장하지 않는다는 전제로, 빈도·미출현 간격·홀짝/저고 균형·과거 조합 제외 조건을 사용합니다.

핵심 추천 로직은 [docs/core-logic.md](docs/core-logic.md)에 정리합니다. 추천 알고리즘을 바꿀 때는 이 문서도 함께 갱신합니다.

기능별 파일 분리 원칙은 [docs/architecture.md](docs/architecture.md)에 정리합니다.
