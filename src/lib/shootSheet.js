// 촬영 시트 링크 (10/25) — 모델에게 보내는 '그날 촬영' 한 장.
// 세원: "모델분들도 다른 건 다 못 보게 하고 촬영 관리만 볼 수 있게" → 계정 대신 링크(세원 OK):
//   ERP 촬영 › 촬영 관리 — 촬영 창 '모델에게 보낼 링크 만들기' → 무작위 토큰 링크 #sheet=<토큰>
//   모델(로그인 없음) — main.jsx 가 #sheet= 이면 App 대신 SheetPage 만 그린다.
//
// 시트 = 스냅숏: 링크를 만들거나 '내용 새로 보내기'를 누를 때 그날 내용만 골라 저장한다 —
//   날짜 · 시각 · 장소 · 모델에게 한 줄 · 코디 순서대로 [코디 이름 · 상품(이름 · 색상 · 사진) · 스타일링 · 참고 사진].
//   ⛔ 도매가 · 판매가 · 거래처 · 위치 · 신마 링크 · 내부 메모는 절대 넣지 않는다(pick 함수가 고른 칸만 넣는다).
//   사진은 보관함이 비공개라 서명 주소(7일), 신마 사진은 주소 그대로. 7일이 지나면 '내용 새로 보내기'로 다시 서명.
//
// 저장 (공유 장부): Supabase 표 shoot_sheets {id, token, data, closed, updated_at, created_at}
//   로그인한 사람은 표를 그대로, 모델(anon)은 SECURITY DEFINER 함수 sheet_get(토큰)만(닫힌 건 null). SQL 은 supabase/shoot_sheets.sql.
//   이 기기 저장 모드(VITE_SUPABASE_URL 없음)는 localStorage 'poclo_shoot_sheets' 로 같은 동작(시험용).
import { isRemote, supabase } from "./supabase";
import { newToken, callName, isMissing } from "./contract";
import { codiItems, codiName, colorList, md } from "./shoot";
import { dayKey } from "./journal";

const LOCAL = "poclo_shoot_sheets";
export const SHEET_DAYS = 7; // 사진 서명 주소가 살아 있는 날

export const sheetLink = (token) => `${window.location.origin}/#sheet=${token}`;
export const sheetTokenOfHash = (h) => {
  const m = String(h || "").match(/^#sheet=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : "";
};
const wd = (d) => (d ? "일월화수목금토"[new Date(d + "T00:00:00").getDay()] : "");
export const dayLabel = (d) => (d ? `${md(d)}(${wd(d)})` : "");
/** DM 문구 — 촬영이 내일이면 '내일', 아니면 날짜 */
export function sheetDm(name, token, on, today) {
  const t = new Date(today + "T00:00:00");
  t.setDate(t.getDate() + 1);
  const tomorrow = dayKey(t);
  const when = on === tomorrow ? "내일" : on === today ? "오늘" : dayLabel(on);
  return `${callName(name)}! ${when} 촬영 시트예요 ☺️\n시간·장소랑 찍을 코디 미리 봐 주세요 💗\n${sheetLink(token)}`;
}

export class SheetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ------------------------------------------------------------ 스냅숏 — 모델이 봐도 되는 칸만

/** 보관 키들 → 7일 서명 주소 (공유 장부만) */
async function longUrls(keys, online) {
  const ks = [...new Set(keys.filter((k) => k && !String(k).startsWith("local/")))];
  if (!(isRemote && online) || !ks.length) return {};
  const out = {};
  for (let i = 0; i < ks.length; i += 100) {
    const { data } = await supabase.storage.from("reels").createSignedUrls(ks.slice(i, i + 100), 60 * 60 * 24 * SHEET_DAYS);
    for (const r of data || []) if (r.signedUrl) out[r.path] = r.signedUrl;
  }
  return out;
}

/**
 * 그날 시트 내용 — day = shoot_days 한 줄, codis = 그날 코디, d = 신상 관리 데이터(items·refs·urls)
 * 이 기기 저장 모드면 사진은 화면에 이미 있는 주소(d.urls)를 쓴다.
 */
export async function buildSheet(day, codis, d, online) {
  const its = (c) => codiItems(c, d.items);
  const refsOf = (ids) => (ids || []).map((id) => d.refs.find((r) => r.id === id)).filter(Boolean);
  const keys = [];
  for (const c of codis) {
    for (const x of its(c)) if (x.photo) keys.push(x.photo);
    const st = c.styling || {};
    for (const s of [...(st.shoes || []), ...(st.bag || [])]) {
      const x = s.itemId && d.items.find((i) => i.id === s.itemId);
      if (x?.photo) keys.push(x.photo);
    }
    for (const r of refsOf([...(c.refIds || []), ...(st.refIds || [])])) keys.push(r.photo);
  }
  const signed = await longUrls(keys, online);
  const urlOf = (k, fallback) => (k && (signed[k] || (!(isRemote && online) ? d.urls[k] : ""))) || fallback || "";
  const pickItem = (x, c) => ({
    name: x.name || "",
    color: (c.colors?.[x.id] || []).join(", ") || colorList(x).join(", "),
    photo: urlOf(x.photo, x.photoUrl),
  });
  const pickWear = (s) => {
    if (!s) return null;
    if (s.itemId) {
      const x = d.items.find((i) => i.id === s.itemId);
      return x ? { text: x.name || "", photo: urlOf(x.photo, x.photoUrl) } : null;
    }
    return s.text ? { text: s.text } : null;
  };
  return {
    on: day.on || "",
    time: day.time || "",
    place: day.place || "",
    models: (day.models || []).filter(Boolean),
    note: day.modelNote || "",
    codis: codis.map((c) => {
      const st = c.styling || {};
      return {
        name: codiName(c, d.items),
        items: its(c).map((x) => pickItem(x, c)),
        styling: {
          hair: st.hair || [],
          shoes: (st.shoes || []).map(pickWear).filter(Boolean),
          bag: (st.bag || []).map(pickWear).filter(Boolean),
          acc: st.acc || [],
          memo: st.memo || "",
        },
        refs: refsOf([...new Set([...(st.refIds || []), ...(c.refIds || [])])])
          .map((r) => urlOf(r.photo))
          .filter(Boolean),
      };
    }),
    madeAt: new Date().toISOString(),
    until: new Date(Date.now() + SHEET_DAYS * 86400000).toISOString(),
  };
}

// ------------------------------------------------------------ 저장 — 공유 장부면 표, 아니면 이 기기

const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || "[]");
  } catch {
    return [];
  }
};
const writeLocal = (list) => localStorage.setItem(LOCAL, JSON.stringify(list));
const missing = (e) => (isMissing(e) ? new SheetError("missing", "shoot_sheets 표가 아직 없어요") : e);

/** 새 링크 — 토큰을 돌려준다 */
export async function createSheet(online, data) {
  const token = newToken();
  if (!(isRemote && online)) {
    writeLocal([{ id: crypto.randomUUID(), token, data, closed: false, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }, ...readLocal()]);
    return token;
  }
  const { error } = await supabase.from("shoot_sheets").insert({ token, data, closed: false });
  if (error) throw missing(error);
  return token;
}

/** 내용 새로 보내기 · 닫기 · 다시 열기 */
export async function updateSheet(online, token, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (!(isRemote && online)) {
    writeLocal(readLocal().map((x) => (x.token === token ? { ...x, ...row } : x)));
    return;
  }
  const { error } = await supabase.from("shoot_sheets").update(row).eq("token", token);
  if (error) throw missing(error);
}

/** 모델 — 토큰으로 시트 읽기. 없거나 닫혔으면 null */
export async function getSheet(token) {
  if (!isRemote) {
    const r = readLocal().find((x) => x.token === token);
    return r && !r.closed ? { data: r.data, updated_at: r.updated_at } : null;
  }
  const { data, error } = await supabase.rpc("sheet_get", { p_token: token });
  if (error) throw missing(error);
  return data || null;
}
