// 소싱 관리 › 뜨는 릴스 · 경쟁몰 베스트 · 계정 (2026-10-24)
//
// 세원: "소싱을 2단계로 나눴어. ① 지금 뜨고 있는 콘텐츠 — 조회수 5만에 댓글 천 개 넘는 것처럼 — 입고 있는 룩을 그대로 따와서 소싱
//        ② 경쟁사 쇼핑몰 베스트 카테고리 상품을 그대로. 소싱 관리에 캡처 넣고 신마에서 비슷한 상품 찾아 가져와서 입어 보고 코디해서 촬영.
//        인스타를 돌아서 경쟁사 릴스 중 조회수 대비 댓글 3% 이상인 걸 매번 손으로 찾았는데 직접 찾아 줄 수 있나?" (기준 3% 확정)
//
// settings
//   sourcing_reels     사무실 PC 수집기(메타 Business Discovery — 조회수를 숨긴 계정도)가 쓴다. 화면은 읽기만.
//                      {at, threshold, accounts:[{handle, mall, name, followers, ok, error}],
//                       items:[{code, handle, mall, url, thumb(Storage reels 키), takenAt, views, comments, likes, ratio, caption, tag:'dm'|'event'|'', firstSeen, lastSeen}]}
//                      items 에는 기준 아래 것도 최근 30일 것은 다 있다 — 화면에서 기준으로 거른다.
//   sourcing_accounts  화면에서 고친다 {items:[{handle, mall, on, from:'tracker'|'manual'}]}
//
// '소싱에 담기' = 촬영 레퍼런스(shoot_refs) 한 장 + 고른 소싱 회차(shoot_sessions)의 refIds · refLooks{cat, memo}
//   (릴스 → 콘텐츠 레퍼런스, 경쟁몰 베스트 → 쇼핑몰 레퍼런스). 그다음은 예전처럼 회차 안에서 메모·상품 링크·우리 상품을 붙인다.

import { useCallback, useEffect, useState } from "react";
import { dayKey, shiftDay } from "./journal";
import { loadKey } from "./shoot";

export const KEYS = { reels: "sourcing_reels", accounts: "sourcing_accounts" };

/** sourcing_reels — 수집기가 쓴 것(읽기만). 이 기기 사본을 먼저 보여 주고, 화면을 다시 볼 때 새로 읽는다 */
export function useSourcingReels(online) {
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poclo_" + KEYS.reels) || "null");
    } catch {
      return null;
    }
  });
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    loadKey(KEYS.reels, online, null)
      .then((v) => setData(v))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [load]);
  return { data, loaded };
}

/** 지금 기준(기기마다 기억)으로 넘는 최근 릴스 수 — 탭 숫자 */
export function hotCount(data) {
  const thr = readThreshold();
  return recentReels(data?.items).filter((x) => (x.r ?? 0) >= thr).length;
}

export const THRESHOLDS = [0.01, 0.02, 0.03, 0.05];
export const DEFAULT_THRESHOLD = 0.03;
export const RECENT_DAYS = 30;

const THR_KEY = "poclo_src_threshold";
export function readThreshold() {
  try {
    const v = Number(localStorage.getItem(THR_KEY));
    return THRESHOLDS.includes(v) ? v : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}
export function writeThreshold(v) {
  try {
    localStorage.setItem(THR_KEY, String(v));
  } catch {
    /* 기억 못 해도 된다 */
  }
}

/** 0.0291 → '2.9%', 0.03 → '3%' */
export const pctText = (r) => (r == null || !isFinite(r) ? "—" : `${(r * 100).toFixed(r >= 0.1 ? 0 : 1).replace(/\.0$/, "")}%`);

/** 52345 → '5.2만', 1503 → '1,503' */
export function countText(n) {
  const v = Number(n);
  if (!isFinite(v) || n == null) return "—";
  if (v >= 100000) return `${Math.round(v / 10000)}만`;
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, "")}만`;
  return v.toLocaleString("ko-KR");
}

/** 'https://www.instagram.com/pureda_korea/' · '@pureda_korea' · 'pureda_korea' → 'pureda_korea' (못 읽으면 '') */
export function handleOf(text) {
  const t = String(text || "").trim();
  const m = t.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  const h = (m ? m[1] : t.replace(/^@/, "").replace(/^\/+|\/+$/g, "")).toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) && !["p", "reel", "reels", "explore", "stories"].includes(h) ? h : "";
}

/** 태그 — 수집기가 캡션으로 붙인다 */
export const TAGS = {
  dm: { label: "DM 링크형", cls: "bg-emerald-600 text-white", tip: "댓글을 달면 링크를 보내 주는 릴스 — 사고 싶다는 신호라 소싱에 제일 좋아요" },
  event: { label: "경품 이벤트", cls: "bg-amber-500 text-white", tip: "추첨·증정 댓글 — 댓글 수가 부풀려졌을 수 있어요" },
};

/** 비율 — 수집기 값이 없으면 댓글÷조회수 */
export const ratioOf = (x) => (x?.ratio != null ? Number(x.ratio) : Number(x?.views) > 0 ? Number(x.comments || 0) / Number(x.views) : null);

/** 최근 days 일 안 + 조회수가 있는 릴스 — 비율 높은 순 */
export function recentReels(items, days = RECENT_DAYS, today = dayKey()) {
  const from = shiftDay(today, -days);
  return (items || [])
    .filter((x) => x && (!x.takenAt || x.takenAt >= from) && Number(x.views) > 0)
    .map((x) => ({ ...x, r: ratioOf(x) }))
    .sort((a, b) => (b.r ?? -1) - (a.r ?? -1) || (b.comments || 0) - (a.comments || 0));
}

/** 'M/D' + 며칠 전 */
export function agoText(d, today = dayKey()) {
  if (!d) return "";
  const n = Math.round((new Date(today + "T00:00:00") - new Date(d + "T00:00:00")) / 86400000);
  const md = `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return n <= 0 ? `${md} 오늘` : n === 1 ? `${md} 어제` : `${md} · ${n}일 전`;
}

/** 수집 시각 ISO → '10/24 08:31' */
export function atText(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t)) return "";
  return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
