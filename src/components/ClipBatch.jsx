import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { won } from "../lib/shoot";
import { stageName, refusalText } from "../lib/sinsang";
import { saveClip } from "../lib/clipSave";
import { Photo } from "./ShootBits";

/**
 * 여러 개 담기 창 (#clip-batch, 10/13 세원: "신상마켓에서 여러 상품을 같이 포클로에 담기 — 하나씩 하니까 불편해서").
 * 신마 목록에서 고른 상품을 담기 단추가 하나씩 열어 읽고 postMessage 로 보낸다(public/clip.js __pocloBatch).
 * 받는 대로 **한 번에 하나씩** 저장한다 — 같은 새 거래처를 두 번 만들지 않게, 방금 만든 거래처를 다음 상품이 쓴다.
 * 신마 주소에서 온 것만 받는다(개발 중엔 localhost 도).
 */
const fromSinsang = (o) =>
  /^https:\/\/([\w-]+\.)*sinsangmarket\.kr$/.test(o) || (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));

const TONE = {
  saved: "bg-emerald-50 text-emerald-800",
  dup: "bg-amber-50 text-amber-800",
  error: "bg-rose-50 text-rose-700",
  fail: "bg-rose-50 text-rose-700",
  saving: "bg-stone-100 text-stone-500",
  wait: "bg-stone-100 text-stone-500",
};
const label = (r) =>
  r.state === "saved"
    ? "담음"
    : r.state === "dup"
      ? r.item?.stage === "trash"
        ? "휴지통 — 안 담음"
        : `이미 있음 · ${stageName(r.item?.stage)}`
      : r.state === "error" || r.state === "fail"
        ? "못 담음"
        : "담는 중";

export default function ClipBatch({ online, vendors = [], onVendor, ready = true }) {
  const [rows, setRows] = useState([]); // {i, state: wait|saving|saved|dup|error|fail, item, photo, why, refused}
  const [info, setInfo] = useState({ n: 0, end: null });
  const queue = useRef([]);
  const busy = useRef(false);
  const known = useRef(vendors);
  const ctx = useRef({ online, onVendor, ready });
  useEffect(() => {
    ctx.current = { online, onVendor, ready };
    // 서버에서 다시 읽은 거래처 + 이 창에서 방금 만든 거래처
    const ids = new Set(vendors.map((v) => v.id));
    known.current = [...vendors, ...known.current.filter((v) => !ids.has(v.id))];
  }, [online, onVendor, ready, vendors]);
  const put = (i, patch) => setRows((r) => (r.some((x) => x.i === i) ? r.map((x) => (x.i === i ? { ...x, ...patch } : x)) : [...r, { i, ...patch }].sort((a, b) => a.i - b.i)));

  const pump = useRef(null);
  useEffect(() => {
    pump.current = async () => {
      if (busy.current || !ctx.current.ready) return;
      busy.current = true;
      while (queue.current.length) {
        const m = queue.current.shift();
        put(m.i, { state: "saving" });
        try {
          const r = await saveClip(m.d, { online: ctx.current.online, vendors: known.current, onVendor: ctx.current.onVendor });
          if (r.vendor && !known.current.some((v) => v.id === r.vendor.id)) known.current = [...known.current, r.vendor];
          put(m.i, { state: r.state, item: r.item, photo: r.photo, why: r.msg, refused: r.refused });
        } catch (e) {
          put(m.i, { state: "error", why: e.message || "저장하지 못했어요" });
        }
      }
      busy.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready) pump.current?.();
  }, [ready]);

  useEffect(() => {
    let heard = false;
    const onMsg = (e) => {
      const m = e.data;
      if (!m || typeof m !== "object" || !m.poclo || !fromSinsang(e.origin)) return;
      heard = true;
      if (m.poclo === "start") setInfo({ n: m.n, end: null });
      else if (m.poclo === "clip" && m.d) {
        put(m.i, { state: "wait" });
        queue.current.push(m);
        pump.current?.();
      } else if (m.poclo === "fail") put(m.i, { state: "fail", why: m.why });
      else if (m.poclo === "end") setInfo((x) => ({ ...x, n: m.n, end: m }));
    };
    window.addEventListener("message", onMsg);
    // 신마 창에 '받을 준비 됐어요' — 첫 소식이 올 때까지 1초마다
    const hi = () => !heard && window.opener?.postMessage({ poclo: "ready" }, "*");
    hi();
    const t = setInterval(hi, 1000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(t);
    };
  }, []);

  const count = (st) => rows.filter((r) => st.includes(r.state)).length;
  const saved = count(["saved"]);
  const dup = count(["dup"]);
  const bad = count(["error", "fail"]);
  const going = !info.end || count(["wait", "saving"]) > 0;

  return (
    <div className="min-h-screen bg-stone-50 p-3 text-stone-800">
      <div className="mx-auto max-w-md space-y-3">
        <div className={"flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold " + (going ? "bg-white text-stone-700" : bad ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900")}>
          {going ? <Loader2 size={16} className="animate-spin" /> : bad ? <AlertTriangle size={16} /> : <Check size={16} />}
          {!info.n
            ? "신마에서 고른 상품을 기다리는 중…"
            : going
              ? `여러 개 담는 중 · ${rows.filter((r) => !["wait", "saving"].includes(r.state)).length} / ${info.n}`
              : `다 담았어요 · 새로 ${saved}개${dup ? ` · 이미 있던 ${dup}개` : ""}${bad ? ` · 못 담은 ${bad}개` : ""}`}
        </div>
        {info.n > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={info.n} aria-valuenow={rows.filter((r) => !["wait", "saving"].includes(r.state)).length}>
            <div
              className={"h-full rounded-full transition-[width] duration-300 ease-out " + (going ? "bg-rose-700" : bad ? "bg-amber-500" : "bg-emerald-600")}
              style={{ width: `${Math.round((rows.filter((r) => !["wait", "saving"].includes(r.state)).length / info.n) * 100)}%` }}
            />
          </div>
        )}
        {info.end?.halted && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">신마에서 '멈추기'를 눌러 중간에 멈췄어요.</p>}
        {!ready && <p className="px-1 text-xs text-stone-500">포클로ERP 거래처 목록을 읽는 중이에요 — 다 읽으면 바로 담아요.</p>}

        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.i} className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white p-2">
              <span className="w-5 shrink-0 text-center text-xs font-semibold text-stone-400 tabular-nums">{r.i + 1}</span>
              <Photo url={r.photo} className="aspect-[3/4] w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-900">{r.item?.name || (r.state === "fail" || r.state === "error" ? "읽지 못한 상품" : "읽는 중…")}</div>
                <div className="truncate text-xs text-stone-500">{r.item ? [r.item.vendor, r.item.place, won(r.item.price)].filter(Boolean).join(" · ") : r.why || ""}</div>
                {r.refused?.length > 0 && <div className="truncate text-[11px] text-rose-700">샘플 거절한 적 있는 거래처 · {refusalText(r.refused[0])}</div>}
              </div>
              <span className={"flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " + (TONE[r.state] || "")}>
                {(r.state === "saving" || r.state === "wait") && <Loader2 size={11} className="animate-spin" />}
                {label(r)}
              </span>
            </li>
          ))}
        </ul>
        {bad > 0 && !going && <p className="px-1 text-xs leading-relaxed text-stone-500">못 담은 상품은 신마에서 그 상품을 눌러 연 다음 '포클로에 담기'로 하나씩 담아 주세요.</p>}
        <p className="px-1 text-xs leading-relaxed text-stone-500">담긴 상품은 신상 관리 '요청'에 있어요. 샘플/사입·종류는 거기서 고쳐요.</p>
        <a href={window.location.origin + "/"} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-700">
          <ExternalLink size={14} /> 포클로ERP에서 보기 (촬영 › 신상 관리)
        </a>
      </div>
    </div>
  );
}
