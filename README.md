# NPICK

NPICK은 Number Pick의 줄임말입니다. 역대 로또 6/45 1등 당첨번호를 기반으로 추천 조합을 생성하는 정적 웹 앱이며, 백엔드 서버 없이 브라우저에서 동작합니다.

## 실행

`index.html`을 브라우저로 열면 됩니다.

```bash
open index.html
```

로컬 HTTP 서버로 확인하려면 아래처럼 실행할 수 있습니다.

```bash
python3 -m http.server 4173
```

## 데이터 갱신

당첨번호 데이터는 `data/lotto-data.js`에 들어 있습니다. 최신 데이터로 갱신할 때만 아래 스크립트를 실행합니다.

```bash
node scripts/update-lotto-data.mjs
```

앱은 추천 결과가 당첨을 보장하지 않는다는 전제로, 빈도·미출현 간격·홀짝/저고 균형·과거 조합 제외 조건을 사용합니다.
