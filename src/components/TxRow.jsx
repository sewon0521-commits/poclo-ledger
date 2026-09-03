import { Trash2, Check, Pencil } from "lucide-react";
import { won, derive } from "../lib/calc";
import { MethodChip } from "./ui";

/**
 * 거래 한 건. 일별 화면과 거래처별 화면이 같이 쓴다.
 * showVendor=false면 거래처명 대신 상품명을 앞세운다(이미 거래처별로 묶여 있으므로).
 */
export default function TxRow({ tx, showVendor = true, onToggleMethod, onToggleInvoice, onEdit, onDelete }) {
  const { vat } = derive(tx);
  const isTransfer = tx.method === "transfer";
  const title = showVendor ? tx.vendor : tx.items || "품목 없음";
  const sub = showVendor ? [tx.items, tx.memo].filter(Boolean).join(" · ") : tx.memo;

  return (
    <li className="flex items-center gap-2.5 px-3 py-3">
      <MethodChip method={tx.method} onClick={() => onToggleMethod(tx.id)} />

      <button type="button" onClick={() => onEdit(tx)} className="min-w-0 flex-1 text-left" title="눌러서 수정">
        <div className="flex items-center gap-1 truncate font-medium text-stone-900">
          <span className="truncate">{title}</span>
          <Pencil size={11} className="shrink-0 text-stone-300" />
        </div>
        {sub && <div className="truncate text-xs text-stone-400">{sub}</div>}
      </button>

      <div className="shrink-0 text-right">
        <div className="font-medium tabular-nums">{won(tx.supply)}</div>
        <div className={"text-xs tabular-nums " + (isTransfer ? "text-emerald-600" : "text-amber-600")}>
          {isTransfer ? "+부가세 " : "미증빙 "}
          {won(vat)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggleInvoice(tx.id)}
        title="세금계산서 수취"
        aria-pressed={tx.invoice}
        className={
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border " +
          (tx.invoice
            ? "border-rose-700 bg-rose-700 text-white"
            : "border-stone-300 bg-white text-transparent")
        }
      >
        <Check size={15} />
      </button>

      <button
        type="button"
        onClick={() => onDelete(tx)}
        aria-label="삭제"
        className="-mr-1 shrink-0 p-1 text-stone-300 hover:text-rose-600"
      >
        <Trash2 size={17} />
      </button>
    </li>
  );
}
