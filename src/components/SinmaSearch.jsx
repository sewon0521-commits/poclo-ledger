import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Pause, Play, X, Check, AlertTriangle } from "lucide-react";
import { loadKey, changeKey } from "../lib/shoot";
import { useLiveKey } from "../lib/useLiveKey";
import { JOBS_KEY, jobOf, isActive, jobLine, enqueue, stopJob, resumeJob, clearJob } from "../lib/sinmaJobs";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 신마에서 찾기 (11/25 세원 "요번에 찍을 사진 쫙 넣고 버튼 하나 누르면 신마에서 찾아주게") — lib/sinmaJobs 머리말.
 * 소싱 회차 창 '촬영 레퍼런스' 칸 머리의 단추 + 그 아래 상태 한 줄. 결과는 회차 창 '신마 후보'(SinmaFinds)에 사진마다 들어온다.
 */

export function useSinmaJobs(online) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    loadKey(JOBS_KEY, online, { items: [] })
      .then((v) => alive && setList(v?.items || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [online]);
  // 둘이 같이 쓰기 + 사무실 PC 가 진행을 적으면 바로(방송 · 놓쳐도 4초)
  useLiveKey([JOBS_KEY], online, (_, v) => setList(v?.items || []), { items: [] });
  const change = async (fn) => {
    const next = await changeKey(JOBS_KEY, online, fn, { items: [] });
    setList(next?.items || []);
    return next;
  };
  return { list, change };
}

const TONE = {
  wait: "bg-stone-100 text-stone-700",
  run: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  stop: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  err: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  done: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
};

/** 칸 머리 단추 */
export function SinmaSearchButton({ onOpen, job }) {
  const live = isActive(job);
  return (
    <button
      type="button"
      onClick={onOpen}
      title="고른 사진의 옷·신발·소품을 사무실 PC 가 어사이드로 신마에서 찾아 '신마 후보'에 넣어요"
      className={
        "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors " +
        (live ? "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : "bg-stone-900 text-white hover:bg-stone-700")
      }
    >
      {job?.status === "running" ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} 신마에서 찾기
    </button>
  );
}

/** 칸 머리 아래 상태 한 줄 + 멈추기·이어서·지우기 */
export function SinmaJobBar({ job, change, busy }) {
  const [err, setErr] = useState("");
  if (!job) return null;
  const line = jobLine(job);
  const act = async (fn) => {
    setErr("");
    try {
      await change(fn);
    } catch (e) {
      setErr(e.message || "저장하지 못했어요.");
    }
  };
  const btn = "flex items-center gap-0.5 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-stone-200 hover:ring-stone-300 disabled:opacity-50";
  return (
    <div className={"mb-2 rounded-xl px-3 py-2 text-xs " + (TONE[line.tone] || TONE.wait)} role="status">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {line.tone === "run" ? <Loader2 size={13} className="shrink-0 animate-spin" /> : line.tone === "done" ? <Check size={13} className="shrink-0" /> : line.tone === "stop" || line.tone === "err" ? <AlertTriangle size={13} className="shrink-0" /> : <Search size={13} className="shrink-0" />}
        <b className="font-semibold">신마에서 찾기</b>
        <span className="min-w-0">{line.text}</span>
        <span className="ml-auto flex gap-1">
          {isActive(job) && (
            <button type="button" disabled={busy} onClick={() => act(stopJob(job.id))} className={btn + " text-stone-700"}>
              <Pause size={11} /> 멈추기
            </button>
          )}
          {(job.status === "blocked" || job.status === "stopped" || job.status === "error") && (
            <button type="button" disabled={busy} onClick={() => act(resumeJob(job.id))} className={btn + " text-emerald-800"}>
              <Play size={11} /> 이어서
            </button>
          )}
          {!isActive(job) && (
            <button type="button" disabled={busy} onClick={() => act(clearJob(job.id))} title="이 줄만 지워요 — 찾은 후보는 그대로" className={btn + " text-stone-500"}>
              <X size={11} /> 닫기
            </button>
          )}
        </span>
      </div>
      {job.status === "blocked" && <p className="mt-1 text-[11px]">어사이드 신마 화면에서 로그인·보안 확인을 직접 해 주신 뒤 [이어서]를 눌러 주세요. 멈춘 사진부터 다시 찾아요.</p>}
      {isActive(job) && <p className="mt-1 text-[11px] opacity-80">찾는 동안 신마를 웹에서 열면 어사이드 쪽 로그인이 튕겨요(신마는 한 곳만 로그인). 사진 한 장에 20~30분쯤 걸려요.</p>}
      {err && <p className="mt-1 text-[11px] text-rose-700">{err}</p>}
    </div>
  );
}

/** 고르기 창 — 기본 = 아직 신마 후보가 없고 지금 찾고 있지도 않은 사진 전부 */
export function SinmaPickSheet({ refs, src, refNoOf, hasFinds, job, looks, onClose, onGo }) {
  const inJob = useMemo(() => new Set(isActive(job) ? (job.refs || []).filter((r) => r.status !== "done").map((r) => r.refId) : []), [job]);
  const [sel, setSel] = useState(() => new Set(refs.filter((r) => !hasFinds(r.id) && !inJob.has(r.id)).map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (id) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const go = async () => {
    if (!sel.size) return;
    setBusy(true);
    setErr("");
    try {
      await onGo(refs.filter((r) => sel.has(r.id)));
      onClose();
    } catch (e) {
      setErr(e.message || "넣지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title="신마에서 찾을 사진 고르기" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 text-xs text-stone-500">
          고른 사진마다 사무실 PC 가 어사이드로 신마에서 같은 옷·비슷한 옷·더 싼 대안을 찾아 '신마 후보'에 넣어요(신발·모자·머플러·벨트도). 도매가는 소싱 기준표대로, 세일 상품은 빼요. 사진 한 장에 20~30분쯤 걸려요.
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
          <button type="button" onClick={() => setSel(new Set(refs.filter((r) => !inJob.has(r.id)).map((r) => r.id)))} className="rounded-full bg-white px-2.5 py-1 font-semibold text-stone-600 ring-1 ring-stone-200">
            전부 고르기
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="rounded-full bg-white px-2.5 py-1 font-semibold text-stone-600 ring-1 ring-stone-200">
            다 빼기
          </button>
          <span className="self-center text-stone-400">{sel.size}장 고름</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {refs.map((r) => {
            const on = sel.has(r.id);
            const busyRef = inJob.has(r.id);
            const has = hasFinds(r.id);
            const look = looks?.[r.id]?.text || "";
            return (
              <button
                key={r.id}
                type="button"
                disabled={busyRef}
                onClick={() => toggle(r.id)}
                className={"relative overflow-hidden rounded-xl border-2 text-left transition-colors disabled:opacity-60 " + (on ? "border-rose-500" : "border-transparent hover:border-stone-300")}
              >
                <span className="block aspect-[3/4] w-full bg-stone-100">{src(r) && <img src={src(r)} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
                <span className={"absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow " + (on ? "bg-rose-600" : "bg-white/90 ring-1 ring-stone-300")}>{on && <Check size={12} />}</span>
                <span className="absolute top-1 right-1 rounded bg-black/55 px-1 text-[10px] font-semibold text-white">{refNoOf(r.id)}번</span>
                {(has || busyRef) && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] text-white">{busyRef ? "찾는 중·대기" : "후보 있음"}</span>
                )}
                {look && <span className="block truncate px-1 py-0.5 text-[10px] text-stone-500">{look}</span>}
              </button>
            );
          })}
        </div>
        {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <span className="text-[11px] text-stone-500">찾는 동안 신마를 웹에서 열면 어사이드 쪽 로그인이 튕겨요(신마는 한 곳만 로그인).</span>
        <button type="button" disabled={!sel.size || busy} onClick={go} className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {sel.size}장 찾기 시작
        </button>
      </footer>
    </Sheet>
  );
}

/** 회차 창에서 쓰는 묶음 — 단추·상태 줄·고르기 창 */
export function useSinmaSearch({ session, refNoOf, hasFinds, online }) {
  const jobs = useSinmaJobs(online);
  const job = jobOf(jobs.list, session?.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = async (fn) => {
    setBusy(true);
    try {
      return await jobs.change(fn);
    } finally {
      setBusy(false);
    }
  };
  const go = (picked) =>
    change(
      enqueue(
        { id: session.id, title: session.title || "", on: session.on || "" },
        // 사진은 보관함 키(photo)로 — 바깥 주소는 http 만(data: 주소를 넣으면 일감 목록이 무거워진다)
        picked.map((r) => ({ refId: r.id, refNo: refNoOf(r.id), photo: r.photo || "", url: /^https?:/.test(r.photoUrl || "") ? r.photoUrl : "", shop: r.shop || "", look: r.lookText || "" })),
      ),
    );
  return { job, open, setOpen, busy, change, go, refNoOf, hasFinds };
}
