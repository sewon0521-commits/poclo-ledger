// 촬영 시트 링크 (10/25) — 모델에게 보내는 '그날 촬영' 한 장.
// 세원: "모델분들도 다른 건 다 못 보게 하고 촬영 관리만 볼 수 있게" → 계정 대신 링크(세원 OK):
//   ERP 촬영 › 촬영 관리 — 촬영 창 '모델에게 보낼 링크 만들기' → 무작위 토큰 링크 #sheet=<토큰>
//   모델(로그인 없음) — main.jsx 가 #sheet= 이면 App 대신 SheetPage 만 그린다.
//
// 시트 = 스냅숏: 링크를 만들거나 '내용 새로 보내기'를 누를 때 그날 내용만 골라 저장한다 —
//   날짜 · 시각 · 장소 · 모델에게 전할 말(인사 한 줄 + 준비하실 것 · 미리 알려 주세요 · 참고해 주세요, 10/27) · 영상 가이드(사진 · 레퍼런스 링크, 10/27) ·
//   코디 순서대로(촬영 창에서 끌어 정한 순서) [메모 · 참고 영상 장면 · 참고 사진 · 인스타 레퍼런스]. 시트 화면 순서는 SheetPage(첫 카드 → 전할 말 → 코디 → 영상 가이드).
//   10/29 세원(이주현 촬영 뒤): "모델에게 보낼 시트 중에서 코디는 필요 없을 것 같아. 모델은 입히는 옷만 그냥 입거든. 대신 사진 레퍼런스, 영상 레퍼런스가 정말 중요해." →
//     v3: 코디 사진은 빼고 스타일링 창의 참고 사진 · 참고 영상(릴스 기획에서 자른 장면) · 인스타 주소 레퍼런스.
//   같은 날 세원: "모델에게 보낼 촬영 시트는 저번처럼 영상 가이드 해 주면 될 것 같고, 참고 영상은 우리 보면서 찍으려고 한 거여서 모델한테 굳이 안 보여 줘도 될 것 같아.
//     우리가 직접 해당 코디 찍을 때 디렉하면 될 것 같아. 상품 특징 보고." → **v4: 코디 칸을 통째로 뺐다** — 날짜·시각·장소 · 모델에게 전할 말 · 영상 가이드만.
//     스타일링 창의 참고 사진·참고 영상·메모는 촬영 때 우리가 보는 것(ERP 안에서만). 아래 '10/27 …코디 사진 + 메모만'은 v2 때 이야기.
//   같은 날 세원: "기본 동선 같은 건 기본으로 깔아 두자 — 모델한테 보내는 기본 가이드(동선 · 찍을 영상 · 추구하는 것 · 포즈), 계속 쌓아 나가자" →
//     v4 에 base(촬영 기본 가이드, settings model_guide — lib/modelGuide.js). 시트 순서: 첫 카드 → 전할 말 → 촬영 기본 가이드 → 영상 가이드.
//   10/27 세원: "링크에 코디1 에 신상마켓 상품들 나오는데 그거 다 없애고 내가 첨부한 코디 사진 + 메모만" →
//     상품(이름·색·사진) · 스타일링 칩 · 참고 사진은 넣지 않는다. 메모 = 스타일링 창 '메모'(모델 시트용 칸). 코디 이름은 직접 지은 것만(자동 이름 = 상품 이름이라 뺀다).
//   ⛔ 도매가 · 판매가 · 거래처 · 위치 · 신마 링크 · 내부 메모는 절대 넣지 않는다(고른 칸만 넣는다).
//   사진은 보관함이 비공개라 서명 주소(7일). 7일이 지나면 '내용 새로 보내기'로 다시 서명.
//
// 저장 (공유 장부): Supabase 표 shoot_sheets {id, token, data, closed, updated_at, created_at}
//   로그인한 사람은 표를 그대로, 모델(anon)은 SECURITY DEFINER 함수 sheet_get(토큰)만(닫힌 건 null). SQL 은 supabase/shoot_sheets.sql.
//   이 기기 저장 모드(VITE_SUPABASE_URL 없음)는 localStorage 'poclo_shoot_sheets' 로 같은 동작(시험용).
import { isRemote, supabase } from "./supabase";
import { newToken, callName, isMissing } from "./contract";
import { md, loadKey, codiItems, photoUrls } from "./shoot";
import { GUIDE_KEY, DEFAULT_GUIDE, filledItems } from "./modelGuide";
import { videoKey, thumbKey } from "./refClips";
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
  return `${callName(name)}! ${when} 촬영 시트예요 ☺️\n시간·장소랑 영상 가이드 미리 봐 주세요 💗\n${sheetLink(token)}`;
}

// ------------------------------------------------------------ 모델에게 전할 말 (10/27)
// 세원: "촬영 영상 가이드만 냅두고 준비하실 것 · 미리 알려 주세요 · 참고해 주세요는 내가 적는 걸로 따로 빼서 코디 바로 위에. 모델에게 한 줄을 내가 말한 걸로 바꾸는 거지."
// 처음엔 이 세 칸이 가이드 이미지 맨 아래에 그려져 있었다. 이제 촬영 줄 prep {bring, ask, info}(한 줄에 하나씩) — 시트엔 [{title, items}](빈 칸은 뺌).
// 예전 '모델에게 한 줄'(modelNote → 시트 note)은 이 칸 맨 위 인사말로 남는다.
export const PREP_PARTS = [
  { k: "bring", title: "준비하실 것", hint: "예: 기본 메이크업\n스킨톤 속옷, 니플패치나 오프숄더용 브라" },
  { k: "ask", title: "미리 알려 주세요", hint: "예: 차 가지고 오시나요? 주차 필요 여부를 알려 주세요" },
  { k: "info", title: "참고해 주세요", hint: "예: 옷·신발은 저희가 준비해요" },
];
/** 한 줄에 하나 — 앞에 붙인 - • * 1. 은 뗀다 */
export const prepLines = (t) =>
  String(t || "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
export const hasPrep = (day) => PREP_PARTS.some((p) => prepLines(day?.prep?.[p.k]).length > 0);

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

// ------------------------------------------------------------ 찍을 코디 미리 보기 (10/29 밤)
// 세원: "대충 요런 코디 찍는다는 것도 보여 주고 싶긴 한데, 우리가 촬영해서 보내 주는 건 안 할라고 — 기존 신마 썸네일 좀 작게 해서?"
// → 코디마다 상품 사진(신상 관리 대표 사진)을 **폭 144px 로 줄인 사진 자체**(data URL, 처음엔 96px)로 넣는다 — 화면에서만 작게가 아니라 파일이 작아서
//   모델이 확대해도 신마 사진의 거래처 워터마크가 안 읽히고, 신마 주소·오래 사는 서명 주소도 안 나간다. 상품 이름·가격·거래처는 안 넣는다.
// 10/30 세원: "너무 안 보이는데? 살짝만 크게" — 96 → 144px(화면 72×96 의 2배). 이보다 크면 워터마크가 읽히기 시작한다
const PEEK_W = 144;
async function tinyPhoto(src) {
  try {
    const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
    if (!blob.type.startsWith("image/")) return "";
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = PEEK_W;
    c.height = Math.round((bmp.height * PEEK_W) / bmp.width);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  } catch {
    return "";
  }
}
/** 코디마다 [작은 사진…] — 입는 순서(이너·상의·아우터·하의…), 코디당 6장까지 */
async function peekOf(codis, d, online) {
  const its = codis.map((c) => codiItems(c, d.items).slice(0, 6));
  const keys = [...new Set(its.flat().map((x) => x.photo).filter((k) => k && !k.startsWith("data:") && !d.urls[k]))];
  const more = keys.length ? await photoUrls(keys, online).catch(() => ({})) : {};
  const srcOf = (x) => {
    if (x.photo?.startsWith("data:")) return x.photo;
    const u = (x.photo && (d.urls[x.photo] || more[x.photo])) || "";
    if (u) return u;
    // 우리 보관함에 없고 신마 주소만 있으면 서버가 대신 받아 준다(남의 사이트 사진은 브라우저가 직접 못 받아서 — api/img)
    return x.photoUrl ? { proxy: x.photoUrl } : "";
  };
  return Promise.all(
    its.map(async (list) =>
      (
        await Promise.all(
          list.map(async (x) => {
            const s = srcOf(x);
            if (!s) return "";
            if (typeof s === "string") return tinyPhoto(s);
            try {
              const r = await fetch("/api/img", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.proxy }) });
              return r.ok ? tinyPhoto(await r.blob()) : "";
            } catch {
              return "";
            }
          }),
        )
      ).filter(Boolean),
    ),
  );
}

/**
 * 그날 시트 내용 — day = shoot_days 한 줄, codis = 그날 코디, d = 신상 관리 데이터(items·refs·urls)
 * 이 기기 저장 모드면 사진은 화면에 이미 있는 주소(d.urls)를 쓴다.
 */
export async function buildSheet(day, codis, d, online) {
  // 10/29 모델 기본 가이드 — 모든 시트에 같이(lib/modelGuide). 한 번도 저장 안 했으면 기본 동선
  const g = await loadKey(GUIDE_KEY, online, null).catch(() => null);
  const baseItems = filledItems(g ? g.items : DEFAULT_GUIDE.items);
  const keys = [];
  for (const x of baseItems) {
    for (const p of x.photos || []) if (p.key && !p.key.startsWith("data:")) keys.push(p.key);
    for (const cl of x.clips || []) keys.push(videoKey(cl.reelId), thumbKey(cl.reelId));
  }
  for (const k of day.guidePhotos || []) if (!k.startsWith("data:")) keys.push(k);
  const signed = await longUrls(keys, online);
  const urlOf = (k) => (k && (k.startsWith("data:") ? k : signed[k] || (!(isRemote && online) ? d.urls[k] : ""))) || "";
  // 찍을 코디 미리 보기 — 촬영 창에서 끌 수 있다(day.sheetPeek === false). 사진이 하나도 없는 코디는 뺀다
  const peek = day.sheetPeek === false ? [] : (await peekOf(codis, d, online)).filter((l) => l.length);
  return {
    on: day.on || "",
    time: day.time || "",
    place: day.place || "",
    models: (day.models || []).filter(Boolean),
    note: day.modelNote || "",
    // 10/27 모델에게 전할 말 — 준비하실 것 · 미리 알려 주세요 · 참고해 주세요 (시트에선 코디 바로 위)
    prep: PREP_PARTS.map((p) => ({ title: p.title, items: prepLines(day.prep?.[p.k]) })).filter((x) => x.items.length),
    // 10/29 v4 — 코디 칸 없음(날짜·장소 · 전할 말 · 영상 가이드만). 이미 보낸 v1~v3 시트는 SheetPage 가 예전 모양 그대로 그린다
    v: 4,
    peek, // 10/29 밤 찍을 코디 미리 보기 [[작은 사진 data URL…] 코디마다]
    // 10/29 촬영 기본 가이드(모든 촬영 공통 — 동선·찍을 영상·포즈…) — 글은 그대로, 시트(SheetPage → BaseGuide)가 번호 단계·사진/영상 표시로 그린다
    base: baseItems.map((x) => ({
      title: (x.title || "").trim(),
      text: x.text || "",
      photos: (x.photos || []).map((p) => ({ url: urlOf(p.key), cap: (p.cap || "").trim() })).filter((p) => p.url),
      // 칸마다 참고 영상 — 릴스 기획에서 자른 장면(파일은 그대로, 7일 서명 주소 · 누르면 그 장면만 반복) · 인스타 주소
      clips: (x.clips || []).map((cl) => ({ src: urlOf(videoKey(cl.reelId)), poster: urlOf(thumbKey(cl.reelId)), start: cl.start || 0, end: cl.end || 0, note: (cl.note || "").trim() })),
      links: (x.links || []).filter((l) => /^https?:\/\//i.test(l.url || "")).map((l) => ({ name: (l.name || "").trim(), url: l.url })),
    })),
    // 10/27 모델에게 보낼 가이드 — '영상 가이드'(사진은 7일 서명 주소, 링크는 이름 + 주소)
    guide: {
      photos: (day.guidePhotos || []).map(urlOf).filter(Boolean),
      links: (day.guideLinks || []).filter((l) => /^https?:\/\//i.test(l.url || "")).map((l) => ({ name: (l.name || "").trim(), url: l.url })),
    },
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
