import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Pretendard — 쓰는 글자만 조각으로 받아 온다(한글 전체를 한 번에 받지 않음)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
