// 구독 · 고정 지출 (2026-10-01)
//
// 세원: "우리가 지금 어떤 사이트를 구독하고 있고 어떤 거에서 금액이 나가고 있고 — 지출 내역을 한 번에 볼 수 있게.
//        노션(쇼필공 OS 구독관리)처럼 해도 되는데 좀 구려 보여서 세련되게. 돈 카테고리에 구독."
// 노션은 월간·연간 카드 두 판이었다. 여기서는 **한 달에 얼마 나가는지**를 맨 위에 두고, **다음 결제일 순서**로 줄을 세운다.
//
// settings 'subscriptions' {items:[{id, name, cycle, price, status, start, card, kind, url, memo, endedOn, createdAt, logo?, logoBg?}]}
//   cycle  : "month" | "year"
//   status : "active"(구독 중) | "trial"(무료체험 — start 가 첫 결제일) | "ended"(해지)
//   start  : 결제 시작일(첫 결제일). 다음 결제일은 여기서 주기만큼 넘겨 계산한다(따로 적지 않는다 — 노션처럼 손으로 고칠 일이 없게).

import { dayKey } from "./journal";

export const CYCLES = [
  ["month", "월간"],
  ["year", "연간"],
];
export const STATUSES = [
  ["active", "구독 중"],
  ["trial", "무료체험"],
  ["ended", "해지"],
];
export const KINDS = ["쇼핑몰·운영", "디자인·영상", "AI·업무툴", "광고·마케팅", "고정비", "기타"];
// 처음 넣을 때 바로 고르는 것 — 이름만 채워 준다(금액·날짜는 세원이 적는다)
export const QUICK = [
  ["카페24", "쇼핑몰·운영"],
  ["Claude", "AI·업무툴"],
  ["Adobe", "디자인·영상"],
  ["Canva", "디자인·영상"],
  ["VREW", "디자인·영상"],
  ["Notion", "AI·업무툴"],
  ["그랜터", "쇼핑몰·운영"],
  ["CapCut", "디자인·영상"],
];

const parse = (k) => {
  const [y, m, d] = String(k).split("-").map(Number);
  return { y, m, d };
};
const key = (y, m, d) => {
  // 달 끝을 넘으면 그달 마지막 날로 (1/31 시작 → 2/28)
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};

/** 다음 결제일 — 시작일에서 주기만큼 넘겨 오늘 이후 첫 날 (해지면 없음) */
export function nextPay(s, today = dayKey()) {
  if (!s.start || s.status === "ended") return "";
  if (s.start >= today) return s.start;
  const { y, m, d } = parse(s.start);
  const step = s.cycle === "year" ? 12 : 1;
  const t = parse(today);
  let n = Math.max(0, Math.floor(((t.y - y) * 12 + (t.m - m)) / step) * step - step);
  for (let i = 0; i < 40; i++, n += step) {
    const mm = m - 1 + n;
    const k = key(y + Math.floor(mm / 12), (mm % 12) + 1, d);
    if (k >= today) return k;
  }
  return "";
}

/** 오늘부터 며칠 */
export function daysUntil(k, today = dayKey()) {
  if (!k) return null;
  const a = parse(k);
  const b = parse(today);
  return Math.round((new Date(a.y, a.m - 1, a.d) - new Date(b.y, b.m - 1, b.d)) / 86400000);
}

/** 한 달로 치면 얼마 (연간은 12로 나눔) */
export const monthly = (s) => (s.status === "ended" ? 0 : s.cycle === "year" ? (Number(s.price) || 0) / 12 : Number(s.price) || 0);

/** 맨 위 숫자 — 한 달 · 1년 · 앞으로 30일 안에 나갈 돈 */
export function summary(list, today = dayKey()) {
  const live = list.filter((s) => s.status !== "ended");
  const month = live.reduce((a, s) => a + monthly(s), 0);
  const soon = live
    .map((s) => ({ s, at: nextPay(s, today) }))
    .filter((x) => x.at && daysUntil(x.at, today) <= 30);
  return {
    month,
    year: month * 12,
    count: live.length,
    trials: live.filter((s) => s.status === "trial").length,
    soonTotal: soon.reduce((a, x) => a + (Number(x.s.price) || 0), 0),
    soonCount: soon.length,
  };
}

/** 이름으로 정해지는 타일 색 — 로고 대신 (바깥 이미지를 안 불러온다) */
const TILE = ["#9f1239", "#44403c", "#0f766e", "#1d4ed8", "#a16207", "#6d28d9", "#be123c", "#334155"];
export function tileColor(name) {
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE[h % TILE.length];
}

// ---------------------------------------------------------------- 카드 썸네일 (10/7 세원: "줄로 말고 블록으로, 썸네일은 직관적으로 — 노션 카드처럼")
//
// 순서: ① 세원이 붙여 넣은 로고 사진(s.logo, data URL — 작아서 settings 에 같이 둔다) ② 이름으로 알아보는 곳은 글자·색으로 그린 로고 모양
// ③ 그 밖은 이름을 크게. 바깥 로고 이미지는 여전히 안 불러온다(주소가 바뀌거나 막히면 깨지므로).
// size 는 썸네일 폭에 대한 % (cqw) — 카드·고치기 창 미리 보기 크기가 달라도 같은 비율로 보인다.
export const BRANDS = [
  { re: /netflix|넷플릭스/, bg: "#000", text: "N", color: "#E50914", size: 30, weight: 900, squish: true },
  { re: /granter|그랜터/, bg: "#fff", text: "granter", color: "#111", size: 15, weight: 800, tracking: "-0.04em" },
  { re: /vrew|브루/, bg: "#fff", text: "vrew", color: "#5B3DF5", size: 17, weight: 800, tracking: "-0.03em" },
  { re: /claude|클로드/, bg: "#F0EEE6", text: "Claude", color: "#3D3929", size: 13, weight: 600, serif: true, icon: "burst", iconColor: "#D97757" },
  { re: /adobe|어도비|포토샵|photoshop|프리미어|premiere|라이트룸|lightroom|일러스트레이터|illustrator/, bg: "#EB1000", text: "Adobe", color: "#fff", size: 15, weight: 800 },
  { re: /canva|캔바/, bg: "linear-gradient(135deg,#00C4CC,#7D2AE8)", text: "Canva", color: "#fff", size: 16, weight: 700, italic: true, serif: true },
  { re: /notion|노션/, bg: "#fff", text: "N", color: "#111", size: 17, weight: 700, serif: true, boxed: true },
  { re: /cafe24|카페24/, bg: "#fff", text: "cafe24", color: "#1D3FFF", size: 15, weight: 800, tracking: "-0.03em" },
  { re: /capcut|캡컷/, bg: "#000", text: "CapCut", color: "#fff", size: 14, weight: 800 },
  { re: /chatgpt|openai|gpt|지피티|오픈ai/, bg: "#000", text: "ChatGPT", color: "#fff", size: 13, weight: 700 },
  { re: /youtube|유튜브/, bg: "#fff", text: "YouTube", color: "#0F0F0F", size: 12, weight: 800, tracking: "-0.03em", icon: "play" },
  { re: /google|구글/, bg: "#fff", letters: [["G", "#4285F4"], ["o", "#EA4335"], ["o", "#FBBC05"], ["g", "#4285F4"], ["l", "#34A853"], ["e", "#EA4335"]], size: 15, weight: 600 },
  { re: /naver|네이버/, bg: "#03C75A", text: "NAVER", color: "#fff", size: 14, weight: 900 },
  { re: /kakao|카카오/, bg: "#FEE500", text: "kakao", color: "#191919", size: 15, weight: 800 },
  { re: /meta|메타|facebook|페이스북|instagram|인스타/, bg: "#fff", text: "Meta", color: "#0866FF", size: 16, weight: 700 },
];
export const brandOf = (name) => {
  const n = String(name || "").toLowerCase().replace(/\s+/g, "");
  return (n && BRANDS.find((b) => b.re.test(n))) || null;
};

/** 이름 글자 크기(썸네일 폭 %) — 한글 한 글자 1, 영문·숫자 약 0.6 으로 쳐서 폭의 78% 안에 */
export function nameFit(name) {
  let w = 0;
  for (const ch of String(name || "")) w += /[ㄱ-힣]/.test(ch) ? 1 : ch === " " ? 0.3 : /[A-Z]/.test(ch) ? 0.68 : 0.58;
  return Math.max(7, Math.min(17, 78 / Math.max(w, 1)));
}

/**
 * 붙여 넣은 로고 사진 → {logo: 작은 그림(data URL), logoBg: 바탕색}.
 * 둘레의 같은 색 여백은 잘라 낸다 — 캡처를 대충 붙여도 로고만 가운데 크게, 바탕은 사진 귀퉁이 색으로 채운다(검은 바탕 로고면 카드도 검정).
 */
export async function makeLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("사진을 열지 못했어요."));
      i.src = url;
    });
    const s0 = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s0));
    c.height = Math.max(1, Math.round(img.naturalHeight * s0));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const [r0, g0, b0, a0] = data;
    const clear = a0 < 128;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const a = data[i + 3];
        const far = clear ? a > 40 : a > 40 && Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 48;
        if (!far) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) [x0, y0, x1, y1] = [0, 0, c.width - 1, c.height - 1];
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const s = Math.min(1, 320 / Math.max(cw, ch));
    const o = document.createElement("canvas");
    o.width = Math.max(1, Math.round(cw * s));
    o.height = Math.max(1, Math.round(ch * s));
    o.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, o.width, o.height);
    let logo = o.toDataURL("image/webp", 0.9);
    if (!logo.startsWith("data:image/webp")) logo = o.toDataURL("image/png");
    const hex = (n) => n.toString(16).padStart(2, "0");
    return { logo, logoBg: clear ? "#ffffff" : `#${hex(r0)}${hex(g0)}${hex(b0)}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}
