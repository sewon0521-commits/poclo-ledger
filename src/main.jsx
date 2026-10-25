import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
// Pretendard — 쓰는 글자만 조각으로 받아 온다(한글 전체를 한 번에 받지 않음)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./index.css";
import App from "./App.jsx";
import { installClickSound } from "./lib/clickSound";

// 10/25 모델 계약서 — 모델이 받은 링크(#sign=<토큰>)는 로그인 없이 서명 화면만 (components/SignPage.jsx)
// oxlint-disable-next-line react/only-export-components
const SignPage = lazy(() => import("./components/SignPage.jsx"));
const signing = /^#sign=/.test(window.location.hash);
// 10/25 촬영 시트 — 모델이 받은 링크(#sheet=<토큰>)도 로그인 없이 그날 촬영 한 장만 (components/SheetPage.jsx)
// oxlint-disable-next-line react/only-export-components
const SheetPage = lazy(() => import("./components/SheetPage.jsx"));
const sheet = /^#sheet=/.test(window.location.hash);

if (!signing && !sheet) installClickSound();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {signing ? (
      <Suspense fallback={<div className="min-h-screen bg-stone-100" />}>
        <SignPage />
      </Suspense>
    ) : sheet ? (
      <Suspense fallback={<div className="min-h-screen bg-stone-100" />}>
        <SheetPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);
