import { useMemo, useRef, useState } from "react";
import { Plus, Camera, Loader2, CalendarDays, Users, AlertCircle } from "lucide-react";
import {
  won,
  monthOf,
  monthLabel,
  thisMonth,
  todayISO,
  groupByDay,
  groupByVendor,
  totals as sumTotals,
} from "./lib/calc";
import { loadTx, saveTx, newId } from "./lib/storage";
import { readReceipt } from "./lib/receipt";
import TxForm from "./components/TxForm";
import DailyView from "./components/DailyView";
import VendorView from "./components/VendorView";
import { Kpi, Tab } from "./components/ui";

const TAX_TYPE_KEY = "poclo_tax_type";

function loadTaxType() {
  try {
    const saved = localStorage.getItem(TAX_TYPE_KEY);
    return saved === "general" ? "general" : "simple";
  } catch {
    return "simple";
  }
}

export default function App() {
  const [tx, setTx] = useState(loadTx);
  const [month, setMonth] = useState(thisMonth);
  const [taxType, setTaxType] = useState(loadTaxType);
  const [view, setView] = useState("daily");
  const [form, setForm] = useState(null); // null이면 폼 닫힘
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);

  const persist = (list) => {
    setTx(list);
    if (!saveTx(list)) {
      setNotice("이 브라우저에 저장하지 못했어요. 시크릿 창이면 일반 창에서 열어주세요.");
    }
  };

  const pickTaxType = (t) => {
    setTaxType(t);
    try {
      localStorage.setItem(TAX_TYPE_KEY, t);
    } catch {
      // 저장에 실패해도 이번 세션에는 반영된다
    }
  };

  const months = useMemo(() => {
    const s = new Set(tx.map((t) => monthOf(t.date)).filter(Boolean));
    s.add(month);
    s.add(thisMonth());
    return [...s].sort().reverse();
  }, [tx, month]);

  const rows = useMemo(() => tx.filter((t) => monthOf(t.date) === month), [tx, month]);
  const days = useMemo(() => groupByDay(rows), [rows]);
  const vendors = useMemo(() => groupByVendor(rows, taxType), [rows, taxType]);
  const totals = useMemo(() => sumTotals(rows), [rows]);
  const vendorNames = useMemo(() => [...new Set(tx.map((t) => t.vendor))].sort(), [tx]);

  const defaultDate = () => (month === thisMonth() ? todayISO() : month + "-01");

  const openBlank = () =>
    setForm({ _k: Date.now(), date: defaultDate(), vendor: "", supply: "", memo: "" });

  const saveForm = (data) => {
    if (form?.id) {
      persist(tx.map((t) => (t.id === form.id ? { ...t, ...data } : t)));
    } else {
      persist([...tx, { ...data, id: newId() }]);
    }
    if (monthOf(data.date) !== month) setMonth(monthOf(data.date));
    setForm(null);
  };

  const editTx = (t) => setForm({ ...t, _k: Date.now() });

  const deleteTx = (t) => {
    if (!window.confirm(`${t.vendor} ${won(t.supply)} 건을 지울까요?`)) return;
    persist(tx.filter((x) => x.id !== t.id));
    if (form?.id === t.id) setForm(null);
  };

  const toggleMethod = (id) =>
    persist(
      tx.map((t) =>
        t.id === id ? { ...t, method: t.method === "transfer" ? "samchon" : "transfer" } : t,
      ),
    );

  const toggleInvoice = (id) =>
    persist(tx.map((t) => (t.id === id ? { ...t, invoice: !t.invoice } : t)));

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setNotice("");
    const result = await readReceipt(file);
    setBusy(false);

    if (result.ok) {
      const g = result.data;
      setForm({
        _k: Date.now(),
        date: g.date || defaultDate(),
        vendor: g.vendor,
        supply: g.supply || "",
        memo: g.items,
        vatSeparate: g.vatSeparate,
        fromReceipt: true,
      });
    } else {
      setNotice(result.message);
      setForm({
        _k: Date.now(),
        date: defaultDate(),
        vendor: "",
        supply: "",
        memo: "",
        fromReceipt: true,
        failed: true,
      });
    }
  };

  const addButton = (
    <button
      type="button"
      onClick={openBlank}
      className="rounded-lg bg-rose-700 px-4 py-2.5 font-medium text-white hover:bg-rose-800"
    >
      거래 한 건 넣기
    </button>
  );

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-5 border-b-2 border-rose-700 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">포클로 매입 장부</h1>
              <p className="mt-1 text-sm text-stone-500">
                영수증만 올리면 자동 입력. 이체·삼촌이 섞여도 알아서 갈라줘요.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
                {[
                  ["simple", "간이"],
                  ["general", "일반"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickTaxType(key)}
                    className={
                      "px-3.5 py-2 " +
                      (taxType === key ? "bg-rose-700 text-white" : "bg-white text-stone-600")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="월 선택"
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="mb-4 flex gap-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3.5 font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" /> 영수증 읽는 중…
              </>
            ) : (
              <>
                <Camera size={18} /> 영수증 올리기
              </>
            )}
          </button>
          <button
            type="button"
            onClick={openBlank}
            className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3.5 font-medium text-stone-700 transition hover:bg-stone-100"
          >
            <Plus size={18} /> 직접
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickFile}
          />
        </div>

        {notice && (
          <div className="mb-4 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-600">
            {notice}
          </div>
        )}

        {form && (
          <TxForm
            key={form._k}
            seed={form}
            vendorList={vendorNames}
            onSubmit={saveForm}
            onCancel={() => setForm(null)}
          />
        )}

        <section className="mb-5 space-y-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-800">
              <AlertCircle size={15} /> 미증빙 삼촌 매입 (부가세 안 낸 것)
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-rose-900">
              {won(totals.samchon)}
            </div>
            <div className="mt-1.5 text-sm text-rose-700">
              세금계산서로 돌리려면 추가 부가세{" "}
              <span className="font-semibold tabular-nums">{won(totals.switchCost)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Kpi
              label="총매입"
              value={won(totals.supply)}
              sub={`실지출 ${won(totals.actualPaid)}`}
            />
            <Kpi label="낸 부가세" value={won(totals.paidVat)} tone="emerald" sub="이체 건" />
            <Kpi
              label="세금계산서"
              value={`${totals.invoiced}/${totals.count}`}
              sub={totals.count ? `수취율 ${Math.round(totals.invoiceRate * 100)}%` : "—"}
            />
          </div>
        </section>

        <div className="mb-4 flex gap-1 rounded-xl bg-stone-200 p-1">
          <Tab active={view === "daily"} onClick={() => setView("daily")}>
            <CalendarDays size={15} /> 일별
          </Tab>
          <Tab active={view === "vendor"} onClick={() => setView("vendor")}>
            <Users size={15} /> 거래처별
          </Tab>
        </div>

        {view === "daily" ? (
          <DailyView
            days={days}
            onToggleMethod={toggleMethod}
            onToggleInvoice={toggleInvoice}
            onEdit={editTx}
            onDelete={deleteTx}
            emptyAction={addButton}
          />
        ) : (
          <VendorView vendors={vendors} taxType={taxType} emptyAction={addButton} />
        )}

        <footer className="mt-10 border-t border-stone-200 pt-4 text-xs text-stone-400">
          기록·집계·확인용 장부예요. 신고 판단은 세무 담당자와 확인하세요.
        </footer>
      </div>
    </div>
  );
}
