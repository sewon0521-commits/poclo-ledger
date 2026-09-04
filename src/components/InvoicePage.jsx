import { useMemo, useState } from "react";
import { Check, Copy, Share2, Send, Phone } from "lucide-react";
import {
  won,
  VAT_RATE,
  rangeOf,
  rangeLabel,
  filterRange,
  summarizeVendors,
  totals as sumTotals,
} from "../lib/calc";
import { Empty } from "./ui";
import DateRange from "./DateRange";
import { requestMessage } from "../lib/message";

function VendorRow({ v, checked, onToggle, onRequest }) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={`${v.name} 고르기`}
        className={
          "flex h-6 w-6 shrink-0 items-center justify-center rounded border " +
          (checked ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white text-transparent")
        }
      >
        <Check size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-stone-900">{v.name}</div>
        <div className="mt-0.5 text-xs text-stone-400">
          장끼 {v.count}건 · 계산서 {v.invoiceCount}/{v.count}
          {v.phone && ` · ${v.phone}`}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums text-stone-900">
          {won(v.unpaidVatSupply + v.switchCost)}
        </div>
        <div className="text-xs tabular-nums text-stone-400">
          공급가 {won(v.unpaidVatSupply)} + 부가세 {won(v.switchCost)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRequest(v)}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-700 px-2.5 py-2 text-xs font-medium text-white hover:bg-rose-800"
      >
        <Send size={13} /> 요청
      </button>
    </li>
  );
}

/**
 * 세금계산서 대조 — 부가세를 안 낸 거래처를 모아서 보여주고,
 * 고른 곳들의 추가 부가세 합계를 알려준다. 요청 문구도 만들어 준다.
 *
 * 홈택스에서 실제 발행 내역을 자동으로 가져오는 것은 아직 안 한다(TODO.md 참고).
 * 지금은 앱에 기록한 '계산서 받음' 체크가 기준이다.
 */
export default function InvoicePage({ vendors, rows, onRequestMessage }) {
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState(rangeOf("month"));
  const [picked, setPicked] = useState(() => new Set());

  const range = preset === "custom" ? custom : rangeOf(preset);
  const inside = useMemo(() => filterRange(rows, range), [rows, range]);
  const t = useMemo(() => sumTotals(inside), [inside]);

  const pending = useMemo(
    () =>
      summarizeVendors(inside, vendors, "general")
        .filter((v) => v.count > 0 && v.unpaidVatSupply > 0)
        .sort((a, b) => b.unpaidVatSupply - a.unpaidVatSupply),
    [inside, vendors],
  );

  const chosen = pending.filter((v) => picked.has(v.id));
  const chosenSupply = chosen.reduce((s, v) => s + v.unpaidVatSupply, 0);
  const chosenVat = chosenSupply * VAT_RATE;

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPicked = pending.length > 0 && chosen.length === pending.length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">세금계산서 대조</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          부가세를 아직 안 낸 거래를 모아서 보여줘요. 고른 곳의 추가 부가세를 합쳐서 알려줍니다.
        </p>
      </div>

      <DateRange
        preset={preset}
        custom={custom}
        onChange={({ preset: p, custom: c }) => {
          setPreset(p);
          setCustom(c);
          setPicked(new Set());
        }}
      />
      <p className="mt-1.5 text-xs text-stone-400">{rangeLabel(range)}</p>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ["총매입 (공급가)", won(t.supply), "text-stone-900"],
          ["부가세 낸 매입", won(t.supply - t.unpaid), "text-emerald-700"],
          ["부가세 안 낸 매입", won(t.unpaid), "text-amber-700"],
          ["더 낼 부가세", won(t.switchCost), "text-rose-700"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-xs text-stone-500">{label}</div>
            <div className={"mt-0.5 font-semibold tabular-nums " + tone}>{value}</div>
          </div>
        ))}
      </div>

      {pending.length === 0 ? (
        <div className="mt-4">
          <Empty
            title="이 기간에 부가세 안 낸 거래가 없어요."
            hint="다른 기간을 고르거나, 장부에서 결제방식을 확인해 보세요."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-stone-900">
              계산서 받을 곳 <span className="text-stone-400">{pending.length}곳</span>
            </h3>
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(pending.map((v) => v.id)))}
              className="text-sm font-medium text-rose-700"
            >
              {allPicked ? "선택 해제" : "전부 고르기"}
            </button>
          </div>

          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {pending.map((v) => (
              <VendorRow
                key={v.id}
                v={v}
                checked={picked.has(v.id)}
                onToggle={() => toggle(v.id)}
                onRequest={(vendor) =>
                  onRequestMessage(
                    vendor,
                    requestMessage(vendor, range, vendor.unpaidVatSupply, vendor.count),
                  )
                }
              />
            ))}
          </ul>

          {chosen.length > 0 && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-semibold text-rose-800">
                고른 {chosen.length}곳을 계산서로 돌리면
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-2xl font-bold tabular-nums text-rose-900">
                  {won(chosenVat)}
                </span>
                <span className="text-sm text-rose-700">를 더 내야 해요</span>
              </div>
              <div className="mt-1 text-xs tabular-nums text-rose-700">
                공급가 {won(chosenSupply)} · 합계 {won(chosenSupply + chosenVat)}
              </div>
              <button
                type="button"
                onClick={() =>
                  onRequestMessage(
                    { name: `${chosen.length}곳` },
                    chosen
                      .map((v) => requestMessage(v, range, v.unpaidVatSupply, v.count))
                      .join("\n\n──────────\n\n"),
                  )
                }
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white hover:bg-rose-800"
              >
                <Send size={16} /> 고른 곳 요청 문구 만들기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 만들어진 요청 문구를 보여주고 복사·공유하게 하는 창 내용 */
export function RequestMessage({ vendor, text, onClose }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex max-h-[90vh] flex-col">
      <header className="shrink-0 border-b border-stone-200 px-4 py-3.5">
        <h2 id="tx-form-title" className="font-semibold text-stone-900">
          {vendor.name} 계산서 요청
        </h2>
        <p className="mt-0.5 text-xs text-stone-500">
          복사해서 카톡에 붙여넣으세요. 문구는 고쳐 쓰셔도 됩니다.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {vendor.phone && (
          <p className="mb-2 flex items-center gap-1.5 text-sm text-stone-500">
            <Phone size={14} /> {vendor.phone}
          </p>
        )}
        <pre className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-700">
          {text}
        </pre>
      </div>

      <footer className="flex shrink-0 gap-2 border-t border-stone-200 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-600 hover:bg-stone-100"
        >
          닫기
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => navigator.share({ text }).catch(() => {})}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-4 py-3 font-medium text-stone-700"
          >
            <Share2 size={16} /> 보내기
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white hover:bg-rose-800"
        >
          <Copy size={16} /> {copied ? "복사했어요" : "복사하기"}
        </button>
      </footer>
    </div>
  );
}
