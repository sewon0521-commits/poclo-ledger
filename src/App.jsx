import { useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { monthOf, thisMonth, todayISO, groupByDay, totals as sumTotals } from "./lib/calc";
import { loadAll, saveVendors, saveTx, makeVendor, makeTx, makeAccount } from "./lib/store";
import { matchVendor, searchVendors } from "./lib/match";
import { readReceipt } from "./lib/receipt";
import { putPhoto, getPhoto, deletePhoto } from "./lib/photos";
import Sidebar from "./components/Sidebar";
import LedgerPage from "./components/LedgerPage";
import VendorsPage from "./components/VendorsPage";
import TxForm from "./components/TxForm";

const TAX_TYPE_KEY = "poclo_tax_type";

function loadTaxType() {
  try {
    return localStorage.getItem(TAX_TYPE_KEY) === "general" ? "general" : "simple";
  } catch {
    return "simple";
  }
}

const initial = loadAll();

export default function App() {
  const [vendors, setVendors] = useState(initial.vendors);
  const [tx, setTx] = useState(initial.tx);
  const [page, setPage] = useState("ledger");
  const [menuOpen, setMenuOpen] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [taxType, setTaxType] = useState(loadTaxType);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const warnIfUnsaved = (ok) => {
    if (!ok) setNotice("이 브라우저에 저장하지 못했어요. 시크릿 창이면 일반 창에서 열어주세요.");
  };
  const putVendors = (list) => {
    setVendors(list);
    warnIfUnsaved(saveVendors(list));
  };
  const putTx = (list) => {
    setTx(list);
    warnIfUnsaved(saveTx(list));
  };

  const pickTaxType = (t) => {
    setTaxType(t);
    try {
      localStorage.setItem(TAX_TYPE_KEY, t);
    } catch {
      /* 저장에 실패해도 이번 세션에는 반영된다 */
    }
  };

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || "";

  const months = useMemo(() => {
    const s = new Set(tx.map((t) => monthOf(t.date)).filter(Boolean));
    s.add(month);
    s.add(thisMonth());
    return [...s].sort().reverse();
  }, [tx, month]);

  const monthRows = useMemo(() => tx.filter((t) => monthOf(t.date) === month), [tx, month]);
  const days = useMemo(() => groupByDay(monthRows), [monthRows]);
  const totals = useMemo(() => sumTotals(monthRows), [monthRows]);

  const defaultDate = () => (month === thisMonth() ? todayISO() : month + "-01");

  // ------------------------------------------------------------ 거래처

  const saveVendor = (data) => {
    if (data.id) {
      putVendors(vendors.map((v) => (v.id === data.id ? makeVendor({ ...v, ...data }) : v)));
    } else {
      putVendors([...vendors, makeVendor(data)]);
    }
  };

  const deleteVendor = (v) => {
    const used = tx.filter((t) => t.vendorId === v.id).length;
    if (used > 0) {
      window.alert(`${v.name}에 거래가 ${used}건 있어요. 거래를 먼저 옮기거나 지워주세요.`);
      return;
    }
    if (!window.confirm(`${v.name} 거래처를 지울까요?`)) return;
    putVendors(vendors.filter((x) => x.id !== v.id));
  };

  /**
   * 같은 가게가 이름이 다르게 읽혀 둘로 나뉜 경우를 하나로 합친다.
   * 거래가 따라 옮겨가야 하므로 거래처 삭제와 다르다.
   */
  const mergeVendor = (from) => {
    const others = vendors.filter((v) => v.id !== from.id);
    if (others.length === 0) {
      window.alert("합칠 다른 거래처가 없어요.");
      return;
    }
    const name = window.prompt(
      `“${from.name}”을(를) 어느 거래처에 합칠까요?\n남길 거래처 이름을 적어주세요.\n\n${others
        .map((v) => "· " + v.name)
        .join("\n")}`,
    );
    if (!name) return;
    const target = searchVendors(others, name)[0];
    if (!target) {
      window.alert("그런 이름의 거래처를 못 찾았어요.");
      return;
    }
    if (!window.confirm(`“${from.name}”의 거래를 전부 “${target.name}”으로 옮기고 합칠까요?`)) return;

    // 남길 쪽에 비어 있는 정보와 없는 계좌를 채워 넣는다
    const merged = makeVendor({
      ...target,
      address: target.address || from.address,
      phone: target.phone || from.phone,
      bizNo: target.bizNo || from.bizNo,
      accounts: [
        ...target.accounts,
        ...from.accounts.filter(
          (a) => !target.accounts.some((b) => b.number.replace(/\D/g, "") === a.number.replace(/\D/g, "")),
        ),
      ],
    });
    putVendors(vendors.filter((v) => v.id !== from.id).map((v) => (v.id === target.id ? merged : v)));
    putTx(tx.map((t) => (t.vendorId === from.id ? { ...t, vendorId: target.id } : t)));
  };

  // -------------------------------------------------------------- 거래

  const openBlank = () => setForm({ _k: Date.now(), date: defaultDate() });

  const editTx = async (t) => {
    const photoUrl = t.hasPhoto ? await getPhoto(t.id) : "";
    const v = vendors.find((x) => x.id === t.vendorId);
    setForm({
      ...t,
      _k: Date.now(),
      photoUrl: photoUrl || "",
      address: v?.address ?? "",
      phone: v?.phone ?? "",
      bizNo: v?.bizNo ?? "",
      accounts: v?.accounts ?? [],
    });
  };

  const deleteTx = (t) => {
    if (!window.confirm(`${vendorName(t.vendorId)} 거래를 지울까요?`)) return;
    putTx(tx.filter((x) => x.id !== t.id));
    deletePhoto(t.id);
    if (form?.id === t.id) setForm(null);
  };

  const toggleMethod = (id) =>
    putTx(
      tx.map((t) =>
        t.id === id ? { ...t, method: t.method === "transfer" ? "samchon" : "transfer" } : t,
      ),
    );

  const toggleInvoice = (id) =>
    putTx(tx.map((t) => (t.id === id ? { ...t, invoice: !t.invoice } : t)));

  const submitForm = async ({ vendorId, newVendorName, vendorInfo, tx: data, photoFile }) => {
    // 1) 거래처를 정한다 — 새로 만들거나, 고른 거래처에 새 정보를 채운다
    let list = vendors;
    let id = vendorId;
    if (!id) {
      const created = makeVendor({ name: newVendorName, ...vendorInfo });
      list = [...vendors, created];
      id = created.id;
    } else {
      list = vendors.map((v) => {
        if (v.id !== id) return v;
        const known = new Set(v.accounts.map((a) => a.number.replace(/\D/g, "")));
        return makeVendor({
          ...v,
          address: vendorInfo.address || v.address,
          phone: vendorInfo.phone || v.phone,
          bizNo: vendorInfo.bizNo || v.bizNo,
          accounts: [
            ...v.accounts,
            ...vendorInfo.accounts.filter((a) => !known.has(a.number.replace(/\D/g, ""))).map(makeAccount),
          ],
        });
      });
    }
    putVendors(list);

    // 2) 거래를 저장한다
    const record = makeTx({ ...data, vendorId: id, hasPhoto: !!photoFile || !!form?.hasPhoto });
    const next = data.id ? tx.map((t) => (t.id === data.id ? { ...record, id: data.id } : t)) : [...tx, record];
    putTx(next);

    // 3) 사진은 IndexedDB에 따로 — 실패해도 거래는 남는다
    if (photoFile) {
      const saved = await putPhoto(record.id, photoFile);
      if (!saved) {
        setNotice("장끼 사진을 저장하지 못했어요. 거래는 저장됐습니다.");
        putTx(next.map((t) => (t.id === record.id ? { ...t, hasPhoto: false } : t)));
      }
    }

    if (monthOf(data.date) !== month) setMonth(monthOf(data.date));
    setForm(null);
  };

  // ------------------------------------------------------------ 장끼 읽기

  const onReceipt = async (file) => {
    setBusy(true);
    setNotice("");
    const result = await readReceipt(file);
    setBusy(false);

    if (!result.ok) {
      setNotice(result.message);
      setForm({ _k: Date.now(), date: defaultDate(), fromReceipt: true, failed: true, photoFile: file });
      return;
    }

    const g = result.data;
    // 이름은 사진마다 흔들리지만 전화·계좌는 안 흔들린다. 번호를 먼저 맞춰본다.
    const m = matchVendor({ ...g, account: g.accounts?.[0]?.number }, vendors);

    setForm({
      _k: Date.now(),
      date: g.date || defaultDate(),
      vendorId: m.kind === "exact" ? m.vendor.id : "",
      newVendorName: m.kind === "exact" ? "" : g.vendor,
      matchNote: m.kind === "exact" ? `${m.vendor.name} 거래처로 잡았어요 (${m.reason}).` : "",
      items: g.items,
      supply: g.supply,
      address: g.address,
      phone: g.phone,
      bizNo: g.bizNo,
      accounts: g.accounts,
      vatSeparate: g.vatSeparate,
      fromReceipt: true,
      photoFile: file,
    });
  };

  const rowProps = {
    onToggleMethod: toggleMethod,
    onToggleInvoice: toggleInvoice,
    onEdit: editTx,
    onDelete: deleteTx,
  };

  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-800">
      <Sidebar page={page} onPage={setPage} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 md:hidden">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="메뉴" className="p-1">
            <Menu size={22} />
          </button>
          <span className="font-bold text-stone-900">포클로</span>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {notice && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-600">
              <span className="flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice("")} className="shrink-0 text-stone-400">
                닫기
              </button>
            </div>
          )}

          {form && (
            <TxForm
              key={form._k}
              seed={form}
              vendors={vendors}
              onSubmit={(payload) =>
                submitForm({ ...payload, photoFile: payload.photoFile || form.photoFile || null })
              }
              onCancel={() => setForm(null)}
            />
          )}

          {page === "ledger" ? (
            <LedgerPage
              days={days}
              totals={totals}
              months={months}
              month={month}
              onMonth={setMonth}
              taxType={taxType}
              onTaxType={pickTaxType}
              busy={busy}
              onReceipt={onReceipt}
              onAddBlank={openBlank}
              vendorName={vendorName}
              rowProps={rowProps}
            />
          ) : (
            <VendorsPage
              vendors={vendors}
              rows={tx}
              taxType={taxType}
              onSaveVendor={saveVendor}
              onDeleteVendor={deleteVendor}
              onMergeVendor={mergeVendor}
              rowProps={rowProps}
            />
          )}

          <footer className="mt-10 border-t border-stone-200 pt-4 text-xs text-stone-400">
            기록·집계·확인용 장부예요. 신고 판단은 세무 담당자와 확인하세요.
          </footer>
        </main>
      </div>
    </div>
  );
}
