import { useEffect, useMemo, useRef, useState } from "react";
import { Radar, Loader2, RotateCw, Trash2, X, ExternalLink, Play, Layers, Info, SlidersHorizontal, Check } from "lucide-react";
import { newId } from "../lib/id";
import { WorkerStatus } from "./ContentBits";
import { Empty } from "./ui";

/**
 * 계정 아카이브 (세원 2026-09-23, 쇼필공 레퍼런스랩 '계정 아카이브' 참고).
 *
 * v2 (9/23 밤, 세원 화면 4장):
 *  - 왼쪽 세로 목록에 추적 계정 → 누르면 오른쪽에 바로 (모달 아님)
 *  - 탭: 릴스 / 사진·캐러셀(예전엔 둘로 나눴는데 장 수만 다를 뿐이라 합침) / 광고 소재
 *  - 광고 소재는 **날짜 타임라인**: 광고마다 막대 하나 = 언제 켜서 언제 껐는지. '게재 중/중단' 탭보다 한눈에 보인다.
 *    등급은 켜 둔 기간 — 오래 켤수록 성과 나는 소재.
 *  - 게시물·광고를 누르면 바로 인스타·광고 라이브러리로 가지 않고 **상세 창** → 거기서 '…에서 보기'
 *  - 영상 광고 → 레퍼런스 라이브러리로 (분석기가 광고 영상을 받아 온다). 보관만(무료) / 분석까지 고를 수 있다.
 *
 * 스캔은 사무실 PC 분석기(poclo-cafe24/account_scan.py). 목록 settings 'accounts', 기록 'acct_<id>'.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const num = (n) => (n == null ? "—" : new Intl.NumberFormat("ko-KR").format(n));
const short = (n) => (n == null ? "—" : n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만` : num(n));
const today = () => new Date().toLocaleDateString("sv-SE");
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const kday = (d) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");
const dotted = (d) => (d ? `${d.slice(0, 4)}. ${Number(d.slice(5, 7))}. ${Number(d.slice(8, 10))}.` : "");
const addDays = (d, n) => {
  const t = new Date(d + "T00:00:00");
  t.setDate(t.getDate() + n);
  return t.toLocaleDateString("sv-SE");
};
const diff = (a, b) => (a && b ? Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000) : null);
const handleOf = (t) => {
  const s = String(t || "").trim();
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  const h = m ? m[1] : s.replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) && !["p", "reel", "reels"].includes(h) ? h : "";
};
const isAdUrl = (s) => /facebook\.com\/ads\/library/i.test(String(s || ""));
const ratio = (p) => (p.likes ? (p.comments || 0) / p.likes : null);
const pct = (r) => (r == null ? "—" : `${(r * 100).toFixed(r < 0.01 ? 2 : 1)}%`);

/** 광고를 켜 둔 기간 → 등급. 오래 켤수록 성과 나는 소재 */
const adDays = (a) => diff(a.startAt || a.firstSeen, a.active ? today() : a.stoppedAt || a.lastSeen) ?? 0;
const GRADES = [
  ["S", 30, "30일 이상", "bg-rose-700 text-white"],
  ["A", 14, "14일 이상", "bg-rose-100 text-rose-800"],
  ["B", 7, "7일 이상", "bg-stone-200 text-stone-700"],
  ["C", 0, "7일 미만", "bg-stone-100 text-stone-500"],
];
const gradeOf = (a) => GRADES.find(([, min]) => adDays(a) >= min) || GRADES[3];

function statusOf(acc, queue) {
  const q = queue.find((j) => j.id === acc.id && j.target === "account");
  if (q?.status === "working") return { kind: "working", text: q.step || "스캔 중" };
  if (q) return { kind: "queued", text: "스캔 대기 중" };
  if (acc.job?.status === "error") return { kind: "error", text: acc.job.message || "스캔 실패" };
  return { kind: "done" };
}

function Avatar({ acc, size = "h-9 w-9 text-sm", active }) {
  const ch = (acc.handle || acc.name || "?").replace(/^[._]+/, "").slice(0, 1).toUpperCase();
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full font-semibold ${active ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-500"}`}>
      {ch}
    </span>
  );
}

// ------------------------------------------------------------------ 등록

function AddBar({ worker, onAdd }) {
  const [ig, setIg] = useState("");
  const [ad, setAd] = useState("");
  const [showAd, setShowAd] = useState(false);
  const [busy, setBusy] = useState(false);
  const handle = handleOf(ig);
  const ok = (handle || isAdUrl(ad)) && (!ad.trim() || isAdUrl(ad));
  const go = async () => {
    setBusy(true);
    try {
      await onAdd({ handle, adUrl: ad.trim() });
      setIg("");
      setAd("");
      setShowAd(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4">
      <div className="flex overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:border-rose-600">
        <input
          value={ig}
          onChange={(e) => setIg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ok && go()}
          placeholder="인스타 계정 링크 붙여넣기 — 매일 자동으로 새 게시물·광고를 모아요"
          className="min-w-0 flex-1 px-4 py-3 text-sm outline-none"
        />
        <button
          type="button"
          disabled={!ok || busy}
          onClick={go}
          className="flex shrink-0 items-center gap-1.5 bg-rose-700 px-5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} 모니터링 시작
        </button>
      </div>
      {showAd ? (
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder="메타 광고 라이브러리에서 그 브랜드를 검색한 주소 (선택)"
          className={FIELD + " mt-2 text-sm"}
        />
      ) : (
        <button type="button" onClick={() => setShowAd(true)} className="mt-2 text-xs font-medium text-rose-700">
          + 광고 라이브러리 링크도 넣기 (광고 소재 추적)
        </button>
      )}
      {ad.trim() && !isAdUrl(ad) && <p className="mt-1 text-xs text-rose-700">facebook.com/ads/library/… 주소를 넣어주세요.</p>}
      <WorkerStatus worker={worker} />
    </div>
  );
}

// ------------------------------------------------------------------ 상세 창 (게시물 · 광고)

function Sheet({ children, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-2 sm:p-6">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:flex-row">
        {children}
      </div>
    </div>
  );
}

function ImportButtons({ label, done, onImport }) {
  const [busy, setBusy] = useState("");
  if (done)
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-800">
        <Check size={15} /> 라이브러리에 담았어요
      </div>
    );
  const run = async (analyze) => {
    setBusy(analyze ? "a" : "k");
    try {
      await onImport(analyze);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={!!busy} onClick={() => run(false)} className="rounded-xl border border-stone-300 py-2.5 text-sm font-semibold text-stone-800 disabled:opacity-50">
        {busy === "k" ? "담는 중…" : label}
        <span className="block text-[11px] font-normal text-stone-400">보관만 · 무료</span>
      </button>
      <button type="button" disabled={!!busy} onClick={() => run(true)} className="rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
        {busy === "a" ? "맡기는 중…" : "담고 분석까지"}
        <span className="block text-[11px] font-normal text-rose-100">대본·구조 · 약 100~200원</span>
      </button>
    </div>
  );
}

function PostSheet({ acc, p, url, onClose, onImport, onHide }) {
  const r = ratio(p);
  const young = p.takenAt && diff(p.takenAt, today()) <= 2;
  return (
    <Sheet onClose={onClose}>
      <div className="relative flex min-h-[40vh] items-center justify-center bg-stone-100 sm:w-[46%]">
        {url ? <img src={url} alt="" className="h-full max-h-[92vh] w-full object-cover" /> : null}
        {young && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 성과 확인 중
          </span>
        )}
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
          {p.kind === "reel" ? "릴스" : p.kind === "carousel" ? `${p.slides}장` : "사진"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-stone-100 px-5 py-4">
          <div>
            <div className="font-semibold text-stone-900">@{acc.handle}</div>
            <div className="mt-0.5 text-xs text-stone-500">
              {p.takenAt ? `${dotted(p.takenAt)} 게시` : "게시일 확인 중"} · {md(p.firstSeen)} 수집
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-stone-50 px-5 py-4">
          <div className="rounded-xl border border-rose-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold text-stone-500">좋아요 대비 댓글 비율</div>
            <div className={"mt-0.5 text-2xl font-bold tabular-nums " + (r != null && r >= 0.005 ? "text-rose-700" : "text-stone-900")}>{pct(r)}</div>
            <div className="mt-0.5 text-xs text-stone-500">
              댓글이 많이 달릴수록 저장·공유로 이어진 잘 터진 소재예요{r != null && r >= 0.005 ? " — 0.5% 넘음" : ""}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["좋아요", p.likes],
              ["댓글", p.comments],
              ["조회", p.views],
            ]
              .filter(([k, v]) => k !== "조회" || v != null)
              .map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white px-3 py-2.5">
                  <div className="text-xs text-stone-500">{k}</div>
                  <div className="text-lg font-bold tabular-nums text-stone-900">{num(v)}</div>
                </div>
              ))}
          </div>
          {p.caption && (
            <div className="rounded-xl bg-white px-4 py-3">
              <div className="text-xs font-semibold text-stone-500">캡션</div>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-stone-700">{p.caption}</p>
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-stone-100 px-5 py-4">
          <ImportButtons label={p.kind === "reel" ? "릴스 라이브러리에 담기" : "캐러셀 레퍼런스에 담기"} done={!!p.imported} onImport={onImport} />
          <div className="flex items-center justify-between text-xs">
            <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-stone-600 hover:text-stone-900">
              인스타그램에서 보기 <ExternalLink size={11} />
            </a>
            <button
              type="button"
              onClick={() => window.confirm("이 소재를 목록에서 뺄까요? 다음 스캔에도 다시 나오지 않아요.") && onHide()}
              className="text-stone-400 hover:text-rose-600"
            >
              이 소재 삭제
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function AdSheet({ a, url, onClose, onImport }) {
  const [g, , glabel] = gradeOf(a);
  return (
    <Sheet onClose={onClose}>
      <div className="relative flex min-h-[40vh] items-center justify-center bg-stone-100 sm:w-[55%]">
        {url ? <img src={url} alt="" className="h-full max-h-[92vh] w-full object-contain" /> : null}
        <span className={"absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold " + (a.active ? "bg-rose-700 text-white" : "bg-stone-700 text-white")}>
          {a.active ? "게재 중" : "중단"}
        </span>
        {a.video && (
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
            <Play size={10} /> 영상
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-stone-100 px-5 py-4">
          <div>
            <div className="font-semibold text-stone-900">{a.page || "광고"}</div>
            <div className="mt-0.5 text-xs text-stone-500">광고 라이브러리 소재 · {glabel} 켜 둠 ({g}등급)</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="text-sm font-semibold text-stone-800">
            {dotted(a.startAt)} ~ {a.active ? "현재 게재 중" : `${dotted(a.stoppedAt)} 중단`}
            <span className="ml-1.5 font-normal text-stone-500">({adDays(a)}일)</span>
          </div>
          {a.outOfTop && a.active && <p className="text-xs text-amber-700">아직 게재 중이지만 노출 많은 순위에서는 밀려났어요.</p>}
          {a.title && <div className="text-sm font-medium text-stone-800">{a.title}</div>}
          {a.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap text-stone-700">{a.text}</p> : <p className="text-sm text-stone-400">문구 없음</p>}
          {a.cta && <div className="text-xs text-stone-500">버튼: {a.cta}</div>}
        </div>
        <div className="space-y-2 border-t border-stone-100 px-5 py-4">
          {a.video ? (
            <ImportButtons label="레퍼런스 라이브러리에 담기" done={!!a.imported} onImport={onImport} />
          ) : (
            <p className="text-center text-xs text-stone-400">사진 광고는 라이브러리에 담지 않아요 — 영상 광고만</p>
          )}
          <a
            href={`https://www.facebook.com/ads/library/?id=${a.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"
          >
            광고 라이브러리에서 보기 <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ 게시물 격자

function PostTile({ p, url, onOpen }) {
  const r = ratio(p);
  const young = p.takenAt && diff(p.takenAt, today()) <= 2;
  return (
    <button type="button" onClick={() => onOpen(p)} className="group relative block overflow-hidden rounded-xl bg-stone-200 text-left">
      <span className="block aspect-[4/5]">{url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}</span>
      <span className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
        {young && (
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 성과 확인 중
          </span>
        )}
        {p.firstSeen === today() && <span className="rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>}
      </span>
      {p.imported && <span className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white">담음</span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-8 pb-2 text-white">
        <span className="flex items-end justify-between gap-1">
          <span className="text-base leading-none font-bold tabular-nums">
            {pct(r)} <span className="text-[10px] font-medium opacity-80">댓글비율</span>
          </span>
          {p.kind !== "reel" && (
            <span className="flex items-center gap-0.5 text-[10px] opacity-85">
              <Layers size={10} /> {p.kind === "carousel" ? p.slides : 1}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[11px] tabular-nums opacity-85">
          {p.kind === "reel" && p.views != null ? `조회 ${short(p.views)}` : `좋아요 ${short(p.likes)}`} · 댓글 {short(p.comments)}
        </span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ 광고 타임라인

const COL = 26; // 하루 칸 너비(px)
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function AdTimeline({ ads, urls, onOpen }) {
  const scroller = useRef(null);
  const t = today();
  const first = ads.reduce((m, a) => ((a.startAt || a.firstSeen || t) < m ? a.startAt || a.firstSeen : m), t);
  const start = [first, addDays(t, -59)].sort()[1]; // 길어도 최근 60일
  const days = useMemo(() => {
    const out = [];
    for (let d = start; d <= t; d = addDays(d, 1)) out.push(d);
    return out;
  }, [start, t]);

  // 오늘이 오른쪽 끝 — 열면 오늘 쪽을 보여준다
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [days.length]);

  const months = [];
  days.forEach((d) => {
    const m = d.slice(0, 7);
    if (!months.length || months[months.length - 1].m !== m) months.push({ m, n: 1 });
    else months[months.length - 1].n += 1;
  });

  return (
    <div ref={scroller} className="max-h-[70vh] overflow-auto rounded-xl border border-stone-200 bg-white">
      <div style={{ width: 272 + days.length * COL }} className="relative">
        <div className="sticky top-0 z-20 flex border-b border-stone-200 bg-white">
          <div className="sticky left-0 z-10 flex w-[272px] shrink-0 items-end border-r border-stone-200 bg-white px-3 pb-2 text-xs font-semibold text-stone-500">광고</div>
          <div>
            <div className="flex h-7 border-b border-stone-100 text-xs font-semibold text-stone-700">
              {months.map((m) => (
                <div key={m.m} style={{ width: m.n * COL }} className="flex items-center border-l border-stone-100 whitespace-nowrap">
                  <span className="sticky left-[272px] px-2">
                    {Number(m.m.slice(0, 4))}년 {Number(m.m.slice(5))}월
                  </span>
                </div>
              ))}
            </div>
            <div className="flex">
              {days.map((d) => {
                const w = new Date(d + "T00:00:00").getDay();
                const weekend = w === 0 || w === 6;
                return (
                  <div key={d} style={{ width: COL }} className="flex flex-col items-center py-1 text-[10px]">
                    <span className={weekend ? "text-rose-500" : "text-stone-400"}>{DOW[w]}</span>
                    <span
                      className={
                        "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums " +
                        (d === t ? "bg-rose-700 text-white" : weekend ? "text-rose-500" : "text-stone-700")
                      }
                    >
                      {Number(d.slice(8))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {ads.map((a) => {
          const s = a.startAt || a.firstSeen || t;
          const e = a.active ? t : a.stoppedAt || a.lastSeen || t;
          const from = Math.max(0, diff(start, s));
          const to = Math.min(days.length - 1, diff(start, e));
          const cut = s < start;
          const [g, , , tone] = gradeOf(a);
          return (
            <button key={a.id} type="button" onClick={() => onOpen(a)} className="group relative flex h-14 w-full border-b border-stone-100 text-left">
              <div className="sticky left-0 z-10 flex w-[272px] shrink-0 items-center gap-2.5 border-r border-stone-200 bg-white px-3 group-hover:bg-stone-50">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-stone-100">
                  {urls[a.thumb] && <img src={urls[a.thumb]} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  {a.video && <Play size={10} className="absolute right-0.5 bottom-0.5 fill-white text-white drop-shadow" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-stone-900">{(a.text || a.title || a.page || "광고").split("\n")[0]}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                    <span className={"rounded px-1 text-[10px] font-bold " + tone}>{g}</span>
                    <span className={a.active ? "text-rose-700" : "text-stone-400"}>
                      {a.active ? `게재 중 · ${kday(s)} 시작` : `${kday(a.stoppedAt)} 중단`}
                    </span>
                  </span>
                </span>
              </div>
              <div className="relative flex-1 group-hover:bg-stone-50/70">
                {days.indexOf(t) >= 0 && <span style={{ left: days.indexOf(t) * COL, width: COL }} className="absolute inset-y-0 bg-rose-50" />}
                {to >= 0 && (
                  <span
                    style={{ left: from * COL + 3, width: Math.max(COL - 6, (to - from + 1) * COL - 6) }}
                    className={"absolute top-1/2 h-6 -translate-y-1/2 rounded-md " + (cut ? "rounded-l-none " : "") + (a.active ? "bg-rose-600" : "bg-stone-300")}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AdsPanel({ acc, data, urls, onOpen, onSaveAcc }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("grade");
  const [adUrl, setAdUrl] = useState("");
  const ads = useMemo(() => {
    const list = Object.values(data?.ads || {}).filter((a) => !a.hidden && (filter === "all" || (filter === "active" ? a.active : !a.active)));
    return list.sort((a, b) =>
      sort === "grade" ? adDays(b) - adDays(a) : (b.startAt || b.firstSeen || "").localeCompare(a.startAt || a.firstSeen || ""),
    );
  }, [data, filter, sort]);

  if (!acc.adUrl) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-stone-300 bg-white p-4 text-sm">
        <p className="text-stone-600">광고 라이브러리 링크를 넣으면 이 계정의 광고 소재도 매일 추적해요.</p>
        <div className="flex gap-2">
          <input value={adUrl} onChange={(e) => setAdUrl(e.target.value)} placeholder="https://www.facebook.com/ads/library/?…" className={FIELD + " min-w-0 flex-1 text-sm"} />
          <button type="button" disabled={!isAdUrl(adUrl)} onClick={() => onSaveAcc({ ...acc, adUrl: adUrl.trim() }, true)} className="rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:bg-stone-300">
            넣고 스캔
          </button>
        </div>
      </div>
    );
  }
  const last = (data?.scans || []).filter((s) => s.ads != null).slice(-1)[0];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-400">
          {last ? `마지막 광고 스캔 ${md(new Date(last.at).toLocaleDateString("sv-SE"))}` : "아직 스캔 전"} · 매일 자동 갱신
          {last && last.adsTotal > last.ads ? ` · 노출 많은 ${last.ads}개 추적 (게재 중 전체 ${last.adsTotal}개)` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-stone-400" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1">
            <option value="all">전체</option>
            <option value="active">게재 중만</option>
            <option value="stopped">중단만</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1">
            <option value="grade">등급 순 (오래 켠 순)</option>
            <option value="new">최근 시작 순</option>
          </select>
        </span>
      </div>
      {ads.length === 0 ? <Empty title="해당하는 광고가 없어요." hint="필터를 바꾸거나 다음 스캔을 기다려 주세요." /> : <AdTimeline ads={ads} urls={urls} onOpen={onOpen} />}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-rose-600" /> 게재 중
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-stone-300" /> 중단
        </span>
        {GRADES.map(([g, , label, tone]) => (
          <span key={g} className="flex items-center gap-1">
            <span className={"rounded px-1 text-[10px] font-bold " + tone}>{g}</span> {label}
          </span>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ 오른쪽 — 계정 하나

function AccountPanel({ acc, status, load, patchData, fileUrls, onRescan, onRemove, onSave, onImportPost, onImportAd }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(acc.handle ? "reel" : "ads");
  const [urls, setUrls] = useState({});
  const [openPost, setOpenPost] = useState(null);
  const [openAd, setOpenAd] = useState(null);

  useEffect(() => {
    let alive = true;
    load(acc.id).then((d) => alive && setData(d || { posts: {}, ads: {} }));
    return () => {
      alive = false;
    };
  }, [acc.id, acc.lastScan, load]);

  const posts = useMemo(
    () =>
      Object.values(data?.posts || {})
        .filter((p) => !p.hidden)
        .sort((a, b) => (b.takenAt || b.firstSeen || "").localeCompare(a.takenAt || a.firstSeen || "")),
    [data],
  );
  const reels = useMemo(() => posts.filter((p) => p.kind === "reel"), [posts]);
  const photos = useMemo(() => posts.filter((p) => p.kind !== "reel"), [posts]);
  const adsAll = useMemo(() => Object.values(data?.ads || {}).filter((a) => !a.hidden), [data]);

  const need = tab === "ads" ? adsAll : tab === "reel" ? reels : photos;
  useEffect(() => {
    const keys = need.map((x) => x.thumb).filter((k) => k && !urls[k]).slice(0, 150);
    if (!keys.length) return;
    let alive = true;
    fileUrls(keys).then((m) => alive && setUrls((u) => ({ ...u, ...m })));
    return () => {
      alive = false;
    };
  }, [need, fileUrls, urls]);

  const mark = async (kind, id, patch) => {
    const next = await patchData(acc.id, (d) => ({ ...d, [kind]: { ...(d[kind] || {}), [id]: { ...(d[kind] || {})[id], ...patch } } }));
    if (next) setData(next);
  };

  const shown = tab === "reel" ? reels : photos;
  const total = posts.length + adsAll.length;
  const TABS = [
    ...(acc.handle
      ? [
          ["reel", "릴스", reels.length],
          ["photo", "사진·캐러셀", photos.length],
        ]
      : []),
    ["ads", "광고 소재", adsAll.length],
  ];

  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="border-b border-stone-100 px-5 pt-4">
        <div className="flex items-start gap-3">
          <Avatar acc={acc} size="h-11 w-11 text-base" active />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="truncate text-lg font-bold text-stone-900">{acc.handle ? `@${acc.handle}` : acc.name || "광고 추적"}</span>
              <button
                type="button"
                role="switch"
                aria-checked={!acc.paused}
                onClick={() => onSave({ ...acc, paused: !acc.paused })}
                className="flex items-center gap-1.5 text-xs font-medium"
                title="끄면 매일 자동 스캔을 멈춰요 (기록은 그대로)"
              >
                <span className={"relative h-5 w-9 rounded-full transition-colors duration-200 " + (acc.paused ? "bg-stone-300" : "bg-emerald-600")}>
                  <span className={"toggle-knob absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow " + (acc.paused ? "" : "translate-x-4")} />
                </span>
                <span className={acc.paused ? "text-stone-400" : "text-emerald-700"}>{acc.paused ? "모니터링 꺼짐" : "모니터링 중"}</span>
              </button>
            </div>
            <div className="mt-0.5 text-xs text-stone-500">
              {dotted(acc.addedAt)} 부터 모니터링 · 수집된 소재 {num(total)}개 · 마지막 확인{" "}
              {acc.lastScan ? md(new Date(acc.lastScan).toLocaleDateString("sv-SE")) : "아직"}
              {acc.name && acc.handle ? ` · ${acc.name}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={status.kind === "working" || status.kind === "queued"}
              onClick={() => onRescan(acc)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40"
            >
              <RotateCw size={13} /> 다시 스캔
            </button>
            <button
              type="button"
              aria-label="추적 그만하기"
              onClick={() => window.confirm(`${acc.handle || acc.name} 추적을 멈추고 기록을 지울까요?`) && onRemove(acc.id)}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        {status.kind !== "done" && (
          <div className={"mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs " + (status.kind === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900")}>
            {status.kind === "error" ? <Info size={13} /> : <Loader2 size={13} className="animate-spin" />}
            {status.text}
          </div>
        )}
        {/* 탭 모양은 ERP 다른 화면(릴스·캐러셀·미송)과 같게 — 회색 바탕 위 흰 알약 */}
        <nav className="my-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm" role="tablist">
          {TABS.map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={"flex-1 rounded-lg py-2 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
            >
              {label} <span className={"tabular-nums " + (tab === k ? "text-rose-700" : "text-stone-400")}>{n}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="bg-stone-50/60 p-4">
        {!data ? (
          <div className="flex justify-center py-12 text-stone-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : tab === "ads" ? (
          <AdsPanel acc={acc} data={data} urls={urls} onOpen={setOpenAd} onSaveAcc={onSave} />
        ) : shown.length === 0 ? (
          <Empty title="아직 없어요." hint="최근 게시물 12개 안에 없거나 스캔 전이에요. 매일 새로 쌓여요." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <PostTile key={p.code} p={p} url={urls[p.thumb]} onOpen={setOpenPost} />
            ))}
          </div>
        )}
      </div>

      {openPost && (
        <PostSheet
          acc={acc}
          p={(data?.posts || {})[openPost.code] || openPost}
          url={urls[openPost.thumb]}
          onClose={() => setOpenPost(null)}
          onHide={async () => {
            await mark("posts", openPost.code, { hidden: true });
            setOpenPost(null);
          }}
          onImport={async (analyze) => {
            await onImportPost(openPost, acc, analyze);
            await mark("posts", openPost.code, { imported: true });
          }}
        />
      )}
      {openAd && (
        <AdSheet
          a={(data?.ads || {})[openAd.id] || openAd}
          url={urls[openAd.thumb]}
          onClose={() => setOpenAd(null)}
          onImport={async (analyze) => {
            await onImportAd(openAd, acc, analyze);
            await mark("ads", openAd.id, { imported: true });
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- 화면

export default function AccountsPage({
  accounts,
  onSave,
  onRemove,
  load,
  patchData,
  fileUrls,
  worker,
  queue,
  onQueue,
  onPoll,
  onSaveReel,
  onSaveCarousel,
}) {
  const [sel, setSel] = useState(null);

  useEffect(() => {
    onPoll();
    const t = setInterval(onPoll, 4000);
    return () => clearInterval(t);
  }, [onPoll]);

  const sorted = useMemo(() => [...accounts].sort((a, b) => (a.addedAt || "").localeCompare(b.addedAt || "")), [accounts]);
  const current = sorted.find((a) => a.id === sel) || sorted[0] || null;

  const scan = async (acc) => {
    await onSave({ ...acc, job: { status: "queued", at: new Date().toISOString() } });
    await onQueue(acc.id, "account");
  };

  const add = async ({ handle, adUrl }) => {
    const exists = accounts.find((a) => handle && a.handle === handle);
    if (exists) {
      await scan({ ...exists, adUrl: adUrl || exists.adUrl, paused: false });
      setSel(exists.id);
      return;
    }
    const acc = { id: newId("ac"), handle, adUrl, name: "", addedAt: today(), counts: {} };
    await scan(acc);
    setSel(acc.id);
  };

  // 게시물 → 릴스 라이브러리 / 캐러셀 레퍼런스. analyze=false 면 보관만(무료)
  const importPost = async (p, acc, analyze) => {
    const now = new Date().toISOString();
    const base = {
      title: `${analyze ? "분석" : "보관"} 대기 — @${acc.handle}`,
      source: { type: "link", url: p.url },
      meta: { url: p.url },
      memo: `계정 아카이브 @${acc.handle}`,
      job: { status: "queued", at: now },
    };
    if (p.kind === "reel") {
      const id = newId("r");
      await onSaveReel({ id, ...base, shop: { name: acc.name || `@${acc.handle}`, url: `https://www.instagram.com/${acc.handle}/` }, filled: [] });
      await onQueue(id, "ref", analyze ? {} : { analyze: false });
    } else {
      const id = newId("c");
      await onSaveCarousel({ id, ...base });
      await onQueue(id, "carousel", analyze ? {} : { analyze: false });
    }
  };

  // 영상 광고 → 릴스 라이브러리 (분석기가 광고 영상을 받아 온다)
  const importAd = async (a, acc, analyze) => {
    const id = newId("r");
    await onSaveReel({
      id,
      // 문구 없는 광고가 많다 — 그때는 "cloudemotion 광고 · 8/5 시작"
      title: (a.text || a.title || "").split("\n")[0].slice(0, 40) || `${a.page || acc.handle} 광고 · ${md(a.startAt)} 시작`,
      source: { type: "adlib", adId: a.id },
      meta: { url: `https://www.facebook.com/ads/library/?id=${a.id}`, uploader: a.page, postedAt: a.startAt, caption: a.text, ad: true },
      memo: `광고 소재 · ${a.page || acc.handle} · ${a.startAt} 게재 시작`,
      shop: { name: a.page || acc.name || `@${acc.handle}`, url: a.link || "" },
      job: { status: "queued", at: new Date().toISOString() },
      filled: [],
    });
    await onQueue(id, "ref", analyze ? {} : { analyze: false });
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <Radar size={20} /> 계정 아카이브
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">매일 자동으로 확인해요 — 새 게시물, 새로 켠 광고, 중단한 광고까지.</p>
      </div>

      <AddBar worker={worker} onAdd={add} />

      {sorted.length === 0 ? (
        <Empty title="아직 추적하는 계정이 없어요." hint="위에 인스타 계정 링크를 붙여넣고 모니터링 시작을 누르세요." />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <aside className="shrink-0 rounded-2xl border border-stone-200 bg-white p-2 md:sticky md:top-4 md:w-60">
            <div className="px-2 pt-1 pb-2 text-xs font-semibold text-stone-500">수집된 계정 {sorted.length}</div>
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {sorted.map((a) => {
                const on = current?.id === a.id;
                const st = statusOf(a, queue);
                const c = a.counts || {};
                const n = (c.reels || 0) + (c.carousels || 0) + (c.photos || 0) + (c.adsActive || 0) + (c.adsStopped || 0);
                return (
                  <li key={a.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSel(a.id)}
                      className={"flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left " + (on ? "bg-rose-50" : "hover:bg-stone-50")}
                    >
                      <Avatar acc={a} active={on} />
                      <span className="min-w-0 flex-1">
                        <span className={"block truncate text-sm font-semibold " + (on ? "text-rose-800" : "text-stone-800")}>
                          {a.handle ? `@${a.handle}` : a.name || "광고"}
                        </span>
                        <span className="block text-[11px] text-stone-400">{st.kind === "done" ? `소재 ${num(n)}` : st.text}</span>
                      </span>
                      <span
                        title={a.paused ? "모니터링 꺼짐" : "모니터링 중"}
                        className={
                          "h-2 w-2 shrink-0 rounded-full " +
                          (st.kind === "working" || st.kind === "queued" ? "animate-pulse bg-amber-400" : a.paused ? "bg-stone-300" : "bg-emerald-600")
                        }
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          {current && (
            <AccountPanel
              key={current.id}
              acc={current}
              status={statusOf(current, queue)}
              load={load}
              patchData={patchData}
              fileUrls={fileUrls}
              onRescan={scan}
              onRemove={(id) => {
                onRemove(id);
                setSel(null);
              }}
              onSave={(a, rescan) => (rescan ? scan(a) : onSave(a))}
              onImportPost={importPost}
              onImportAd={importAd}
            />
          )}
        </div>
      )}
    </div>
  );
}
