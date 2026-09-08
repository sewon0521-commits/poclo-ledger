import { useMemo, useRef, useState } from "react";
import {
  X, Check, Plus, Trash2, ChevronDown, ChevronUp, Camera, ImageOff, Clock, Wallet,
} from "lucide-react";
import { won, VAT_RATE, itemsTotal, MODES, KIND_TONE, kindOf, nextKind } from "../lib/calc";
import { makeAccount, makeItem } from "../lib/store";
import { pendingOf, balanceBefore, balanceText } from "../lib/pending";
import VendorPicker from "./VendorPicker";

const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
const comma = (s) => {
  const d = digits(s);
  return d ? Number(d).toLocaleString("ko-KR") : "";
};
const numOf = (s) => Number(digits(s) || 0);

/** 수량용 — 마이너스를 허용한다(반품·교환) */
const intOf = (s) => {
  const cleaned = String(s ?? "").replace(/[^0-9-]/g, "");
  const neg = cleaned.startsWith("-");
  const n = Number(cleaned.replace(/-/g, "") || 0);
  return neg ? -n : n;
};

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

/** 품목 줄용 — 한 줄에 들어가야 해서 낮고 좁다 */
const COMPACT =
  "rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-rose-600";

function Money({ value, onChange, className = "", compact = false, ...rest }) {
  return (
    <input
      value={comma(value)}
      onChange={(e) => onChange(digits(e.target.value))}
      inputMode="numeric"
      className={(compact ? COMPACT : FIELD) + " text-right tabular-nums " + className}
      {...rest}
    />
  );
}

/**
 * 수량 — 화살표로 1씩 올리고 내린다.
 * 마이너스를 허용한다. 반품·교환은 수량이 빠지는 일이므로 음수로 적는다.
 *
 * 화살표는 높이를 고정하지 않고 입력칸을 따라 늘어난다(flex-1). 그래야 글꼴이나
 * 여백이 바뀌어도 칸과 어긋나지 않는다.
 */
function Qty({ value, onChange }) {
  const arrow =
    "flex flex-1 w-5 items-center justify-center border-l-0 border-stone-300 bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-200";
  return (
    <div className="flex shrink-0 items-stretch">
      <input
        value={value}
        onChange={(e) => onChange(intOf(e.target.value))}
        inputMode="numeric"
        aria-label="수량"
        className={COMPACT + " w-11 rounded-r-none text-center tabular-nums"}
      />
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onChange((Number(value) || 0) + 1)}
          aria-label="수량 1 올리기"
          className={arrow + " rounded-tr-md border border-b-0"}
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          onClick={() => onChange((Number(value) || 0) - 1)}
          aria-label="수량 1 내리기"
          className={arrow + " rounded-br-md border"}
        >
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}

/**
 * 거래 추가/수정 폼.
 *
 * 장부 금액은 품목 합계가 아니라 '당일합계'다(에누리 등으로 둘이 다를 수 있다).
 * 품목 합계는 참고용으로만 보여주고, 사장님이 당일합계를 직접 고치기 전까지는
 * 품목 합계를 따라간다.
 *
 * 결제방식은 장끼로 알 수 없으므로 기본값 없이 반드시 고르게 한다.
 * 호출부가 key={seed._k}로 다시 마운트시키므로 초기값만 잡으면 된다.
 */
export default function TxForm({ seed, vendors, allTx = [], onSubmit, onCancel }) {
  const [vendorId, setVendorId] = useState(seed.vendorId || "");
  const [newVendorName, setNewVendorName] = useState(seed.newVendorName || "");
  const [date, setDate] = useState(seed.date || "");
  const [items, setItems] = useState(
    seed.items?.length ? seed.items.map(makeItem) : [makeItem()],
  );
  const [supply, setSupply] = useState(seed.supply ? String(seed.supply) : "");
  const [supplyTouched, setSupplyTouched] = useState(!!seed.supply);
  // 실제로 건넨 돈. 안 적으면 당일합계와 같다고 본다.
  const [cash, setCash] = useState(
    seed.cashPaid === null || seed.cashPaid === undefined ? "" : String(seed.cashPaid),
  );
  const [cashTouched, setCashTouched] = useState(
    seed.cashPaid !== null && seed.cashPaid !== undefined,
  );
  const [creditAdd, setCreditAdd] = useState(seed.creditAdd ? String(seed.creditAdd) : "");
  const [creditUse, setCreditUse] = useState(seed.creditUse ? String(seed.creditUse) : "");
  const [creditExpiry, setCreditExpiry] = useState(seed.creditExpiry || "");
  const [creditNote, setCreditNote] = useState(seed.creditNote || "");
  const [openCredit, setOpenCredit] = useState(
    !!(seed.creditAdd || seed.creditUse || seed.creditExpiry),
  );
  const [method, setMethod] = useState(seed.method || null);
  const [vatPaid, setVatPaid] = useState(seed.method === "transfer" ? seed.vatPaid !== false : false);
  const [invoice, setInvoice] = useState(!!seed.invoice);
  const [memo, setMemo] = useState(seed.memo || "");
  const [accountId, setAccountId] = useState(seed.accountId || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(seed.photoUrl || "");
  const photoRef = useRef(null);

  // 거래처 정보 — 고른 거래처에 반영된다
  const picked = vendors.find((v) => v.id === vendorId) || null;
  const [address, setAddress] = useState(seed.address ?? picked?.address ?? "");
  const [phone, setPhone] = useState(seed.phone ?? picked?.phone ?? "");
  const [bizNo, setBizNo] = useState(seed.bizNo ?? picked?.bizNo ?? "");
  const [accounts, setAccounts] = useState(() => {
    const base = seed.accounts?.length ? seed.accounts : picked?.accounts || [];
    return base.length ? base.map(makeAccount) : [];
  });
  const [openInfo, setOpenInfo] = useState(!!(seed.address || seed.phone || seed.bizNo));

  const mode = method ? MODES.find((m) => m.method === method && m.vatPaid === vatPaid) : null;
  const itemSum = useMemo(() => itemsTotal(items), [items]);
  const amount = supplyTouched ? numOf(supply) : itemSum;
  const cashAmount = cashTouched ? numOf(cash) : amount;

  // 이 거래처에 아직 남아 있는 미송 — 장끼를 넣는 자리에서 바로 보이게
  const vendorNameOf = (id) => vendors.find((v) => v.id === id)?.name || "";
  const openPending = useMemo(
    () => (vendorId ? pendingOf(allTx, vendorId, vendorNameOf) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTx, vendorId, vendors],
  );

  // 전잔 → 당잔. 잔액 = 낸 돈 − 살 돈 (양수면 우리가 더 낸 것)
  const before = useMemo(
    () => balanceBefore(allTx, vendorId, date, seed.id),
    [allTx, vendorId, date, seed.id],
  );
  const after = before + cashAmount - amount;
  // 동대문은 천원 단위로 맞춰 주고받는다. 천원을 넘게 어긋나면 적은 값이 틀렸을 가능성이 크다.
  const balanceOdd = Math.abs(after) >= 1000;
  const filledAccounts = accounts.filter((a) => a.number.trim());

  // 계좌가 하나뿐이면 고를 것도 없이 그것이 송금 계좌다
  const effectiveAccountId =
    filledAccounts.length === 1 ? filledAccounts[0].id : accountId;

  // 미송 출고분만 받은 날은 낼 돈이 0원이다. 그런 장끼도 남겨야 하므로
  // 금액과 결제방식을 강요하지 않는다 — 0원에는 부가세도 없다.
  const onlyPrepaid =
    amount === 0 && items.some((i) => i.kind === "pendingOut" && (i.name.trim() || i.qty));

  const [touched, setTouched] = useState(false);
  const missing = [];
  if (!vendorId && !newVendorName.trim()) missing.push("거래처");
  if (!amount && !onlyPrepaid) missing.push("금액");
  if (!date) missing.push("날짜");
  if (!method && !onlyPrepaid) missing.push("결제방식");

  const patchItem = (id, patch) =>
    setItems((list) =>
      list.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        // 단가·수량을 고치면 금액이 따라온다. 금액을 직접 고치면 그 값을 그대로 둔다.
        if ("unitPrice" in patch || "qty" in patch) next.amount = next.unitPrice * next.qty;
        return next;
      }),
    );

  const submit = () => {
    setTouched(true);
    if (missing.length) return;
    onSubmit({
      vendorId,
      newVendorName: newVendorName.trim(),
      vendorInfo: {
        address: address.trim(),
        phone: phone.trim(),
        bizNo: bizNo.trim(),
        accounts: filledAccounts,
      },
      tx: {
        id: seed.id,
        date,
        items: items.filter((i) => i.name.trim() || i.amount),
        supply: amount,
        cashPaid: cashTouched ? cashAmount : onlyPrepaid ? 0 : null,
        creditAdd: numOf(creditAdd),
        creditUse: numOf(creditUse),
        creditExpiry,
        creditNote: creditNote.trim(),
        method: method || "samchon",
        vatPaid: method === "transfer" ? vatPaid : false,
        invoice,
        accountId: method === "transfer" ? effectiveAccountId : "",
        memo: memo.trim(),
      },
      photoFile,
    });
  };

  const title = seed.id
    ? "거래 수정"
    : seed.fromReceipt
      ? seed.failed
        ? "장끼를 못 읽었어요 · 직접 채워주세요"
        : "장끼에서 읽었어요 · 확인 후 저장"
      : "거래 추가";

  return (
    <div className="flex max-h-[90vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3.5">
        <div>
          <h2 id="tx-form-title" className="font-semibold text-stone-900">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            결제방식은 꼭 골라주세요. 나머지는 나중에 고쳐도 돼요.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700"
        >
          <X size={20} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      {seed.matchNote && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {seed.matchNote} 아니면 아래에서 다른 거래처로 바꾸세요.
        </p>
      )}
      {seed.fromReceipt && !seed.failed && !seed.matchNote && (
        <p className="mb-3 rounded-lg bg-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-600">
          장끼에서 읽은 값이에요. 금액과 거래처를 눈으로 확인하고 저장하세요.
          {seed.vatSeparate === false && " 부가세 별도 표기가 없어 적힌 금액을 그대로 넣었어요."}
        </p>
      )}

      {/* 거래처 · 날짜 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-sm">
          <span className="mb-1 block text-stone-500">거래처 (물건 판 가게)</span>
          <VendorPicker
            vendors={vendors}
            value={vendorId}
            name={newVendorName}
            onPick={(v) => {
              setVendorId(v.id);
              setNewVendorName("");
              setAddress(v.address);
              setPhone(v.phone);
              setBizNo(v.bizNo);
              setAccounts(v.accounts.map(makeAccount));
              setAccountId("");
            }}
            onNewName={(n) => {
              setNewVendorName(n);
              setVendorId("");
            }}
          />
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-stone-500">날짜</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
        </label>
      </div>

      {/* 이 거래처에 남아 있는 미송 — 누르면 출고 줄이 바로 만들어진다 */}
      {openPending.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Clock size={14} /> 이 거래처에 미송 {openPending.reduce((n, r) => n + r.left, 0)}장이
            남아 있어요
          </div>
          <p className="mt-0.5 mb-2 text-[11px] leading-relaxed text-amber-800">
            오늘 받은 게 있으면 눌러서 <b className="font-semibold">출고</b> 줄로 넣으세요. 돈은 이미
            냈으므로 합계에는 안 더해집니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {openPending.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() =>
                  setItems((list) => [
                    ...list.filter((i) => i.name.trim() || i.amount),
                    makeItem({
                      name: r.name,
                      qty: r.left,
                      unitPrice: r.unitPrice,
                      amount: r.left * r.unitPrice,
                      kind: "pendingOut",
                    }),
                  ])
                }
                className="rounded-lg border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {r.name} <span className="tabular-nums">{r.left}장</span>
                {r.unitPrice > 0 && (
                  <span className="ml-1 font-normal text-amber-600">{won(r.amount)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 품목 */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm text-stone-500">품목</span>
          <button
            type="button"
            onClick={() => setItems([...items, makeItem()])}
            className="flex items-center gap-1 text-sm font-medium text-rose-700"
          >
            <Plus size={14} /> 행 추가
          </button>
        </div>

        <div className="space-y-2">
          {items.map((it) => {
            const kind = kindOf(it);
            return (
              <div key={it.id}>
                <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
                  <input
                    value={it.name}
                    onChange={(e) => patchItem(it.id, { name: e.target.value })}
                    placeholder="품목명"
                    className={COMPACT + " min-w-0 flex-1 basis-full sm:basis-0"}
                  />
                  <Money
                    value={it.unitPrice || ""}
                    onChange={(v) => patchItem(it.id, { unitPrice: Number(v || 0) })}
                    placeholder="단가"
                    className="w-[4.5rem] shrink-0"
                    compact
                  />
                  <Qty value={it.qty} onChange={(q) => patchItem(it.id, { qty: q })} />
                  <Money
                    value={it.amount || ""}
                    onChange={(v) => patchItem(it.id, { amount: Number(v || 0) })}
                    placeholder="금액"
                    className={
                      "w-[5.5rem] shrink-0 " + (kind.key === "pendingOut" ? "text-stone-400" : "")
                    }
                    compact
                  />
                  {/* 매입 → 미송 → 출고 → 불량 순으로 돈다 */}
                  <button
                    type="button"
                    onClick={() => patchItem(it.id, { kind: nextKind(it.kind) })}
                    title={kind.help}
                    className={
                      "w-11 shrink-0 rounded-md border px-1 py-1.5 text-xs font-medium transition " +
                      KIND_TONE[kind.key]
                    }
                  >
                    {kind.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((x) => x.id !== it.id))}
                    aria-label="품목 줄 삭제"
                    className="shrink-0 p-1 text-stone-300 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {kind.key !== "buy" && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-1 text-[11px]">
                    <span
                      className={
                        kind.key === "pendingOut"
                          ? "text-emerald-700"
                          : kind.key === "defect"
                            ? "text-rose-700"
                            : "text-amber-700"
                      }
                    >
                      {kind.help}
                    </span>
                    {kind.key === "defect" && (
                      <input
                        value={it.note}
                        onChange={(e) => patchItem(it.id, { note: e.target.value })}
                        placeholder="무엇으로 바꿔 받았나요"
                        className={COMPACT + " min-w-0 flex-1 text-xs"}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-right text-xs tabular-nums text-stone-500">
          품목 합계 {won(itemSum)}
          {items.some((i) => i.kind === "pendingOut") && (
            <span className="ml-1 text-emerald-700">· 미송 출고분은 뺐어요</span>
          )}
        </p>
      </div>

      {/* 당일합계 = 장부 금액 */}
      <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-stone-700">당일합계</div>
            <div className="text-[11px] text-stone-400">
              {onlyPrepaid ? "출고분만 받은 날이라 0원이에요" : "이 금액이 장부에 남아요"}
            </div>
          </div>
          <Money
            value={supplyTouched ? supply : String(itemSum || "")}
            onChange={(v) => {
              setSupply(v);
              setSupplyTouched(true);
            }}
            placeholder="0"
            className="w-36 font-semibold"
          />
        </div>
        {amount > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 text-xs tabular-nums text-stone-500">
            <span>부가세 미포함 {won(amount)}</span>
            <span>부가세 포함 {won(amount + amount * VAT_RATE)}</span>
            {supplyTouched && itemSum > 0 && amount !== itemSum && (
              <span className="text-amber-700">품목 합계와 {won(Math.abs(amount - itemSum))} 차이</span>
            )}
          </div>
        )}

        {/* 현금입금 — 실제로 건넨 돈. 천원 단위로 맞춰 주고받으므로 당일합계와 다를 수 있다 */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-200 pt-3">
          <div>
            <div className="text-sm font-medium text-stone-700">현금입금</div>
            <div className="text-[11px] text-stone-400">실제로 건넨 돈. 같으면 비워두세요</div>
          </div>
          <Money
            value={cashTouched ? cash : String(amount || "")}
            onChange={(v) => {
              setCash(v);
              setCashTouched(true);
            }}
            placeholder="0"
            className={"w-36 " + (cashTouched ? "font-semibold" : "text-stone-400")}
          />
        </div>

        {/* 전잔 → 당잔 */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            ["전잔", before, "지난 거래까지"],
            ["당일합계", amount, "산 물건"],
            ["당잔", after, balanceOdd ? "확인해 보세요" : "다음으로 넘어가요"],
          ].map(([label, value, note], i) => (
            <div
              key={label}
              className={
                "rounded-lg border px-2 py-1.5 " +
                (i === 2 && balanceOdd
                  ? "border-amber-400 bg-amber-50"
                  : "border-stone-200 bg-white")
              }
            >
              <div className="text-[11px] text-stone-400">{label}</div>
              <div
                className={
                  "text-sm font-semibold tabular-nums " +
                  (i === 2 && balanceOdd ? "text-amber-800" : "text-stone-800")
                }
              >
                {won(value)}
              </div>
              <div className="text-[10px] text-stone-400">{note}</div>
            </div>
          ))}
        </div>
        {after !== 0 && (
          <p
            className={
              "mt-1.5 text-xs " + (balanceOdd ? "font-medium text-amber-800" : "text-stone-500")
            }
          >
            당잔 {balanceText(after)}
            {balanceOdd && " — 천원 단위를 넘어요. 금액을 다시 보거나 거래처에 확인해 보세요."}
          </p>
        )}
      </div>

      {/* 결제방식 — 이체를 했어도 부가세는 안 보낸 경우가 있어 이체가 둘로 갈린다 */}
      <div className="mt-3 text-sm">
        <span className="mb-1.5 block text-stone-500">
          결제방식{" "}
          {onlyPrepaid ? (
            <span className="text-emerald-700">· 낼 돈이 0원이라 안 골라도 돼요</span>
          ) : (
            <span className="text-rose-600">· 장끼로는 알 수 없어요. 꼭 골라주세요</span>
          )}
        </span>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const on = mode?.key === m.key;
            const tone = m.key === "transfer-vat" ? "emerald" : "amber";
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMethod(m.method);
                  setVatPaid(m.vatPaid);
                }}
                className={
                  "flex flex-col items-center rounded-lg border py-2.5 leading-tight font-medium transition " +
                  (on
                    ? tone === "emerald"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-amber-500 bg-amber-500 text-white"
                    : "border-stone-300 bg-white text-stone-600")
                }
              >
                <span>{m.key === "samchon" ? "삼촌 대납" : "이체"}</span>
                <span className="text-xs opacity-80">
                  {m.key === "transfer-vat" ? "부가세 보냄" : m.key === "transfer-novat" ? "부가세 안 보냄" : "부가세 X"}
                </span>
              </button>
            );
          })}
        </div>
        {amount > 0 && (
          <p className="mt-2 text-xs tabular-nums text-stone-500">
            {mode?.key === "transfer-vat"
              ? `실제 지출 ${won(amount + amount * VAT_RATE)} (금액 ${won(amount)} + 부가세 ${won(amount * VAT_RATE)})`
              : mode
                ? `실제 지출 ${won(amount)} · 아직 안 낸 부가세 ${won(amount * VAT_RATE)}`
                : `부가세 ${won(amount * VAT_RATE)}`}
          </p>
        )}
      </div>

      {/* 계좌 — 여러 개면 실제 송금한 것을 고른다 */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm text-stone-500">
            입금 계좌
            {method === "transfer" && filledAccounts.length > 1 && (
              <span className="ml-1 text-rose-600">· 실제로 보낸 계좌를 고르세요</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setAccounts([...accounts, makeAccount()])}
            className="flex items-center gap-1 text-sm font-medium text-rose-700"
          >
            <Plus size={14} /> 행 추가
          </button>
        </div>

        <div className="space-y-2">
          {accounts.map((a) => {
            const chosen = method === "transfer" && effectiveAccountId === a.id;
            return (
              <div
                key={a.id}
                className={
                  "flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5 " +
                  (chosen ? "border-emerald-500 bg-emerald-50" : "border-transparent")
                }
              >
                {method === "transfer" && filledAccounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    aria-label="이 계좌로 송금함"
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border " +
                      (chosen
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-stone-300 bg-white text-transparent")
                    }
                  >
                    <Check size={13} />
                  </button>
                )}
                <input
                  value={a.bank}
                  onChange={(e) =>
                    setAccounts(accounts.map((x) => (x.id === a.id ? { ...x, bank: e.target.value } : x)))
                  }
                  placeholder="은행"
                  className={FIELD + " w-24 text-sm"}
                />
                <input
                  value={a.number}
                  onChange={(e) =>
                    setAccounts(accounts.map((x) => (x.id === a.id ? { ...x, number: e.target.value } : x)))
                  }
                  placeholder="계좌번호"
                  inputMode="numeric"
                  className={FIELD + " min-w-0 flex-1 text-sm tabular-nums"}
                />
                <input
                  value={a.holder}
                  onChange={(e) =>
                    setAccounts(accounts.map((x) => (x.id === a.id ? { ...x, holder: e.target.value } : x)))
                  }
                  placeholder="예금주"
                  className={FIELD + " w-24 text-sm"}
                />
                <button
                  type="button"
                  onClick={() => setAccounts(accounts.filter((x) => x.id !== a.id))}
                  aria-label="계좌 줄 삭제"
                  className="shrink-0 p-1.5 text-stone-300 hover:text-rose-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          {accounts.length === 0 && (
            <p className="text-xs text-stone-400">계좌가 없어요. 장끼를 올리면 자동으로 채워집니다.</p>
          )}
        </div>
      </div>

      {/* 매입금(차감권) — 샘플 반납·불량 매입처럼 '돈이 거래처에 남는' 일 */}
      <div className="mt-3 rounded-xl border border-stone-200">
        <button
          type="button"
          onClick={() => setOpenCredit(!openCredit)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-stone-600"
        >
          <span className="flex items-center gap-1.5">
            <Wallet size={14} /> 매입금 (잡은 돈 · 깎아 쓴 돈)
            {(numOf(creditAdd) > 0 || numOf(creditUse) > 0) && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600 tabular-nums">
                {numOf(creditAdd) > 0 && "+" + won(numOf(creditAdd))}
                {numOf(creditAdd) > 0 && numOf(creditUse) > 0 && " / "}
                {numOf(creditUse) > 0 && "−" + won(numOf(creditUse))}
              </span>
            )}
          </span>
          <ChevronDown size={16} className={"transition " + (openCredit ? "rotate-180" : "")} />
        </button>
        {openCredit && (
          <div className="border-t border-stone-200 p-3">
            <p className="mb-2.5 text-xs leading-relaxed text-stone-500">
              샘플을 반납했거나, 불량을 매입으로 잡았거나, 안 하기로 한 상품 값이 남았을 때{" "}
              <b className="font-semibold">잡은 돈</b>에 적어요. 다음 거래에서 그만큼 덜 냈으면{" "}
              <b className="font-semibold">깎아 쓴 돈</b>에 적으면 잔액이 줄어요.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">잡은 돈 (+)</span>
                <Money value={creditAdd} onChange={setCreditAdd} placeholder="0" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">깎아 쓴 돈 (−)</span>
                <Money value={creditUse} onChange={setCreditUse} placeholder="0" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">쓸 수 있는 기한</span>
                <input
                  type="date"
                  value={creditExpiry}
                  onChange={(e) => setCreditExpiry(e.target.value)}
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] text-stone-400">
                  기한이 없으면 비워두세요. 넣으면 남은 날짜를 세어 줘요.
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">무엇 때문에</span>
                <input
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="예: 샘플 반납 · 불량 3장"
                  className={FIELD}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 거래처 정보 */}
      <div className="mt-3 rounded-xl border border-stone-200">
        <button
          type="button"
          onClick={() => setOpenInfo(!openInfo)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-stone-600"
        >
          <span>거래처 정보 (위치 · 전화 · 사업자번호)</span>
          <ChevronDown size={16} className={"transition " + (openInfo ? "rotate-180" : "")} />
        </button>
        {openInfo && (
          <div className="grid gap-3 border-t border-stone-200 p-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-stone-500">위치 / 주소</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 디오트 지하1층 J13"
                className={FIELD}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">전화번호</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={FIELD} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">사업자번호</span>
              <input value={bizNo} onChange={(e) => setBizNo(e.target.value)} inputMode="numeric" className={FIELD} />
            </label>
          </div>
        )}
      </div>

      {/* 장끼 사진 — 미송이라 나중에 받는 경우가 있다 */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-stone-200 p-3">
        {photoPreview ? (
          <img src={photoPreview} alt="장끼" className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
            <ImageOff size={22} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-stone-700">
            {photoPreview ? "장끼 있음" : "장끼 없음"}
          </div>
          <div className="text-xs text-stone-400">
            {photoPreview ? "누르면 다른 사진으로 바꿔요" : "나중에 받아서 붙여도 돼요"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700"
        >
          <Camera size={15} /> {photoPreview ? "바꾸기" : "사진 붙이기"}
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setPhotoFile(f);
            setPhotoPreview(URL.createObjectURL(f));
          }}
        />
      </div>

      {/* 세금계산서 · 메모 */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setInvoice(!invoice)}
          className={
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition " +
            (invoice
              ? "border-rose-700 bg-rose-50 text-rose-800"
              : "border-stone-300 bg-white text-stone-600")
          }
        >
          <span
            className={
              "flex h-5 w-5 items-center justify-center rounded border " +
              (invoice ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 text-transparent")
            }
          >
            <Check size={13} />
          </span>
          세금계산서 받음
        </button>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모"
          className={FIELD + " min-w-0 flex-1 text-sm"}
        />
      </div>

      {touched && missing.length > 0 && (
        <p className="mt-3 text-sm text-rose-700">{missing.join(", ")}을(를) 채워주세요.</p>
      )}
      </div>

      <footer className="flex shrink-0 gap-2 border-t border-stone-200 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-600 transition hover:bg-stone-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          className="flex-1 rounded-xl bg-rose-700 py-3 font-semibold text-white transition hover:bg-rose-800 active:scale-[0.99]"
        >
          저장
        </button>
      </footer>
    </div>
  );
}
