import { useState } from "react";
import { ChevronLeft, MapPin, Phone, Landmark, ReceiptText } from "lucide-react";
import { won, dayLabel, vendorHistory, INVOICE_THRESHOLD } from "../lib/calc";
import { Badge, Empty } from "./ui";
import TxRow from "./TxRow";

function InfoLine({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon size={14} className="mt-0.5 shrink-0 text-stone-400" />
      <span className="sr-only">{label}</span>
      <span className="min-w-0 break-words text-stone-600">{value}</span>
    </div>
  );
}

function VendorList({ vendors, selected, onSelect }) {
  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
      {vendors.map((v) => {
        const active = v.vendor === selected;
        return (
          <li key={v.vendor}>
            <button
              type="button"
              onClick={() => onSelect(v.vendor)}
              className={
                "flex w-full items-center gap-2 px-3 py-3 text-left transition " +
                (active ? "bg-rose-50" : "hover:bg-stone-50")
              }
            >
              {v.flag ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" aria-label="우선순위" />
              ) : (
                <span className="h-2 w-2 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={
                      "truncate font-medium " + (active ? "text-rose-900" : "text-stone-900")
                    }
                  >
                    {v.vendor}
                  </span>
                  {v.status === "mixed" && <Badge tone="amber">혼합</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-stone-400">
                  {v.count}건 · 계산서 {v.invoiceCount}/{v.count}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-700">
                {won(v.supply)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function VendorDetail({ vendor, rows, onBack, rowProps }) {
  const days = vendorHistory(rows, vendor.vendor);
  const hasInfo = vendor.address || vendor.phone || vendor.account || vendor.bizNo;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 -ml-1 flex items-center gap-1 text-sm text-stone-500 md:hidden"
      >
        <ChevronLeft size={16} /> 거래처 목록
      </button>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-stone-900">{vendor.vendor}</h3>
          {vendor.status === "mixed" && <Badge tone="amber">혼합</Badge>}
          {vendor.flag && <Badge tone="stone">계산서 챙길 곳</Badge>}
        </div>

        {hasInfo ? (
          <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
            <InfoLine icon={MapPin} label="위치" value={vendor.address} />
            <InfoLine icon={Phone} label="전화" value={vendor.phone} />
            <InfoLine icon={Landmark} label="계좌" value={vendor.account} />
            <InfoLine icon={ReceiptText} label="사업자번호" value={vendor.bizNo} />
          </div>
        ) : (
          <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-400">
            위치·전화·계좌는 장끼를 올리면 자동으로 채워져요. 거래를 눌러 직접 넣어도 됩니다.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-stone-100 pt-3 text-sm sm:grid-cols-4">
          {[
            ["총매입", won(vendor.supply), "text-stone-900"],
            ["이체(증빙)", vendor.transferSupply ? won(vendor.transferSupply) : "—", "text-emerald-700"],
            ["삼촌 대납(미증빙)", vendor.samchonSupply ? won(vendor.samchonSupply) : "—", "text-amber-700"],
            ["전환 +부가세", vendor.switchCost ? won(vendor.switchCost) : "—", "text-stone-600"],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className={"font-semibold tabular-nums " + tone}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 space-y-4">
        {days.map((d) => (
          <section key={d.date}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold text-stone-700">{dayLabel(d.date)}</h4>
              <span className="text-xs tabular-nums text-stone-400">{won(d.supply)}</span>
            </div>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {d.items.map((t) => (
                <TxRow key={t.id} tx={t} showVendor={false} {...rowProps} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function VendorView({ vendors, rows, taxType, emptyAction, ...rowProps }) {
  const [selected, setSelected] = useState(null);

  if (vendors.length === 0) {
    return (
      <Empty title="이 달 거래가 아직 없어요." hint="거래를 넣으면 거래처별로 묶어서 보여드려요.">
        {emptyAction}
      </Empty>
    );
  }

  // 목록이 바뀌어 선택한 거래처가 사라졌으면 데스크톱에서는 첫 거래처를 보여준다
  const current = vendors.find((v) => v.vendor === selected) || null;
  const desktopCurrent = current || vendors[0];
  const flagged = vendors.filter((v) => v.flag);

  return (
    <div>
      <div className="md:grid md:grid-cols-[minmax(200px,17rem)_1fr] md:items-start md:gap-4">
        {/* 모바일에서는 거래처를 고르면 목록이 내역으로 바뀐다 */}
        <div className={current ? "hidden md:block" : "block"}>
          <VendorList vendors={vendors} selected={desktopCurrent.vendor} onSelect={setSelected} />

          {flagged.length > 0 && (
            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-stone-500">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-rose-600" />
              <span>
                {taxType === "simple"
                  ? `총매입 ${won(INVOICE_THRESHOLD)} 이상인데 세금계산서가 덜 붙은 곳 — 간이 기간에는 여기부터 챙기면 돼요.`
                  : "세금계산서가 덜 붙은 곳 — 일반과세로 넘어가면 전부 챙기는 게 유리해요."}
                {` (${flagged.length}곳)`}
              </span>
            </p>
          )}
        </div>

        <div className={current ? "block" : "hidden md:block"}>
          <VendorDetail
            vendor={desktopCurrent}
            rows={rows}
            onBack={() => setSelected(null)}
            rowProps={rowProps}
          />
        </div>
      </div>
    </div>
  );
}
