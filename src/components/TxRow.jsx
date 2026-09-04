import { Trash2, Check, Pencil, ImageOff, Clock } from "lucide-react";
import { won, derive, hasPending } from "../lib/calc";
import { MethodChip } from "./ui";

/**
 * 거래 한 건. 일별 화면과 거래처 화면이 같이 쓴다.
 * showVendor=false면 거래처명 대신 품목을 앞세운다(이미 거래처별로 묶여 있으므로).
 */
export default function TxRow({
  tx,
  vendorName,
  showVendor = true,
  onToggleMethod,
  onToggleInvoice,
  onEdit,
  onDelete,
}) {
  const { vat, paidVat } = derive(tx);
  const vatIsPaid = paidVat > 0;
  const itemNames = (tx.items || []).map((i) => i.name).filter(Boolean).join(", ");
  const title = showVendor ? vendorName || "(거래처 없음)" : itemNames || "품목 없음";
  const sub = showVendor ? [itemNames, tx.memo].filter(Boolean).join(" · ") : tx.memo;

  return (
    <li className="flex items-center gap-2.5 px-3 py-3">
      <MethodChip tx={tx} onClick={() => onToggleMethod(tx.id)} />

      <button type="button" onClick={() => onEdit(tx)} className="min-w-0 flex-1 text-left" title="눌러서 수정">
        <div className="flex items-center gap-1 truncate font-medium text-stone-900">
          <span className="truncate">{title}</span>
          <Pencil size={11} className="shrink-0 text-stone-300" />
          {!tx.hasPhoto && <ImageOff size={12} className="shrink-0 text-stone-300" title="장끼 없음" />}
          {hasPending(tx) && <Clock size={12} className="shrink-0 text-amber-500" title="미송 있음" />}
        </div>
        {sub && <div className="truncate text-xs text-stone-400">{sub}</div>}
      </button>

      <div className="shrink-0 text-right">
        <div className="font-medium tabular-nums">{won(tx.supply)}</div>
        <div className={"text-xs tabular-nums " + (vatIsPaid ? "text-emerald-600" : "text-amber-600")}>
          {vatIsPaid ? "+부가세 " : "미납 부가세 "}
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
