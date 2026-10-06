import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Copy, Check, X, Loader2, RotateCcw, Info } from "lucide-react";
import { won } from "../lib/sales";
import { loadKey, changeKey, FIELD } from "../lib/shoot";
import { dayKey } from "../lib/journal";
import { fileToCsv, fileFromDrop } from "../lib/tabular";
import { parseOrder, findPrice, memoryKey, soLines, splitName, SO_TYPES } from "../lib/soOrder";

/**
 * 돈 › 매입 › SO+ 발주 변환 (lib/soOrder.js 머리말).
 * 이지어드민 발주 엑셀 → 줄마다 한 장 단가를 채워서 → SO+ '엑셀 붙여넣기' 칸 모양으로 복사.
 * 만들던 발주는 이 기기에 남는다(poclo_so_draft). 직접 고친 단가·매장명은 복사할 때 settings so_prices {prices, stores} 에 기억한다.
 */

const DRAFT = "poclo_so_draft";
const MEMORY = "so_prices";
const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
    if (!d?.rows) return d;
    // 10/6 전에 만든 발주 — 도매 상품명에 붙은 위치·매장을 뗀다
    return {
      ...d,
      rows: d.rows.map((r) => {
        if (r.rawName != null) return r;
        const sp = splitName(r.name);
        return { ...r, rawName: r.name, name: sp.name, place: sp.place, parsedStore: sp.store };
      }),
    };
  } catch {
    return null;
  }
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const FROM_TONE = {
  ledger: "text-emerald-700",
  pricing: "text-stone-500",
  memory: "text-sky-700",
};

function MissChip({ value, onChange }) {
  const opts = [
    ["yes", "미송 가능"],
    ["no", "미송 X"],
  ];
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-stone-200">
      {opts.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(value === k ? null : k)}
          className={
            "px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " +
            (value === k ? (k === "yes" ? "bg-stone-900 text-white" : "bg-rose-700 text-white") : "bg-white text-stone-400 hover:text-stone-700")
          }
        >
          {label}
        </button>
      ))}
    </span>
  );
}

export default function SoOrderPage({ tx, vendors, pricing, online }) {
  const [draft, setDraft] = useState(readDraft);
  const [memory, setMemory] = useState({});
  const [stores, setStores] = useState({}); // 제조사 → 지난번 적은 매장명
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState("");
  const [allMemo, setAllMemo] = useState("");
  const file = useRef(null);

  useEffect(() => {
    try {
      if (draft) localStorage.setItem(DRAFT, JSON.stringify(draft));
      else localStorage.removeItem(DRAFT);
    } catch {
      /* 이 기기에 못 남겨도 화면은 돈다 */
    }
  }, [draft]);

  const loadMemory = useCallback(async () => {
    try {
      const m = await loadKey(MEMORY, online, { prices: {} });
      setMemory(m.prices || {});
      setStores(m.stores || {});
    } catch {
      /* 기억한 단가 없이도 된다 */
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    loadMemory();
  }, [loadMemory]);

  // 매장명: 직접 고친 값 → 괄호 안 매장명(지난번에 고쳐 둔 이름이 있으면 그것, 키 '@괄호 이름') → 지난번 그 제조사에 적은 매장명 → 제조사
  const autoStore = useCallback((r) => (r.parsedStore ? stores["@" + r.parsedStore] || r.parsedStore : stores[r.vendor] || r.vendor), [stores]);
  const withStore = useMemo(() => (draft?.rows || []).map((r) => ({ ...r, store: r.storeEdit || autoStore(r) })), [draft?.rows, autoStore]);

  // 줄마다 찾은 단가 — 장끼·판매가 목록이 바뀌면 다시 찾는다(직접 고친 값은 그대로)
  const found = useMemo(() => {
    const src = { tx, vendors, pricing, memory };
    return Object.fromEntries(withStore.map((r) => [r.id, findPrice(r, src)]));
  }, [withStore, tx, vendors, pricing, memory]);

  const rows = useMemo(
    () =>
      withStore.map((r) => {
        const f = found[r.id] || {};
        const price = r.manual != null ? r.manual : f.price;
        return { ...r, price: price > 0 ? price : null, auto: f };
      }),
    [withStore, found],
  );

  const read = async (f) => {
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      const order = parseOrder(await fileToCsv(f));
      if (!order) throw new Error("이지어드민 발주 파일 모양이 아니에요 — '제조사 · 공급처상품명' 머리 줄을 못 찾았어요.");
      if (!order.rows.length) throw new Error("발주 줄이 하나도 없어요. 파일을 확인해 주세요.");
      setDraft({ ...order, file: f.name || "붙여넣은 표", at: new Date().toISOString(), type: "주문", rows: order.rows.map((r) => ({ ...r, miss: null, manual: null })) });
      setCopied("");
    } catch (e) {
      setMsg(e.message || "파일을 읽지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  // 표를 복사해 Ctrl+V 해도 된다 (이지어드민 화면·엑셀에서)
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!text.includes("\t") && !text.includes(",")) return;
      const order = parseOrder(text);
      if (!order?.rows.length) return;
      e.preventDefault();
      setDraft({ ...order, file: "붙여넣은 표", at: new Date().toISOString(), type: "주문", rows: order.rows.map((r) => ({ ...r, miss: null, manual: null })) });
      setCopied("");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const patchRow = (id, p) => setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  // 매장명을 고치면 같은 제조사·같은 매장으로 읽힌 다른 줄도 같이 (디벨롭 두 줄처럼)
  const setStore = (row, value) => {
    const v = value.trim();
    const before = autoStore(row);
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((x) =>
        x.id === row.id || (x.vendor === row.vendor && autoStore(x) === before && !x.storeEdit) ? { ...x, storeEdit: v && v !== autoStore(x) ? v : null } : x,
      ),
    }));
  };
  const allMiss = (v) => setDraft((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, miss: v })) }));

  const type = draft?.type || "주문";
  const lines = useMemo(() => soLines(rows, type), [rows, type]);
  const text = lines.join("\n");
  const pieces = rows.reduce((s, r) => s + r.qty, 0);
  const total = rows.reduce((s, r) => s + r.qty * (r.price || 0), 0);
  const noPrice = rows.filter((r) => !r.price);
  const noMiss = rows.filter((r) => !r.miss);
  const differ = rows.filter((r) => r.manual == null && r.auto?.alt);

  const copy = async () => {
    if (noMiss.length) return;
    const ok = await copyText(text);
    if (!ok) {
      setMsg("복사가 막혔어요. 아래 '복사되는 내용 보기'에서 직접 골라 복사해 주세요.");
      return;
    }
    const now = new Date();
    setCopied(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
    // 직접 적은 단가는 다음 발주 때 쓰게 기억 (장끼·판매가 목록에 없는 상품용)
    const mine = rows.filter((r) => r.manual > 0);
    // 매장명 기억 — 괄호에서 읽은 이름을 고쳤으면 '@괄호 이름' → 고친 이름, 제조사 → 매장명(다음 발주에 괄호가 없어도 그 매장으로)
    const named = {};
    for (const r of rows) {
      if (!r.store) continue;
      if (r.parsedStore && r.storeEdit) named["@" + r.parsedStore] = r.store;
      if (r.storeEdit || r.store !== r.vendor) named[r.vendor] = r.store;
    }
    const newNames = Object.entries(named).filter(([k, v]) => (stores[k] || (k.startsWith("@") ? k.slice(1) : k)) !== v);
    if (mine.length || newNames.length) {
      try {
        const next = await changeKey(
          MEMORY,
          online,
          (v) => ({
            ...v,
            prices: { ...(v.prices || {}), ...Object.fromEntries(mine.map((r) => [memoryKey(r), { price: r.manual, on: dayKey(), name: r.name, vendor: r.store }])) },
            stores: { ...(v.stores || {}), ...named },
          }),
          { prices: {} },
        );
        setMemory(next.prices || {});
        setStores(next.stores || {});
      } catch {
        /* 기억은 못 해도 복사는 됐다 */
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        read(fileFromDrop(e.dataTransfer));
      }}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">SO+ 발주 변환</h2>
          <p className="mt-0.5 text-sm text-stone-500">이지어드민 발주 엑셀을 넣으면 한 장 단가까지 채워서 SO+ '엑셀 붙여넣기' 칸 모양으로 복사해요. 수량 × 단가는 SO+ 가 곱해요.</p>
        </div>
        {draft && (
          <button
            type="button"
            onClick={() => window.confirm("지금 발주를 비우고 새로 넣을까요?") && setDraft(null)}
            className="flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:border-rose-300 hover:text-rose-800"
          >
            <RotateCcw size={14} /> 새 발주 넣기
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </div>
      )}

      {!draft ? (
        <button
          type="button"
          onClick={() => file.current?.click()}
          className={
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-14 text-center transition " +
            (drag ? "border-rose-400 bg-rose-50/60" : "border-stone-300 bg-white hover:border-rose-300")
          }
        >
          {busy ? <Loader2 size={28} className="animate-spin text-stone-400" /> : <FileSpreadsheet size={30} className="text-emerald-600" />}
          <span className="font-semibold text-stone-900">이지어드민 발주 엑셀 넣기</span>
          <span className="text-sm text-stone-500">끌어다 놓거나 눌러서 고르기 · request_stock_….xls · xlsx · csv · 표를 복사해 Ctrl+V 도 돼요</span>
        </button>
      ) : (
        <>
          {/* 발주 머리 */}
          <div className="mb-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-stone-900">{draft.title || draft.file}</div>
                <div className="text-xs text-stone-400">
                  {draft.on && `요청일 ${draft.on} · `}
                  {draft.file}
                </div>
              </div>
              <div className="text-right text-sm text-stone-600 tabular-nums">
                {lines.length}줄 · 총 {pieces}장 · 단가 합 <b className="text-stone-900">₩{won(total)}</b>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-stone-500">
                타입
                <select value={type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} className={FIELD + " w-auto py-1.5"}>
                  {SO_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <input value={allMemo} onChange={(e) => setAllMemo(e.target.value)} placeholder="메모 — 예: 색상 바뀌면 전화 주세요" className={FIELD + " min-w-0 flex-1 py-1.5"} />
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, memo: allMemo })) }))}
                  className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-stone-700 hover:border-rose-300"
                >
                  전체 적용
                </button>
              </span>
            </div>
          </div>

          {/* 줄 */}
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">매장명</th>
                  <th className="px-3 py-2 font-medium">도매처 상품명</th>
                  <th className="px-3 py-2 font-medium">색상</th>
                  <th className="px-3 py-2 text-right font-medium">수량</th>
                  <th className="px-3 py-2 font-medium">한 장 단가</th>
                  <th className="px-3 py-2 text-right font-medium">금액</th>
                  <th className="px-3 py-2 font-medium">
                    <div>미송</div>
                    <div className="mt-0.5 flex gap-1">
                      <button type="button" onClick={() => allMiss("yes")} className="rounded-full border border-stone-200 bg-white px-1.5 text-[10px] text-stone-600 hover:border-stone-400">
                        전부 가능
                      </button>
                      <button type="button" onClick={() => allMiss("no")} className="rounded-full border border-stone-200 bg-white px-1.5 text-[10px] text-stone-600 hover:border-stone-400">
                        전부 X
                      </button>
                    </div>
                  </th>
                  <th className="px-3 py-2 font-medium">메모</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => {
                  const f = r.auto || {};
                  const edited = r.manual != null;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2">
                        <input
                          key={r.store}
                          defaultValue={r.store}
                          onBlur={(e) => e.target.value.trim() !== r.store && setStore(r, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          aria-label={`${r.name} 매장명`}
                          title="SO+ 에 들어갈 매장명 — 고치면 같은 제조사 줄도 같이 바뀌어요"
                          className={
                            "w-32 rounded-lg border px-2 py-1 font-medium text-stone-900 outline-none focus:border-rose-600 " +
                            (r.storeEdit ? "border-rose-300 bg-rose-50/50" : "border-stone-200 bg-white")
                          }
                        />
                        <div className="mt-0.5 max-w-[8rem] text-[11px] leading-tight text-stone-400">
                          {r.place && <div className="truncate">{r.place}</div>}
                          {r.store !== r.vendor && <div className="truncate">제조사 {r.vendor}</div>}
                        </div>
                      </td>
                      <td className="max-w-[15rem] px-3 py-2">
                        <div className="font-medium text-stone-900">{r.name}</div>
                        {r.shopName && <div className="truncate text-xs text-stone-400">{r.shopName}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-stone-700">{r.option}</td>
                      <td className="px-3 py-2 text-right">
                        {/* 10/6 세원: "수량도 변경 가능하게" — 칸을 벗어나거나 엔터에 적용, 1 아래로는 안 내려간다(줄을 빼려면 ×) */}
                        <input
                          key={r.qty}
                          defaultValue={r.qty}
                          inputMode="numeric"
                          onBlur={(e) => {
                            const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
                            if (!n || n < 1) {
                              e.target.value = String(r.qty);
                              return;
                            }
                            if (n !== r.qty) patchRow(r.id, { qty: n, qtyFrom: r.qtyFrom ?? r.qty });
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          aria-label={`${r.name} 수량`}
                          className={
                            "w-14 rounded-lg border px-2 py-1 text-right text-stone-900 tabular-nums outline-none focus:border-rose-600 " +
                            (r.qtyFrom != null && r.qtyFrom !== r.qty ? "border-rose-300 bg-rose-50/50" : "border-stone-200 bg-white")
                          }
                        />
                        {r.qtyFrom != null && r.qtyFrom !== r.qty && (
                          <button type="button" onClick={() => patchRow(r.id, { qty: r.qtyFrom, qtyFrom: null })} title="원래 수량으로" className="mt-0.5 block w-full text-right text-[11px] text-stone-400 underline decoration-dotted">
                            원래 {r.qtyFrom}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.price ? String(r.price) : ""}
                          inputMode="numeric"
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, "");
                            patchRow(r.id, { manual: v ? Number(v) : null });
                          }}
                          placeholder="단가"
                          aria-label={`${r.store} ${r.name} 한 장 단가`}
                          className={
                            "w-24 rounded-lg border px-2 py-1 text-right tabular-nums outline-none focus:border-rose-600 " +
                            (r.price ? "border-stone-300 bg-white" : "border-amber-400 bg-amber-50")
                          }
                        />
                        <div className="mt-0.5 text-[11px] leading-tight">
                          {edited ? (
                            <span className="text-rose-700">
                              직접 적음
                              {f.price > 0 && f.price !== r.manual && (
                                <button type="button" onClick={() => patchRow(r.id, { manual: null })} className="ml-1 underline decoration-dotted">
                                  찾은 값 {won(f.price)}
                                </button>
                              )}
                            </span>
                          ) : f.note ? (
                            <span className={FROM_TONE[f.from] || "text-stone-500"}>{f.note}</span>
                          ) : (
                            <span className="text-amber-700">못 찾음 — 적어 주세요</span>
                          )}
                          {!edited && f.alt && <div className="text-amber-700">{f.alt}</div>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-stone-500 tabular-nums">{r.price ? won(r.price * r.qty) : ""}</td>
                      <td className="px-3 py-2">
                        <MissChip value={r.miss} onChange={(v) => patchRow(r.id, { miss: v })} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={r.memo || ""} onChange={(e) => patchRow(r.id, { memo: e.target.value })} className="w-32 rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-rose-600" />
                      </td>
                      <td className="py-2 pr-2">
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, rows: d.rows.filter((x) => x.id !== r.id) }))} aria-label="이 줄 빼기" className="p-1 text-stone-300 hover:text-rose-700">
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-stone-400">
            <Info size={12} className="mt-px shrink-0" />
            단가는 같은 거래처 장끼의 가장 최근 단가(초록) → 판매가 목록 공급가 → 지난번 여기서 직접 적은 값 순으로 찾아요. 칸을 고치면 그 값으로, 비우면 다시 찾은 값으로.
          </p>

          {/* 복사 */}
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 text-sm">
                <div className="font-semibold text-stone-900">
                  SO+ 에 붙여넣기 · {lines.length}줄 · 총 {pieces}장
                </div>
                {noMiss.length > 0 && <div className="text-amber-700">미송을 아직 안 고른 줄 {noMiss.length}개 — 표 머리 '전부 가능 / 전부 X' 또는 줄마다 골라 주세요.</div>}
                {noPrice.length > 0 && <div className="text-amber-700">단가가 빈 줄 {noPrice.length}개 — 비운 채 복사하면 SO+ 에서 따로 넣어야 해요.</div>}
                {differ.length > 0 && <div className="text-stone-500">장끼 단가와 판매가 목록 공급가가 다른 상품 {differ.length}개 — 장끼(실제로 낸 값)로 넣었어요.</div>}
                {copied && (
                  <div className="flex items-center gap-1 text-emerald-700">
                    <Check size={14} /> {copied} 복사했어요 — SO+ › 엑셀 사입 관리 › 엑셀 붙여넣기 칸에 Ctrl+V → '변환'
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!!noMiss.length || !lines.length}
                onClick={copy}
                className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-5 py-2.5 font-semibold text-white disabled:bg-stone-300"
              >
                <Copy size={16} /> SO+ 모양으로 복사
              </button>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-stone-500">복사되는 내용 보기</summary>
              <textarea readOnly value={text} rows={Math.min(14, lines.length + 1)} className="mt-2 w-full rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-[11px] leading-5 text-stone-700" />
              <p className="mt-1 text-[11px] text-stone-400">
                열 순서: 매장명 · 타입 · 제품명(도매) · 색상 · 사이즈 · 수량 · 개당단가 · 메모 · 사진링크 · 코드 — 넥스트팩 변환기 때 SO+ 에 맞춰 둔 그대로예요. 제품명 뒤에 붙어 있던 '(위치 / 매장)'은 떼고 매장명 칸으로 옮겼어요. 같은 매장·상품·색상 줄은 수량을 합쳐요.
              </p>
            </details>
          </div>
        </>
      )}
      <input
        ref={file}
        type="file"
        accept=".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          read(f);
        }}
      />
      {draft && (
        <p className="mt-3 text-center text-[11px] text-stone-400">
          다른 발주는 이 화면 아무 데나 파일을 끌어다 놓아도 돼요 ·{" "}
          <button type="button" onClick={() => file.current?.click()} className="underline decoration-dotted">
            파일 고르기
          </button>
        </p>
      )}
    </div>
  );
}

