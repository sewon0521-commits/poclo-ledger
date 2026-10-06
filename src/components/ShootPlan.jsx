import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  Loader2,
  ImagePlus,
  Trash2,
  Check,
  ChevronRight,
  ExternalLink,
  Pencil,
  CalendarDays,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudFog,
  CloudLightning,
  Camera,
  Video,
  Store,
  Megaphone,
  Shirt,
  Images,
} from "lucide-react";
import { FIELD, md, loadKey, changeKey, upsert, remove, putPhoto, photoUrls, shopsOf } from "../lib/shoot";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { BigSlides } from "./ContentBits";
import { clipImages, filesOf } from "../lib/pasteImages";
import { folderIdOf, withChildren, ordered } from "../lib/reelFolders";

/**
 * 촬영 › 코디 촬영 관리 (10/4 세원 — 노션 '쇼핑몰 별 BEST 컷 모음' 화면을 보여 주며):
 *   "코디 촬영 관리란을 만들어 줘. 이번 촬영 때 어떤 컷·어떤 영상을 찍어야 하는지, 쇼핑몰별 베스트컷 모음집,
 *    이번 촬영 날씨 — 언제 올라가고 사람들이 이날 보니 이 날씨에 어떤 제품을 사겠구나, 쇼만마에서 어떤 코디를 찍어라·
 *    지금 어떤 코디가 뜬다는 걸 내가 정리해 넣는 칸."
 *
 * 탭 둘 (settings 키):
 *   촬영 회차      shoot_sessions  [{id, on, title, place, uploads:[날짜], cuts:[{id,text,done}], videos:[…], shops:[{id,name,url,photos}], sellNote, memo}]
 *                  shops = 그 촬영에서 따라갈 쇼핑몰 BEST 컷 (10/4 탭에서 회차 안으로). 예전 탭 것(shop_best)은 회차 창에서 '가져오기'로 옮긴다
 *   쇼만마 코디 노트 shomanma_notes  [{id, on, text, photos:[]}]
 * 날씨는 Open-Meteo(무료·키 없음, 서울) — 16일 안은 예보, 그 뒤는 작년 같은 날. 기온별 옷차림은 흔히 쓰는 표로 짐작만 한다.
 * 사진은 신상 관리와 같은 보관함(reels/shoot/…), 이 기기 저장 모드면 이 기기에.
 */

const KEYS = { sessions: "shoot_sessions", shops: "shop_best", notes: "shomanma_notes" };
const CUTS = ["전신 정면", "전신 측면", "뒷모습", "상반신", "앉은 컷", "걷는 컷", "디테일(소재·단추)", "거울 셀카", "손에 든 소품 컷"];
const VIDEOS = ["착용 영상(상의)", "핏 영상 — 걷기(하의)", "디테일 영상", "릴스 기획 영상", "거울 셀카 영상", "코디 바꾸기 영상"];

// ---------------------------------------------------------------- 저장 (서버 최신을 읽어 한 줄만 바꿔 쓰기)

function useList(key, online) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
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

// ---------------------------------------------------------------- 체크 목록 (컷 · 영상)

function CheckList({ title, icon: Icon, list, onChange, presets }) {
  const [text, setText] = useState("");
  const add = (t) => {
    const v = String(t || "").trim();
    if (!v) return;
    onChange([...list, { id: newId("k"), text: v, done: false }]);
  };
  const done = list.filter((x) => x.done).length;
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Icon size={15} className="text-rose-700" /> {title}
        </span>
        <span className="text-xs text-stone-400 tabular-nums">
          {done} / {list.length}
        </span>
      </div>
      {list.length > 0 && (
        <ul className="mb-2 space-y-0.5">
          {list.map((x) => (
            <li key={x.id} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-stone-50">
              <button
                type="button"
                onClick={() => onChange(list.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))}
                aria-label={x.done ? "안 찍음으로" : "찍음"}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] hover:bg-stone-200/80"
              >
                <span className={"flex h-4 w-4 items-center justify-center rounded-[4px] border-[1.5px] " + (x.done ? "border-rose-700 bg-rose-700 text-white" : "border-stone-400 bg-white")}>
                  {x.done && <Check size={11} strokeWidth={3.5} />}
                </span>
              </button>
              <input
                value={x.text}
                onChange={(e) => onChange(list.map((y) => (y.id === x.id ? { ...y, text: e.target.value } : y)))}
                className={"min-w-0 flex-1 bg-transparent text-sm outline-none " + (x.done ? "text-stone-400 line-through decoration-stone-300" : "text-stone-800")}
              />
              <button type="button" onClick={() => onChange(list.filter((y) => y.id !== x.id))} aria-label="빼기" className="rounded p-1 text-stone-300 opacity-0 group-hover:opacity-100 hover:text-rose-700 max-sm:opacity-100">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyUp={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            add(text);
            setText("");
          }
        }}
        placeholder="적고 엔터"
        className={FIELD + " py-1.5 text-sm"}
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {presets
          .filter((p) => !list.some((x) => x.text === p))
          .map((p) => (
            <button key={p} type="button" onClick={() => add(p)} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-600 hover:border-rose-300 hover:text-rose-800">
              + {p}
            </button>
          ))}
      </div>
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
    .filter((r) => (!inFolder || inFolder.has(folderIdOf(r, d.folders))) && (!cut || (r.cuts || []).includes(cut)) && (!shop || r.shop === shop));
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
          {(d.tags?.cuts || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {["", ...d.tags.cuts].map((c) => (
                <button
                  key={c || "all"}
                  type="button"
                  onClick={() => setCut(c)}
                  className={"rounded-full border px-2.5 py-0.5 text-xs " + (cut === c ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}
                >
                  {c || "컷 전체"}
                </button>
              ))}
            </div>
          )}
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
function PickedRefs({ d, ids, onChange, onAdd, online, onMsg, hot, onHot }) {
  const [pick, setPick] = useState(false);
  const [view, setView] = useState(null);
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
  const src = (r) => d.urls[r.photo] || shown[r.id] || "";
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
      if (!hot || pick || view != null) return;
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
      {refs.length || pending.length ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {refs.map((r, i) => (
            <span key={r.id} className="group relative">
              <button type="button" onClick={() => setView(i)} className="block aspect-[3/4] w-full overflow-hidden rounded-lg bg-stone-100">
                {src(r) && <img src={src(r)} alt="" loading="lazy" className="h-full w-full object-cover" />}
              </button>
              <button
                type="button"
                onClick={() => onChange(ids.filter((k) => k !== r.id))}
                aria-label="빼기"
                title="이 촬영에서만 빼요 (촬영 레퍼런스에는 남아요)"
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
      {view != null && <BigSlides urls={refs.map(src)} start={view} onClose={() => setView(null)} />}
    </div>
  );
}

function SessionSheet({ session, d, codis, items, notes, onSave, onRemove, onClose, onNotes, online, legacy = [], onTakeLegacy }) {
  const [msg, setMsg] = useState("");
  // Ctrl+V 가 들어갈 칸 — 마우스를 올리거나 누른 칸. 아직 없으면 쇼핑몰 칸이 있을 때 쇼핑몰, 없으면 촬영 레퍼런스
  const [pasteTo, setPasteTo] = useState("");
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

  return (
    <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <input
              value={s.title || ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="촬영 이름 — 예: 10월 2주 가을 코디 촬영"
              className="w-full bg-transparent text-lg font-semibold text-stone-900 outline-none placeholder:text-stone-300"
            />
            <p className="text-xs text-stone-400">고치는 대로 저장돼요</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-stone-500">
              촬영일
              <input type="date" value={s.on || ""} onChange={(e) => set({ on: e.target.value })} className={FIELD + " mt-1"} />
            </label>
            <label className="block text-xs font-medium text-stone-500">
              장소
              <input value={s.place || ""} onChange={(e) => set({ place: e.target.value })} placeholder="예: 사무실 스튜디오 / 성수 야외" className={FIELD + " mt-1"} />
            </label>
          </div>
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

          {/* 날씨 — 촬영일과 올라가는 날 */}
          <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-1">
            <div className="divide-y divide-sky-100">
              <WeatherRow label="촬영일" date={s.on} w={w[s.on]} />
              {uploads.map((u, i) => (
                <WeatherRow key={i} label={uploads.length > 1 ? `업로드 ${i + 1}` : "업로드"} date={u} w={u ? w[u] : undefined} />
              ))}
            </div>
            <p className="pb-2 text-[10px] text-sky-900/60">서울 기준 · 16일 안은 예보, 그 뒤는 작년 같은 날 · 옷차림은 하루 평균 기온으로 짐작한 거예요</p>
          </div>
          <label className="block text-xs font-medium text-stone-500">
            이 날씨에 팔릴 옷 — 올라가는 날 사람들이 뭘 살까
            <textarea
              value={s.sellNote || ""}
              onChange={(e) => set({ sellNote: e.target.value })}
              placeholder="예: 업로드날 최저 9° → 아침저녁 쌀쌀, 가디건·자켓 레이어드 코디를 앞에. 반팔 단독 컷은 빼기"
              className={FIELD + " mt-1 h-20 resize-y text-sm"}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <CheckList title="찍을 컷" icon={Camera} list={s.cuts || []} onChange={(v) => set({ cuts: v })} presets={CUTS} />
            <CheckList title="찍을 영상" icon={Video} list={s.videos || []} onChange={(v) => set({ videos: v })} presets={VIDEOS} />
          </div>

          {legacy.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-rose-300 bg-rose-50/50 px-3 py-2 text-xs text-rose-900">
              예전 '쇼핑몰 BEST 컷' 탭에 모아 둔 것 {legacy.length}곳 · 사진 {legacy.reduce((n, x) => n + (x.photos || []).length, 0)}장
              <button
                type="button"
                onClick={() => {
                  set({ shops: [...(latest.current.shops || []), ...legacy] });
                  onTakeLegacy();
                }}
                className="rounded-lg bg-rose-700 px-2.5 py-1 font-semibold text-white"
              >
                이 촬영으로 가져오기
              </button>
            </div>
          )}
          <PickedRefs
            d={d}
            ids={s.refIds || []}
            onChange={(v) => set({ refIds: v })}
            onAdd={(more) => set({ refIds: [...(latest.current.refIds || []), ...more] })}
            online={online}
            onMsg={setMsg}
            hot={pasteTo === "refs" || (!pasteTo && !(s.shops || []).length)}
            onHot={() => setPasteTo("refs")}
          />
          <ShopBoard
            list={s.shops || []}
            change={(fn) => set({ shops: fn(latest.current.shops || []) })}
            online={online}
            onMsg={setMsg}
            hot={pasteTo !== "refs"}
            onHot={() => setPasteTo("shops")}
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
                    <b className="font-medium text-stone-900">{c.name}</b>
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
              if (window.confirm("이 촬영을 지울까요?")) {
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

function SessionsTab({ sessions, d, codis, items, notes, onNotes, online, legacy, onTakeLegacy }) {
  const [open, setOpen] = useState(null);
  const today = dayKey();
  const all = sessions.items;
  const list = useMemo(() => {
    const up = all.filter((s) => !s.on || s.on >= today).sort((a, b) => (a.on || "9").localeCompare(b.on || "9"));
    const past = all.filter((s) => s.on && s.on < today).sort((a, b) => b.on.localeCompare(a.on));
    return { up, past };
  }, [all, today]);
  const w = useWeather(list.up.map((s) => s.on));
  const card = (s) => {
    const cuts = s.cuts || [];
    const vids = s.videos || [];
    const nCodi = codis.filter((c) => s.on && c.shootDate === s.on).length;
    return (
      <button key={s.id} type="button" onClick={() => setOpen(s)} className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-rose-300 hover:shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <span>
            <span className="block text-lg font-bold text-stone-900 tabular-nums">{s.on ? `${md(s.on)} 촬영` : "날짜 미정"}</span>
            <span className="block text-sm text-stone-600">{s.title || "이름 없는 촬영"}</span>
          </span>
          {s.on && <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + (s.on === today ? "bg-rose-700 text-white" : s.on > today ? "bg-rose-50 text-rose-800" : "bg-stone-100 text-stone-500")}>{dday(s.on)}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          {w[s.on] && (
            <span className="flex items-center gap-1 tabular-nums">
              <WxIcon code={w[s.on].code} size={14} /> {Math.round(w[s.on].max)}°/{Math.round(w[s.on].min)}°{w[s.on].past ? " (작년)" : ""}
            </span>
          )}
          <span>컷 {cuts.filter((x) => x.done).length}/{cuts.length}</span>
          <span>영상 {vids.filter((x) => x.done).length}/{vids.length}</span>
          {(s.refIds || []).length > 0 && <span>레퍼런스 {s.refIds.length}장</span>}
          {(s.shops || []).length > 0 && <span>BEST 컷 {(s.shops || []).reduce((n, x) => n + (x.photos || []).length, 0)}장 · {(s.shops || []).length}곳</span>}
          {nCodi > 0 && <span>코디 {nCodi}</span>}
          {s.uploads?.filter(Boolean).length > 0 && <span>업로드 {s.uploads.filter(Boolean).map(md).join(", ")}</span>}
        </div>
      </button>
    );
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            const s = { id: newId("ss"), on: "", title: "", uploads: [""], cuts: [], videos: [], createdAt: new Date().toISOString() };
            sessions.save(s);
            setOpen(s);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> 새 촬영
        </button>
      </div>
      {!sessions.items.length ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          '새 촬영'을 눌러 촬영일·올라가는 날·찍을 컷과 영상을 정리해 보세요. 날씨는 날짜만 넣으면 떠요.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.up.map(card)}</div>
          {list.past.length > 0 && (
            <>
              <div className="mt-5 mb-2 text-xs font-semibold text-stone-400">지난 촬영</div>
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
          legacy={legacy}
          onTakeLegacy={onTakeLegacy}
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

// ---------------------------------------------------------------- 쇼핑몰 BEST 컷

const OPEN_KEY = "poclo_shop_best_open";
/**
 * 쇼핑몰 BEST 컷 (10/4 세원: "촬영 회차 안에 쇼핑몰 BEST 컷이 들어갔으면. 촬영마다 우리가 지향하는 각 쇼핑몰의 코디 사진이 달라지기 때문에")
 * 촬영 회차마다 따로 — list = 그 회차의 shops [{id, name, url, photos}], change(fn) = 목록을 고치는 함수.
 */
function ShopBoard({ list, change, online, onMsg, hot = true, onHot }) {
  const [openIds, setOpenIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [active, setActive] = useState(null); // 붙여넣기(Ctrl+V)가 들어갈 쇼핑몰 — 마지막에 누르거나 마우스를 올린 칸
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState({}); // 쇼핑몰 id → 올리는 중인 사진 미리 보기
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(null);
  const file = useRef(null);
  const target = useRef(null);
  const urls = usePhotoUrls(
    list.filter((s) => openIds.has(s.id)).flatMap((s) => s.photos || []),
    online,
  );
  const toggle = (id) =>
    setOpenIds((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...n]));
      } catch {
        /* 기억 못 해도 된다 */
      }
      return n;
    });
  /** 사진 넣기 — 붙여넣은 사진이 바로 보이고(흐리게 + 도는 표시), 올라가면 진하게 */
  const addPhotos = async (shopId, clip) => {
    setOpenIds((o) => new Set([...o, shopId]));
    setBusy(clip.files.length ? `사진 ${clip.files.length}장 올리는 중…` : "사진 주소에서 사진 받는 중…");
    const list = await filesOf(clip);
    if (!list.length) {
      setBusy("");
      onMsg("붙여넣은 것에서 사진을 못 찾았어요. 사진 위에서 오른쪽 클릭 → '이미지 복사' 한 뒤 붙여넣어 보세요.");
      return;
    }
    const previews = list.map((f) => URL.createObjectURL(f));
    setPending((p) => ({ ...p, [shopId]: [...(p[shopId] || []), ...previews] }));
    setBusy(`사진 ${list.length}장 올리는 중…`);
    try {
      const keys = await savePhotos(list, online);
      change((l) => l.map((s) => (s.id === shopId ? { ...s, photos: [...(s.photos || []), ...keys] } : s)));
    } catch (e) {
      onMsg(e.message || "사진을 올리지 못했어요.");
    }
    setPending((p) => ({ ...p, [shopId]: (p[shopId] || []).filter((u) => !previews.includes(u)) }));
    setBusy("");
  };
  // 붙여넣기 — 화면 어디서든 Ctrl+V. 들어갈 칸: 마지막에 누르거나 마우스를 올린 칸 → 없으면 펼쳐 둔 첫 칸 → 첫 칸
  useEffect(() => {
    const onPaste = (e) => {
      if (e.defaultPrevented || !hot) return; // 촬영 레퍼런스 칸이 받았다
      if (e.target.closest?.("input, textarea, [contenteditable=true]")) return;
      const clip = clipImages(e.clipboardData);
      if (!clip.files.length && !clip.urls.length) return;
      e.preventDefault();
      const id = (list.some((s) => s.id === active) && active) || list.find((s) => openIds.has(s.id))?.id || list[0]?.id;
      if (!id) {
        onMsg("먼저 '쇼핑몰 추가'로 칸을 만들어 주세요. 그다음 붙여넣으면 들어가요.");
        return;
      }
      setActive(id);
      addPhotos(id, clip);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div onMouseEnter={onHot} onMouseDown={onHot} className="rounded-xl border border-stone-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            <Store size={15} className="text-rose-700" /> 쇼핑몰 BEST 컷 <span className="font-normal text-stone-400">이번 촬영에서 따라갈 코디 사진</span>
          </span>
          <span className="block text-[11px] text-stone-400">사진을 복사해서 Ctrl+V 하면 마우스를 올려 둔 칸에 바로 들어가요 · 끌어다 놓기도 돼요</span>
        </span>
        <button type="button" onClick={() => setAdding(true)} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
          <Plus size={13} /> 쇼핑몰 추가
        </button>
      </div>
      {busy && (
        <p className="mb-2 flex items-center gap-1.5 text-sm text-stone-600">
          <Loader2 size={14} className="animate-spin" /> {busy}
        </p>
      )}
      {adding && (
        <div className="mb-3 flex flex-wrap gap-2 rounded-2xl border border-rose-200 bg-rose-50/40 p-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="쇼핑몰 이름 — 예: 페트리코어" className={FIELD + " min-w-0 flex-1 text-sm"} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="베스트 페이지 주소 (선택)" className={FIELD + " min-w-0 flex-1 text-sm"} />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={async () => {
              const s = { id: newId("sb"), name: name.trim(), url: url.trim(), photos: [], createdAt: new Date().toISOString() };
              change((l) => [...l, s]);
              setOpenIds((o) => new Set([...o, s.id]));
              setActive(s.id);
              setName("");
              setUrl("");
              setAdding(false);
            }}
            className="rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            만들기
          </button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-2 text-sm text-stone-500">
            그만두기
          </button>
        </div>
      )}
      {!list.length && !adding ? (
        <p className="rounded-xl border border-dashed border-stone-200 px-4 py-5 text-center text-xs text-stone-400">'쇼핑몰 추가'로 이번 촬영에서 참고할 쇼핑몰 칸(페트리코어 · 윈느 …)을 만들어 보세요.</p>
      ) : (
        <div className="space-y-2">
          {list.map((s) => {
            const isOpen = openIds.has(s.id);
            const photos = s.photos || [];
            return (
              <section
                key={s.id}
                onMouseDown={() => setActive(s.id)}
                onMouseEnter={() => setActive(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  // 다른 창의 사진을 바로 끌어 와도(주소로 온다) 들어가게
                  const clip = clipImages(e.dataTransfer);
                  if (!clip.files.length && !clip.urls.length) return;
                  e.preventDefault();
                  setActive(s.id);
                  addPhotos(s.id, clip);
                }}
                className={"rounded-2xl border bg-white " + (hot && active === s.id ? "border-rose-300" : "border-stone-200")}
              >
                <header className="flex items-center gap-2 px-3 py-2">
                  <button type="button" onClick={() => toggle(s.id)} className="group/tg flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-stone-500 group-hover/tg:bg-stone-200/80 group-hover/tg:text-stone-900">
                      <ChevronRight size={17} strokeWidth={2.5} className={"transition-transform duration-150 " + (isOpen ? "rotate-90" : "")} />
                    </span>
                    {editing === s.id ? null : <span className="truncate font-semibold text-stone-900">{s.name}</span>}
                    <span className="shrink-0 text-xs text-stone-400">{photos.length}장</span>
                    {hot && active === s.id && <span className="hidden shrink-0 rounded bg-rose-50 px-1.5 text-[10px] font-medium text-rose-700 sm:inline">Ctrl+V 하면 여기로</span>}
                  </button>
                  {editing === s.id && (
                    <input
                      autoFocus
                      defaultValue={s.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        setEditing(null);
                        if (v && v !== s.name) change((l) => l.map((x) => (x.id === s.id ? { ...x, name: v } : x)));
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="min-w-0 flex-1 rounded-md border border-rose-400 px-2 py-1 text-sm outline-none"
                    />
                  )}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs text-sky-700 hover:underline">
                      베스트 열기 <ExternalLink size={11} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      target.current = s.id;
                      file.current?.click();
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 hover:border-rose-300 hover:text-rose-800"
                  >
                    <ImagePlus size={13} /> 사진
                  </button>
                  <button type="button" onClick={() => setEditing(s.id)} aria-label="이름 바꾸기" className="shrink-0 rounded p-1 text-stone-400 hover:text-stone-700">
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`'${s.name}' 칸과 사진 ${photos.length}장을 지울까요?`) && change((l) => l.filter((x) => x.id !== s.id))}
                    aria-label="쇼핑몰 지우기"
                    className="shrink-0 rounded p-1 text-stone-400 hover:text-rose-700"
                  >
                    <Trash2 size={13} />
                  </button>
                </header>
                {isOpen && (
                  <div className="border-t border-stone-100 p-3">
                    {photos.length || pending[s.id]?.length ? (
                      <PhotoGrid keys={photos} urls={urls} pending={pending[s.id] || []} onRemove={(k) => change((l) => l.map((x) => (x.id === s.id ? { ...x, photos: (x.photos || []).filter((y) => y !== k) } : x)))} />
                    ) : (
                      <p className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-sm text-stone-400">사진을 복사해서 이 칸에 마우스를 올리고 Ctrl+V · 끌어다 놓기 · '사진' 단추</p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (target.current) addPhotos(target.current, { files: [...e.target.files], urls: [] });
          e.target.value = "";
        }}
      />
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
  ["sessions", "촬영 회차"],
  ["notes", "쇼만마 코디 노트"],
];
const TAB_KEY = "poclo_shoot_plan_tab";

export default function ShootPlan({ d, online }) {
  const sessions = useList(KEYS.sessions, online);
  const shops = useList(KEYS.shops, online);
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
  const msg = sessions.msg || shops.msg || notes.msg;
  const count = { sessions: sessions.items.filter((s) => !s.on || s.on >= dayKey()).length, notes: notes.items.length };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">코디 촬영 관리</h2>
        <p className="mt-0.5 text-sm text-stone-500">촬영마다 찍을 컷·영상, 촬영일·올라가는 날 날씨, 따라갈 쇼핑몰 BEST 컷을 한 폴더에. 쇼만마에서 들은 코디는 노트로.</p>
      </div>
      {msg && (
        <p className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {msg}
          <button type="button" onClick={() => [sessions, shops, notes].forEach((x) => x.setMsg(""))} aria-label="닫기">
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
      {!(sessions.loaded && shops.loaded && notes.loaded) ? (
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
          legacy={shops.items}
          onTakeLegacy={() => shops.change(() => ({ items: [] }))}
        />
      ) : (
        <NotesTab notes={notes} online={online} />
      )}
    </div>
  );
}
