import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Plus, X, Film, Check, FolderInput, AtSign, ShoppingBag } from "lucide-react";
import { loadKey, changeKey, putPhoto, photoUrls, md, won } from "../lib/shoot";
import { isRemote, supabase } from "../lib/supabase";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { urlsToFiles } from "../lib/pasteImages";
import { catsOf, isShopCat } from "../lib/sourceMix";
import { baseDay, compareSnaps, CATS } from "../lib/tracker";
import { KEYS, THRESHOLDS, readThreshold, writeThreshold, pctText, countText, handleOf, TAGS, recentReels, agoText, atText, RECENT_DAYS } from "../lib/sourcing";
import { Sheet, SheetHead, Chips } from "./ShootBits";
import { Empty } from "./ui";

/**
 * 촬영 › 소싱 관리의 새 탭 셋 (2026-10-24) — 뜨는 릴스 · 경쟁몰 베스트 · 계정.
 * 세원의 소싱 2단계(① 뜨는 콘텐츠의 룩 ② 경쟁몰 베스트)를 한 화면에서 고르고 '소싱에 담기'로 소싱 회차의 촬영 레퍼런스에 넣는다.
 * 담은 뒤(신마에서 비슷한 상품 찾기 · 메모 · 상품 링크 · 우리 상품 고르기)는 예전 소싱 회차 창 그대로. 데이터는 lib/sourcing.js 머리말.
 */

// 보관함 사진 주소 (4시간) — 한 번 물어 못 받은 건 빈 값으로 남겨 다시 안 묻는다
const SIGNED = new Map();
const ASKING = new Set();
export function useSigned(keys, online) {
  const [, bump] = useState(0);
  const sig = [...new Set(keys.filter(Boolean))].filter((k) => !SIGNED.has(k) && !ASKING.has(k)).join("|");
  useEffect(() => {
    const want = sig ? sig.split("|").slice(0, 300) : [];
    if (!want.length || !(isRemote && online)) return;
    want.forEach((k) => ASKING.add(k));
    photoUrls(want, online)
      .then((m) => {
        for (const k of want) SIGNED.set(k, m[k] || "");
      })
      .catch(() => {})
      .finally(() => {
        want.forEach((k) => ASKING.delete(k));
        bump((n) => n + 1);
      });
  }, [sig, online]);
  return (k) => (k ? SIGNED.get(k) || "" : "");
}

// ---------------------------------------------------------------- 소싱에 담기

/** 보관함 사진을 촬영 레퍼런스용으로 복사 (수집기 썸네일이 나중에 바뀌어도 레퍼런스는 그대로) — 안 되면 같은 키를 쓴다 */
async function copyPhoto(key, online) {
  if (!key || !(isRemote && online)) return key || null;
  const to = `shoot/${newId("s")}.jpg`;
  const { error } = await supabase.storage.from("reels").copy(key, to);
  return error ? key : to;
}

/** 어디서 왔는지(from)가 같은 레퍼런스가 있나 — 카드의 '담음' */
export const sameFrom = (a, b) => !!a && !!b && a.type === b.type && ((a.code && a.code === b.code) || (a.url && a.url === b.url));

const LAST_KEY = "poclo_src_session";
const readLast = () => {
  try {
    return localStorage.getItem(LAST_KEY) || "";
  } catch {
    return "";
  }
};

/**
 * 어느 소싱에 담을까요? — 다가오는 소싱 + 최근 지난 소싱 3개 + 새 소싱(오늘).
 * put = {title, src, from, cat:'content'|'shop', shop, links, memo, photo: async () => 보관 키|null, photoUrl?}
 */
export function PutSheet({ put, d, sessions, onDone, onClose }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const today = dayKey();
  const last = readLast();
  const list = useMemo(() => {
    const all = sessions.items || [];
    const up = all.filter((s) => !s.on || s.on >= today).sort((a, b) => (a.on || "9").localeCompare(b.on || "9"));
    const past = all.filter((s) => s.on && s.on < today).sort((a, b) => b.on.localeCompare(a.on)).slice(0, 3);
    return [...up, ...past];
  }, [sessions.items, today]);
  const cats = catsOf(d.tags);
  const cat = put.cat === "shop" ? cats.find(isShopCat) : cats.find((c) => c.id === "content" || (c.name || "").includes("콘텐츠"));

  const go = async (sid) => {
    setErr("");
    setBusy(sid || "new");
    try {
      const photo = await put.photo();
      const ref = {
        id: newId("r"),
        photo,
        ...(photo ? {} : put.photoUrl ? { photoUrl: put.photoUrl } : {}),
        folderId: null,
        cuts: [],
        place: "",
        memo: "",
        shop: put.shop || "",
        links: put.links || [],
        from: put.from,
        createdAt: new Date().toISOString(),
      };
      await d.saveRefs((v) => ({ ...v, items: [ref, ...(v.items || [])] }));
      const look = { ...(cat ? { cat: cat.id } : {}), ...(put.memo ? { memo: put.memo } : {}) };
      const id = sid || newId("ss");
      await sessions.change((v) => {
        const items = v.items || [];
        const add = (s) => ({ ...s, refIds: [...(s.refIds || []), ref.id], refLooks: { ...(s.refLooks || {}), ...(Object.keys(look).length ? { [ref.id]: look } : {}) } });
        if (sid && items.some((s) => s.id === sid)) return { ...v, items: items.map((s) => (s.id === sid ? add(s) : s)) };
        return { ...v, items: [add({ id, on: today, title: "", uploads: [""], createdAt: new Date().toISOString() }), ...items] };
      });
      try {
        localStorage.setItem(LAST_KEY, id);
      } catch {
        /* 무시 */
      }
      onDone({ sessionId: id, catName: cat?.name || "" });
    } catch (e) {
      setErr(e.message || "담지 못했어요.");
      setBusy("");
    }
  };

  const row = (s) => (
    <button
      key={s.id}
      type="button"
      disabled={!!busy}
      onClick={() => go(s.id)}
      className={"flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left transition hover:border-rose-300 disabled:opacity-60 " + (s.id === last ? "border-rose-300 bg-rose-50/40" : "border-stone-200 bg-white")}
    >
      <span className="min-w-0">
        <span className="block font-semibold text-stone-900 tabular-nums">
          {s.on ? `${md(s.on)} 소싱` : "날짜 미정"} {s.on && s.on < today && <span className="text-xs font-normal text-stone-400">지난 소싱</span>}
        </span>
        <span className="block truncate text-xs text-stone-500">
          {s.title || "이름 없는 소싱"} · 레퍼런스 {(s.refIds || []).length}장{s.id === last ? " · 지난번에 담은 곳" : ""}
        </span>
      </span>
      {busy === s.id ? <Loader2 size={16} className="shrink-0 animate-spin text-rose-700" /> : <FolderInput size={16} className="shrink-0 text-stone-400" />}
    </button>
  );

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <SheetHead title="어느 소싱에 담을까요?" onClose={busy ? () => {} : onClose} />
      <div className="space-y-3 overflow-y-auto p-4">
        <div className="flex items-center gap-3 rounded-xl bg-stone-50 p-2.5">
          <span className="block h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-200">{put.src && <img src={put.src} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}</span>
          <span className="min-w-0 text-sm">
            <span className="line-clamp-2 font-semibold text-stone-800">{put.title}</span>
            <span className="mt-0.5 block text-xs text-stone-500">
              촬영 레퍼런스 한 장 · {cat ? <b className="font-semibold text-stone-700">{cat.name}</b> : "분류 안 함"}로 들어가요
            </span>
          </span>
        </div>
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
        <div className="space-y-2">{list.map(row)}</div>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => go("")}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy === "new" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 새 소싱({md(today)})을 만들어 담기
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 뜨는 릴스

const ScopeBtn = ({ on, onClick, children, title }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
  >
    {children}
  </button>
);

// 10/25 세원: "뜨는 릴스에서 바로 릴스 기획으로 옮기는 버튼. 인스타 버튼은 없애고 — 썸네일 누르면 인스타로 가니까."
// 계정 아카이브 '라이브러리에 담기'와 같은 길(릴스 항목 + 분석기 일감 ref). 보관만이면 Claude 를 안 부른다(돈 — 9/23 원칙).
function PlanButton({ planned, onPlan }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState("");
  if (planned)
    return (
      <span title="콘텐츠 › 릴스 기획에 들어 있어요" className="flex min-w-[5.5rem] flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-emerald-800">
        <Check size={11} /> 기획에 있음
      </span>
    );
  const run = async (analyze) => {
    setBusy(analyze ? "a" : "k");
    try {
      await onPlan(analyze);
    } finally {
      setBusy("");
      setAsk(false);
    }
  };
  if (!ask)
    return (
      <button
        type="button"
        onClick={() => setAsk(true)}
        className="flex min-w-[5.5rem] flex-1 items-center justify-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-stone-700 hover:border-rose-300 hover:text-rose-800"
      >
        <Film size={11} /> 릴스 기획
      </button>
    );
  return (
    <div className="absolute inset-x-2.5 bottom-2.5 z-10 space-y-1 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
      <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-stone-500">
        릴스 기획에 담기
        <button type="button" onClick={() => setAsk(false)} aria-label="닫기" className="rounded p-0.5 text-stone-400 hover:text-stone-700">
          <X size={12} />
        </button>
      </div>
      <button type="button" disabled={!!busy} onClick={() => run(false)} className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-left text-xs font-semibold text-stone-800 disabled:opacity-50">
        {busy === "k" ? "담는 중…" : "보관만"}
        <span className="block text-[10px] font-normal text-stone-400">영상만 · 무료</span>
      </button>
      <button type="button" disabled={!!busy} onClick={() => run(true)} className="w-full rounded-lg bg-rose-700 px-2 py-1.5 text-left text-xs font-semibold text-white disabled:bg-stone-300">
        {busy === "a" ? "맡기는 중…" : "담고 분석까지"}
        <span className="block text-[10px] font-normal text-rose-100">대본·구조 · 약 100~200원</span>
      </button>
    </div>
  );
}

const reelCode = (url) => (String(url || "").match(/\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/) || [])[1] || "";

/**
 * 카드의 '릴스 기획' — 릴스 기획 라이브러리에 이미 있는 릴스(같은 릴스 코드)는 '기획에 있음'(방금 담은 것은 서버 목록이 늦게 와도 바로).
 * 뜨는 릴스 · 코디로 찾기가 같이 쓴다(from = 메모 앞머리).
 */
export function useReelPlan(reelKit, from) {
  const [justPlanned, setJustPlanned] = useState(() => new Set());
  const plannedCodes = useMemo(() => {
    const s = new Set();
    for (const it of reelKit?.reels || []) {
      const c = reelCode(it.source?.url || it.meta?.url);
      if (c) s.add(c);
    }
    return s;
  }, [reelKit?.reels]);
  const plannedOf = (x) => plannedCodes.has(x.code) || justPlanned.has(x.code);
  const plan = reelKit?.save
    ? (x) => async (analyze) => {
        const now = new Date().toISOString();
        const id = newId("r");
        const who = x.mall && x.mall !== "크리에이터" ? x.mall : `@${x.handle}`;
        await reelKit.save({
          id,
          title: `${analyze ? "분석" : "보관"} 대기 — @${x.handle}`,
          source: { type: "link", url: x.url },
          meta: { url: x.url },
          memo: `${from} · @${x.handle} · 조회 ${countText(x.views)} · 댓글 ${countText(x.comments)} (댓글÷조회 ${pctText(x.r)})`,
          shop: { name: who, url: `https://www.instagram.com/${x.handle}/` },
          job: { status: "queued", at: now },
          addedAt: now,
          filled: [],
        });
        await reelKit.queue(id, "ref", analyze ? {} : { analyze: false });
        setJustPlanned((s) => new Set(s).add(x.code));
      }
    : null;
  return { plannedOf, plan };
}

/** 카드의 '소싱에 담기' → PutSheet 에 넘길 것 (뜨는 릴스 · 코디로 찾기) */
export function putReel(x, src, online, onPut, extraMemo = "") {
  onPut({
    title: `${x.mall || "@" + x.handle} 릴스 · 댓글÷조회 ${pctText(x.r)}`,
    src,
    from: { type: "reel", code: x.code, url: x.url },
    cat: "content",
    shop: x.mall || "",
    links: [{ id: newId("lk"), kind: "릴스", url: x.url }],
    memo: (`@${x.handle} 릴스 ${x.takenAt ? md(x.takenAt) : ""} · 조회 ${countText(x.views)} · 댓글 ${countText(x.comments)} (${pctText(x.r)})`.replace(/\s+·/, " ·") + (extraMemo ? `\n${extraMemo}` : "")),
    photo: async () => {
      if (x.thumb) return copyPhoto(x.thumb, online);
      if (x.img && isRemote && online) {
        const [f] = await urlsToFiles([x.img]);
        return f ? putPhoto(f, online) : null;
      }
      return null;
    },
    photoUrl: !(isRemote && online) ? src : "",
  });
}

// x.why(코디로 찾기 — 왜 닮았는지 한 줄)가 있으면 캡션 대신 그것, badge 는 왼쪽 위(꼬리표가 없을 때)
export function ReelCard({ x, src, done, onPut, dim, planned, onPlan, badge }) {
  const tag = TAGS[x.tag];
  return (
    <div className={"flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white " + (dim ? "opacity-75" : "")}>
      <a href={x.url} target="_blank" rel="noreferrer" title="인스타에서 보기" className="relative block aspect-[3/4] bg-stone-100 sm:aspect-[9/16]">
        {src ? (
          <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-stone-300">
            <Film size={28} />
          </span>
        )}
        {tag ? (
          <span title={tag.tip} className={"absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold shadow-sm " + tag.cls}>
            {tag.label}
          </span>
        ) : (
          badge
        )}
        {done && (
          <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700 shadow-sm">
            <Check size={11} /> 담음
          </span>
        )}
      </a>
      <div className="relative flex flex-1 flex-col gap-0.5 p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className={"text-xl font-bold tracking-tight tabular-nums " + (dim ? "text-stone-700" : "text-rose-700")}>{pctText(x.r)}</span>
          <span className="text-[10px] text-stone-400">댓글÷조회</span>
        </div>
        <div className="text-xs text-stone-600 tabular-nums">
          조회 <b className="font-semibold text-stone-800">{countText(x.views)}</b> · 댓글 <b className="font-semibold text-stone-800">{countText(x.comments)}</b>
          {x.likes != null && <span className="text-stone-400"> · 좋아요 {countText(x.likes)}</span>}
        </div>
        <div className="mt-1 truncate text-[13px] font-semibold text-stone-900">{x.mall || `@${x.handle}`}</div>
        <div className="truncate text-[11px] text-stone-400">
          @{x.handle} · {agoText(x.takenAt)}
        </div>
        {x.why ? (
          <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] leading-snug text-rose-900">{x.why}</p>
        ) : (
          x.caption && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-500">{x.caption}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {onPlan ? (
            <PlanButton planned={planned} onPlan={onPlan} />
          ) : (
            <a href={x.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
              인스타 <ExternalLink size={11} />
            </a>
          )}
          <button
            type="button"
            onClick={onPut}
            className={"flex min-w-[5.5rem] flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold whitespace-nowrap " + (done ? "border border-stone-200 text-stone-500 hover:border-rose-300" : "bg-rose-700 text-white hover:bg-rose-800")}
          >
            {done ? "다시 담기" : "소싱에 담기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HotReelsTab({ reels, d, online, onPut, reelKit }) {
  const [thr, setThrState] = useState(readThreshold);
  const [noEvent, setNoEvent] = useState(false);
  const [mall, setMall] = useState("");
  const setThr = (v) => {
    setThrState(v);
    writeThreshold(v);
  };
  const data = reels.data;
  const all = useMemo(() => recentReels(data?.items), [data]);
  const malls = useMemo(() => [...new Set(all.map((x) => x.mall || `@${x.handle}`))], [all]);
  const pick = (x) => (!noEvent || x.tag !== "event") && (!mall || (x.mall || `@${x.handle}`) === mall);
  const shown = all.filter(pick);
  const over = shown.filter((x) => (x.r ?? 0) >= thr);
  const under = shown.filter((x) => (x.r ?? 0) < thr).slice(0, over.length < 8 ? 8 : 0);
  const sign = useSigned(
    [...over, ...under].map((x) => x.thumb),
    online,
  );
  const srcOf = (x) => sign(x.thumb) || x.img || "";
  const doneOf = (x) => d.refs.some((r) => sameFrom(r.from, { type: "reel", code: x.code, url: x.url }));
  const accounts = data?.accounts || [];
  const okN = accounts.filter((a) => a.ok).length;

  const { plannedOf, plan } = useReelPlan(reelKit, "소싱 관리 뜨는 릴스");
  const put = (x) => putReel(x, srcOf(x), online, onPut);

  if (!reels.loaded && !data) {
    return (
      <div className="flex h-60 items-center justify-center text-stone-300">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (!data?.items?.length) {
    return (
      <Empty title="아직 수집 전이에요" hint="사무실 PC 수집기가 매일 아침 '계정' 탭의 경쟁사 인스타 릴스를 돌면서 조회수·댓글을 모아요. 처음 모이면 여기에 댓글 비율 높은 순으로 떠요." />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-stone-500">기준</span>
          {THRESHOLDS.map((t) => (
            <ScopeBtn key={t} on={thr === t} onClick={() => setThr(t)} title={`댓글 ÷ 조회수 ${pctText(t)} 이상`}>
              {pctText(t)}
            </ScopeBtn>
          ))}
        </div>
        <ScopeBtn on={noEvent} onClick={() => setNoEvent(!noEvent)} title={TAGS.event.tip}>
          경품 이벤트 빼기
        </ScopeBtn>
        {malls.length > 1 && (
          <select value={mall} onChange={(e) => setMall(e.target.value)} aria-label="몰 고르기" className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700">
            <option value="">모든 몰 ({malls.length})</option>
            {malls.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-stone-500">
        최근 {RECENT_DAYS}일 릴스 {shown.length}개 중 <b className="text-rose-700">기준 {pctText(thr)} 넘는 것 {over.length}개</b> · 계정 {okN}/{accounts.length || "—"}곳
        {data.at && ` · 마지막 수집 ${atText(data.at)}`}
        <span className="ml-1 text-stone-400">
          · <span className="font-semibold text-emerald-700">DM 링크형</span> = 사고 싶다는 신호, <span className="font-semibold text-amber-600">경품 이벤트</span> = 댓글이 부풀었을 수 있어요
        </span>
      </p>
      {over.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {over.map((x) => (
            <ReelCard key={x.code} x={x} src={srcOf(x)} done={doneOf(x)} onPut={() => put(x)} planned={plannedOf(x)} onPlan={plan && plan(x)} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">
          기준 {pctText(thr)} 넘는 릴스가 아직 없어요.{shown[0] ? ` 가장 높은 건 ${pctText(shown[0].r)}(${shown[0].mall || "@" + shown[0].handle})예요.` : ""}
        </p>
      )}
      {under.length > 0 && (
        <section className="space-y-2 pt-2">
          <div className="border-b border-stone-200 pb-1 text-xs font-semibold text-stone-400">기준 아래 상위 {under.length}개 — 참고만</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {under.map((x) => (
              <ReelCard key={x.code} x={x} src={srcOf(x)} done={doneOf(x)} onPut={() => put(x)} planned={plannedOf(x)} onPlan={plan && plan(x)} dim />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 경쟁몰 베스트 (사입 트래커 기록 그대로)

const TOPS = [10, 30];
export function MallBestTab({ d, online, onPut }) {
  const [days, setDays] = useState(null);
  const [snap, setSnap] = useState(null);
  const [baseSnap, setBaseSnap] = useState(null);
  const [conf, setConf] = useState([]);
  const [state, setState] = useState("loading");
  const [mall, setMall] = useState("");
  const [cat, setCat] = useState("");
  const [top, setTop] = useState(10);
  const [onlyNew, setOnlyNew] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ds = (await loadKey("tracker_days", online, { items: [] })).items || [];
        const c = (await loadKey("tracker_malls", online, { items: [] }).catch(() => ({ items: [] }))).items || [];
        if (!alive) return;
        setDays(ds);
        setConf(c);
        const day = ds[0];
        if (!day) return setState("empty");
        const s = await loadKey(`tracker_${day}`, online, null);
        const { base } = baseDay(ds, day, 1);
        const b = base ? await loadKey(`tracker_${base}`, online, null).catch(() => null) : null;
        if (!alive) return;
        setSnap(s);
        setBaseSnap(b);
        setState(s ? "ready" : "empty");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [online]);

  const confMap = useMemo(() => Object.fromEntries(conf.map((m) => [m.host, m])), [conf]);
  const items = useMemo(() => compareSnaps(snap, baseSnap, confMap).items, [snap, baseSnap, confMap]);
  const malls = useMemo(() => [...new Set(items.map((x) => x.mall))], [items]);
  const cats = useMemo(() => CATS.filter((c) => items.some((x) => x.cat === c)), [items]);
  const list = items
    .filter((x) => x.rank <= top && (!mall || x.mall === mall) && (!cat || x.cat === cat) && (!onlyNew || x.was === null))
    // 몰마다 1위부터 번갈아 — 한 몰이 화면을 다 차지하지 않게
    .sort((a, b) => a.rank - b.rank || a.mall.localeCompare(b.mall));
  const shown = more ? list : list.slice(0, 60);
  const doneOf = (x) => d.refs.some((r) => sameFrom(r.from, { type: "best", url: x.url }));
  const day = days?.[0];

  const put = (x) =>
    onPut({
      title: `${x.mall} 베스트 ${x.rank}위 · ${x.name}`,
      src: x.img,
      from: { type: "best", url: x.url, mall: x.mall, productName: x.name },
      cat: "shop",
      shop: x.mall,
      links: [{ id: newId("lk"), kind: x.cat === "기타" ? "" : x.cat, url: x.url }],
      memo: `${x.mall} 베스트 ${x.rank}위${day ? ` (${md(day)})` : ""} · ${x.name}${x.price > 0 ? ` · ${won(x.price)}` : ""}`,
      photo: async () => {
        if (!(isRemote && online)) return null;
        const [f] = await urlsToFiles([x.img]);
        if (!f) throw new Error("이 상품 사진을 못 받아왔어요. 상품 페이지에서 사진을 복사해 소싱 회차에 직접 붙여 주세요.");
        return putPhoto(f, online);
      },
      photoUrl: !(isRemote && online) ? x.img : "",
    });

  if (state === "loading") {
    return (
      <div className="flex h-60 items-center justify-center text-stone-300">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (state !== "ready") {
    return <Empty title={state === "error" ? "사입 트래커 기록을 불러오지 못했어요" : "사입 트래커 기록이 아직 없어요"} hint="보고 › 사입 트래커가 매일 아침 모으는 경쟁몰 베스트를 여기서 같이 봐요." />;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          {TOPS.map((n) => (
            <ScopeBtn key={n} on={top === n} onClick={() => setTop(n)}>
              몰마다 {n}위까지
            </ScopeBtn>
          ))}
        </div>
        <ScopeBtn on={onlyNew} onClick={() => setOnlyNew(!onlyNew)} title="어제 기록에 없던(새로 들어온) 상품만">
          NEW만
        </ScopeBtn>
        <select value={mall} onChange={(e) => setMall(e.target.value)} aria-label="몰 고르기" className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700">
          <option value="">모든 몰 ({malls.length})</option>
          {malls.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <Chips list={cats} value={cat} onChange={setCat} all="전체 품목" />
      <p className="text-xs text-stone-500">
        {day && `${md(day)} 사입 트래커 기록`} · {list.length}개{baseSnap ? " · NEW = 어제 기록에 없던 상품" : ""} · 몰마다 1위부터 번갈아 보여요
      </p>
      {list.length ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {shown.map((x) => {
              const done = doneOf(x);
              return (
                <div key={x.host + x.id} className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
                  <a href={x.url} target="_blank" rel="noreferrer" title="그 몰 상품 페이지" className="relative block aspect-[3/4] bg-stone-100">
                    {x.img && <img src={x.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                    <span className="absolute top-1.5 left-1.5 flex gap-1">
                      <span className="rounded bg-stone-900/80 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">{x.rank}위</span>
                      {x.was === null && <span className="rounded bg-rose-700 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">NEW</span>}
                    </span>
                    {done && (
                      <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700 shadow-sm">
                        <Check size={11} /> 담음
                      </span>
                    )}
                  </a>
                  <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                    <div className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="truncate font-semibold text-stone-700">{x.mall}</span>
                      <span className="shrink-0 text-rose-700">{x.cat}</span>
                    </div>
                    <div className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug font-medium text-stone-900">{x.name || "이름 없음"}</div>
                    <div className="text-sm font-bold text-stone-900 tabular-nums">{x.price > 0 ? won(x.price) : "—"}</div>
                    <button
                      type="button"
                      onClick={() => put(x)}
                      className={"mt-auto flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold " + (done ? "border border-stone-200 text-stone-500 hover:border-rose-300" : "bg-rose-700 text-white hover:bg-rose-800")}
                    >
                      {done ? "다시 담기" : "소싱에 담기"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {list.length > shown.length && (
            <button type="button" onClick={() => setMore(true)} className="w-full rounded-lg border border-stone-200 py-2 text-xs text-stone-600 hover:border-rose-300">
              {list.length - shown.length}개 더 보기
            </button>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">고른 조건에 맞는 상품이 없어요.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 계정

function MallInput({ value = "", onSave }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (was !== value) {
    setWas(value);
    setV(value);
  }
  const commit = () => v.trim() !== value && onSave(v.trim());
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setV(value);
      }}
      placeholder="몰 이름"
      aria-label="몰 이름"
      className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-stone-900 outline-none placeholder:font-normal placeholder:text-stone-300 hover:border-stone-200 focus:border-rose-400 focus:bg-white"
    />
  );
}

export function SourcingAccountsTab({ reels, online }) {
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState("");
  const [handle, setHandle] = useState("");
  const [mallName, setMallName] = useState("");
  const [ask, setAsk] = useState(""); // 지우기 확인 중인 계정

  useEffect(() => {
    let alive = true;
    loadKey(KEYS.accounts, online, { items: [] })
      .then((v) => alive && setItems(v.items || []))
      .catch(() => {
        if (alive) {
          setItems([]);
          setMsg("계정 목록을 불러오지 못했어요.");
        }
      });
    return () => {
      alive = false;
    };
  }, [online]);

  const change = async (fn) => {
    try {
      const next = await changeKey(KEYS.accounts, online, (v) => ({ ...v, items: fn(v.items || []) }), { items: [] });
      setItems(next.items || []);
      setMsg("");
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };
  const patch = (h, p) => change((xs) => xs.map((x) => (x.handle === h ? { ...x, ...p } : x)));
  const add = () => {
    const h = handleOf(handle);
    if (!h) return setMsg("인스타 계정을 못 읽었어요. @계정 또는 인스타 주소를 넣어 주세요.");
    if ((items || []).some((x) => x.handle === h)) return setMsg(`@${h} 은(는) 이미 있어요.`);
    change((xs) => [...xs, { handle: h, mall: mallName.trim(), on: true, from: "manual" }]);
    setHandle("");
    setMallName("");
  };

  const status = useMemo(() => Object.fromEntries((reels.data?.accounts || []).map((a) => [String(a.handle || "").toLowerCase(), a])), [reels.data]);
  const reelN = useMemo(() => {
    const m = {};
    for (const x of recentReels(reels.data?.items)) m[x.handle] = (m[x.handle] || 0) + 1;
    return m;
  }, [reels.data]);
  const list = [...(items || [])].sort((a, b) => (b.on !== false) - (a.on !== false) || (a.mall || a.handle).localeCompare(b.mall || b.handle));
  const onN = list.filter((x) => x.on !== false).length;

  if (!items) {
    return (
      <div className="flex h-60 items-center justify-center text-stone-300">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        수집기가 매일 아침 켜진 계정의 최근 릴스 조회수·댓글을 모아요(메타 공식 기능 — 조회수를 숨긴 계정도). 비즈니스·크리에이터 계정만 읽혀요.
        {reels.data?.at && ` 마지막 수집 ${atText(reels.data.at)}.`}
      </p>
      {msg && (
        <p className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-2.5"
      >
        <label className="flex min-w-[12rem] flex-1 items-center gap-1 rounded-lg border border-stone-300 px-2.5 focus-within:border-rose-600">
          <AtSign size={14} className="shrink-0 text-stone-400" />
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="인스타 계정 또는 주소" aria-label="인스타 계정" className="min-w-0 flex-1 py-2 text-sm outline-none" />
        </label>
        <label className="flex min-w-[9rem] flex-1 items-center gap-1 rounded-lg border border-stone-300 px-2.5 focus-within:border-rose-600 sm:flex-none">
          <ShoppingBag size={14} className="shrink-0 text-stone-400" />
          <input value={mallName} onChange={(e) => setMallName(e.target.value)} placeholder="몰 이름 (선택)" aria-label="몰 이름" className="min-w-0 flex-1 py-2 text-sm outline-none" />
        </label>
        <button type="submit" className="flex items-center gap-1 rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> 계정 추가
        </button>
      </form>
      {list.length ? (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-3 py-2 text-xs text-stone-500">
            계정 {list.length}곳 · 켜짐 {onN}
          </div>
          <ul className="divide-y divide-stone-100">
            {list.map((x) => {
              const st = status[x.handle];
              const on = x.on !== false;
              return (
                <li key={x.handle} className={"flex items-center gap-2 px-3 py-2 " + (on ? "" : "bg-stone-50")}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={on ? "수집 끄기" : "수집 켜기"}
                    onClick={() => patch(x.handle, { on: !on })}
                    className={"relative h-5 w-9 shrink-0 rounded-full transition " + (on ? "bg-rose-700" : "bg-stone-300")}
                  >
                    <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all " + (on ? "left-[18px]" : "left-0.5")} />
                  </button>
                  {/* 폰에서는 몰 이름 아래 줄에 @계정 · 상태 */}
                  <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                    <span className="sm:w-40 sm:shrink-0">
                      <MallInput value={x.mall || ""} onSave={(mall) => patch(x.handle, { mall })} />
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-2 px-1.5 sm:px-0">
                      <a href={`https://www.instagram.com/${x.handle}/`} target="_blank" rel="noreferrer" className="min-w-0 shrink truncate text-sm text-stone-600 hover:text-rose-800">
                        @{x.handle}
                      </a>
                      <span className="ml-auto min-w-0 max-w-[65%] truncate text-right text-xs">
                        {!on ? (
                          <span className="text-stone-400">꺼짐</span>
                        ) : !st ? (
                          <span className="text-stone-400">수집 전</span>
                        ) : st.ok ? (
                          <span className="text-emerald-700">
                            ● {st.followers != null ? `팔로워 ${countText(st.followers)}` : "읽힘"}
                            {reelN[x.handle] ? ` · 릴스 ${reelN[x.handle]}` : ""}
                          </span>
                        ) : (
                          <span className="text-rose-700" title={st.error || ""}>
                            ● {st.error || "못 읽음"}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  {ask === x.handle ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => change((xs) => xs.filter((y) => y.handle !== x.handle))} className="rounded-md bg-rose-700 px-2 py-1 text-xs font-semibold text-white">
                        지우기
                      </button>
                      <button type="button" onClick={() => setAsk("")} className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-600">
                        두기
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setAsk(x.handle)} aria-label={`@${x.handle} 지우기`} className="shrink-0 p-1 text-stone-300 hover:text-rose-600">
                      <X size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <Empty title="아직 계정이 없어요" hint="경쟁몰 인스타 계정은 수집기를 처음 켤 때 사입 트래커 몰 목록에서 채워 넣어요. 코디·인플루언서 계정은 위에서 직접 더해 주세요." />
      )}
    </div>
  );
}
