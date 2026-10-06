import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Pencil, Trash2, Loader2, Search, ChevronRight } from "lucide-react";
import { won } from "../lib/sales";
import { dayLabel } from "../lib/calc";
import { loadKey } from "../lib/shoot";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * SO+ 발주 변환 › 저장한 발주 (10/6 세원: "다 끝나면 날짜별로 저장할 수 있게").
 * 목록 = settings 'so_orders' {items:[{id, on, title, lines, pieces, total, stores, savedAt}]} (가벼운 요약),
 * 한 발주 = settings 'so_order_<id>' {…, text(복사 글 그대로), rows} — 열 때만 읽는다(목록이 커져도 가볍게).
 */

const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");

function Detail({ item, online, onClose, onLoad, onDelete, copyText }) {
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    loadKey(`so_order_${item.id}`, online, {})
      .then((r) => alive && (r?.rows ? setRec(r) : setErr("이 발주 내용을 못 찾았어요. 지워졌을 수 있어요.")))
      .catch(() => alive && setErr("불러오지 못했어요. 인터넷을 확인해 주세요."));
    return () => {
      alive = false;
    };
  }, [item.id, online]);
  const rows = rec?.rows || [];
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={`${dayLabel(item.on)} · ${item.title || "발주"}`} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {err ? (
          <p className="py-8 text-center text-sm text-rose-700">{err}</p>
        ) : !rec ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-stone-400">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중…
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-stone-600 tabular-nums">
                {rec.type || "주문"} · {rec.lines}줄 · 총 {rec.pieces}장 · 단가 합 <b className="text-stone-900">₩{won(rec.total)}</b>
                {rec.reqOn && rec.reqOn !== rec.on && <span className="text-stone-400"> · 요청일 {rec.reqOn}</span>}
              </span>
              <span className="text-xs text-stone-400">{hhmm(rec.savedAt)} 저장 · {rec.file}</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">매장명</th>
                    <th className="px-3 py-2 font-medium">도매처 상품명</th>
                    <th className="px-3 py-2 font-medium">색상</th>
                    <th className="px-3 py-2 text-right font-medium">수량</th>
                    <th className="px-3 py-2 text-right font-medium">단가</th>
                    <th className="px-3 py-2 text-right font-medium">금액</th>
                    <th className="px-3 py-2 font-medium">미송</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-stone-900">{r.store || r.vendor}</div>
                        {r.addr && <div className="text-[11px] text-stone-400">{r.addr}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-stone-900">{r.name}</div>
                        {r.memo && <div className="text-[11px] text-stone-500">메모 {r.memo}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-stone-700">{r.option}</td>
                      <td className="px-3 py-2 text-right text-stone-900 tabular-nums">{r.qty}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-stone-900 tabular-nums">{r.price ? won(r.price) : <span className="text-amber-700">없음</span>}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-stone-500 tabular-nums">{r.price ? won(r.price * r.qty) : ""}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{r.miss === "no" ? <span className="text-rose-700">미송 X</span> : r.miss === "yes" ? "미송 가능" : <span className="text-stone-400">안 고름</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <button
          type="button"
          onClick={() => window.confirm(`${dayLabel(item.on)} '${item.title || "발주"}' 저장을 지울까요?`) && onDelete(item.id)}
          className="flex items-center gap-1 text-sm text-stone-400 hover:text-rose-700"
        >
          <Trash2 size={14} /> 지우기
        </button>
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!rec}
            onClick={() => onLoad(rec)}
            className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 hover:border-rose-300 disabled:opacity-50"
          >
            <Pencil size={14} /> 불러와서 고치기
          </button>
          <button
            type="button"
            disabled={!rec?.text}
            onClick={async () => setCopied(await copyText(rec.text))}
            className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "복사했어요" : "SO+ 모양으로 다시 복사"}
          </button>
        </span>
      </footer>
    </Sheet>
  );
}

export default function SoSaved({ items, loaded, online, onLoad, onDelete, copyText }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const groups = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = items
      .filter((x) => !n || [x.title, ...(x.stores || [])].join(" ").toLowerCase().includes(n))
      .sort((a, b) => String(b.on).localeCompare(String(a.on)) || String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    const out = [];
    for (const x of list) {
      const g = out.find((y) => y.on === x.on);
      if (g) g.list.push(x);
      else out.push({ on: x.on, list: [x] });
    }
    return out;
  }, [items, q]);

  if (!loaded)
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-stone-400">
        <Loader2 size={16} className="animate-spin" /> 불러오는 중…
      </p>
    );
  if (!items.length)
    return <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-12 text-center text-sm text-stone-500">아직 저장한 발주가 없어요. 발주를 만들고 '저장'(또는 복사)하면 날짜별로 여기 모여요.</p>;

  return (
    <div>
      <div className="relative mb-3 w-full sm:w-72">
        <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="전표명·매장 찾기" className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pr-2 pl-8 text-sm" />
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.on}>
            <h3 className="mb-1.5 text-sm font-semibold text-stone-700">{dayLabel(g.on)}</h3>
            <ul className="space-y-1.5">
              {g.list.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setOpen(x)} className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left hover:border-rose-300">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-900">{x.title || "발주"}</span>
                      <span className="block truncate text-xs text-stone-400">
                        {(x.stores || []).slice(0, 4).join(" · ")}
                        {(x.stores || []).length > 4 && ` 외 ${x.stores.length - 4}곳`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm text-stone-600 tabular-nums">
                      <span className="block">
                        {x.lines}줄 · {x.pieces}장
                      </span>
                      <span className="block font-semibold text-stone-900">₩{won(x.total)}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-stone-300" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {open && (
        <Detail
          item={open}
          online={online}
          copyText={copyText}
          onClose={() => setOpen(null)}
          onLoad={(rec) => {
            setOpen(null);
            onLoad(rec);
          }}
          onDelete={(id) => {
            setOpen(null);
            onDelete(id);
          }}
        />
      )}
    </div>
  );
}
