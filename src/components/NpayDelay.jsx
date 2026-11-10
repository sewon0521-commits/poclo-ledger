import { useEffect, useMemo, useState } from "react";
import { Truck, RefreshCw, ChevronDown } from "lucide-react";
import { changeKey, loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { when, DELAY_TEMPLATE, fillDelay, scheduleText, codeOf, mdKo } from "../lib/cs";

/**
 * CS 관리 위 '네이버페이 발송지연' (11/10 세원: "네이버 페이센터에서 발송기한이 있거든? 발송지연 안내 자동화 — 매일 보고 답변해야 돼서 너무 귀찮아")
 * 사무실 PC(poclo-cafe24/npay_delay.py)가 3시간마다 어사이드로 '배송준비 지연 · 배송준비' 목록을 읽어 settings npay_delay 에 쓴다.
 * 여기서 고르고 날짜·글을 고친 뒤 [발송지연 처리] → cs_queue {kind:'npay_delay', ids} → PC 가 네이버페이센터 '발송지연 안내' 창에 넣고 확인.
 * ⚠ 한 주문에 한 번만 되고 상세사유는 손님에게 보인다 — 누를 때만 나간다.
 */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dday = (d) => Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5);
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const clean = (p) => String(p || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "").replace(/\s*\(\d+\s*co.*$/i, "");

export default function NpayDelay({ online, always = false }) {
  const [v, setV] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [dates, setDates] = useState({});
  const [detail, setDetail] = useState(""); // 세원 틀(11/11) — () 칸은 줄마다 채움
  const [sched, setSched] = useState({}); // 줄마다 (일정)·(예상일자)
  const [inbound, setInbound] = useState(null);
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => loadKey("npay_delay", online, { items: [] }).then((x) => alive && setV(x)).catch(() => {});
    loadKey("inbound_eta", online, { items: [] }).then((x) => alive && setInbound(x)).catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === "npay_delay" && load());
    const off2 = watchKeys(["npay_delay"], load, 20000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);

  const items = useMemo(() => (v?.items || []).filter((x) => ["new", "queued", "error", "elsewhere"].includes(x.status)).sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "")), [v]);
  const doneN = (v?.items || []).filter((x) => x.status === "done").length;
  if (!v || (!always && !items.length && !v.error)) return null;
  // 11/11 세원 배송지연 틀 — 네이버 문단 포함, (일정)=출고 예정 · (2주뒤)=새 발송기한 · (예상일자)=실제 예상일
  const base = detail || fillDelay(DELAY_TEMPLATE, { naver: true }).replace(/\(2주뒤\)|\(일정\)|\(예상일자\)/g, (m) => m);
  const whenOf = (x) => sched[x.id] ?? scheduleText(inbound, codeOf(x.product), x.option);
  const textOf = (x) => fillDelay(base, { when: whenOf(x), until: mdKo(dates[x.id] || x.newDeadline), expect: whenOf(x), naver: true });
  const busy =(x) => x.status === "queued" || x.status === "elsewhere"; // elsewhere = 다른 창이 직접 처리 중(11/10 테디)
  const picked = items.filter((x) => sel.has(x.id) && !busy(x));
  const soon = items.filter((x) => !busy(x) && dday(x.deadline) <= 1);
  const toggle = (id) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const go = async () => {
    if (!picked.length) return;
    if (picked.some((x) => !whenOf(x))) return window.alert("출고 예정(일정) 칸이 빈 줄이 있어요 — 채운 뒤 눌러 주세요.");
    if (picked.some((x) => textOf(x).length > 500)) return window.alert("상세사유가 500자를 넘는 줄이 있어요 — 틀을 줄여 주세요.");
    const lines = picked.map((x) => `${clean(x.product)} ${x.option} → 기한 ${md(dates[x.id] || x.newDeadline)} · 출고 예정 '${whenOf(x)}'`).join("\n");
    if (!window.confirm(`${picked.length}건 발송지연 처리할까요? (기한이 가까운 것만 골랐는지 봐 주세요)\n${lines}\n\n손님에게 아래 글이 보이고, 한 주문에 한 번만 돼요.\n\n${textOf(picked[0])}`)) return;
    const ids = picked.map((x) => x.id);
    await changeKey("npay_delay", online, (w) => ({
      ...w,
      items: (w.items || []).map((x) => (ids.includes(x.id) ? { ...x, status: "queued", newDeadline: dates[x.id] || x.newDeadline, detail: textOf(x), error: "", askedAt: new Date().toISOString() } : x)),
    }));
    await changeKey("cs_queue", online, (q) => ({ ...q, items: [...(q.items || []), { id: `npay-${Date.now()}`, kind: "npay_delay", ids, at: new Date().toISOString() }] }));
    setSel(new Set());
    setMsg(`${ids.length}건을 사무실 PC에 맡겼어요 — 네이버페이센터에서 처리하고 다시 읽어 확인해요(몇 분).`);
    loadKey("npay_delay", online, { items: [] }).then(setV);
  };
  const rescan = async () => {
    await changeKey("cs_queue", online, (q) => ({ ...q, items: [...(q.items || []).filter((j) => j.kind !== "npay_scan"), { id: "npay_scan", kind: "npay_scan", at: new Date().toISOString() }] }));
    setMsg("다시 읽기를 맡겼어요 — 1~2분 뒤 바뀌어요.");
  };

  return (
    <section className="rounded-2xl border border-green-200 bg-white">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 px-4 pt-3 pb-2 text-left">
        <Truck size={15} className="text-green-700" />
        <span className="text-sm font-bold text-stone-900">네이버페이 발송지연</span>
        <span className="text-xs text-stone-500">
          처리 안 한 {items.filter((x) => !busy(x)).length}건{soon.length ? ` · 기한 하루 안 ${soon.length}건` : ""}
          {doneN ? ` · 처리함 ${doneN}` : ""}
        </span>
        <span className="ml-auto text-[11px] text-stone-400">{v.at ? `${when(v.at)} 읽음` : ""}</span>
        <ChevronDown size={14} className={"text-stone-400 " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-3">
          {v.error && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">마지막 읽기 실패: {v.error}</p>}
          {msg && <p className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-700">{msg}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-stone-500">
                  <th className="py-1 pr-2">
                    <input type="checkbox" aria-label="기한 하루 안 모두 고르기" checked={soon.length > 0 && soon.every((x) => sel.has(x.id))} onChange={(e) => setSel(e.target.checked ? new Set(soon.map((x) => x.id)) : new Set())} className="accent-rose-700" />
                  </th>
                  <th className="py-1 pr-2">상품 · 색</th>
                  <th className="py-1 pr-2">손님</th>
                  <th className="py-1 pr-2">결제</th>
                  <th className="py-1 pr-2">발송기한</th>
                  <th className="py-1 pr-2">새 발송기한 (2주뒤)</th>
                  <th className="py-1 pr-2">출고 예정 (일정)</th>
                  <th className="py-1">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((x) => {
                  const d = dday(x.deadline);
                  return (
                    <tr key={x.id} className={busy(x) ? "opacity-60" : ""}>
                      <td className="py-1.5 pr-2">
                        <input type="checkbox" disabled={busy(x)} checked={sel.has(x.id)} onChange={() => toggle(x.id)} className="accent-rose-700" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium text-stone-900">{clean(x.product)}</span> <span className="text-stone-500">{x.option}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-stone-500">{x.buyer}</td>
                      <td className="py-1.5 pr-2 text-xs text-stone-500 tabular-nums">{(x.paidAt || "").slice(5, 10).replace(".", "/")}</td>
                      <td className={"py-1.5 pr-2 text-xs font-semibold tabular-nums " + (d < 0 ? "text-rose-700" : d <= 1 ? "text-amber-700" : "text-stone-600")}>
                        {md(x.deadline)} {d < 0 ? "지남" : d === 0 ? "오늘" : `D-${d}`}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="date" value={dates[x.id] || x.newDeadline || ""} disabled={busy(x)} onChange={(e) => setDates((s) => ({ ...s, [x.id]: e.target.value }))} className="rounded-lg border border-stone-200 px-1.5 py-0.5 text-xs" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={whenOf(x) || ""} disabled={busy(x)} onChange={(e) => setSched((s) => ({ ...s, [x.id]: e.target.value }))} placeholder="예: 다음 주 주중" className={"w-28 rounded-lg border px-1.5 py-0.5 text-xs " + (whenOf(x) ? "border-stone-200" : "border-amber-300 bg-amber-50")} />
                      </td>
                      <td className="py-1.5 text-xs">
                        {x.status === "elsewhere" ? <span className="text-stone-500" title={x.note}>다른 창이 처리 중</span> : x.status === "queued" ? <span className="text-sky-700">처리 중…</span> : x.status === "error" ? <span className="text-rose-700" title={x.error}>다시 확인</span> : <span className="text-stone-400">처리 전</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium text-stone-500">손님에게 보이는 상세사유 — 세원 틀(11/11). (일정)·(예상일자) = 줄의 '출고 예정', (2주뒤) = 새 발송기한으로 줄마다 채워요 · 500자까지 · 처리 뒤 못 고쳐요</span>
            <textarea value={base} onChange={(e) => setDetail(e.target.value)} rows={10} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-rose-600" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={rescan} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-500 hover:text-stone-800">
              <RefreshCw size={12} /> 지금 다시 읽기
            </button>
            <span className="text-[11px] text-stone-400">사유: 상품준비중 · 날짜는 결제일부터 90일 안</span>
            <button type="button" onClick={go} disabled={!picked.length || !base.trim()} className="ml-auto flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
              <Truck size={14} /> 고른 {picked.length}건 발송지연 처리
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
