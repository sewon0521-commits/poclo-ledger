import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, Check, Clock, Copy, ExternalLink, Film, ImagePlus, Link2, Loader2, Lock, MapPin, Plus, RefreshCw, Shirt, Trash2, Unlock, Users, X } from "lucide-react";
import { FIELD, md, loadKey, changeKey, upsert, remove, codiName, codiItems, photoUrls, fixUrl } from "../lib/shoot";
import { clipImages, filesOf } from "../lib/pasteImages";
import { BigSlides } from "./ContentBits";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { stylingLine } from "../lib/styling";
import { buildSheet, createSheet, updateSheet, sheetLink, sheetDm, SHEET_DAYS, SheetError, PREP_PARTS, hasPrep } from "../lib/shootSheet";
import { Photo, CheckList } from "./ShootBits";
import StylingSheet from "./Styling";
import { MemoEditor } from "./SourcingMemo";
import { useSort, reorder, Grip } from "./CutBits";
import { guidePhoto, GUIDE_KEY, DEFAULT_GUIDE, filledItems } from "../lib/modelGuide";
import ModelGuideSheet from "./ModelGuideEditor";

/**
 * 촬영 › 촬영 관리 (10/25) — 세원: "소싱 관리랑 촬영 관리랑 따로 나눠야 할 것 같기도 하고. 모델분들도 다른 건 다 못 보게 하고 촬영 관리만 볼 수 있게"
 *   → 소싱 관리(무엇을 살지)와 나눠, 촬영일마다 그날 찍을 코디 · 스타일링 · 시간·장소·모델을 한 곳에.
 *   모델에게는 계정 대신 '촬영 시트 링크'(lib/shootSheet.js — 고른 칸만 담은 스냅숏, 로그인 없이 #sheet=<토큰>).
 *
 * 촬영일 = 코디들의 촬영일(shoot_codis.shootDate) + 직접 만든 촬영(settings shoot_days).
 * settings shoot_days {items:[{id, on, time, place, models:[이름], modelNote, prep:{bring, ask, info}, memo, cuts:[{id,text,done}], videos:[…], sheetToken, sheetAt, sheetClosed, createdAt}]}
 *   modelNote = 모델에게 전할 말의 인사 한 줄(예전 '모델에게 한 줄') · prep = 준비하실 것 / 미리 알려 주세요 / 참고해 주세요(10/27, 한 줄에 하나씩)
 *   코디만 있는 날은 창을 열고 무언가 고칠 때 그 날짜 줄이 생긴다.
 *
 * 10/26 같은 날 여러 촬영 — 세원: "같은 날 다른 모델을 쓸 수도 있어서, 10/28(수)에 황다현·이주현을 촬영하는데 이걸 나눠야 할 것 같아. 이런 날이 많지는 않겠지만."
 *   → 촬영 한 줄 = 날짜 + 모델(들) + 시간 + 시트 링크. 같은 날 여러 줄이면 카드도 여러 개(예전엔 날짜마다 첫 줄만 보여서 둘째 줄이 숨었다).
 *   코디는 shootDate 로 날짜에 붙고, 같은 날 촬영이 둘 이상이면 shoot_codis.shootId 로 어느 촬영인지 고른다(`shootOf`).
 *   shootId 가 없거나 그날 촬영이 아니면 그날 **처음 만든 촬영**(createdAt) — 촬영이 하나뿐인 날은 예전과 똑같다.
 *   촬영 시트 링크도 촬영마다 따로라 모델마다 자기 코디만 본다. 촬영 창 '같은 날 다른 모델 촬영 추가'로 만든다.
 *
 * 10/26 세원: "촬영 관리도 마찬가지로(소싱 관리처럼) 메모" → 촬영 창의 '메모(우리만 봐요)' 칸을 노션식 편집기로(kind 'day'). 예전 글 메모는 그대로 보인다.
 *   (같은 날 만든 '촬영일 · 메모' 탭은 세원 "촬영 관리도 빼, 어차피 안 쓸 것 같아"로 뺐다 — 세원이 말한 메모는 창 안 메모였다. shoot_memo 는 비어 있었음)
 */

const DAYS_KEY = "shoot_days";
const STUDIO = "우베리 스튜디오 (서울 서대문구 북아현로 100, 2층)";

const wd = (d) => (d ? "일월화수목금토"[new Date(d + "T00:00:00").getDay()] : "");
const dday = (d) => {
  if (!d) return "";
  const n = Math.round((new Date(d + "T00:00:00") - new Date(dayKey() + "T00:00:00")) / 86400000);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n > 0 ? `D-${n}` : `${-n}일 전`;
};
const timeText = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${m ? ` ${m}분` : ""}`;
};

// ---------------------------------------------------------------- 같은 날 여러 촬영 (10/26)

/** 그날 촬영들 — 처음 만든 순서 */
const sameDay = (rows, on) => (on ? rows.filter((x) => x.on === on).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id)) : []);
/** 코디가 어느 촬영인지 — shootId 가 그날 촬영이면 그것, 아니면 그날 처음 만든 촬영(없으면 null) */
const shootOf = (c, rows) => {
  const list = sameDay(rows, c.shootDate);
  return list.find((r) => r.id === c.shootId) || list[0] || null;
};
/** 이 촬영의 코디 — rows 에 이 촬영이 없으면(아직 저장 전인 날) 그날 코디 전부 */
const codisOf = (row, codis, rows) => {
  const dayCodis = codis.filter((c) => row.on && c.shootDate === row.on);
  if (!rows.some((r) => r.id === row.id)) return sameDay(rows, row.on).length ? [] : dayCodis;
  return dayCodis.filter((c) => shootOf(c, rows)?.id === row.id);
};
/** '황다현 · 오후 12시' */
const shootLabel = (r) => [(r.models || []).filter(Boolean).join(", ") || "모델 미정", timeText(r.time)].filter(Boolean).join(" · ");
/** 촬영의 코디 순서(10/27) — codiOrder 에 있는 건 그 순서, 없는 건(새로 붙은 코디) 원래 순서대로 뒤에 */
const inOrder = (codis, order = []) => {
  const at = new Map(order.map((id, i) => [id, i]));
  return codis.map((c, i) => [c, at.has(c.id) ? at.get(c.id) : order.length + i]).sort((a, b) => a[1] - b[1]).map(([c]) => c);
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}
function CopyBtn({ text, children, primary }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={
        "flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold " +
        (primary ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-stone-200 bg-white text-stone-700 hover:border-rose-300 hover:text-rose-800")
      }
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "복사했어요" : children}
    </button>
  );
}

/** shoot_days 읽고 쓰기 (서버 최신을 읽어 한 줄만 바꿔 쓰기 — lib/shoot changeKey) */
function useDays(online) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poclo_" + DAYS_KEY) || "null")?.items || [];
    } catch {
      return [];
    }
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    loadKey(DAYS_KEY, online)
      .then((v) => alive && setItems(v.items || []))
      .catch(() => alive && setMsg("촬영 목록을 불러오지 못했어요. 인터넷을 확인해 주세요."));
    return () => {
      alive = false;
    };
  }, [online]);
  const change = useCallback(
    async (fn) => {
      try {
        const next = await changeKey(DAYS_KEY, online, fn);
        setItems(next.items || []);
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
      }
    },
    [online],
  );
  return { items, msg, setMsg, save: (it) => change(upsert(it)), drop: (id) => change(remove(id)) };
}

/** 모델 이름 칩 — 적고 엔터 */
function Models({ value = [], onChange }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setTyped("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((m) => (
        <span key={m} className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
          {m}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== m))} aria-label={`${m} 빼기`} className="text-rose-400 hover:text-rose-800">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
        onBlur={add}
        placeholder="모델 이름 (엔터)"
        className="w-36 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs outline-none focus:border-rose-400"
      />
    </div>
  );
}

/** 그날 코디 카드 — 누르면 스타일링. 같은 날 촬영이 둘 이상이면(rows) 아래에 '누구 촬영' 고르기 */
function CodiRow({ c, d, onStyle, rows, onMove }) {
  const its = codiItems(c, d.items);
  const line = stylingLine(c.styling, d.items);
  // 이 코디의 찍을 컷 · 영상 (10/27) — 끝낸 수 / 전체
  const cnt = (l) => (l?.length ? `${l.filter((x) => x.done).length}/${l.length}` : "");
  // 10/29 모델 시트에 가는 참고 영상(자른 장면 + 인스타 주소) · 참고 사진 수
  const nVid = (c.styling?.clips?.length || 0) + (c.styling?.refVideos?.length || 0);
  const nPic = new Set([...(c.styling?.refIds || []), ...(c.refIds || [])]).size;
  const tally = [
    cnt(c.styling?.cuts) && `컷 ${cnt(c.styling.cuts)}`,
    cnt(c.styling?.videos) && `영상 ${cnt(c.styling.videos)}`,
    nVid && `참고 영상 ${nVid}`,
    nPic && `참고 사진 ${nPic}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const card = (
    <button type="button" onClick={onStyle} className="flex w-full min-w-0 gap-3 rounded-xl border border-stone-200 bg-white p-2.5 text-left hover:border-rose-300">
      <span className="flex shrink-0 gap-1">
        {its.slice(0, 3).map((x) => (
          <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-11 rounded-md" />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold text-stone-900">{codiName(c, d.items)}</span>
        {line ? (
          <span className="mt-0.5 block truncate text-xs text-rose-800">{line}</span>
        ) : (
          <span className="mt-0.5 block text-xs text-amber-700">스타일링 정하기 — 헤어 · 신발 · 악세서리</span>
        )}
        {tally && <span className="mt-0.5 block text-[11px] font-medium text-stone-500">{tally}</span>}
        {c.uploadOn && <span className="block text-[11px] text-stone-400">{md(c.uploadOn)} 업로드</span>}
      </span>
    </button>
  );
  if (!(rows?.length > 1)) return card;
  return (
    <div className="min-w-0">
      {card}
      <label className="mt-1 flex min-w-0 items-center gap-1.5 px-1 text-[11px] text-stone-500">
        <Users size={12} className="shrink-0 text-stone-400" /> 누구 촬영
        <select
          value={shootOf(c, rows)?.id || ""}
          onChange={(e) => onMove(c, e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-1.5 py-1 text-xs text-stone-700 outline-none focus:border-rose-500"
        >
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {shootLabel(r)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- 모델에게 보낼 가이드 (10/27)
// 세원: "촬영 창에 '모델에게 보낼 가이드' 칸 — 가이드 사진 여러 장(Ctrl+V·끌어다 놓기·고르기, 저장소가 1GB 넘었으니 긴 변 1600px jpg),
//   레퍼런스 링크 여러 개(이름 + 주소). 촬영 시트에 '영상 가이드'로 코디 위에, 사진은 누르면 크게. '내용 새로 보내기' 하면 같이."
// 10/27 세원: "순서를 코디 → 가이드로" · "레퍼런스가 인스타 릴스·게시물이면 단추 대신 시트 안에서 바로 영상" → SheetPage.GuideCard·IgEmbed
// 촬영 줄에 guidePhotos:[보관 키] · guideLinks:[{id, name, url}]. 세로로 아주 긴 안내 이미지는 폭 1080 까지만 줄인다(putPhoto tallWidth — 글씨가 읽히게).
// 이 기기 저장 모드면 사진은 작은 data URL 로(시험용).

const GUIDE_URLS = new Map(); // 보관 키 → 서명 주소(4시간) · 이 탭에서만
// 사진 보관(guidePhoto)은 lib/modelGuide.js — 모델 기본 가이드(10/29)와 같이 쓴다
const hostOf = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function GuideBox({ s, set, online }) {
  const photos = useMemo(() => s.guidePhotos || [], [s.guidePhotos]);
  const links = s.guideLinks || [];
  const [urls, setUrls] = useState({});
  const [pending, setPending] = useState([]); // 올리는 중 미리 보기
  const [err, setErr] = useState("");
  const [big, setBig] = useState(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const boxRef = useRef(null);
  const hot = useRef(false);
  const fileRef = useRef(null);
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);

  // 서명 주소 — 없는 것만
  const sig = photos.filter((k) => !k.startsWith("data:") && !GUIDE_URLS.has(k)).join("|");
  useEffect(() => {
    const want = sig ? sig.split("|") : [];
    if (!want.length) return;
    let alive = true;
    photoUrls(want, online)
      .then((m) => {
        for (const k of want) GUIDE_URLS.set(k, m[k] || "");
        if (alive) setUrls((u) => ({ ...u, ...m }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sig, online]);
  const src = (k) => (k.startsWith("data:") ? k : urls[k] || GUIDE_URLS.get(k) || "");

  const add = async (files) => {
    const imgs = [...files].filter((f) => f.type?.startsWith("image/"));
    if (!imgs.length) return;
    setErr("");
    const previews = imgs.map((f) => URL.createObjectURL(f));
    setPending((p) => [...p, ...previews]);
    for (let i = 0; i < imgs.length; i++) {
      try {
        const k = await guidePhoto(imgs[i], online);
        if (!k.startsWith("data:")) GUIDE_URLS.set(k, previews[i]); // 서명 주소 받기 전에도 바로 보이게
        latest.current = [...latest.current, k];
        set({ guidePhotos: latest.current });
      } catch (e) {
        setErr(e.message || "사진을 넣지 못했어요.");
      }
      setPending((p) => p.filter((u) => u !== previews[i]));
    }
  };

  // Ctrl+V — 이 칸에 마우스를 올렸거나 이 칸을 눌렀을 때만(글 칸 안 붙여넣기는 안 가로챈다)
  useEffect(() => {
    const onPaste = (e) => {
      const inBox = boxRef.current && boxRef.current.contains(document.activeElement);
      if (!hot.current && !inBox) return;
      const t = e.target;
      if (t?.closest?.("input, textarea, [contenteditable=true]")) return;
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return;
      e.preventDefault();
      e.stopPropagation();
      filesOf(c).then(add);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const addLink = () => {
    const u = fixUrl(url);
    if (!u) {
      setErr("주소를 다시 확인해 주세요 (예: instagram.com/reel/…).");
      return;
    }
    set({ guideLinks: [...links, { id: newId("gl"), name: name.trim(), url: u }] });
    setName("");
    setUrl("");
    setErr("");
  };

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      onMouseEnter={() => (hot.current = true)}
      onMouseLeave={() => (hot.current = false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        filesOf(clipImages(e.dataTransfer)).then(add);
      }}
      className="rounded-xl border border-stone-200 p-3 outline-none focus-within:border-rose-300"
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-sm font-semibold text-stone-800">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Film size={15} className="text-rose-700" /> 모델에게 보낼 가이드
        </span>
        <span className="text-xs font-normal text-stone-400">시트 코디 아래 '영상 가이드' · 인스타 링크는 시트 안 영상으로</span>
      </div>
      <p className="mb-2 text-xs text-stone-500">가이드 사진 · 레퍼런스 링크 — 이 칸에 마우스를 올리고 Ctrl+V, 끌어다 놓기, 사진 고르기. 바꾼 뒤엔 시트에서 '내용 새로 보내기'.</p>
      {(photos.length > 0 || pending.length > 0) && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {photos.map((k, i) => (
            <span key={k.slice(0, 80) + i} className="group relative shrink-0">
              <button type="button" onClick={() => setBig(i)} className="block h-28 w-20 overflow-hidden rounded-lg bg-stone-100" aria-label="크게 보기">
                {src(k) && <img src={src(k)} alt="" className="h-full w-full object-cover object-top" />}
              </button>
              <button
                type="button"
                onClick={() => window.confirm("이 가이드 사진을 뺄까요?") && set({ guidePhotos: photos.filter((_, j) => j !== i) })}
                aria-label="사진 빼기"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-80"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {pending.map((u) => (
            <span key={u} className="relative block h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
              <img src={u} alt="" className="h-full w-full object-cover object-top opacity-60" />
              <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-white drop-shadow" />
            </span>
          ))}
        </div>
      )}
      <button type="button" onClick={() => fileRef.current?.click()} className="mb-2 flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-rose-300 hover:text-rose-800">
        <ImagePlus size={13} /> 가이드 사진 고르기
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files || []);
          e.target.value = "";
        }}
      />
      {links.length > 0 && (
        <ul className="mb-2 space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
              <Link2 size={12} className="shrink-0 text-stone-400" />
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-stone-800 hover:text-rose-800">
                {l.name || hostOf(l.url)} <span className="font-normal text-stone-400">{l.name ? hostOf(l.url) : ""}</span>
              </a>
              <button type="button" onClick={() => set({ guideLinks: links.filter((x) => x.id !== l.id) })} aria-label="링크 빼기" className="shrink-0 p-0.5 text-stone-400 hover:text-rose-700">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="레퍼런스 이름 (예: 거울셀카 걷기)" className="min-w-0 flex-1 basis-36 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-rose-600" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), addLink())}
          placeholder="주소 (instagram.com/reel/…)"
          className="min-w-0 flex-[2] basis-48 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-rose-600"
        />
        <button type="button" onClick={addLink} disabled={!url.trim()} className="flex items-center gap-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300">
          <Plus size={12} /> 링크
        </button>
      </div>
      {err && <p className="mt-1.5 text-xs text-rose-700">{err}</p>}
      {big != null && <BigSlides urls={photos.map(src)} start={big} onClose={() => setBig(null)} />}
    </div>
  );
}

/** 모델에게 보낼 촬영 시트 링크 */
function SheetLink({ day, set, codis, d, online }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const today = dayKey();
  // 10/29 모델 기본 가이드 — 모든 시트에 같이 간다. 몇 칸인지 보여 주고 여기서도 고친다
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideN, setGuideN] = useState(null);
  useEffect(() => {
    if (guideOpen) return;
    let alive = true;
    loadKey(GUIDE_KEY, online, null)
      .then((v) => alive && setGuideN(filledItems(v ? v.items : DEFAULT_GUIDE.items).map((x) => (x.title || "").trim() || "제목 없는 칸")))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [guideOpen, online]);
  const run = async (what) => {
    setBusy(what);
    setErr("");
    try {
      if (what === "make") {
        const data = await buildSheet(day, codis, d, online);
        const token = await createSheet(online, data);
        set({ sheetToken: token, sheetAt: new Date().toISOString(), sheetClosed: false });
      } else if (what === "refresh") {
        const data = await buildSheet(day, codis, d, online);
        await updateSheet(online, day.sheetToken, { data, closed: false });
        set({ sheetAt: new Date().toISOString(), sheetClosed: false });
      } else if (what === "close") {
        await updateSheet(online, day.sheetToken, { closed: true });
        set({ sheetClosed: true });
      } else if (what === "open") {
        await updateSheet(online, day.sheetToken, { closed: false });
        set({ sheetClosed: false });
      }
    } catch (e) {
      setErr(e instanceof SheetError && e.code === "missing" ? "missing" : e.message || "하지 못했어요.");
    } finally {
      setBusy("");
    }
  };
  const age = day.sheetAt ? Math.round((new Date(today + "T00:00:00") - new Date(dayKey(new Date(day.sheetAt)) + "T00:00:00")) / 86400000) : 0;
  const old = age >= SHEET_DAYS - 1;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
        <Link2 size={15} className="text-rose-700" /> 모델에게 보낼 촬영 시트
      </div>
      <p className="mb-2 text-xs text-stone-500">
        모델은 로그인 없이 이 날 <b>시간·장소 · 전할 말 · 촬영 기본 가이드 · 영상 가이드</b>만 봐요. 코디·참고 사진·참고 영상·상품·가격·거래처는 안 들어가요(코디는 찍을 때 우리가 디렉).
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-stone-200">
        <BookOpen size={13} className="shrink-0 text-rose-700" />
        <span className="min-w-0 flex-1 text-stone-600">
          촬영 기본 가이드{guideN ? (guideN.length ? ` ${guideN.length}칸 — ${guideN.join(" · ")}` : " — 비어 있어요") : ""}
        </span>
        <button type="button" onClick={() => setGuideOpen(true)} className="shrink-0 font-semibold text-rose-700 hover:underline">
          고치기
        </button>
      </div>
      {guideOpen && <ModelGuideSheet online={online} onClose={() => setGuideOpen(false)} />}
      {err === "missing" ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          촬영 시트 준비가 아직 안 됐어요 — Supabase SQL 을 한 번 실행해 주세요:{" "}
          <a href="https://supabase.com/dashboard/project/prbsdwmlnigpjcfkvivd/sql/new" target="_blank" rel="noreferrer" className="font-semibold underline">
            SQL Editor 열기
          </a>{" "}
          → <b>poclo-ledger/supabase/shoot_sheets.sql</b> 전부 붙여넣고 Run.
        </div>
      ) : err ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>
      ) : null}
      {!day.sheetToken ? (
        <button
          type="button"
          disabled={!!busy || !day.on}
          onClick={() => run("make")}
          className="mt-1 flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          {busy === "make" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} 모델에게 보낼 링크 만들기
        </button>
      ) : (
        <div className="mt-1 space-y-2">
          <div className={"flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2 " + (day.sheetClosed ? "border-stone-200 opacity-60" : "border-stone-200")}>
            <input readOnly value={sheetLink(day.sheetToken)} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-xs text-stone-700 outline-none" />
            {day.sheetClosed ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                <Lock size={11} /> 닫힘
              </span>
            ) : (
              <a href={sheetLink(day.sheetToken)} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rose-700">
                열어 보기 <ExternalLink size={11} />
              </a>
            )}
          </div>
          {!day.sheetClosed && (
            <div className="flex flex-wrap gap-1.5">
              <CopyBtn text={sheetLink(day.sheetToken)}>링크 복사</CopyBtn>
              <CopyBtn primary text={sheetDm(day.models?.[0], day.sheetToken, day.on, today)}>
                DM 문구 복사
              </CopyBtn>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" disabled={!!busy} onClick={() => run("refresh")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-medium text-stone-700 hover:border-rose-300 disabled:opacity-50">
              {busy === "refresh" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 내용 새로 보내기
            </button>
            {day.sheetClosed ? (
              <button type="button" disabled={!!busy} onClick={() => run("open")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-medium text-stone-700 disabled:opacity-50">
                <Unlock size={12} /> 다시 열기
              </button>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => window.confirm("링크를 닫을까요? 모델이 더 이상 못 열어요.") && run("close")}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-stone-500 hover:text-rose-700 disabled:opacity-50"
              >
                <Lock size={12} /> 링크 닫기
              </button>
            )}
            {day.sheetAt && <span className="text-stone-400">마지막으로 보낸 내용 {md(dayKey(new Date(day.sheetAt)))}</span>}
          </div>
          <p className={"text-[11px] " + (old ? "font-semibold text-amber-700" : "text-stone-400")}>
            코디·스타일링을 바꿨으면 '내용 새로 보내기'를 눌러야 모델 화면에 반영돼요. 사진은 보낸 날로부터 {SHEET_DAYS}일 동안 보여요{old ? " — 곧 사진이 안 보여요, 새로 보내 주세요" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 모델에게 전할 말 (10/27) — 세원: "준비하실 것 · 미리 알려 주세요 · 참고해 주세요는 내가 적는 걸로 따로 빼서 코디 바로 위에. 모델에게 한 줄을 내가 말한 걸로 바꾸는 거지."
 * 인사 한 줄(modelNote — 예전 '모델에게 한 줄') + 세 칸(prep {bring, ask, info}, 한 줄에 하나씩 → 시트에서 점 목록). 비어 있으면 지난 촬영 것을 불러올 수 있다(매번 비슷해서).
 */
function ModelPrep({ s, set, rows }) {
  const empty = !hasPrep(s);
  const prev = empty
    ? rows.filter((r) => r.id !== s.id && hasPrep(r)).sort((a, b) => (b.on || "").localeCompare(a.on || "") || (b.createdAt || "").localeCompare(a.createdAt || ""))[0]
    : null;
  const put = (k, v) => set({ prep: { ...(s.prep || {}), [k]: v } });
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-stone-800">모델에게 전할 말</span>
        <span className="text-xs text-stone-400">촬영 시트 코디 바로 위에 가요 · 한 줄에 하나씩 적으면 점 목록</span>
        {prev && (
          <button type="button" onClick={() => set({ prep: { ...prev.prep } })} className="ml-auto rounded-full border border-dashed border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">
            지난 촬영({md(prev.on)}{(prev.models || []).filter(Boolean).length ? ` · ${prev.models.filter(Boolean).join(", ")}` : ""}) 내용 불러오기
          </button>
        )}
      </div>
      <label className="block text-xs font-medium text-stone-500">
        인사 한 줄 (선택)
        <input value={s.modelNote || ""} onChange={(e) => set({ modelNote: e.target.value })} placeholder="예: 28일 찍을 코디예요! 궁금한 점은 DM 주세요" className={FIELD + " mt-1"} />
      </label>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {PREP_PARTS.map((p) => (
          <label key={p.k} className="block text-xs font-medium text-stone-500">
            {p.title}
            <textarea value={s.prep?.[p.k] || ""} onChange={(e) => put(p.k, e.target.value)} placeholder={p.hint} rows={4} className={FIELD + " mt-1 resize-y leading-relaxed"} />
          </label>
        ))}
      </div>
    </div>
  );
}

/** 촬영 창 — 고치는 대로 저장. rows = 촬영 전체(같은 날 다른 촬영 찾기), onOpen = 다른 촬영 열기, onAddSibling = 같은 날 새 촬영 */
function DaySheet({ day: start, d, online, rows = [], onSave, onRemove, onClose, onOpen, onAddSibling, canRemove }) {
  const [s, setS] = useState(start);
  const latest = useRef(s);
  const timer = useRef(null);
  const saved = useRef(JSON.stringify(start));
  const [styling, setStyling] = useState(null);
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
    timer.current = setTimeout(flush, 500);
  };
  // 이 창에서 고친 것(아직 저장 전)까지 넣은 촬영 목록
  const all = rows.some((r) => r.id === s.id) ? rows.map((r) => (r.id === s.id ? s : r)) : rows;
  // 10/27 세원: "촬영 관리에서 이 촬영 코디 순서를 변경하게" — 손잡이(⋮⋮)로 끌어 옮기면 s.codiOrder, 시트 링크도 이 순서
  const codis = inOrder(codisOf(s, d.codis, all), s.codiOrder);
  const sort = useSort((from, to) => set({ codiOrder: reorder(codis.map((c) => c.id), from, to) }));
  const dayRows = sameDay(all, s.on);
  const siblings = dayRows.filter((r) => r.id !== s.id);
  const others = siblings.length ? d.codis.filter((c) => s.on && c.shootDate === s.on && !codis.includes(c)) : [];
  const [showOthers, setShowOthers] = useState(false);
  const moveCodi = (c, rowId) => d.saveCodis(upsert({ ...c, shootId: rowId }));
  const addSibling = () => {
    // 이 촬영이 아직 저장 전이면(코디만 있던 날) 먼저 저장 — 안 그러면 그날 코디가 전부 새 촬영으로 간다
    if (!rows.some((r) => r.id === s.id)) {
      saved.current = JSON.stringify(latest.current);
      onSave(latest.current);
    } else flush();
    onAddSibling(latest.current);
  };
  const styled = codis.filter((c) => stylingLine(c.styling, d.items)).length;
  const live = styling && d.codis.find((c) => c.id === styling.id);
  return (
    <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-stone-900">
              {s.on ? `${md(s.on)}(${wd(s.on)}) 촬영` : "날짜 미정"}
              {siblings.length > 0 && <span className="text-rose-800"> · {(s.models || []).filter(Boolean).join(", ") || "모델 미정"}</span>}{" "}
              {s.on && <span className="ml-1 text-sm font-semibold text-rose-700">{dday(s.on)}</span>}
            </div>
            <p className="text-xs text-stone-400">고치는 대로 저장돼요</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label className="block text-xs font-medium text-stone-500">
              촬영일
              <input type="date" value={s.on || ""} onChange={(e) => set({ on: e.target.value })} className={FIELD + " mt-1"} />
            </label>
            <label className="block text-xs font-medium text-stone-500">
              시작 시각
              <input type="time" value={s.time || ""} onChange={(e) => set({ time: e.target.value })} className={FIELD + " mt-1"} />
            </label>
            <label className="block text-xs font-medium text-stone-500 sm:col-span-1">
              장소
              <input value={s.place || ""} onChange={(e) => set({ place: e.target.value })} placeholder={STUDIO} className={FIELD + " mt-1"} />
            </label>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-stone-500">모델</div>
            <Models value={s.models || []} onChange={(v) => set({ models: v })} />
          </div>
          {s.on && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-stone-50 px-3 py-2 text-xs">
              {siblings.length > 0 ? (
                <>
                  <span className="font-medium text-stone-500">같은 날 다른 촬영</span>
                  {siblings.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        flush();
                        onOpen(r);
                      }}
                      className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-700 hover:border-rose-300 hover:text-rose-800"
                    >
                      <Users size={11} /> {shootLabel(r)}
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-stone-400">같은 날 다른 모델도 찍으면 촬영을 나눠요 — 코디·시트 링크가 모델마다 따로</span>
              )}
              <button type="button" onClick={addSibling} className="flex items-center gap-1 rounded-full border border-dashed border-rose-300 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-50">
                <Plus size={11} /> 같은 날 다른 모델 촬영
              </button>
            </div>
          )}
          <ModelPrep s={s} set={set} rows={rows} />
          <GuideBox s={s} set={set} online={online} />

          <div className="rounded-xl border border-stone-200 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
              <Shirt size={15} className="text-rose-700" /> {siblings.length ? "이 촬영 코디" : "그날 코디"}{" "}
              {codis.length > 0 && <span className="font-normal text-stone-400">{codis.length}개 · 스타일링 {styled}/{codis.length}</span>}
            </div>
            {codis.length ? (
              <div className="space-y-2">
                {codis.length > 1 && <p className="text-[11px] text-stone-400">왼쪽 ⋮⋮ 를 끌어 찍는 순서를 바꿔요 — 모델 시트도 이 순서예요</p>}
                {codis.map((c, i) => (
                  <div
                    key={c.id}
                    ref={sort.ref(i)}
                    style={sort.styleOf(i)}
                    className={"flex min-w-0 items-start gap-1.5 bg-white " + (sort.dragging === i ? "rounded-xl shadow-lg ring-1 ring-stone-200" : "")}
                  >
                    <div className="flex w-7 shrink-0 flex-col items-center gap-0.5 pt-2">
                      <span className="text-xs font-bold text-rose-700 tabular-nums">{i + 1}</span>
                      {codis.length > 1 && <Grip onPointerDown={(e) => sort.start(e, i)} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CodiRow c={c} d={d} onStyle={() => setStyling(c)} rows={dayRows} onMove={moveCodi} />
                    </div>
                  </div>
                ))}
              </div>
            ) : siblings.length ? (
              <p className="text-xs text-stone-400">아직 이 촬영 코디가 없어요 — 아래 '같은 날 다른 촬영 코디'에서 '누구 촬영'을 이 촬영으로 바꿔요.</p>
            ) : (
              <p className="text-xs text-stone-400">촬영 › 코디에서 촬영일을 {s.on ? md(s.on) : "이날"}로 정한 코디가 여기 떠요. 누르면 헤어·신발·악세서리를 골라요.</p>
            )}
            {others.length > 0 && (
              <div className="mt-3 border-t border-stone-100 pt-2.5">
                <button type="button" onClick={() => setShowOthers(!showOthers)} className="text-xs font-semibold text-stone-500 hover:text-rose-800">
                  같은 날 다른 촬영 코디 {others.length}개 {showOthers ? "접기" : "보기"}
                </button>
                {showOthers && (
                  <div className="mt-2 grid grid-cols-1 gap-2 opacity-90 sm:grid-cols-2">
                    {others.map((c) => (
                      <CodiRow key={c.id} c={c} d={d} onStyle={() => setStyling(c)} rows={dayRows} onMove={moveCodi} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 10/27 세원: "찍을 컷, 찍을 영상 그걸 이 촬영 코디 안에 각각" — 이제 코디마다(코디를 누르면 스타일링 창 맨 위).
              예전에 촬영 전체로 적어 둔 것만 아래에 남겨 보여 준다(지우면 사라짐). */}
          {((s.cuts || []).length > 0 || (s.videos || []).length > 0) && (
            <div className="space-y-2 rounded-xl bg-stone-50 p-3">
              <p className="text-xs text-stone-500">
                <b className="font-semibold text-stone-700">예전에 촬영 전체로 적은 찍을 컷 · 영상</b> — 이제는 코디마다 적어요(코디를 누르면 스타일링 창 맨 위). 다 옮겼으면 지워도 돼요.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(s.cuts || []).length > 0 && <CheckList title="찍을 컷 (촬영 전체)" list={s.cuts} onChange={(v) => set({ cuts: v })} placeholder="+ 컷 엔터" />}
                {(s.videos || []).length > 0 && <CheckList title="찍을 영상 (촬영 전체)" list={s.videos} onChange={(v) => set({ videos: v })} placeholder="+ 영상 엔터" />}
              </div>
            </div>
          )}

          <SheetLink day={s} set={set} codis={codis} d={d} online={online} />

          <div>
            <div className="mb-1 text-xs font-medium text-stone-500">메모 (우리만 봐요)</div>
            <div className="rounded-xl border border-stone-200 bg-white">
              <MemoEditor key={start.id} initial={start.memo || ""} onSave={(t) => set({ memo: t })} online={online} kind="day" compact />
            </div>
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
          {canRemove ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("이 촬영을 지울까요? (코디는 그대로 남아요)")) {
                  saved.current = JSON.stringify(latest.current);
                  onRemove(s.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
            >
              <Trash2 size={13} /> 지우기
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white">
            닫기
          </button>
        </footer>
      </div>
      {live && <StylingSheet codi={live} d={d} online={online} onClose={() => setStyling(null)} />}
    </div>
  );
}

// 촬영일 미정 코디 (10/25 세원: "신상 관리에서 코디 짜면 촬영 관리에서 바로 업뎃되게") — 신상 관리 코디는 촬영일이 '(선택)'이라
// 비워 두면 촬영 관리에 안 나왔다. 촬영 전·촬영일 없는 코디를 맨 위에 모으고, 여기서 촬영일을 정하면 그날 카드로 들어간다.
function UndatedCodis({ codis, d, onStyle }) {
  const [busy, setBusy] = useState("");
  if (!codis.length) return null;
  const setDate = async (c, on) => {
    if (!on) return;
    setBusy(c.id);
    try {
      await d.saveCodis(upsert({ ...c, shootDate: on }));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-bold text-amber-900">촬영일 미정 코디 {codis.length}</h3>
        <span className="text-xs text-amber-800/80">신상 관리에서 짠 코디가 바로 여기로 와요 · 촬영일을 정하면 그날 카드로 옮겨져요</span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {codis.map((c) => {
          const its = codiItems(c, d.items);
          const line = stylingLine(c.styling, d.items);
          return (
            <div key={c.id} className="flex gap-2.5 rounded-xl border border-stone-200 bg-white p-2.5">
              <button type="button" onClick={() => onStyle(c)} className="flex shrink-0 gap-1" title="스타일링 고르기">
                {its.slice(0, 3).map((x) => (
                  <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-12 rounded-md" />
                ))}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button type="button" onClick={() => onStyle(c)} className="line-clamp-2 text-left text-[13px] leading-snug font-semibold text-stone-900 hover:text-rose-800">
                  {codiName(c, d.items)}
                </button>
                <span className={"truncate text-[11px] " + (line ? "text-emerald-700" : "text-stone-400")}>{line ? `스타일링 · ${line}` : "스타일링 아직"}</span>
                <label className="mt-auto flex items-center gap-1.5 text-[11px] text-stone-500">
                  촬영일
                  <input
                    type="date"
                    disabled={busy === c.id}
                    onChange={(e) => setDate(c, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-rose-600"
                  />
                  {busy === c.id && <Loader2 size={12} className="animate-spin" />}
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ShootDays({ d, online }) {
  const days = useDays(online);
  const [open, setOpen] = useState(null); // 날짜 또는 기록 id
  const [styling, setStyling] = useState(null); // 촬영일 미정 코디 id
  const [guide, setGuide] = useState(false); // 모델 기본 가이드 고치기 창
  const today = dayKey();
  const undated = useMemo(() => d.codis.filter((c) => !c.shootDate && !c.done), [d.codis]);
  const liveStyling = styling && d.codis.find((c) => c.id === styling);
  // 촬영일 = 직접 만든 촬영(같은 날 여러 개면 카드도 여러 개 — 10/26) + 촬영이 아직 없는 코디 촬영일
  const list = useMemo(() => {
    const rows = days.items.filter((x) => x.on).map((rec) => ({ on: rec.on, rec, codis: codisOf(rec, d.codis, days.items), n: sameDay(days.items, rec.on).length }));
    const had = new Set(rows.map((r) => r.on));
    for (const on of new Set(d.codis.map((c) => c.shootDate).filter(Boolean))) if (!had.has(on)) rows.push({ on, rec: null, codis: d.codis.filter((c) => c.shootDate === on), n: 1 });
    const byTime = (a, b) => (a.rec?.time || "99").localeCompare(b.rec?.time || "99") || (a.rec?.createdAt || "").localeCompare(b.rec?.createdAt || "");
    const noDate = days.items.filter((x) => !x.on).map((rec) => ({ on: "", rec, codis: [], n: 1 }));
    const up = [...noDate, ...rows.filter((r) => r.on >= today).sort((a, b) => a.on.localeCompare(b.on) || byTime(a, b))];
    const past = rows.filter((r) => r.on < today).sort((a, b) => b.on.localeCompare(a.on) || byTime(a, b));
    return { up, past };
  }, [days.items, d.codis, today]);
  const blank = (on) => ({ id: newId("sd"), on, time: "12:00", place: STUDIO, models: [], modelNote: "", memo: "", cuts: [], videos: [], createdAt: new Date().toISOString() });
  const openDay = open && (days.items.find((x) => x.id === open.id) || open);
  // 같은 날 다른 모델 촬영 — 시간은 비워 두고 장소는 그대로
  const addSibling = (from) => {
    const x = { ...blank(from.on), time: "", place: from.place || STUDIO };
    days.save(x);
    setOpen(x);
  };

  const card = (r) => {
    const rec = r.rec || {};
    const styled = r.codis.filter((c) => stylingLine(c.styling, d.items)).length;
    const who = (rec.models || []).filter(Boolean).join(", ");
    // 같은 날 같은 모델 촬영이 또 있으면(잘못 두 번 만든 것일 수 있음) 알려 준다
    const dup = r.rec && r.n > 1 && who && days.items.some((x) => x.id !== rec.id && x.on === r.on && (x.models || []).filter(Boolean).join(", ") === who);
    return (
      <button
        key={rec.id || r.on}
        type="button"
        onClick={() => setOpen(r.rec || blank(r.on))}
        className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-rose-300 hover:shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-lg font-bold text-stone-900 tabular-nums">
            {r.on ? `${md(r.on)}(${wd(r.on)}) 촬영` : "날짜 미정"}
            {r.n > 1 && <span className="block truncate text-sm font-semibold text-rose-800">{who || "모델 미정"} · 같은 날 {r.n}팀</span>}
          </span>
          {r.on && <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + (r.on === today ? "bg-rose-700 text-white" : r.on > today ? "bg-rose-50 text-rose-800" : "bg-stone-100 text-stone-500")}>{dday(r.on)}</span>}
        </div>
        <div className="mt-1.5 space-y-0.5 text-xs text-stone-600">
          {rec.time && (
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-stone-400" /> {timeText(rec.time)}
            </div>
          )}
          {rec.place && (
            <div className="flex items-center gap-1 truncate">
              <MapPin size={12} className="shrink-0 text-stone-400" /> <span className="truncate">{rec.place}</span>
            </div>
          )}
          {(rec.models || []).length > 0 && (
            <div className="flex items-center gap-1">
              <Users size={12} className="text-stone-400" /> {rec.models.join(", ")}
            </div>
          )}
        </div>
        <div className="mt-2.5 flex gap-1 overflow-hidden">
          {inOrder(r.codis, rec.codiOrder).slice(0, 4).flatMap((c) => codiItems(c, d.items).slice(0, 1)).map((x) => (
            <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-10 shrink-0 rounded-md" />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>코디 {r.codis.length}</span>
          {r.codis.length > 0 && <span className={styled < r.codis.length ? "text-amber-700" : "text-emerald-700"}>스타일링 {styled}/{r.codis.length}</span>}
          {rec.sheetToken && <span className={"flex items-center gap-0.5 " + (rec.sheetClosed ? "text-stone-400" : "text-rose-700")}>{rec.sheetClosed ? <Lock size={11} /> : <Link2 size={11} />} 시트 {rec.sheetClosed ? "닫힘" : "보냄"}</span>}
        </div>
        {dup && <div className="mt-1.5 text-[11px] text-amber-700">같은 날 {who} 촬영이 또 있어요 — 잘못 두 번 만든 거면 하나는 지워 주세요</div>}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">촬영 관리</h2>
          <p className="mt-0.5 text-sm text-stone-500">촬영일마다 그날 코디 · 스타일링(헤어·신발·악세서리) · 시간·장소·모델. 모델에게는 로그인 없이 보는 촬영 시트 링크로 보내요.</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {/* 10/29 모든 촬영 시트에 같이 가는 '촬영 기본 가이드'(동선 · 찍을 영상 · 포즈 …) */}
          <button type="button" onClick={() => setGuide(true)} className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:border-rose-300 hover:text-rose-800">
            <BookOpen size={16} /> 모델 기본 가이드
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              t.setDate(t.getDate() + 1);
              const x = blank(dayKey(t));
              days.save(x);
              setOpen(x);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} /> 새 촬영
          </button>
        </div>
      </div>
      {days.msg && (
        <p className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {days.msg}
          <button type="button" onClick={() => days.setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}
      <UndatedCodis codis={undated} d={d} onStyle={(c) => setStyling(c.id)} />
      {!list.up.length && !list.past.length ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          <CalendarDays size={20} className="mx-auto mb-2 text-stone-300" />
          촬영 › 코디에서 촬영일을 정하거나 '새 촬영'을 누르면 여기에 촬영일이 생겨요.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.up.map(card)}</div>
          {list.past.length > 0 && (
            <>
              <div className="mt-5 mb-2 text-xs font-semibold text-stone-400">지난 촬영</div>
              <div className="grid grid-cols-1 gap-3 opacity-80 sm:grid-cols-2 lg:grid-cols-3">{list.past.map(card)}</div>
            </>
          )}
        </>
      )}
      {open && openDay && (
        <DaySheet
          key={openDay.id}
          day={openDay}
          d={d}
          online={online}
          rows={days.items}
          onOpen={(r) => setOpen(r)}
          onAddSibling={addSibling}
          canRemove={days.items.some((x) => x.id === openDay.id)}
          onSave={days.save}
          onRemove={days.drop}
          onClose={() => setOpen(null)}
        />
      )}
      {liveStyling && <StylingSheet codi={liveStyling} d={d} online={online} onClose={() => setStyling(null)} />}
      {guide && <ModelGuideSheet online={online} onClose={() => setGuide(false)} />}
    </div>
  );
}

