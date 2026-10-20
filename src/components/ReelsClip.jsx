import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, ExternalLink, AlertTriangle, RotateCw, Film, Images } from "lucide-react";
import { loadList, matchExisting, isFailedReel, saveInstaBatch } from "../lib/reelsClip";
import { seedFolders, ordered, pathName, folderIdOf } from "../lib/reelFolders";
import { useScriptFrom, ScriptFromPick } from "./ScriptFrom";

/**
 * 인스타에서 한 번에 담기 창 (#reels-clip, 10/20) — 인스타 화면의 즐겨찾기 단추(public/insta-clip.js)가 연다.
 * 받은 게시물을 줄로 보여 주고, 어떻게 담을지(보관만 / 분석까지 · 대본 자막대로/목소리대로 · 폴더) 고른 뒤 'N개 담기'.
 * 저장·일감 만들기는 lib/reelsClip.js. 인스타 주소에서 온 것만 받는다(개발 중엔 localhost 도).
 */
const fromInsta = (o) =>
  /^https:\/\/([\w-]+\.)*instagram\.com$/.test(o) || (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));

const MODE_KEY = "poclo_reels_clip_mode";
const FOLDER_KEY = "poclo_reels_clip_folder";
const read = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 기억 못 해도 된다 */
  }
};
const man = (v) => (v >= 10000 ? `${(v / 10000).toFixed(1).replace(/\.0$/, "")}만` : Number(v || 0).toLocaleString("ko-KR"));

export default function ReelsClip({ online, ready = true }) {
  const [rows, setRows] = useState([]); // {i, d, on, done}
  const [info, setInfo] = useState({ n: 0, end: null });
  const [reels, setReels] = useState(null);
  const [cars, setCars] = useState([]);
  const [folders, setFolders] = useState([]);
  const [analyze, setAnalyze] = useState(() => read(MODE_KEY, "keep") === "analyze");
  const [from, setFrom] = useScriptFrom();
  const [folderId, setFolderId] = useState(() => read(FOLDER_KEY, ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  // 지금 있는 릴스·캐러셀·폴더 (이미 있나 보려고)
  const reload = useCallback(async () => {
    const [r, c, f] = await Promise.all([loadList("reels", online), loadList("carousels", online), loadList("reels_folders", online)]);
    setReels(r);
    setCars(c);
    setFolders(f.length ? f : seedFolders(r));
  }, [online]);
  useEffect(() => {
    if (ready) reload().catch((e) => setErr(e.message || "목록을 못 읽었어요"));
  }, [ready, reload]);

  useEffect(() => {
    let heard = false;
    const onMsg = (e) => {
      const m = e.data;
      if (!m || typeof m !== "object" || !m.poclo || !fromInsta(e.origin)) return;
      heard = true;
      if (m.poclo === "start") setInfo((x) => ({ n: (x.end ? 0 : x.n) + m.n, end: null }));
      else if (m.poclo === "item" && m.d?.code)
        setRows((rs) => (rs.some((r) => r.d.code === m.d.code) ? rs.map((r) => (r.d.code === m.d.code && !r.done ? { ...r, d: m.d } : r)) : [...rs, { i: rs.length, d: m.d, on: null, done: false }]));
      else if (m.poclo === "end") setInfo((x) => ({ ...x, end: m }));
    };
    window.addEventListener("message", onMsg);
    // 인스타 창에 '받을 준비 됐어요' — 첫 소식이 올 때까지 1초마다 (같은 창에 다음 묶음이 또 오면 그때도 받는다)
    const hi = () => !heard && window.opener?.postMessage({ poclo: "ready" }, "*");
    hi();
    const t = setInterval(hi, 1000);
    const again = setInterval(() => window.opener?.postMessage({ poclo: "ready" }, "*"), 3000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(t);
      clearInterval(again);
    };
  }, []);

  // 줄마다: 이미 있나 · 무엇이 될까 · 기본 체크
  const view = useMemo(
    () =>
      rows.map((r) => {
        const ex = reels ? matchExisting(r.d, reels, cars) : null;
        const video = !r.d.kind || r.d.kind === "video";
        const retry = video && ex && isFailedReel(ex);
        const dup = !!ex && !retry;
        const def = !dup;
        return { ...r, ex, video, retry, dup, checked: r.done ? false : r.on ?? def };
      }),
    [rows, reels, cars],
  );
  const picked = view.filter((r) => r.checked && !r.done);
  const nReel = picked.filter((r) => r.video && !r.retry).length;
  const nRetry = picked.filter((r) => r.retry).length;
  const nCar = picked.filter((r) => !r.video).length;
  const going = info.n > 0 && !info.end;
  const got = rows.length;
  const folder = folders.find((f) => f.id === folderId);

  const toggle = (code, on) => setRows((rs) => rs.map((r) => (r.d.code === code ? { ...r, on } : r)));

  const commit = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await saveInstaBatch(
        picked.map((r) => ({ d: r.d, existing: r.ex })),
        { analyze, scriptFrom: analyze ? from : "", folder: folder ? { folderId: folder.id, folder: folder.parent ? "" : folder.name } : { folderId: null, folder: "" }, online },
      );
      const codes = new Set(picked.map((r) => r.d.code));
      setRows((rs) => rs.map((r) => (codes.has(r.d.code) ? { ...r, done: true } : r)));
      setResult((x) => ({
        added: (x?.added || 0) + res.added,
        retried: (x?.retried || 0) + res.retried,
        carousels: (x?.carousels || 0) + res.carousels,
      }));
      await reload();
    } catch (e) {
      setErr(e.message || "담지 못했어요. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-28 text-stone-800">
      <div className="mx-auto max-w-lg space-y-3 p-3">
        <div className={"flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold " + (going ? "bg-white text-stone-700" : got ? "bg-emerald-50 text-emerald-900" : "bg-white text-stone-600")}>
          {going ? <Loader2 size={16} className="animate-spin" /> : got ? <Check size={16} /> : <Loader2 size={16} className="animate-spin" />}
          {!info.n ? "인스타에서 고른 게시물을 기다리는 중…" : going ? `인스타에서 읽는 중 · ${got} / ${info.n}` : `다 받았어요 · ${got}개 — 아래에서 고르고 담아요`}
        </div>
        {info.n > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={info.n} aria-valuenow={got}>
            <div className={"h-full rounded-full transition-[width] duration-300 ease-out " + (going ? "bg-rose-700" : "bg-emerald-600")} style={{ width: `${Math.round((got / Math.max(1, info.n)) * 100)}%` }} />
          </div>
        )}
        {info.end?.halted && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">인스타에서 '멈추기'를 눌러 중간에 멈췄어요.</p>}

        {/* 어떻게 담을까 */}
        <section className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-sm" role="radiogroup" aria-label="어떻게 담을까요">
            {[
              [false, "보관만", "영상·썸네일만 · 돈 안 들어요"],
              [true, "분석까지", "대본·구조 · 한 개 약 150~300원"],
            ].map(([v, label, sub]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={analyze === v}
                onClick={() => {
                  setAnalyze(v);
                  write(MODE_KEY, v ? "analyze" : "keep");
                }}
                className={"flex flex-1 flex-col items-center rounded-md px-2 py-1.5 " + (analyze === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-[11px] text-stone-400">{sub}</span>
              </button>
            ))}
          </div>
          {analyze && <ScriptFromPick value={from} onChange={setFrom} />}
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <span className="shrink-0 font-medium">릴스 폴더</span>
            <select
              value={folderId}
              onChange={(e) => {
                setFolderId(e.target.value);
                write(FOLDER_KEY, e.target.value);
              }}
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800"
            >
              <option value="">미분류</option>
              {ordered(folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{err}</p>}
        {result && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
            담았어요 — 새 릴스 {result.added}개{result.retried ? ` · 못 받았던 릴스 ${result.retried}개 다시 받기` : ""}
            {result.carousels ? ` · 캐러셀 기획 ${result.carousels}개(보관만)` : ""}. 사무실 PC 분석기가 차례로 받아요.
          </p>
        )}

        <ul className="space-y-1.5">
          {view.map((r) => {
            const d = r.d;
            return (
              <li key={d.code} className={"flex items-start gap-2.5 rounded-xl border bg-white p-2 " + (r.done ? "border-emerald-200 opacity-70" : r.checked ? "border-rose-300" : "border-stone-200")}>
                <input
                  type="checkbox"
                  checked={r.checked}
                  disabled={r.done}
                  onChange={(e) => toggle(d.code, e.target.checked)}
                  aria-label={`${d.user || d.code} 담기`}
                  className="mt-1 h-4 w-4 shrink-0 accent-rose-700"
                />
                <span className="relative aspect-[9/14] w-12 shrink-0 overflow-hidden rounded-md bg-stone-100">
                  {d.thumb && <img src={d.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />}
                  {d.views > 0 && <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[9px] text-white tabular-nums">▶ {man(d.views)}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-stone-900">{d.user ? `@${d.user}` : d.code}</span>
                    {r.video ? <Film size={12} className="shrink-0 text-stone-400" /> : <Images size={12} className="shrink-0 text-stone-400" />}
                  </div>
                  <div className="truncate text-xs text-stone-600">{(d.caption || "").split("\n").find((x) => x.trim()) || (d.err ? "정보를 못 읽었어요 — 링크만 담아요" : "글 없음")}</div>
                  <div className="text-[11px] text-stone-400 tabular-nums">
                    {[d.postedAt && d.postedAt.slice(5).replace("-", "/"), d.likes != null && `♥ ${Number(d.likes).toLocaleString("ko-KR")}`, d.comments != null && `💬 ${d.comments}`].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
                    {r.done ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">담음</span>
                    ) : r.retry ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">
                        <RotateCw size={10} /> 못 받았던 릴스 · {d.video ? "이 영상 주소로 다시 받기" : "다시 맡기기(영상 주소 없음)"}
                      </span>
                    ) : r.dup ? (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">
                        이미 있어요{r.video && reels ? ` · ${pathName(folderIdOf(r.ex, folders), folders) || "미분류"}` : " · 캐러셀 기획"}
                      </span>
                    ) : !r.video ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">사진·캐러셀 → 캐러셀 기획(보관만)</span>
                    ) : (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-800">새 릴스{d.video ? "" : " · 링크로 받기"}</span>
                    )}
                    {d.err && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900" title={d.err}>정보 못 읽음</span>}
                    <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-stone-400 hover:text-stone-700">
                      <ExternalLink size={10} /> 열기
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {view.some((r) => r.d.err) && (
          <p className="flex gap-1.5 px-1 text-xs leading-relaxed text-stone-500">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" />
            정보를 못 읽은 게시물은 링크만 담아요. 사무실 PC 가 링크로 못 받으면 그 게시물을 인스타에서 연 채로 단추를 한 번 더 눌러 주세요.
          </p>
        )}
        <a href={window.location.origin + "/"} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-700">
          <ExternalLink size={14} /> 포클로ERP에서 보기 (콘텐츠 › 릴스 기획)
        </a>
      </div>

      {/* 담기 단추 — 늘 아래에 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            disabled={!picked.length || busy || !reels}
            onClick={commit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 py-3 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {picked.length
              ? `${picked.length}개 담기 · ${[nReel && `릴스 ${nReel}`, nRetry && `다시 받기 ${nRetry}`, nCar && `캐러셀 ${nCar}`].filter(Boolean).join(" · ")}${analyze && nReel + nRetry ? ` · 분석 약 ${((nReel + nRetry) * 150).toLocaleString("ko-KR")}~${((nReel + nRetry) * 300).toLocaleString("ko-KR")}원` : ""}`
              : going
                ? "받는 중…"
                : "담을 게시물을 골라요"}
          </button>
          {going && picked.length > 0 && <p className="mt-1 text-center text-[11px] text-stone-400">아직 읽는 중이에요 — 지금 담아도 되고, 나머지는 다 받은 뒤 또 담으면 돼요</p>}
        </div>
      </div>
    </div>
  );
}
