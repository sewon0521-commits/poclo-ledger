import { useMemo, useState } from "react";
import { ChevronLeft, MapPin, Phone, Landmark, ReceiptText, Pencil } from "lucide-react";
import {
  won,
  dayLabel,
  groupByDay,
  filterRange,
  rangeOf,
  rangeLabel,
  totals as sumTotals,
} from "../lib/calc";
import { Badge } from "./ui";
import TxRow from "./TxRow";
import DateRange from "./DateRange";

function InfoLine({ icon: Icon, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon size={14} className="mt-0.5 shrink-0 text-stone-400" />
      <span className="min-w-0 break-words text-stone-600">{value}</span>
    </div>
  );
}

/** 거래처 하나 — 정보 + 기간 선택 + 그 기간의 날짜별 거래내역(공급가 기준) */
export default function VendorDetail({ vendor, rows, onBack, onEditVendor, rowProps }) {
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState(rangeOf("month"));

  const range = preset === "custom" ? custom : rangeOf(preset);
  const mine = useMemo(() => rows.filter((t) => t.vendorId === vendor.id), [rows, vendor.id]);
  const inside = useMemo(() => filterRange(mine, range), [mine, range]);
  const days = useMemo(() => groupByDay(inside), [inside]);
  const t = useMemo(() => sumTotals(inside), [inside]);

  const accounts = vendor.accounts || [];

  return (
    <div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 -ml-1 flex items-center gap-1 text-sm text-stone-500"
        >
          <ChevronLeft size={16} /> 거래처 목록
        </button>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-stone-900">{vendor.name}</h3>
          {vendor.status === "mixed" && <Badge tone="amber">혼합</Badge>}
          {vendor.flag && <Badge tone="stone">계산서 챙길 곳</Badge>}
          {onEditVendor && (
            <button
              type="button"
              onClick={() => onEditVendor(vendor)}
              className="ml-auto flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
            >
              <Pencil size={14} /> 정보 수정
            </button>
          )}
        </div>

        {vendor.address || vendor.phone || vendor.bizNo || accounts.length ? (
          <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
            <InfoLine icon={MapPin} value={vendor.address} />
            <InfoLine icon={Phone} value={vendor.phone} />
            {accounts.map((a) => (
              <InfoLine
                key={a.id}
                icon={Landmark}
                value={[a.bank, a.number, a.holder].filter(Boolean).join(" ")}
              />
            ))}
            <InfoLine icon={ReceiptText} value={vendor.bizNo} />
          </div>
        ) : (
          <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-400">
            위치·전화·계좌는 장끼를 올리면 자동으로 채워져요.
          </p>
        )}
      </div>

      <div className="mt-4">
        <DateRange
          preset={preset}
          custom={custom}
          onChange={({ preset: p, custom: c }) => {
            setPreset(p);
            setCustom(c);
          }}
          size="sm"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ["거래액 (공급가)", won(t.supply), "text-stone-900"],
          ["이체(증빙)", won(t.supply - t.samchon), "text-emerald-700"],
          ["삼촌 대납(미증빙)", won(t.samchon), "text-amber-700"],
          ["전환 +부가세", won(t.switchCost), "text-stone-600"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-xs text-stone-500">{label}</div>
            <div className={"mt-0.5 font-semibold tabular-nums " + tone}>{value}</div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-stone-400">
        {rangeLabel(range)} · {t.count}건 · 세금계산서 {t.invoiced}/{t.count}
      </p>

      <div className="mt-4 space-y-4">
        {days.map((d) => (
          <section key={d.date}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold text-stone-700">{dayLabel(d.date)}</h4>
              <span className="text-xs tabular-nums text-stone-400">{won(d.supply)}</span>
            </div>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {d.items.map((tx) => (
                <TxRow key={tx.id} tx={tx} showVendor={false} {...rowProps} />
              ))}
            </ul>
          </section>
        ))}
        {days.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-400">
            이 기간에 거래가 없어요.
          </p>
        )}
      </div>
    </div>
  );
}
