import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  Loader2,
  ImagePlus,
  Trash2,
  Check,
  ChevronRight,
  Pencil,
  CalendarDays,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudFog,
  CloudLightning,
  Megaphone,
  Shirt,
  Images,
  Star,
  SlidersHorizontal,
  Link2,
  ExternalLink,
} from "lucide-react";
import { FIELD, md, won, loadKey, changeKey, upsert, remove, putPhoto, photoUrls, shopsOf, hasCut, codiName } from "../lib/shoot";
import { CutFilter } from "./CutBits";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { stageName } from "../lib/sinsang";
import { BigSlides } from "./ContentBits";
import { lookKinds, lookGroupOf, lookBest, bestPatch } from "../lib/lookStars";
import { catsOf, mixOf, isShopCat } from "../lib/sourceMix";
import { clipImages, filesOf } from "../lib/pasteImages";
import { folderIdOf, withChildren, ordered } from "../lib/reelFolders";

/**
 * 촬영 › 소싱 관리 — 10/12 '코디 촬영 관리'에서 이름 바꿈(세원: "사무실에 스튜디오가 생겨 수시로 촬영하니까 소싱 관리로, 촬영 → 소싱")
 * 예전 이름: 코디 촬영 관리 (10/4 세원 — 노션 '쇼핑몰 별 BEST 컷 모음' 화면을 보여 주며):
 *   "코디 촬영 관리란을 만들어 줘. 이번 촬영 때 어떤 컷·어떤 영상을 찍어야 하는지, 쇼핑몰별 베스트컷 모음집,
 *    이번 촬영 날씨 — 언제 올라가고 사람들이 이날 보니 이 날씨에 어떤 제품을 사겠구나, 쇼만마에서 어떤 코디를 찍어라·
 *    지금 어떤 코디가 뜬다는 걸 내가 정리해 넣는 칸."
 *
 * 10/21 세원: "찍을 컷·찍을 영상은 없어도 될 것 같고, 소싱 관리에서 제일 중요한 건 촬영 레퍼런스 칸 — 사진 하나하나 메모를" +
 *   "'+ 룩 적기'를 없애고 콘텐츠 레퍼런스·쇼핑몰 레퍼런스·우리빨로 나누고, 위에 바로 이번 소싱이 몇 %인지" (lib/sourceMix.js)
 *   → 회차 창 맨 위가 촬영 레퍼런스(비율 바 + 사진마다 분류·메모). 찍을 컷·영상 칸은 뺐다(예전 데이터 cuts·videos 는 그대로 남아 있음).
 *
 * 탭 둘 (settings 키):
 *   촬영 회차      shoot_sessions  [{id, on, title, place, uploads:[날짜], refIds, refLooks:{레퍼런스 id: {cat, memo, itemIds, groups, best}}, shops:[{id,name,url,photos}], sellNote, memo}]
 *                  shops = 예전 쇼핑몰 BEST 컷 (10/4~10/21). 10/21 칸을 없애고 촬영 레퍼런스의 '쇼핑몰 레퍼런스' + 쇼핑몰 고르기로 대신 —
 *                  사진이 남아 있는 회차는 창에서 '촬영 레퍼런스로 옮기기'. 예전 탭 키 shop_best 는 10/4 에 비었다.
 *   쇼만마 코디 노트 shomanma_notes  [{id, on, text, photos:[]}]
 * 날씨는 Open-Meteo(무료·키 없음, 서울) — 16일 안은 예보, 그 뒤는 작년 같은 날. 기온별 옷차림은 흔히 쓰는 표로 짐작만 한다.
 * 사진은 신상 관리와 같은 보관함(reels/shoot/…), 이 기기 저장 모드면 이 기기에.
 */

const KEYS = { sessions: "shoot_sessions", notes: "shomanma_notes" };

// ---------------------------------------------------------------- 저장 (서버 최신을 읽어 한 줄만 바꿔 쓰기)

// 이 기기에 남아 있는 사본이 있으면 바로 보여 주고 뒤에서 새로 읽는다 (10/15 '무한로딩' — 매번 '불러오는 중'으로 기다리던 것)
const cachedList = (key) => {
  try {
    return JSON.parse(localStorage.getItem("poclo_" + key) || "null")?.items || null;
  } catch {
    return null;
  }
};
function useList(key, online) {
  const [items, setItems] = useState(() => cachedList(key) || []);
  const [loaded, setLoaded] = useState(() => !!cachedList(key));
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    loadKey(key, online)
      .then((v) => alive && setItems(v.items || []))
      .catch(() => alive && setMsg("불러오지 못했어요. 인터넷을 확인해 주세요."))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [key, online]);
  const change = useCallback(
    async (fn) => {
      try {
        const next = await changeKey(key, online, fn);
        setItems(next.items || []);
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
      }
    },
    [key, online],
  );
  return { items, loaded, msg, setMsg, save: (it) => change(upsert(it)), drop: (id) => change(remove(id)), change };
}

// ---------------------------------------------------------------- 사진

const LOCAL = "poclo_shoot_plan_photos";
const URLS = new Map(); // 보관 키 → {url, exp}
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || "{}");
  } catch {
    return {};
  }
};
function shrinkData(file, edge = 1000) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("사진을 열지 못했어요."));
    };
    img.src = u;
  });
}
async function savePhotos(files, online) {
  const out = [];
  for (const f of [...files].filter((x) => x.type.startsWith("image/"))) {
    const key = await putPhoto(f, online);
    if (key) {
      // 서명 주소를 다시 받기 전에도 바로 보이게 — 붙여넣은 그 사진을 그대로 보여 준다
      URLS.set(key, { url: URL.createObjectURL(f), exp: Date.now() + 3 * 3600 * 1000 });
      out.push(key);
      continue;
    }
    const k = `local/${newId("p")}`;
    const m = readLocal();
    m[k] = await shrinkData(f);
    localStorage.setItem(LOCAL, JSON.stringify(m));
    out.push(k);
  }
  return out;
}
function usePhotoUrls(keys, online) {
  const sig = [...new Set(keys)].join("|");
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const ks = sig ? sig.split("|") : [];
      const out = {};
      const need = [];
      const loc = readLocal();
      for (const k of ks) {
        if (k.startsWith("local/")) out[k] = loc[k] || null;
        else if (URLS.get(k)?.exp > Date.now()) out[k] = URLS.get(k).url;
        else need.push(k);
      }
      for (let i = 0; i < need.length; i += 100) {
        const got = await photoUrls(need.slice(i, i + 100), online);
        for (const [k, u] of Object.entries(got)) {
          URLS.set(k, { url: u, exp: Date.now() + 3 * 3600 * 1000 });
          out[k] = u;
        }
      }
      if (alive) setUrls(out);
    })();
    return () => {
      alive = false;
    };
  }, [sig, online]);
  return urls;
}

/** 사진 칸 — 누르면 전체 화면(확대), × 빼기 */
function PhotoGrid({ keys, urls, onRemove, size = "md", pending = [] }) {
  const [view, setView] = useState(null);
  if (!keys.length && !pending.length) return null;
  const cols = size === "sm" ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6";
  return (
    <>
      <div className={"grid gap-2 " + cols}>
        {keys.map((k, i) => (
          <span key={k} className="group relative">
            <button type="button" onClick={() => setView(i)} className="block aspect-[3/4] w-full overflow-hidden rounded-lg bg-stone-100">
              {urls[k] ? <img src={urls[k]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Loader2 size={14} className="m-auto mt-[45%] animate-spin text-stone-300" />}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => window.confirm("이 사진을 뺄까요?") && onRemove(k)}
                aria-label="사진 빼기"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-80"
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
        {pending.map((u) => (
          <span key={u} className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
            <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
            <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-white drop-shadow" />
          </span>
        ))}
      </div>
      {view != null && <BigSlides urls={keys.map((k) => urls[k] || "")} start={view} onClose={() => setView(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- 날씨 (Open-Meteo, 서울)

const SEOUL = "latitude=37.5665&longitude=126.978&timezone=Asia%2FSeoul";
let FORECAST = null; // {at, days: {날짜: {max, min, rain, code}}}
const PAST = new Map(); // 작년 같은 날
async function forecast() {
  if (FORECAST && Date.now() - FORECAST.at < 30 * 60 * 1000) return FORECAST.days;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${SEOUL}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=16`);
  const j = await r.json();
  const days = {};
  (j.daily?.time || []).forEach((t, i) => {
    days[t] = { max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i], code: j.daily.weather_code[i] };
  });
  FORECAST = { at: Date.now(), days };
  return days;
}
async function lastYear(date) {
  const y = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
  if (PAST.has(y)) return PAST.get(y);
  const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${SEOUL}&start_date=${y}&end_date=${y}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code`);
  const j = await r.json();
  const d = j.daily?.time?.length ? { max: j.daily.temperature_2m_max[0], min: j.daily.temperature_2m_min[0], mm: j.daily.precipitation_sum[0], code: j.daily.weather_code[0], past: y } : null;
  PAST.set(y, d);
  return d;
}
function useWeather(dates) {
  const sig = [...new Set(dates.filter(Boolean))].sort().join("|");
  const [w, setW] = useState({});
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    (async () => {
      const out = {};
      let f = {};
      try {
        f = await forecast();
      } catch {
        /* 인터넷이 없으면 비워 둔다 */
      }
      for (const d of sig.split("|")) {
        if (f[d]) out[d] = f[d];
        else if (d < dayKey()) out[d] = null;
        else {
          try {
            out[d] = await lastYear(d);
          } catch {
            out[d] = null;
          }
        }
      }
      if (alive) setW(out);
    })();
    return () => {
      alive = false;
    };
  }, [sig]);
  return w;
}
// WMO 날씨 코드 → 모양
function WxIcon({ code, size = 16 }) {
  const c = Number(code);
  const I = c === 0 ? Sun : c <= 2 ? CloudSun : c === 3 ? Cloud : c <= 48 ? CloudFog : c <= 67 || (c >= 80 && c <= 82) ? CloudRain : c <= 77 || c === 85 || c === 86 ? CloudSnow : c >= 95 ? CloudLightning : Cloud;
  const tone = c === 0 || c <= 2 ? "text-amber-500" : c <= 48 ? "text-stone-400" : c <= 67 || (c >= 80 && c <= 82) ? "text-sky-600" : "text-sky-400";
  return <I size={size} className={tone} />;
}
// 기온별 옷차림 (하루 평균 기온 기준, 흔히 쓰는 표) — 짐작용
const WEAR = [
  [28, "민소매 · 반팔 · 반바지 · 린넨 원피스"],
  [23, "반팔 · 얇은 셔츠 · 면바지 · 반바지"],
  [20, "긴팔티 · 얇은 가디건 · 셔츠 · 슬랙스"],
  [17, "니트 · 맨투맨 · 얇은 자켓 · 가디건 · 청바지"],
  [12, "자켓 · 트렌치 · 니트 · 스타킹 · 청바지"],
  [9, "트렌치 · 야상 · 점퍼 · 니트 레이어드"],
  [5, "코트 · 가죽자켓 · 히트텍 · 기모"],
  [-99, "패딩 · 두꺼운 코트 · 목도리 · 기모"],
];
const wearOf = (w) => (w ? WEAR.find(([t]) => (w.max + w.min) / 2 >= t)?.[1] : "");

function WeatherRow({ label, date, w }) {
  const wd = date ? "일월화수목금토"[new Date(date + "T00:00:00").getDay()] : "";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="w-28 shrink-0 text-xs font-semibold text-stone-500">
        {label}
        {date && <span className="ml-1 font-normal text-stone-400">{md(date)} ({wd})</span>}
      </span>
      {!date ? (
        <span className="text-xs text-stone-400">날짜를 넣으면 날씨가 떠요</span>
      ) : w === undefined ? (
        <Loader2 size={13} className="animate-spin text-stone-300" />
      ) : !w ? (
        <span className="text-xs text-stone-400">날씨 정보 없음</span>
      ) : (
        <>
          <span className="flex items-center gap-1.5 text-sm text-stone-800 tabular-nums">
            <WxIcon code={w.code} /> {Math.round(w.max)}° / {Math.round(w.min)}°
            {w.rain != null && <span className="text-xs text-sky-700">비 {w.rain}%</span>}
            {w.past && <span className="rounded bg-stone-100 px-1.5 text-[10px] text-stone-500">작년 이날{w.mm > 1 ? ` · 비 ${w.mm}mm` : ""}</span>}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-rose-800">
            <Shirt size={12} className="shrink-0" /> {wearOf(w)}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 촬영 회차

const dday = (d) => {
  if (!d) return "";
  const n = Math.round((new Date(d + "T00:00:00") - new Date(dayKey() + "T00:00:00")) / 86400000);
  return n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 전`;
};

// 예전 '옷 종류' 꼬리표 사진은 같은 이름 상위 목록으로 (촬영 레퍼런스와 같게)
const withFolder = (r) => (r.folderId || r.folder ? r : { ...r, folder: (r.clothes || [])[0] || "" });

/** 촬영 레퍼런스에서 사진 고르기 (10/6 세원: "코디 촬영 관리 폴더 만든 곳에서 촬영 레퍼런스에 있는 사진 레퍼런스를 픽할 수 있었으면") */
function RefPick({ d, picked, onDone, onClose }) {
  const [sel, setSel] = useState(picked);
  const [folder, setFolder] = useState("");
  const [cut, setCut] = useState("");
  const [shop, setShop] = useState("");
  const shops = shopsOf(d.tags, d.refs);
  const inFolder = folder ? new Set(withChildren(folder, d.folders)) : null;
  const refs = d.refs
    .map(withFolder)
    .filter((r) => (!inFolder || inFolder.has(folderIdOf(r, d.folders))) && hasCut(r, cut) && (!shop || r.shop === shop));
  const flip = (id) => setSel((x) => (x.includes(id) ? x.filter((k) => k !== id) : [...x, id]));
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <span className="font-semibold text-stone-900">촬영 레퍼런스에서 고르기 <span className="text-sm font-normal text-stone-400">{sel.length}장 골랐어요</span></span>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="shrink-0 space-y-2 border-b border-stone-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select value={folder} onChange={(e) => setFolder(e.target.value)} className={FIELD + " max-w-xs py-1.5 text-sm"}>
              <option value="">목록 전체</option>
              {ordered(d.folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-stone-400">{refs.length}장</span>
          </div>
          {(d.tags?.cuts || []).length > 0 && <CutFilter tags={d.tags} value={cut} onChange={setCut} />}
          {shops.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {["", ...shops].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setShop(s)}
                  className={"rounded-full border px-2.5 py-0.5 text-xs " + (shop === s ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}
                >
                  {s || "쇼핑몰 전체"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {refs.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {refs.map((r) => {
                const on = sel.includes(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => flip(r.id)} className={"relative block aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 " + (on ? "ring-[3px] ring-rose-600" : "")}>
                    {d.urls[r.photo] && <img src={d.urls[r.photo]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    <span className={"absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-white bg-black/20 text-transparent")}>
                      <Check size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-stone-400">{d.refs.length ? "이 목록·컷에는 사진이 없어요." : "촬영 › 촬영 레퍼런스에 사진을 넣으면 여기서 골라요."}</p>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-4 py-2.5">
          <button type="button" onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600">
            그만두기
          </button>
          <button type="button" onClick={() => onDone(sel)} className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white">
            {sel.length}장 담기
          </button>
        </footer>
      </div>
    </div>
  );
}

const REF_FOLDER_KEY = "poclo_plan_ref_folder"; // 붙인 사진이 들어갈 촬영 레퍼런스 목록 (기기마다 기억)

/**
 * 회차에 고른 촬영 레퍼런스 — 누르면 크게, × 빼기.
 * 10/6 세원: "레퍼런스 사진 넣을 때도 복붙으로" → 복사한 사진 Ctrl+V(마우스를 올린 칸) · 끌어다 놓기 · '사진' 고르기.
 * 붙인 사진은 촬영 레퍼런스(shoot_refs)에도 새 사진으로 담기고(고른 목록으로), 이 회차에 바로 들어간다.
 */
/**
 * 이 소싱에서만 쓰는 레퍼런스 메모 (10/14 세원: "소싱 관리 안 촬영 레퍼런스에서만 보이는 댓글 — 사진 밑에
 * '울코트 + 짧은치마 + 울양말 + 어그' 처럼 적으면 바로 보이게. 어떤 룩을 찍어야 하는지 보여 주는 용도.
 * 그리고 이 사진에 내가 소싱한 어떤 제품을 쓰면 좋겠다를 신상 관리에서 고를 수 있게 — 간단하게")
 * 회차의 refLooks {레퍼런스 id: {text, itemIds}} — 촬영 레퍼런스 원본에는 안 붙는다(다른 소싱에선 다른 룩).
 */
/** 예전 '룩'(text)과 메모(memo)를 하나로 — 10/21 '+ 룩 적기'를 없애면서 사진마다 메모 하나만 둔다. 저장하면 memo 에 합쳐지고 text 는 비운다 */
const lookMemo = (look) => [...new Set([look?.text, look?.memo].map((x) => (x || "").trim()).filter(Boolean))].join("\n");

/** 사진 분류 고르기 — 콘텐츠 레퍼런스 · 쇼핑몰 레퍼런스 · 우리빨 … (분류는 비율 바의 '분류·목표 고치기'에서) */
function CatSelect({ cats, value, onChange, className = "" }) {
  const c = cats.find((x) => x.id === value);
  return (
    <span className={"relative flex items-center " + className}>
      <span className="pointer-events-none absolute left-1.5 h-2 w-2 rounded-full" style={{ background: c?.color || "#d6d3d1" }} />
      <select
        value={c ? c.id : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label="이 사진 분류"
        className={"w-full min-w-0 appearance-none truncate rounded-md border py-0.5 pr-1.5 pl-4.5 text-[11px] font-semibold outline-none focus:border-rose-400 " + (c ? "border-transparent" : "border-dashed border-stone-300 font-normal text-stone-400")}
        style={c ? { background: c.color + "1a", color: c.color } : undefined}
      >
        <option value="">분류 안 함</option>
        {cats.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * 한 줄 적기 — 엔터·칸 벗어나면 저장, Esc 되돌림.
 * 10/21 세원: "어느 쇼핑몰? 고르는 거 개빡세. 그냥 적는 걸로" (예전 ShopSelect 목록 고르기를 없앰) + "상품 링크 달 수 있게"
 * 쇼핑몰·링크는 레퍼런스 사진 자체에(ref.shop · ref.link) — 촬영 레퍼런스 화면의 쇼핑몰 줄과 같은 꼬리표.
 */
function LineInput({ value = "", onSave, autoPaste, className = "", ...rest }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setV(value);
  }
  const save = () => {
    const t = v.trim();
    if (t !== (value || "").trim()) onSave(t);
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
        else if (e.key === "Escape") {
          setV(value);
          e.stopPropagation();
        }
      }}
      onPaste={
        autoPaste
          ? (e) => {
              const el = e.currentTarget;
              setTimeout(() => el.blur(), 30); // 링크는 붙여넣으면 바로 저장
            }
          : undefined
      }
      className={className}
      {...rest}
    />
  );
}
const SHOP_INPUT =
  "w-full min-w-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 outline-none placeholder:font-normal placeholder:text-amber-700/60 focus:border-rose-400 focus:bg-white";
const normLink = (t) => (!t ? "" : /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+/.test(t) ? `https://${t}` : t);

/** 레퍼런스 사진의 상품 링크들 — 예전 한 개(ref.link)도 첫 줄로 읽는다 */
const linksOf = (r) => (r?.links?.length ? r.links : r?.link ? [{ id: "l0", kind: "", url: r.link }] : []);

/**
 * 상품 링크 여러 줄 (10/21 세원: "링크 옆에 상의·하의 적을 수 있게 하고 칸 + 로 늘릴 수 있게")
 * 줄마다 [이름(상의·하의…)] [링크] 열기 ×, 아래 '+ 링크'. 저장 = ref.links [{id, kind, url}] (예전 ref.link 는 비운다).
 * 빈 줄은 저장하지 않는다(화면에만). 링크를 붙여넣으면 바로 저장, 'ppoclo.kr/…' 처럼 적으면 https:// 를 붙인다.
 */
function LinkList({ links, onSave }) {
  const [draft, setDraft] = useState([]); // '+ 링크'로 더한 아직 빈 줄
  const [first] = useState(() => newId("lk")); // 아무것도 없을 때 보이는 첫 빈 줄
  const [focusId, setFocusId] = useState("");
  const rows = [...links, ...draft.filter((d) => !links.some((l) => l.id === d.id))];
  const shown = rows.length ? rows : [{ id: first, kind: "", url: "" }];
  const commit = (id, patch) => {
    const cur = shown.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setDraft((d) => d.filter((x) => !cur.some((r) => r.id === x.id && (r.url || r.kind))));
    onSave(cur.filter((r) => r.url || r.kind));
  };
  const drop = (id) => {
    setDraft((d) => d.filter((x) => x.id !== id));
    if (links.some((l) => l.id === id)) onSave(links.filter((l) => l.id !== id));
  };
  return (
    <div className="space-y-1.5">
      {shown.map((r) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <Link2 size={14} className="shrink-0 text-stone-400" />
          <LineInput
            value={r.kind || ""}
            onSave={(kind) => commit(r.id, { kind })}
            autoFocus={focusId === r.id}
            placeholder="상의"
            aria-label="어떤 상품 (상의·하의…)"
            className="w-20 shrink-0 rounded-lg border border-stone-200 px-2 py-1.5 text-sm font-semibold text-stone-800 outline-none placeholder:font-normal placeholder:text-stone-300 focus:border-rose-400"
          />
          <LineInput
            value={r.url || ""}
            onSave={(t) => commit(r.id, { url: normLink(t) })}
            autoPaste
            inputMode="url"
            placeholder="상품 링크 붙여넣기"
            aria-label="상품 링크"
            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-400"
          />
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer" title={r.url} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
              열기 <ExternalLink size={12} />
            </a>
          )}
          {(r.url || r.kind || shown.length > 1) && (
            <button type="button" onClick={() => drop(r.id)} aria-label="이 링크 빼기" className="shrink-0 p-1 text-stone-300 hover:text-rose-600">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const id = newId("lk");
          setDraft((d) => [...d, { id, kind: "", url: "" }]);
          setFocusId(id);
        }}
        className="ml-5 flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-800"
      >
        <Plus size={12} /> 링크
      </button>
    </div>
  );
}

const MIX_BASIS_KEY = "poclo_mix_basis";
/** 이번 소싱 비율 바 — 신상 관리 '요청한 옷 종류 비율'처럼. 목표 줄을 같이 그리고, 분류를 누르면 그 사진만 */
function SourceMix({ refIds, looks, cats, basis, onBasis, only, onOnly, onEdit, shopOf }) {
  const m = mixOf(refIds, looks, cats, basis);
  // 쇼핑몰 레퍼런스 안에서 어느 쇼핑몰이 몇 장 (사진 기준)
  const shopLines = cats.filter(isShopCat).map((c) => {
    const n = {};
    for (const id of refIds || []) if (looks?.[id]?.cat === c.id) n[shopOf(id) || ""] = (n[shopOf(id) || ""] || 0) + 1;
    const list = Object.entries(n).sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1] - a[1]);
    return { c, list };
  }).filter((x) => x.list.length);
  const unit = basis === "photo" ? "장" : "개";
  const sumT = cats.reduce((n, c) => n + (Number(c.target) || 0), 0);
  return (
    <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-stone-800">
          이번 소싱 비율 <span className="font-normal text-stone-400">{m.sorted ? `분류한 ${m.sorted}${unit}` : ""}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex gap-0.5 rounded-full bg-stone-200/70 p-0.5 text-[11px]">
            {[
              ["photo", "사진 기준"],
              ["item", "상품 기준"],
            ].map(([k, l]) => (
              <button key={k} type="button" onClick={() => onBasis(k)} className={"rounded-full px-2 py-0.5 font-semibold " + (basis === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                {l}
              </button>
            ))}
          </span>
          <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:border-rose-300 hover:text-rose-800">
            <SlidersHorizontal size={12} /> 분류·목표 고치기
          </button>
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[10px] text-stone-400">지금</span>
          <div className="flex h-3.5 flex-1 overflow-hidden rounded-full bg-stone-200/70">
            {m.sorted > 0 &&
              m.rows
                .filter((r) => r.n)
                .map((r) => <span key={r.id} title={`${r.name} ${r.n}${unit} · ${r.pct}%`} style={{ width: `${(r.n / m.sorted) * 100}%`, background: r.color }} className="border-r border-white last:border-r-0" />)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[10px] text-stone-400">목표</span>
          <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200/70">
            {cats
              .filter((c) => c.target > 0)
              .map((c) => (
                <span key={c.id} title={`${c.name} 목표 ${c.target}%`} style={{ width: `${(c.target / Math.max(sumT, 1)) * 100}%`, background: c.color, opacity: 0.45 }} className="border-r border-white last:border-r-0" />
              ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
        {m.rows.map((r) => {
          const on = only === r.id;
          const gap = m.sorted ? r.pct - r.target : 0;
          return (
            <button key={r.id} type="button" onClick={() => onOnly(on ? "" : r.id)} title={on ? "전부 보기" : `${r.name} 사진만 보기`} className={"flex items-center gap-1.5 rounded-full px-2 py-0.5 " + (on ? "bg-stone-800 text-white" : "text-stone-700 hover:bg-white")}>
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.name} <b className="tabular-nums">{r.n}</b>
              <span className={"tabular-nums " + (on ? "text-stone-300" : "text-stone-500")}>{m.sorted ? `${r.pct}%` : "–"}</span>
              <span className={"tabular-nums " + (on ? "text-stone-400" : Math.abs(gap) >= 10 ? (gap < 0 ? "font-semibold text-amber-700" : "text-sky-700") : "text-stone-400")}>/ 목표 {r.target}%</span>
            </button>
          );
        })}
        {m.none > 0 && (
          <button type="button" onClick={() => onOnly(only === "__none" ? "" : "__none")} className={"flex items-center gap-1.5 rounded-full px-2 py-0.5 " + (only === "__none" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-white")}>
            <span className="h-2 w-2 rounded-full border border-dashed border-stone-400" /> 분류 안 함 <b className="tabular-nums">{m.none}</b>
          </button>
        )}
      </div>
      {shopLines.map(({ c, list }) => (
        <p key={c.id} className="mt-1.5 px-2 text-[11px] text-stone-500">
          <span style={{ color: c.color }} className="font-semibold">
            {c.name}
          </span>{" "}
          — {list.map(([n, k]) => `${n || "쇼핑몰 안 정함"} ${k}`).join(" · ")}
        </p>
      ))}
      {m.tip.text && <p className={"mt-2 rounded-lg px-2.5 py-1.5 text-xs " + (m.tip.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>{m.tip.text}</p>}
      {!m.sorted && refIds?.length > 0 && <p className="mt-2 text-[11px] text-stone-400">사진 밑에서 분류를 고르면 비율이 잡혀요.</p>}
    </div>
  );
}

/** 분류·목표 % 고치기 — 모든 소싱 공통(shoot_tags.refCats) */
function CatEditor({ cats, onSave, onClose }) {
  const [list, setList] = useState(() => cats.map(({ id, name, target }) => ({ id, name, target })));
  const sum = list.reduce((n, c) => n + (Number(c.target) || 0), 0);
  const colored = catsOf({ refCats: list });
  const patch = (id, p) => setList((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const ok = list.length > 0 && list.every((c) => c.name.trim());
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50 p-3">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <b className="text-stone-900">분류 · 목표 비율</b>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-stone-500">모든 소싱에 같이 써요. 매출이 올라 비율을 바꾸면(예: 우리빨 50 · 콘텐츠 25 · 쇼핑몰 25) 여기서 고치세요.</p>
        <ul className="space-y-2">
          {list.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colored[i].color }} />
              <input value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} placeholder="분류 이름" className={FIELD + " min-w-0 flex-1 py-1.5 text-sm"} />
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={c.target}
                  aria-label={`${c.name || "분류"} 목표 %`}
                  onChange={(e) => patch(c.id, { target: e.target.value === "" ? "" : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
                  className={FIELD + " w-16 py-1.5 text-right text-sm tabular-nums"}
                />
                <span className="text-xs text-stone-500">%</span>
              </span>
              <button type="button" onClick={() => setList((l) => l.filter((x) => x.id !== c.id))} aria-label="분류 지우기" className="p-1 text-stone-300 hover:text-rose-600">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setList((l) => [...l, { id: newId("mc"), name: "", target: 0 }])} className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:border-rose-300">
          <Plus size={12} /> 분류 더하기
        </button>
        <p className={"mt-3 text-xs " + (sum === 100 ? "text-emerald-700" : "text-amber-700")}>목표 합계 {sum}%{sum === 100 ? "" : " — 100%로 맞추면 보기 편해요"}</p>
        <p className="mt-1 text-[11px] text-stone-400">분류를 지우면 그 분류로 고른 사진은 '분류 안 함'이 돼요.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600">
            그만두기
          </button>
          <button
            type="button"
            disabled={!ok}
            onClick={() => onSave(list.map((c) => ({ id: c.id, name: c.name.trim(), target: Number(c.target) || 0 })))}
            className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

/** 룩 메모 — 여러 줄, 멈추면 0.8초 뒤·칸을 벗어나면 저장 (10/20) */
function LookMemo({ value = "", onSave }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  const timer = useRef(null);
  if (value !== was) {
    setWas(value);
    setV(value);
  }
  const flush = (t) => {
    clearTimeout(timer.current);
    if (t.trim() !== value.trim()) onSave(t.trim());
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <textarea
      value={v}
      rows={3}
      onChange={(e) => {
        const t = e.target.value;
        setV(t);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(t), 800);
      }}
      onBlur={() => flush(v)}
      placeholder="촬영 때 볼 것 · 색 조합 · 사이즈 · 소품 등 자유롭게"
      style={{ fieldSizing: "content" }}
      className="block min-h-20 w-full resize-none rounded-lg border border-stone-200 bg-amber-50/40 px-2.5 py-2 text-sm leading-relaxed text-stone-800 outline-none placeholder:text-stone-300 focus:border-rose-400 focus:bg-white"
    />
  );
}

// 고를 수 있는 상품 (10/14 세원: "촬영 레퍼런스에 모든 제품이 다 뜨는데 — 요청에서는 픽업 요청을 누른 제품만, 입고·픽이랑 촬영까지 뜨는 건 괜찮아")
// 10/20 세원: "룩·상품 고치기에 뜨는 상품 입고·픽만 뜨는 거야? 요청까지 뜨게" → 요청 단계는 전부(픽업 요청 먼저).
// = 입고·픽 → 촬영 → 요청(픽업 요청 켠 것) → 요청. '안 됨'·보류·휴지통·등록 뒤는 빠진다. 찾기도 이 안에서만.
const LOOK_STAGES = ["arrived", "pick", "pickup", "request"];
const lookStage = (x) => (x.stage === "request" ? (x.pickup ? "pickup" : "request") : x.stage);
// 10/21 세원: "룩·상품 고치기에 반납 완료한 상품은 안 떴으면" → 고르는 목록에서 뺀다. 이미 골라 둔 것은 남기되 '반납 완료'로 보인다.
const returnedItem = (x) => !!x.returnedOn || x.settle === "returned";
const stageLabel = (x) => (returnedItem(x) ? "반납 완료" : x.stage === "request" ? (x.pickup ? "픽업 요청" : "요청") : stageName(x.stage));
// 단계 골라 보기 (10/21 세원: "룩·상품 고치기에서 입고·픽, 픽업 요청, 요청 선택할 수 있게") — 여러 개 켜기, 안 켜면 전부. 기기마다 기억
const STAGE_CHIPS = [
  ["arrived", "입고·픽"],
  ["pick", "촬영"],
  ["pickup", "픽업 요청"],
  ["request", "요청"],
];
const LOOK_STAGE_KEY = "poclo_look_stages";
const readLookStages = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_STAGE_KEY) || "[]");
    return Array.isArray(v) ? v.filter((k) => LOOK_STAGES.includes(k)) : [];
  } catch {
    return [];
  }
};

// 고른 상품의 옷 종류 칸 · 칸마다 제일 잘 맞는 상품(10/20) — 규칙은 lib/lookStars (신상 관리 별표와 같이 씀)
/** 사진 밑 한 줄 — 제일 잘 맞는 것이 있으면 '★ 그것들 · 후보 N', 없으면 고른 것 전부. ids = 동그라미 순서(제일 먼저) */
const lookOrder = (d, look) => {
  const items = (look.itemIds || []).map((id) => d.items.find((x) => x.id === id)).filter(Boolean);
  const kinds = lookKinds(d.tags);
  const best = lookBest(look, items, lookGroupOf(kinds, look.groups));
  const picks = kinds.map((k) => best[k]).filter(Boolean);
  const ids = [...picks, ...items.map((x) => x.id).filter((id) => !picks.includes(id))];
  const name = (id) => items.find((x) => x.id === id)?.name || "";
  const line = picks.length ? `★ ${picks.map(name).join(" + ")}${items.length > picks.length ? ` · 후보 ${items.length - picks.length}` : ""}` : items.map((x) => x.name).filter(Boolean).join(" + ");
  return { ids, line };
};
const itemSrc = (x, urls) => urls[x.photo] || x.photoUrl || "";

function LookSheet({ d, r, src, look, cats, onRef, onSave, onBig, onClose }) {
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  // 옷 종류로 나눠 고르기 (10/14 세원: "하의·상의·아우터·기타 등등 카테고리별로 나눠서 고를 수 있게") — "" 전체 · "__etc" 종류 없음/그 밖
  const [kind, setKind] = useState("");
  const [stages, setStagesState] = useState(readLookStages);
  const setStages = (v) => {
    setStagesState(v);
    setMore(false);
    try {
      localStorage.setItem(LOOK_STAGE_KEY, JSON.stringify(v));
    } catch {
      /* 무시 */
    }
  };
  const kinds = d.tags?.clothes?.length ? d.tags.clothes : ["상의", "하의", "원피스·세트", "아우터", "신발·잡화"];
  const kindOf = (x) => (kinds.includes(x.kind) ? x.kind : "__etc");
  const chosen = look.itemIds || [];
  const toggle = (id) => onSave({ itemIds: chosen.includes(id) ? chosen.filter((k) => k !== id) : [...chosen, id] });
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rank = (x) => {
      const k = LOOK_STAGES.indexOf(lookStage(x));
      return k < 0 ? 99 : k;
    };
    const all = d.items.filter((x) => rank(x) < 99 && !returnedItem(x)).sort((a, b) => rank(a) - rank(b));
    if (words.length) return all.filter((x) => words.every((w) => [x.name, x.fullName, x.vendor, x.kind, x.colors].join(" ").toLowerCase().includes(w)));
    return all;
  }, [d.items, q]);
  const picked = chosen.map((id) => d.items.find((x) => x.id === id)).filter(Boolean);
  // 고른 상품은 옷 종류 칸으로, 칸마다 ☆ 제일 잘 맞는 것 (10/20)
  const gKinds = lookKinds(d.tags);
  const groupOf = lookGroupOf(gKinds, look.groups);
  const best = lookBest(look, picked, groupOf);
  const unpicked = list.filter((x) => !chosen.includes(x.id));
  const stageCounts = unpicked.reduce((m, x) => ({ ...m, [lookStage(x)]: (m[lookStage(x)] || 0) + 1 }), {});
  const pool = stages.length ? unpicked.filter((x) => stages.includes(lookStage(x))) : unpicked;
  const counts = pool.reduce((m, x) => ({ ...m, [kindOf(x)]: (m[kindOf(x)] || 0) + 1 }), {});
  const rest = kind ? pool.filter((x) => kindOf(x) === kind) : pool;
  const shown = more ? rest : rest.slice(0, 40);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && !e.target.closest?.("input, textarea") && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const item = (x, on, star) => (
    <button
      key={x.id}
      type="button"
      onClick={() => toggle(x.id)}
      title={on ? "누르면 빼기" : "누르면 고르기"}
      className={
        "relative block w-full overflow-hidden rounded-lg border text-left transition " +
        (on ? (star ? "border-amber-400 ring-2 ring-amber-400" : "border-rose-600 ring-2 ring-rose-600") : "border-stone-200 hover:border-rose-300")
      }
    >
      <span className="block aspect-[3/4] bg-stone-100">{itemSrc(x, d.urls) && <img src={itemSrc(x, d.urls)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}</span>
      <span className="block truncate px-1.5 pt-1 text-[11px] font-medium text-stone-800">{x.name || "이름 없음"}</span>
      {x.price > 0 && <span className="block truncate px-1.5 text-[10px] font-semibold text-stone-600 tabular-nums">공급가 {won(x.price)}</span>}
      <span className={"block truncate px-1.5 pb-1 text-[10px] " + (returnedItem(x) ? "font-semibold text-rose-700" : "text-stone-400")}>
        {stageLabel(x)}
        {x.kind ? ` · ${x.kind}` : ""}
      </span>
      {on && (
        <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );

  return (
    <div className="backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <span className="text-sm font-semibold text-stone-900">이 레퍼런스 분류 · 메모 · 우리 상품 — 이 소싱에서만 보여요</span>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex gap-3">
            <button type="button" onClick={onBig} title="크게 보기" className="block aspect-[3/4] w-28 shrink-0 self-start overflow-hidden rounded-lg bg-stone-100 sm:w-36">
              {src && <img src={src} alt="" decoding="async" className="h-full w-full object-cover" />}
            </button>
            <div className="min-w-0 flex-1">
              {/* 10/21 '어떤 룩' 칸은 없애고 분류 + 메모 하나로 (예전 룩 글은 메모에 합쳐 보인다) */}
              <div className="mb-1 text-xs font-medium text-stone-500">분류</div>
              <CatSelect cats={cats} value={look.cat || ""} onChange={(cat) => onSave({ cat })} className="max-w-xs [&_select]:py-1.5 [&_select]:text-sm" />
              {isShopCat(cats.find((c) => c.id === look.cat)) && (
                <LineInput value={r.shop || ""} onSave={(shop) => onRef(r.id, { shop })} placeholder="어느 쇼핑몰? 적기" aria-label="어느 쇼핑몰" className={SHOP_INPUT + " mt-1.5 max-w-xs py-1.5 text-sm"} />
              )}
              <div className="mt-3 mb-1 text-xs font-medium text-stone-500">상품 링크</div>
              <LinkList links={linksOf(r)} onSave={(links) => onRef(r.id, { links, link: "" })} />
              {(r.shop || r.memo) && <p className="mt-2 text-[11px] text-stone-400">{[r.shop, r.memo].filter(Boolean).join(" · ")}</p>}
              <div className="mt-3 mb-1 text-xs font-medium text-stone-500">메모 — 사진 밑에 바로 보여요</div>
              <LookMemo value={lookMemo(look)} onSave={(memo) => onSave({ memo, text: "" })} />
              {picked.length > 0 && (
                <div className="mt-3 space-y-2.5">
                  <div className="text-xs font-medium text-stone-500">
                    고른 우리 상품 {picked.length} <span className="font-normal text-stone-400">· ☆ 를 누르면 그 칸에서 제일 잘 맞는 것 · 사진을 누르면 빼기</span>
                  </div>
                  {gKinds
                    .filter((k) => picked.some((x) => groupOf(x) === k))
                    .map((k) => {
                      const xs = picked.filter((x) => groupOf(x) === k).sort((a, b) => (b.id === best[k]) - (a.id === best[k]));
                      return (
                        <div key={k}>
                          <div className="mb-1 flex items-baseline gap-1.5 text-xs">
                            <b className="font-semibold text-stone-700">{k}</b>
                            <span className="text-stone-400 tabular-nums">{xs.length}</span>
                            {best[k] && <span className="min-w-0 truncate font-semibold text-amber-700">★ {xs[0].name}</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {xs.map((x) => (
                              <div key={x.id} className="relative">
                                {item(x, true, best[k] === x.id)}
                                <button
                                  type="button"
                                  onClick={() => onSave(bestPatch(look, k, x.id))}
                                  aria-pressed={best[k] === x.id}
                                  title={best[k] === x.id ? "제일 잘 맞음 빼기" : `${k} 중에서 제일 잘 맞음으로`}
                                  className={
                                    "absolute top-1 left-1 flex h-6 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold shadow " +
                                    (best[k] === x.id ? "bg-amber-400 text-amber-950" : "bg-white/90 text-stone-400 hover:text-amber-600")
                                  }
                                >
                                  <Star size={12} className={best[k] === x.id ? "fill-amber-950" : ""} />
                                  {best[k] === x.id && "제일"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-stone-500">이 사진에 쓸 우리 상품 — 신상 관리에서 눌러 고르기</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품·거래처 찾기" className={FIELD + " w-48 py-1.5 text-sm"} />
          </div>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="w-7 shrink-0 text-[11px] text-stone-400">단계</span>
            <button
              type="button"
              onClick={() => setStages([])}
              className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (!stages.length ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
            >
              전체 <span className={!stages.length ? "opacity-70" : "text-stone-400"}>{unpicked.length}</span>
            </button>
            {STAGE_CHIPS.filter(([k]) => stageCounts[k] > 0 || stages.includes(k)).map(([k, label]) => {
              const on = stages.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStages(on ? stages.filter((v) => v !== k) : LOOK_STAGES.filter((v) => v === k || stages.includes(v)))}
                  className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                >
                  {label} <span className={on ? "opacity-70" : "text-stone-400"}>{stageCounts[k] || 0}</span>
                </button>
              );
            })}
          </div>
          <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            <span className="w-7 shrink-0 text-[11px] text-stone-400">종류</span>
            {[["", "전체", pool.length], ...kinds.map((k) => [k, k, counts[k] || 0]), ["__etc", "기타", counts.__etc || 0]]
              .filter(([k, , n]) => !k || n > 0 || kind === k)
              .map(([k, label, n]) => (
                <button
                  key={k || "all"}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setMore(false);
                  }}
                  className={
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " +
                    (kind === k ? (k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-800 bg-stone-800 text-white") : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")
                  }
                >
                  {label} <span className={kind === k ? "opacity-70" : "text-stone-400"}>{n}</span>
                </button>
              ))}
          </div>
          {shown.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {shown.map((x) => item(x, false))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-5 text-center text-xs text-stone-400">{q || kind || stages.length ? "맞는 상품이 없어요." : "신상 관리에 상품이 없어요."}</p>
          )}
          {!more && rest.length > shown.length && (
            <button type="button" onClick={() => setMore(true)} className="mt-2 w-full rounded-lg border border-stone-200 py-2 text-xs text-stone-600 hover:border-rose-300">
              {rest.length - shown.length}개 더 보기
            </button>
          )}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-stone-200 p-3">
          <button type="button" onClick={onClose} className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white">
            다 됐어요
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * 레퍼런스 크게 보기 (10/20 세원: "소싱 관리에서 촬영 레퍼런스 누르면 크게 보이고 사진 옆에 어떤 제품 골라져 있는지 크게 보여 주는 거")
 * 왼쪽 레퍼런스 사진 크게(←·→ 로 이 소싱의 다른 사진) · 오른쪽 적어 둔 룩 + 고른 우리 상품(사진·이름·거래처·색상·사이즈).
 * 상품 사진을 누르면 그 상품 사진 크게(신마 사진 전부). 고치기는 '룩·상품 고치기'(LookSheet). 폰은 위아래로.
 */
function LookView({ d, refs, start, src, looks, cats, onEdit, onLook, onRef, onClose, paused }) {
  const [at, setAt] = useState(start);
  const [big, setBig] = useState(null); // {urls, i}
  const [sel, setSel] = useState(() => new Set()); // 고른 상품 중 잡은 것 (끌어 옮길 것)
  const r = refs[Math.min(at, refs.length - 1)];
  const look = (r && looks[r.id]) || {};
  const items = (look.itemIds || []).map((id) => d.items.find((x) => x.id === id)).filter(Boolean);
  const go = (k) => {
    setSel(new Set());
    setAt((i) => (i + k + refs.length) % refs.length);
  };
  useEffect(() => {
    const k = (e) => {
      if (big || paused || e.target.closest?.("input, textarea, select")) return; // 고치기 창이 위에 떠 있으면 그 창이 받는다
      if (e.key === "Escape" && sel.size) setSel(new Set());
      else if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && refs.length > 1) go(-1);
      else if (e.key === "ArrowRight" && refs.length > 1) go(1);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  const gallery = (x) => ((x.photos || []).length > 1 ? x.photos : itemSrc(x, d.urls) ? [itemSrc(x, d.urls)] : []);
  return (
    <div className="backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/80 p-0 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      {/* 10/20 세원: "모바일에서는 드래그 안 되게 — 창이 내려가지지 않네" → 폰은 창 전체가 한 번에 내려간다(사진 → 상품) */}
      <div className="sheet relative z-10 flex h-full w-full max-w-6xl flex-col overscroll-contain bg-white shadow-2xl max-md:overflow-y-auto sm:h-[92vh] sm:rounded-2xl md:flex-row md:overflow-hidden">
        {/* 레퍼런스 사진 */}
        <div className="relative flex shrink-0 items-center justify-center bg-stone-900 max-md:h-[50vh] md:w-[48%]">
          <button type="button" onClick={onClose} aria-label="닫기" className="absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white md:hidden">
            <X size={20} />
          </button>
          {src(r) && <img src={src(r)} alt="" decoding="async" className="max-h-full max-w-full object-contain" />}
          {refs.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="앞 사진" className="absolute top-1/2 left-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-stone-800 shadow hover:bg-white">
                <ChevronRight size={20} className="rotate-180" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="다음 사진" className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-stone-800 shadow hover:bg-white">
                <ChevronRight size={20} />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white tabular-nums">
                {at + 1} / {refs.length}
              </span>
            </>
          )}
          <button type="button" onClick={() => setBig({ urls: refs.map(src), i: at })} className="absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white hover:bg-black/70">
            확대
          </button>
        </div>

        {/* 룩 + 고른 상품 */}
        <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
          <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
                <CatSelect cats={cats} value={look.cat || ""} onChange={(cat) => onLook(r.id, { cat })} className="w-40" />
                {isShopCat(cats.find((c) => c.id === look.cat)) && (
                  <LineInput key={`s-${r.id}`} value={r.shop || ""} onSave={(shop) => onRef(r.id, { shop })} placeholder="어느 쇼핑몰? 적기" aria-label="어느 쇼핑몰" className={SHOP_INPUT + " w-40 py-1"} />
                )}
                {r.memo && <span>{r.memo}</span>}
              </div>
              <LookMemo key={`m-${r.id}`} value={lookMemo(look)} onSave={(memo) => onLook(r.id, { memo, text: "" })} />
              <LinkList key={`l-${r.id}`} links={linksOf(r)} onSave={(links) => onRef(r.id, { links, link: "" })} />
            </div>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onEdit(r.id)} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
                <Pencil size={12} /> 룩·상품 고치기
              </button>
              <button type="button" onClick={onClose} aria-label="닫기" className="p-1 text-stone-400 hover:text-stone-700">
                <X size={22} />
              </button>
            </span>
          </header>
          <div className="p-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
            {items.length ? (
              <ProductGroups
                d={d}
                items={items}
                groups={look.groups || {}}
                best={look.best || {}}
                onBest={(g, id) => onLook(r.id, bestPatch(look, g, id))}
                sel={sel}
                setSel={setSel}
                onMove={(ids, kind) => {
                  onLook(r.id, { groups: { ...(look.groups || {}), ...Object.fromEntries(ids.map((id) => [id, kind])) } });
                  setSel(new Set());
                }}
                onBig={(x) => {
                  const g = gallery(x);
                  if (g.length) setBig({ urls: g, i: 0 });
                }}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">
                이 사진에 쓸 우리 상품을 아직 안 골랐어요.
                <button type="button" onClick={() => onEdit(r.id)} className="mt-3 block w-full font-semibold text-rose-700 hover:text-rose-900">
                  우리 상품 고르기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {big && <BigSlides urls={big.urls} start={big.i} onClose={() => setBig(null)} />}
    </div>
  );
}

/**
 * 고른 우리 상품을 옷 종류 칸으로 (10/20 세원: "상의 2개·하의 3개를 골랐으면 한 번에 잡히기도 하고 하나만 잡히기도 해서
 * 한 번에 드래그해서 하의는 하의로, 상의는 상의로, 아우터는 아우터로")
 * 칸 = 신상 관리 옷 종류(촬영 레퍼런스 꼬리표 clothes) + 기타. 처음엔 상품의 종류대로 들어가고, 옮기면 이 레퍼런스의
 * groups {상품 id: 칸} 에만 남는다(신상 관리의 옷 종류는 안 바뀐다 — 레퍼런스 룩처럼 이 소싱에서만).
 * 잡기: 누르기 = 그것만(다시 누르면 풀림) · Ctrl(⌘) = 넣고 빼기 · Shift = 여기까지 · 빈 곳을 끌면 네모 안 것 · Esc 풀기.
 * 잡은 것을 끌어 다른 칸에 놓으면 한꺼번에 옮겨진다. 끌기가 안 되는 폰에서는 잡으면 뜨는 '→ 칸' 단추로.
 * 사진 크게 = 두 번 누르기 또는 사진 위 '크게'.
 */
function ProductGroups({ d, items, groups, best: bestRaw = {}, sel, setSel, onMove, onBig, onBest }) {
  const kinds = lookKinds(d.tags);
  const groupOf = lookGroupOf(kinds, groups);
  const best = lookBest({ best: bestRaw }, items, groupOf);
  // 칸 안에서는 제일 잘 맞는 상품이 맨 앞
  const inGroup = (k) => items.filter((x) => groupOf(x) === k).sort((a, b) => (b.id === best[k]) - (a.id === best[k]));
  const order = kinds.flatMap(inGroup); // 화면 순서 (Shift 범위)
  const [drag, setDrag] = useState(null); // 끄는 중인 상품 id 들
  const [over, setOver] = useState("");
  const [box, setBox] = useState(null); // 네모 잡기 {x0, y0, x1, y1}
  const last = useRef(null);
  const wrap = useRef(null);
  // 끌어 옮기기·네모 잡기는 마우스일 때만 — 폰에서 손가락이 끌기로 잡혀 창이 안 내려갔다(10/20). 폰은 눌러 잡고 '→ 칸' 단추로
  const [fine] = useState(() => (typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia("(pointer: fine)").matches));

  const click = (e, x) => {
    const add = e.ctrlKey || e.metaKey;
    if (e.shiftKey && last.current) {
      const a = order.findIndex((y) => y.id === last.current);
      const b = order.findIndex((y) => y.id === x.id);
      const [i, j] = a < b ? [a, b] : [b, a];
      setSel(new Set([...(add ? sel : []), ...order.slice(i, j + 1).map((y) => y.id)]));
      return;
    }
    last.current = x.id;
    if (add) {
      const n = new Set(sel);
      if (n.has(x.id)) n.delete(x.id);
      else n.add(x.id);
      setSel(n);
    } else setSel(sel.size === 1 && sel.has(x.id) ? new Set() : new Set([x.id]));
  };
  const dragStart = (e, x) => {
    const ids = sel.has(x.id) ? order.filter((y) => sel.has(y.id)).map((y) => y.id) : [x.id];
    if (!sel.has(x.id)) setSel(new Set([x.id]));
    setDrag(ids);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ids.join(","));
    // 끄는 모양 — 'N개 옮기기'
    const g = document.createElement("div");
    g.textContent = ids.length > 1 ? `${ids.length}개 옮기기` : x.name || "상품 옮기기";
    g.style.cssText = "position:fixed;top:-200px;left:0;padding:6px 12px;border-radius:999px;background:#be123c;color:#fff;font:600 13px Pretendard,'Malgun Gothic',sans-serif;white-space:nowrap";
    document.body.appendChild(g);
    e.dataTransfer.setDragImage(g, 18, 16);
    setTimeout(() => g.remove(), 0);
  };
  const dragEnd = () => {
    setDrag(null);
    setOver("");
  };
  const drop = (e, k) => {
    e.preventDefault();
    const ids = (e.dataTransfer.getData("text/plain") || "").split(",").filter(Boolean);
    dragEnd();
    if (ids.length) onMove(ids, k);
  };
  // 빈 곳을 끌면 네모 안 것을 잡는다 (Ctrl 누른 채면 더하기)
  const down = (e) => {
    if (!fine || e.pointerType !== "mouse" || e.button !== 0 || e.target.closest("[data-card], button, a, input")) return;
    const add = e.ctrlKey || e.metaKey;
    const base = add ? [...sel] : [];
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true;
      const b = { x0: Math.min(x0, ev.clientX), y0: Math.min(y0, ev.clientY), x1: Math.max(x0, ev.clientX), y1: Math.max(y0, ev.clientY) };
      setBox(b);
      const hit = [...(wrap.current?.querySelectorAll("[data-card]") || [])]
        .filter((c) => {
          const r = c.getBoundingClientRect();
          return r.left < b.x1 && r.right > b.x0 && r.top < b.y1 && r.bottom > b.y0;
        })
        .map((c) => c.dataset.card);
      setSel(new Set([...base, ...hit]));
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      setBox(null);
      if (!moved && !add) setSel(new Set());
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  // 비어 있는 칸은 잡았거나 끄는 동안만 (놓을 자리)
  const shown = kinds.filter((k) => order.some((x) => groupOf(x) === k) || drag || sel.size);
  return (
    <div ref={wrap} onPointerDown={down} className="relative min-h-full select-none">
      <div className="mb-2 text-xs font-medium text-stone-500">
        고른 우리 상품 {items.length}{" "}
        <span className="font-normal text-stone-400">
          {fine ? "· 눌러 잡고(Ctrl·Shift·빈 곳 끌기로 여러 개) 다른 칸으로 끌어 옮겨요" : "· 눌러 잡고 위에 뜨는 '→ 칸' 단추로 옮겨요"} · ☆ 를 누르면 그 칸에서 제일 잘 맞는 것
        </span>
      </div>
      {sel.size > 0 && (
        <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-2 text-xs text-rose-900 shadow-sm">
          <b className="mr-0.5">{sel.size}개 잡음 →</b>
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => onMove([...sel], k)} className="rounded-full border border-rose-200 bg-white px-2.5 py-1 font-semibold text-rose-800 hover:border-rose-400">
              {k}
            </button>
          ))}
          <button type="button" onClick={() => setSel(new Set())} className="ml-auto font-medium text-rose-700 hover:text-rose-900">
            풀기
          </button>
        </div>
      )}
      <div className="space-y-3">
        {shown.map((k) => {
          const xs = order.filter((x) => groupOf(x) === k);
          return (
            <section
              key={k}
              data-group={k}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== k) setOver(k);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === k ? "" : o));
              }}
              onDrop={(e) => drop(e, k)}
              className={
                "rounded-xl border-2 p-1.5 transition-colors " +
                (over === k ? "border-rose-400 bg-rose-50" : drag ? "border-dashed border-stone-300" : "border-transparent")
              }
            >
              <div className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
                <span className="text-sm font-semibold text-stone-800">{k}</span>
                <span className="text-xs text-stone-400 tabular-nums">{xs.length}</span>
                {best[k] && <span className="min-w-0 truncate text-xs font-semibold text-amber-700">★ {items.find((x) => x.id === best[k])?.name}</span>}
              </div>
              {xs.length ? (
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                  {xs.map((x) => {
                    const on = sel.has(x.id);
                    const img = itemSrc(x, d.urls) || (x.photos || [])[0] || "";
                    const n = (x.photos || []).length;
                    return (
                      <div
                        key={x.id}
                        data-card={x.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={on}
                        draggable={fine}
                        onDragStart={(e) => dragStart(e, x)}
                        onDragEnd={dragEnd}
                        onClick={(e) => click(e, x)}
                        onDoubleClick={() => onBig(x)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            click(e, x);
                          }
                        }}
                        className={
                          "relative overflow-hidden rounded-xl border bg-white transition " +
                          (fine ? "cursor-grab active:cursor-grabbing " : "") +
                          (on ? "border-rose-600 ring-2 ring-rose-600" : x.id === best[k] ? "border-amber-400 ring-2 ring-amber-400" : "border-stone-200 hover:border-stone-300") +
                          (drag?.includes(x.id) ? " opacity-40" : "")
                        }
                      >
                        <div className="relative aspect-[3/4] bg-stone-100">
                          {img && <img src={img} alt="" draggable={false} loading="lazy" decoding="async" className="pointer-events-none h-full w-full object-cover" />}
                          <span
                            className={
                              "absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full shadow " +
                              (on ? "bg-rose-600 text-white" : "bg-white/90 text-transparent ring-1 ring-stone-300")
                            }
                          >
                            <Check size={14} strokeWidth={3} />
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBest(k, x.id);
                            }}
                            aria-pressed={x.id === best[k]}
                            title={x.id === best[k] ? "제일 잘 맞음 빼기" : `${k} 중에서 제일 잘 맞음으로`}
                            className={
                              "absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[11px] font-semibold shadow " +
                              (x.id === best[k] ? "bg-amber-400 text-amber-950" : "bg-white/90 text-stone-400 hover:text-amber-600")
                            }
                          >
                            <Star size={13} className={x.id === best[k] ? "fill-amber-950" : ""} />
                            {x.id === best[k] && "제일 잘 맞음"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBig(x);
                            }}
                            className="absolute right-1.5 bottom-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/70"
                          >
                            크게{n > 1 ? ` · ${n}장` : ""}
                          </button>
                        </div>
                        <div className="space-y-0.5 p-2">
                          <div className="text-sm leading-snug font-semibold text-stone-900">{x.name || "이름 없음"}</div>
                          {x.price > 0 && <div className="text-xs font-semibold text-stone-800 tabular-nums">공급가 {won(x.price)}</div>}
                          <div className="truncate text-xs text-stone-500">{[x.vendor, x.place].filter(Boolean).join(" · ")}</div>
                          {(x.colors || x.sizes) && <div className="text-xs text-stone-600">{[x.colors, x.sizes].filter(Boolean).join(" · ")}</div>}
                          <div className={"text-[11px] " + (returnedItem(x) ? "font-semibold text-rose-700" : "text-stone-400")}>
                            {stageLabel(x)}
                            {x.kind && x.kind !== k ? ` · 원래 ${x.kind}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-stone-300 px-3 py-4 text-center text-xs text-stone-400">여기로 끌어다 놓기</div>
              )}
            </section>
          );
        })}
      </div>
      {box && <div className="pointer-events-none fixed z-20 rounded border border-rose-500 bg-rose-500/10" style={{ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }} />}
    </div>
  );
}

function PickedRefs({ d, ids, onChange, onAdd, online, onMsg, hot, onHot, looks = {}, onLook, cats, onCats }) {
  const [pick, setPick] = useState(false);
  const [view, setView] = useState(null);
  const [open, setOpen] = useState(null); // 룩 창 — 레퍼런스 id
  const [see, setSee] = useState(null); // 크게 보기 — {ids: 그때 보이던 순서, i} (10/20)
  const [only, setOnly] = useState(""); // 비율 바에서 고른 분류만 (10/21) — "__none" = 분류 안 함
  const [editCats, setEditCats] = useState(false);
  const [basis, setBasisState] = useState(() => {
    try {
      return localStorage.getItem(MIX_BASIS_KEY) === "item" ? "item" : "photo";
    } catch {
      return "photo";
    }
  });
  const setBasis = (v) => {
    setBasisState(v);
    try {
      localStorage.setItem(MIX_BASIS_KEY, v);
    } catch {
      /* 무시 */
    }
  };
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState([]); // 올리는 중인 사진 미리 보기
  const [shown, setShown] = useState({}); // 방금 붙인 사진 — 서명 주소가 오기 전에도 그 사진으로
  const [folder, setFolder] = useState(() => {
    try {
      return localStorage.getItem(REF_FOLDER_KEY) || "";
    } catch {
      return "";
    }
  });
  const file = useRef(null);
  const folderId = d.folders.some((f) => f.id === folder) ? folder : "";
  const refs = ids.map((id) => d.refs.find((r) => r.id === id)).filter(Boolean);
  const catIds = new Set(cats.map((c) => c.id));
  const catOf = (id) => (catIds.has(looks[id]?.cat) ? looks[id].cat : "");
  const shownRefs = !only ? refs : refs.filter((r) => catOf(r.id) === (only === "__none" ? "" : only));
  const seeRefs = see ? see.ids.map((id) => refs.find((r) => r.id === id)).filter(Boolean) : [];
  // 레퍼런스 사진 자체의 쇼핑몰·상품 링크 고치기 (10/21 — 적는 칸)
  const patchRef = (id, p) => d.saveRefs((v) => ({ ...v, items: (v.items || []).map((x) => (x.id === id ? { ...x, ...p } : x)) })).catch((e) => onMsg(e.message || "저장하지 못했어요."));
  const src = (r) => d.urls[r.photo] || shown[r.id] || r.photoUrl || "";
  const chooseFolder = (v) => {
    setFolder(v);
    try {
      localStorage.setItem(REF_FOLDER_KEY, v);
    } catch {
      /* 기억 못 해도 된다 */
    }
  };

  const add = async (clip) => {
    onHot();
    setBusy(clip.files.length ? `사진 ${clip.files.length}장 넣는 중…` : "사진 주소에서 사진 받는 중…");
    const files = await filesOf(clip);
    if (!files.length) {
      setBusy("");
      onMsg("붙여넣은 것에서 사진을 못 찾았어요. 사진 위에서 오른쪽 클릭 → '이미지 복사' 한 뒤 붙여넣어 보세요.");
      return;
    }
    const previews = files.map((f) => URL.createObjectURL(f));
    setPending((p) => [...p, ...previews]);
    try {
      const made = [];
      for (const [i, f] of files.entries()) {
        setBusy(`촬영 레퍼런스에 넣는 중 ${i + 1}/${files.length}`);
        const photo = await putPhoto(f, online);
        made.push({ id: newId("r"), photo, folderId: folderId || null, cuts: [], place: "", memo: "", createdAt: new Date().toISOString() });
      }
      setShown((m) => ({ ...m, ...Object.fromEntries(made.map((r, i) => [r.id, previews[i]])) }));
      await d.saveRefs((v) => ({ ...v, items: [...made, ...(v.items || [])] }));
      onAdd(made.map((r) => r.id));
    } catch (e) {
      onMsg(e.message || "사진을 넣지 못했어요.");
    }
    setPending((p) => p.filter((u) => !previews.includes(u)));
    setBusy("");
  };

  // 붙여넣기 — 이 칸에 마우스를 올렸거나 마지막에 누른 칸이면. 쇼핑몰 BEST 칸보다 먼저 받는다(capture).
  useEffect(() => {
    const onPaste = (e) => {
      if (!hot || pick || open || editCats || view != null || see != null) return;
      if (e.target.closest?.("input, textarea, [contenteditable=true]")) return;
      const clip = clipImages(e.clipboardData);
      if (!clip.files.length && !clip.urls.length) return;
      e.preventDefault();
      add(clip);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      onMouseEnter={onHot}
      onMouseDown={onHot}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // 다른 창의 사진을 바로 끌어 와도(주소로 온다) 들어가게
        const clip = clipImages(e.dataTransfer);
        if (!clip.files.length && !clip.urls.length) return;
        e.preventDefault();
        add(clip);
      }}
      className={"rounded-xl border p-3 " + (hot ? "border-rose-300" : "border-stone-200")}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            <Images size={15} className="text-rose-700" /> 촬영 레퍼런스 {refs.length > 0 && <span className="font-normal text-stone-400">{refs.length}장</span>}
            {hot && <span className="hidden shrink-0 rounded bg-rose-50 px-1.5 text-[10px] font-medium text-rose-700 sm:inline">Ctrl+V 하면 여기로</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-400">
            사진을 복사해서 Ctrl+V · 끌어다 놓기 — 촬영 레퍼런스
            <select value={folderId} onChange={(e) => chooseFolder(e.target.value)} aria-label="붙인 사진을 넣을 목록" className="max-w-[9rem] rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-700">
              <option value="">목록 없이</option>
              {ordered(d.folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
                </option>
              ))}
            </select>
            에도 같이 담겨요
          </span>
        </span>
        <span className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
            <ImagePlus size={13} /> 사진
          </button>
          <button type="button" onClick={() => setPick(true)} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
            <Plus size={13} /> 레퍼런스에서 고르기
          </button>
        </span>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files || [])];
            e.target.value = "";
            if (files.length) add({ files, urls: [] });
          }}
        />
      </div>
      {busy && (
        <p className="mb-2 flex items-center gap-1.5 text-sm text-stone-600">
          <Loader2 size={14} className="animate-spin" /> {busy}
        </p>
      )}
      {refs.length > 0 && <SourceMix refIds={ids} looks={looks} cats={cats} basis={basis} onBasis={setBasis} only={only} onOnly={setOnly} onEdit={() => setEditCats(true)} shopOf={(id) => refs.find((r) => r.id === id)?.shop || ""} />}
      {only && (
        <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-white">
          {only === "__none" ? "분류 안 한" : cats.find((c) => c.id === only)?.name} 사진만 보는 중 · {shownRefs.length}장
          <button type="button" onClick={() => setOnly("")} className="font-semibold underline">
            전부 보기
          </button>
        </p>
      )}
      {refs.length || pending.length ? (
        <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4 md:grid-cols-5">
          {shownRefs.map((r, i) => (
            <span key={r.id} className="group relative block min-w-0">
              <button type="button" onClick={() => setSee({ ids: shownRefs.map((x) => x.id), i })} title="크게 보기 — 고른 우리 상품까지" className="relative block aspect-[3/4] w-full overflow-hidden rounded-lg bg-stone-100">
                {src(r) && <img src={src(r)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                {(looks[r.id]?.itemIds || []).length > 0 && (
                  <span className="absolute bottom-1 left-1 flex -space-x-1.5">
                    {lookOrder(d, looks[r.id]).ids.slice(0, 4).map((id) => {
                      const x = d.items.find((y) => y.id === id);
                      return x ? (
                        <span key={id} className="block h-7 w-7 overflow-hidden rounded-full border-2 border-white bg-stone-200 shadow-sm">
                          {itemSrc(x, d.urls) && <img src={itemSrc(x, d.urls)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                        </span>
                      ) : null;
                    })}
                  </span>
                )}
              </button>
              <CatSelect cats={cats} value={catOf(r.id)} onChange={(cat) => onLook(r.id, { cat })} className="mt-1" />
              {isShopCat(cats.find((c) => c.id === catOf(r.id))) && (
                <LineInput value={r.shop || ""} onSave={(shop) => patchRef(r.id, { shop })} placeholder="어느 쇼핑몰? 적기" aria-label="어느 쇼핑몰" className={SHOP_INPUT + " mt-1"} />
              )}
              {/* 10/21 세원: "썸네일에 메모·상품 그냥 없애 버려" — 메모·링크·상품은 사진을 눌러 크게 보기에서 */}
              {(() => {
                // 링크 하나면 바로 열기, 여럿이면 크게 보기(링크 목록)로
                const ls = linksOf(r).filter((l) => l.url);
                const cls = "absolute top-1 left-1 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-white/90 px-1 text-[10px] font-semibold text-stone-700 shadow hover:text-rose-700";
                const tip = ls.map((l) => `${l.kind ? l.kind + " — " : ""}${l.url}`).join("\n");
                if (ls.length === 1)
                  return (
                    <a href={ls[0].url} target="_blank" rel="noreferrer" title={`상품 링크 열기\n${tip}`} aria-label="상품 링크 열기" className={cls}>
                      <Link2 size={13} />
                    </a>
                  );
                if (ls.length > 1)
                  return (
                    <button type="button" onClick={() => setSee({ ids: shownRefs.map((x) => x.id), i })} title={`상품 링크 ${ls.length}개\n${tip}`} aria-label={`상품 링크 ${ls.length}개 보기`} className={cls}>
                      <Link2 size={13} />
                      {ls.length}
                    </button>
                  );
                return null;
              })()}
              <button
                type="button"
                onClick={() => onChange(ids.filter((k) => k !== r.id))}
                aria-label="빼기"
                title="이 소싱에서만 빼요 (촬영 레퍼런스에는 남아요)"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-80"
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {pending.map((u) => (
            <span key={u} className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
              <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
              <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-white drop-shadow" />
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-200 px-4 py-5 text-center text-xs text-stone-400">
          촬영 레퍼런스에서 고르거나, 사진을 복사해서 여기에 Ctrl+V 하면 바로 들어가요.
        </p>
      )}
      {pick && (
        <RefPick
          d={d}
          picked={ids}
          onClose={() => setPick(false)}
          onDone={(next) => {
            onChange(next);
            setPick(false);
          }}
        />
      )}
      {see != null && seeRefs.length > 0 && (
        <LookView d={d} refs={seeRefs} start={Math.min(see.i, seeRefs.length - 1)} src={src} looks={looks} cats={cats} onEdit={(id) => setOpen(id)} onLook={onLook} onRef={patchRef} onClose={() => setSee(null)} paused={!!open || editCats} />
      )}
      {editCats && (
        <CatEditor
          cats={cats}
          onClose={() => setEditCats(false)}
          onSave={(next) => {
            onCats(next);
            setEditCats(false);
          }}
        />
      )}
      {open && refs.some((r) => r.id === open) && (
        <LookSheet
          d={d}
          r={refs.find((r) => r.id === open)}
          src={src(refs.find((r) => r.id === open))}
          look={looks[open] || {}}
          cats={cats}
          onRef={patchRef}
          onSave={(p) => onLook(open, p)}
          onBig={() => setView(refs.findIndex((r) => r.id === open))}
          onClose={() => setOpen(null)}
        />
      )}
      {view != null && <BigSlides urls={refs.map(src)} start={view} onClose={() => setView(null)} />}
    </div>
  );
}

function SessionSheet({ session, d, codis, items, notes, onSave, onRemove, onClose, onNotes, online }) {
  const [msg, setMsg] = useState("");
  const [s, setS] = useState(session);
  const latest = useRef(s);
  const timer = useRef(null);
  const saved = useRef(JSON.stringify(session));
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const j = JSON.stringify(latest.current);
    if (j === saved.current) return;
    saved.current = j;
    onSave(latest.current);
  }, [onSave]);
  useEffect(() => () => flush(), [flush]);
  const set = (v) => {
    const n = { ...latest.current, ...v };
    latest.current = n;
    setS(n);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  const uploads = s.uploads?.length ? s.uploads : [""];
  const w = useWeather([s.on, ...uploads]);
  const dayCodis = codis.filter((c) => s.on && c.shootDate === s.on);
  const nameOf = (id) => items.find((x) => x.id === id)?.name || "";
  const cats = catsOf(d.tags);
  // 예전 '쇼핑몰 BEST 컷' 칸 사진 → 촬영 레퍼런스(쇼핑몰 레퍼런스 + 그 쇼핑몰)로 (10/21 칸을 없애면서)
  const oldShops = (s.shops || []).filter((x) => (x.photos || []).length);
  const moveShops = async () => {
    const shopCat = cats.find(isShopCat)?.id || "";
    const now = new Date().toISOString();
    const made = (latest.current.shops || []).flatMap((x) =>
      (x.photos || []).map((photo) => ({ id: newId("r"), photo, shop: (x.name || "").trim(), folderId: null, cuts: [], place: "", memo: x.url || "", createdAt: now })),
    );
    if (!made.length) return;
    try {
      await d.saveRefs((v) => ({ ...v, items: [...made, ...(v.items || [])] }));
      const names = [...new Set(made.map((r) => r.shop).filter(Boolean))];
      if (names.some((n) => !(d.tags.shops || []).includes(n))) d.saveTags((v) => ({ ...v, shops: [...new Set([...(v.shops || []), ...names])] }));
      set({
        refIds: [...(latest.current.refIds || []), ...made.map((r) => r.id)],
        refLooks: { ...(latest.current.refLooks || {}), ...Object.fromEntries(made.map((r) => [r.id, shopCat ? { cat: shopCat } : {}]).filter(([, v]) => v.cat)) },
        shops: [],
      });
    } catch (e) {
      setMsg(e.message || "옮기지 못했어요.");
    }
  };

  return (
    <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <input
              value={s.title || ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="소싱 날짜 — 예: 10월 13일 소싱"
              className="w-full bg-transparent text-lg font-semibold text-stone-900 outline-none placeholder:text-stone-300"
            />
            {/* 10/21 소싱일·장소 칸은 뺐다 — 소싱일은 날씨·목록 순서에 쓰여서 제목 아래 작게만 */}
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
              <label className="flex items-center gap-1">
                소싱일
                <input type="date" value={s.on || ""} onChange={(e) => set({ on: e.target.value })} className="rounded-md border border-stone-200 px-1.5 py-0.5 text-xs text-stone-700" />
              </label>
              · 고치는 대로 저장돼요
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
          {/* 10/21 세원: "소싱일·장소는 없애고 그 자리에 업로드 날짜·날씨(소싱일·업로드)·이 날씨에 팔릴 옷을 위로" — 그 아래가 제일 중요한 촬영 레퍼런스 */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
            <div>
              <div className="mb-1 text-xs font-medium text-stone-500">업로드 날짜 — 이날 올라가요</div>
              <div className="flex flex-wrap items-center gap-2">
                {uploads.map((u, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <input type="date" value={u} onChange={(e) => set({ uploads: uploads.map((x, k) => (k === i ? e.target.value : x)) })} className={FIELD + " w-40 py-1.5"} />
                    {i > 0 && (
                      <button type="button" onClick={() => set({ uploads: uploads.filter((_, k) => k !== i) })} aria-label="빼기" className="p-1 text-stone-400 hover:text-rose-700">
                        <X size={14} />
                      </button>
                    )}
                  </span>
                ))}
                <button type="button" onClick={() => set({ uploads: [...uploads, ""] })} className="flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:border-rose-300">
                  <Plus size={12} /> 날짜 추가
                </button>
              </div>
            </div>

            {/* 날씨 — 소싱일과 올라가는 날 */}
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-1">
              <div className="divide-y divide-sky-100">
                <WeatherRow label="소싱일" date={s.on} w={w[s.on]} />
                {uploads.map((u, i) => (
                  <WeatherRow key={i} label={uploads.length > 1 ? `업로드 ${i + 1}` : "업로드"} date={u} w={u ? w[u] : undefined} />
                ))}
              </div>
              <p className="pb-2 text-[10px] text-sky-900/60">서울 기준 · 16일 안은 예보, 그 뒤는 작년 같은 날 · 옷차림은 하루 평균 기온으로 짐작한 거예요</p>
            </div>
            </div>
            <label className="flex flex-col text-xs font-medium text-stone-500">
              이 날씨에 팔릴 옷 — 올라가는 날 사람들이 뭘 살까
              <textarea
                value={s.sellNote || ""}
                onChange={(e) => set({ sellNote: e.target.value })}
                placeholder="예: 업로드날 최저 9° → 아침저녁 쌀쌀, 가디건·자켓 레이어드 코디를 앞에. 반팔 단독 컷은 빼기"
                className={FIELD + " mt-1 min-h-24 flex-1 resize-y text-sm"}
              />
            </label>
          </div>
          {oldShops.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              <span>
                예전 '쇼핑몰 BEST 컷' 칸에 사진 {oldShops.reduce((n, x) => n + x.photos.length, 0)}장({oldShops.map((x) => x.name || "이름 없음").join(", ")}) — 이제는 촬영 레퍼런스에서 '쇼핑몰 레퍼런스'로 고르고 쇼핑몰을 정해요
              </span>
              <button type="button" onClick={moveShops} className="rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white">
                촬영 레퍼런스로 옮기기
              </button>
            </div>
          )}
          <PickedRefs
            d={d}
            ids={s.refIds || []}
            onChange={(v) => {
              // 이 소싱에서 뺀 사진의 룩 메모도 같이 뺀다
              const looks = Object.fromEntries(Object.entries(latest.current.refLooks || {}).filter(([k]) => v.includes(k)));
              set({ refIds: v, refLooks: looks });
            }}
            onAdd={(more) => set({ refIds: [...(latest.current.refIds || []), ...more] })}
            looks={s.refLooks || {}}
            onLook={(id, p) => {
              const all = latest.current.refLooks || {};
              const next = { ...(all[id] || {}), ...p };
              const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== id));
              set({ refLooks: next.text || next.memo || next.cat || (next.itemIds || []).length ? { ...rest, [id]: next } : rest });
            }}
            online={online}
            onMsg={setMsg}
            hot
            onHot={() => {}}
            cats={cats}
            onCats={(next) => d.saveTags((v) => ({ ...v, refCats: next }))}
          />
          {msg && (
            <p className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {msg}
              <button type="button" onClick={() => setMsg("")} aria-label="닫기">
                <X size={12} />
              </button>
            </p>
          )}

          <div className="rounded-xl border border-stone-200 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
              <Shirt size={15} className="text-rose-700" /> 이날 코디 {dayCodis.length > 0 && <span className="font-normal text-stone-400">{dayCodis.length}개</span>}
            </div>
            {dayCodis.length ? (
              <ul className="space-y-1 text-sm">
                {dayCodis.map((c) => (
                  <li key={c.id}>
                    <b className="font-medium text-stone-900">{codiName(c, items)}</b>
                    <span className="text-stone-500"> — {(c.itemIds || []).map(nameOf).filter(Boolean).join(" + ") || "상품 없음"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-400">신상 관리 › 코디에서 촬영일을 {s.on ? md(s.on) : "이날"}로 정한 코디가 여기 떠요.</p>
            )}
          </div>

          {notes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                  <Megaphone size={14} /> 최근 쇼만마 코디 노트
                </span>
                <button type="button" onClick={onNotes} className="text-xs text-amber-800 hover:underline">
                  전부 보기
                </button>
              </div>
              <ul className="space-y-1.5 text-sm text-amber-950">
                {notes.slice(0, 3).map((n) => (
                  <li key={n.id} className="line-clamp-3 whitespace-pre-line">
                    <span className="mr-1.5 text-xs text-amber-700">{md(n.on)}</span>
                    {n.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="block text-xs font-medium text-stone-500">
            메모
            <textarea value={s.memo || ""} onChange={(e) => set({ memo: e.target.value })} placeholder="준비물 · 모델 · 소품 · 동선 등" className={FIELD + " mt-1 h-20 resize-y text-sm"} />
          </label>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("이 소싱을 지울까요?")) {
                saved.current = JSON.stringify(latest.current);
                onRemove(s.id);
                onClose();
              }
            }}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
          >
            <Trash2 size={13} /> 지우기
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white">
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}

function SessionsTab({ sessions, d, codis, items, notes, onNotes, online }) {
  const [open, setOpen] = useState(null);
  const today = dayKey();
  const all = sessions.items;
  const list = useMemo(() => {
    const up = all.filter((s) => !s.on || s.on >= today).sort((a, b) => (a.on || "9").localeCompare(b.on || "9"));
    const past = all.filter((s) => s.on && s.on < today).sort((a, b) => b.on.localeCompare(a.on));
    return { up, past };
  }, [all, today]);
  const w = useWeather(list.up.map((s) => s.on));
  const cats = catsOf(d.tags);
  const card = (s) => {
    const mix = mixOf(s.refIds, s.refLooks, cats, "photo");
    const nCodi = codis.filter((c) => s.on && c.shootDate === s.on).length;
    return (
      <button key={s.id} type="button" onClick={() => setOpen(s)} className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-rose-300 hover:shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <span>
            <span className="block text-lg font-bold text-stone-900 tabular-nums">{s.on ? `${md(s.on)} 소싱` : "날짜 미정"}</span>
            <span className="block text-sm text-stone-600">{s.title || "이름 없는 소싱"}</span>
          </span>
          {s.on && <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + (s.on === today ? "bg-rose-700 text-white" : s.on > today ? "bg-rose-50 text-rose-800" : "bg-stone-100 text-stone-500")}>{dday(s.on)}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          {w[s.on] && (
            <span className="flex items-center gap-1 tabular-nums">
              <WxIcon code={w[s.on].code} size={14} /> {Math.round(w[s.on].max)}°/{Math.round(w[s.on].min)}°{w[s.on].past ? " (작년)" : ""}
            </span>
          )}
          {(s.refIds || []).length > 0 && <span>레퍼런스 {s.refIds.length}장</span>}
          {nCodi > 0 && <span>코디 {nCodi}</span>}
          {s.uploads?.filter(Boolean).length > 0 && <span>업로드 {s.uploads.filter(Boolean).map(md).join(", ")}</span>}
        </div>
        {/* 이번 소싱 비율 (10/21) — 분류한 레퍼런스 사진 기준 */}
        {mix.sorted > 0 && (
          <div className="mt-2.5">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-stone-100">
              {mix.rows
                .filter((r) => r.n)
                .map((r) => (
                  <span key={r.id} style={{ width: `${(r.n / mix.sorted) * 100}%`, background: r.color }} className="border-r border-white last:border-r-0" />
                ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
              {mix.rows.map((r) => (
                <span key={r.id} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
                  {r.name} <b className={"tabular-nums " + (r.pct - r.target <= -10 ? "text-amber-700" : "text-stone-700")}>{r.pct}%</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </button>
    );
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            const s = { id: newId("ss"), on: dayKey(), title: "", uploads: [""], createdAt: new Date().toISOString() };
            sessions.save(s);
            setOpen(s);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> 새 소싱
        </button>
      </div>
      {!sessions.items.length ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          '새 소싱'을 눌러 촬영 레퍼런스를 모으고 콘텐츠·쇼핑몰·우리빨로 나눠 보세요. 소싱일·올라가는 날 날씨도 같이 떠요.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.up.map(card)}</div>
          {list.past.length > 0 && (
            <>
              <div className="mt-5 mb-2 text-xs font-semibold text-stone-400">지난 소싱</div>
              <div className="grid gap-3 opacity-80 sm:grid-cols-2 lg:grid-cols-3">{list.past.map(card)}</div>
            </>
          )}
        </>
      )}
      {open && (
        <SessionSheet
          key={open.id}
          session={sessions.items.find((x) => x.id === open.id) || open}
          d={d}
          codis={codis}
          items={items}
          notes={notes}
          onSave={sessions.save}
          onRemove={sessions.drop}
          online={online}
          onClose={() => setOpen(null)}
          onNotes={() => {
            setOpen(null);
            onNotes();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 쇼만마 코디 노트

function NotesTab({ notes, online }) {
  const [draft, setDraft] = useState({ on: dayKey(), text: "", photos: [] });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [edit, setEdit] = useState(null);
  const file = useRef(null);
  const sorted = useMemo(() => [...notes.items].sort((a, b) => (b.on || "").localeCompare(a.on || "") || (b.createdAt || "").localeCompare(a.createdAt || "")), [notes.items]);
  const urls = usePhotoUrls([...draft.photos, ...sorted.flatMap((n) => n.photos || [])], online);
  const attach = async (clip) => {
    setBusy(true);
    const files = await filesOf(clip);
    const previews = files.map((f) => URL.createObjectURL(f));
    setPending((p) => [...p, ...previews]);
    try {
      const keys = await savePhotos(files, online);
      setDraft((d) => ({ ...d, photos: [...d.photos, ...keys] }));
    } catch (e) {
      notes.setMsg(e.message || "사진을 올리지 못했어요.");
    }
    setPending((p) => p.filter((u) => !previews.includes(u)));
    setBusy(false);
  };
  // 글 칸 밖에서 Ctrl+V 해도 새 노트에 붙는다
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target.closest?.("input, textarea")) return;
      const clip = clipImages(e.clipboardData);
      if (!clip.files.length && !clip.urls.length) return;
      e.preventDefault();
      attach(clip);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const clip = clipImages(e.dataTransfer);
          if (!clip.files.length && !clip.urls.length) return;
          e.preventDefault();
          attach(clip);
        }}
      >
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <Megaphone size={15} /> 쇼만마에서 들은 코디 · 지금 뜨는 것 정리
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={draft.on} onChange={(e) => setDraft({ ...draft, on: e.target.value })} className={FIELD + " w-40 py-1.5 text-sm"} />
          <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} 사진
          </button>
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => (attach({ files: [...e.target.files], urls: [] }), (e.target.value = ""))} />
        </div>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onPaste={(e) => {
            // 글과 같이 복사한 건 글로 두고, 사진만 왔을 때 사진으로
            const clip = clipImages(e.clipboardData);
            const text = e.clipboardData.getData("text/plain").trim();
            if (!clip.files.length && !(clip.urls.length && (!text || clip.urls.includes(text)))) return;
            e.preventDefault();
            attach(clip);
          }}
          placeholder={"예:\n- 지금 뜨는 코디: 셔츠 + 니트 베스트 레이어드, 와이드 데님\n- 이번 주 찍어라: 트렌치 + 롱스커트, 앉은 컷 많이\n- 피할 것: 반팔 단독 착장\n(사진은 복사해서 Ctrl+V)"}
          className={FIELD + " mt-2 h-32 resize-y bg-white text-sm"}
        />
        {(draft.photos.length > 0 || pending.length > 0) && (
          <div className="mt-2">
            <PhotoGrid keys={draft.photos} urls={urls} size="sm" pending={pending} onRemove={(k) => setDraft({ ...draft, photos: draft.photos.filter((x) => x !== k) })} />
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={!draft.text.trim() && !draft.photos.length}
            onClick={async () => {
              await notes.save({ id: newId("sn"), on: draft.on, text: draft.text.trim(), photos: draft.photos, createdAt: new Date().toISOString() });
              setDraft({ on: dayKey(), text: "", photos: [] });
            }}
            className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            노트에 넣기
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-sm text-stone-400">아직 넣은 노트가 없어요.</p>
      ) : (
        sorted.map((n) => (
          <article key={n.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <header className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
                <CalendarDays size={14} className="text-amber-600" /> {n.on ? `${md(n.on)} (${"일월화수목금토"[new Date(n.on + "T00:00:00").getDay()]})` : "날짜 없음"}
              </span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => setEdit(edit?.id === n.id ? null : { ...n })} className="rounded p-1 text-stone-400 hover:text-stone-700" aria-label="고치기">
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => window.confirm("이 노트를 지울까요?") && notes.drop(n.id)} className="rounded p-1 text-stone-400 hover:text-rose-700" aria-label="지우기">
                  <Trash2 size={13} />
                </button>
              </span>
            </header>
            {edit?.id === n.id ? (
              <div className="space-y-1.5">
                <input type="date" value={edit.on || ""} onChange={(e) => setEdit({ ...edit, on: e.target.value })} className={FIELD + " w-40 py-1.5 text-sm"} />
                <textarea value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} className={FIELD + " h-32 resize-y text-sm"} />
                <span className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-600">
                    그만두기
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await notes.save(edit);
                      setEdit(null);
                    }}
                    className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    저장
                  </button>
                </span>
              </div>
            ) : (
              n.text && <p className="text-sm leading-relaxed whitespace-pre-line text-stone-800">{n.text}</p>
            )}
            {(n.photos || []).length > 0 && (
              <div className="mt-2">
                <PhotoGrid keys={n.photos} urls={urls} size="sm" onRemove={(k) => notes.save({ ...n, photos: n.photos.filter((x) => x !== k) })} />
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 화면

// 쇼핑몰 BEST 컷은 10/4 부터 촬영 회차 안에 (세원: "목록에서는 지우고 촬영 회차 폴더 안으로")
const TABS = [
  ["sessions", "소싱 회차"],
  ["notes", "쇼만마 코디 노트"],
];
const TAB_KEY = "poclo_shoot_plan_tab";

export default function ShootPlan({ d, online }) {
  const sessions = useList(KEYS.sessions, online);
  const notes = useList(KEYS.notes, online);
  const [tab, setTabState] = useState(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      return TABS.some(([k]) => k === t) ? t : "sessions";
    } catch {
      return "sessions";
    }
  });
  const setTab = (t) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 기억 못 해도 된다 */
    }
  };
  const sortedNotes = useMemo(() => [...notes.items].sort((a, b) => (b.on || "").localeCompare(a.on || "")), [notes.items]);
  const msg = sessions.msg || notes.msg;
  const count = { sessions: sessions.items.filter((s) => !s.on || s.on >= dayKey()).length, notes: notes.items.length };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">소싱 관리</h2>
        <p className="mt-0.5 text-sm text-stone-500">소싱마다 올라가는 날 날씨와 촬영 레퍼런스(콘텐츠·쇼핑몰·우리빨 비율 + 사진마다 메모·상품)를 한 폴더에. 쇼만마에서 들은 코디는 노트로.</p>
      </div>
      {msg && (
        <p className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {msg}
          <button type="button" onClick={() => [sessions, notes].forEach((x) => x.setMsg(""))} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}
      <div className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={"flex-1 rounded-lg py-2 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
          >
            {label} {count[k] > 0 && <span className="text-stone-400">{count[k]}</span>}
          </button>
        ))}
      </div>
      {!(sessions.loaded && notes.loaded) ? (
        <div className="flex h-60 items-center justify-center text-stone-300">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : tab === "sessions" ? (
        <SessionsTab
          sessions={sessions}
          d={d}
          codis={d.codis}
          items={d.items}
          notes={sortedNotes}
          onNotes={() => setTab("notes")}
          online={online}
        />
      ) : (
        <NotesTab notes={notes} online={online} />
      )}
    </div>
  );
}
