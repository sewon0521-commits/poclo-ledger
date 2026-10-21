// 창 나누기 (10/21) — 기억·화면 폭·메뉴 목록. 그리는 건 components/SplitPane.jsx
import { useEffect, useState } from "react";
import { SECTIONS } from "./nav";

export const SPLIT_KEY = "poclo_split";
export const readSplit = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SPLIT_KEY) || "null");
    return v && typeof v.page === "string" ? v : null;
  } catch {
    return null;
  }
};
export const writeSplit = (v) => {
  try {
    localStorage.setItem(SPLIT_KEY, JSON.stringify(v));
  } catch {
    /* 기억 못 해도 된다 */
  }
};

/** 넓은 화면인가 (나눈 창은 1024px 이상에서만) */
export function useWide(q = "(min-width: 1024px)") {
  const [wide, setWide] = useState(() => (typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia(q).matches));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return wide;
}

/** 메뉴에 있는 화면 전부 (갈래별) */
export const PAGES = SECTIONS.map((s) => ({ label: s.label, items: s.groups.flatMap((g) => g.items) }));

export const defaultSplitW = () => Math.round((typeof window === "undefined" ? 1400 : window.innerWidth) * 0.42);
