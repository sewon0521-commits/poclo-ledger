import { useMemo, useRef, useState } from "react";
import { X, Check, Plus, Trash2, ChevronDown, ChevronUp, Camera, ImageOff } from "lucide-react";
import { won, VAT_RATE, itemsTotal } from "../lib/calc";
import { makeAccount, makeItem } from "../lib/store";
import VendorPicker from "./VendorPicker";

const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
const comma = (s) => {
  const d = digits(s);
  return d ? Number(d).toLocaleString("ko-KR") : "";
};
const numOf = (s) => Number(digits(s) || 0);

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

/** 수량 — 화살표로 1씩 올리고 내린다. 0 아래로는 안 내려간다. */
function Qty({ value, onChange }) {
  const step = (d) => onChange(Math.max(0, (Number(value) || 0) + d));
  return (
    <div className="flex shrink-0 items-stretch">
      <input
        value={value}
        onChange={(e) => onChange(Number(digits(e.target.value) || 0))}
        inputMode="numeric"
        aria-label="수량"
        className={COMPACT + " w-10 rounded-r-none text-center tabular-nums"}
      />
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="수량 1 올리기"
          className="flex h-[17px] w-5 items-center justify-center rounded-tr-md border border-b-0 border-l-0 border-stone-300 bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-200"
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="수량 1 내리기"
          className="flex h-[17px] w-5 items-center justify-center rounded-br-md border border-l-0 border-stone-300 bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-200"
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
export default function TxForm({ seed, vendors, onSubmit, onCancel }) {
  const [vendorId, setVendorId] = useState(seed.vendorId || "");
  const [newVendorName, setNewVendorName] = useState(seed.newVendorName || "");
  const [date, setDate] = useState(seed.date || "");
  const [items, setItems] = useState(
    seed.items?.length ? seed.items.map(makeItem) : [makeItem()],
  );
  const [supply, setSupply] = useState(seed.supply ? String(seed.supply) : "");
  const [supplyTouched, setSupplyTouched] = useState(!!seed.supply);
  const [method, setMethod] = useState(seed.method || null);
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

  const itemSum = useMemo(() => itemsTotal(items), [items]);
  const amount = supplyTouched ? numOf(supply) : itemSum;
  const filledAccounts = accounts.filter((a) => a.number.trim());

  // 계좌가 하나뿐이면 고를 것도 없이 그것이 송금 계좌다
  const effectiveAccountId =
    filledAccounts.length === 1 ? filledAccounts[0].id : accountId;

  const [touched, setTouched] = useState(false);
  const missing = [];
  if (!vendorId && !newVendorName.trim()) missing.push("거래처");
  if (!amount) missing.push("금액");
  if (!date) missing.push("날짜");
  if (!method) missing.push("결제방식");

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
        method,
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
    <div className="mb-5 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="font-semibold text-stone-900">{title}</span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="-m-1 p-1 text-stone-400 hover:text-stone-700"
        >
          <X size={20} />
        </button>
      </div>

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
          {items.map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
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
                className="w-[5.5rem] shrink-0"
                compact
              />
              <button
                type="button"
                onClick={() => patchItem(it.id, { pending: !it.pending })}
                title="미송 (아직 안 온 물건)"
                className={
                  "shrink-0 rounded-md border px-1.5 py-1.5 text-xs font-medium transition " +
                  (it.pending
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-stone-300 bg-white text-stone-500")
                }
              >
                미송
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
          ))}
        </div>

        <p className="mt-2 text-right text-xs tabular-nums text-stone-500">
          품목 합계 {won(itemSum)}
        </p>
      </div>

      {/* 당일합계 = 장부 금액 */}
      <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-stone-700">당일합계</div>
            <div className="text-[11px] text-stone-400">이 금액이 장부에 남아요</div>
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
      </div>

      {/* 결제방식 */}
      <div className="mt-3 text-sm">
        <span className="mb-1.5 block text-stone-500">
          결제방식 <span className="text-rose-600">· 장끼로는 알 수 없어요. 꼭 골라주세요</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("samchon")}
            className={
              "rounded-lg border py-3 font-medium transition " +
              (method === "samchon"
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-stone-300 bg-white text-stone-600")
            }
          >
            삼촌 대납 <span className="text-xs opacity-80">부가세 X</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod("transfer")}
            className={
              "rounded-lg border py-3 font-medium transition " +
              (method === "transfer"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-stone-300 bg-white text-stone-600")
            }
          >
            이체 <span className="text-xs opacity-80">부가세 O</span>
          </button>
        </div>
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

      <button
        type="button"
        onClick={submit}
        className="mt-3 w-full rounded-xl bg-rose-700 py-3.5 font-semibold text-white transition hover:bg-rose-800 active:scale-[0.99]"
      >
        저장
      </button>
    </div>
  );
}
