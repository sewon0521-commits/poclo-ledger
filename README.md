# 포클로 매입 장부

사입 매입을 **거래 건 단위**로 기록하고, 이체(부가세 포함)와 삼촌송금(부가세 미포함)을
갈라서 집계하는 웹앱. 자세한 도메인 규칙은 [CLAUDE.md](CLAUDE.md)에 있다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
npm run preview  # 빌드 결과 확인
npm run lint
```

`npm run dev`에서는 `/api/read-receipt`가 없으므로 **영수증 올리기**를 누르면 수동 입력
폼이 열린다. OCR까지 로컬에서 돌려보려면:

```bash
npm i -g vercel
vercel dev
```

## 배포 (Vercel)

1. GitHub에 저장소를 만들고 push.
2. [vercel.com/new](https://vercel.com/new)에서 저장소를 가져온다.
   Vite 프리셋이 자동으로 잡힌다(빌드 `npm run build`, 출력 `dist`).
3. Vercel 프로젝트 → Settings → Environment Variables에 `ANTHROPIC_API_KEY`를 넣는다.
   **키는 저장소에 절대 커밋하지 않는다.** 없어도 앱은 돌아가고, 영수증 자동 읽기만
   꺼진 상태가 된다.
4. 발급된 URL을 폰에서 열고 공유 → **홈 화면에 추가**(PWA).

## 구조

```
api/read-receipt.js     영수증 OCR 서버리스 함수 (API 키는 여기 환경변수에만)
src/lib/calc.js         도메인 계산 — 부가세, 일별/거래처별 집계, 우선순위 판정
src/lib/storage.js      저장 계층 (지금은 localStorage, M2에서 Supabase로 교체)
src/lib/receipt.js      사진 축소 + /api/read-receipt 호출
src/components/         TxForm(입력) · DailyView(일별) · VendorView(거래처별) · ui
src/App.jsx             화면 조립, 월/과세유형 상태
```

## 데이터

지금은 브라우저마다 따로 저장된다(로컬 저장). 사장님 폰과 직원 폰이 같은 데이터를 보려면
M2(Supabase 연결)가 필요하다.
