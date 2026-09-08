import { useMemo, useState } from "react";
import { Menu, Loader2, LogOut, UploadCloud } from "lucide-react";
import {
  monthOf,

  todayISO,
  groupByDay,
  filterRange,
  rangeOf,
  nextMode,
  totals as sumTotals,
} from "./lib/calc";
import { makeVendor, makeTx, makeAccount } from "./lib/store";
import { matchVendor, searchVendors } from "./lib/match";
import { readReceipt } from "./lib/receipt";
import { useLedger } from "./lib/useLedger";
import Sidebar from "./components/Sidebar";
import LedgerPage from "./components/LedgerPage";
import VendorsPage from "./components/VendorsPage";
import TxForm from "./components/TxForm";
import Login from "./components/Login";
import Modal from "./components/Modal";
import InvoicePage, { RequestMessage } from "./components/InvoicePage";
import SalesPage from "./components/SalesPage";
import HomePage from "./components/HomePage";
import Soon from "./components/Soon";
import { useSales } from "./lib/useSales";

const TAX_TYPE_KEY = "poclo_tax_type";

function loadTaxType() {
  try {
    return localStorage.getItem(TAX_TYPE_KEY) === "general" ? "general" : "simple";
  } catch {
    return "simple";
  }
}

export default function App() {
  const L = useLedger();
  const { vendors, tx } = L;

  const S = useSales(L.session);

  const [page, setPage] = useState("home");
  // 매출 장부는 기간을 따로 고른다 — 매입 기간과 얽히면 둘 다 헷갈린다
  const [salesPreset, setSalesPreset] = useState("month");
  const [salesCustom, setSalesCustom] = useState(() => rangeOf("month"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState(() => rangeOf("month"));
  const [request, setRequest] = useState(null);
  const [taxType, setTaxType] = useState(loadTaxType);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickTaxType = (t) => {
    setTaxType(t);
    try {
      localStorage.setItem(TAX_TYPE_KEY, t);
    } catch {
      /* 저장에 실패해도 이번 세션에는 반영된다 */
    }
  };

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || "";

  const range = preset === "custom" ? custom : rangeOf(preset);
  const salesRange = salesPreset === "custom" ? salesCustom : rangeOf(salesPreset);
  const shown = useMemo(() => filterRange(tx, range), [tx, range]);
  const days = useMemo(() => groupByDay(shown), [shown]);
  const totals = useMemo(() => sumTotals(shown), [shown]);

  // 새 거래의 기본 날짜 — 보고 있는 기간 안이면 오늘, 아니면 기간 시작일
  const defaultDate = () => {
    const today = todayISO();
    if ((!range.from || today >= range.from) && (!range.to || today <= range.to)) return today;
    return range.from || today;
  };

  // ------------------------------------------------------------ 거래처

  const deleteVendor = (v) => {
    const used = tx.filter((t) => t.vendorId === v.id).length;
    if (used > 0) {
      window.alert(`${v.name}에 거래가 ${used}건 있어요. 거래를 먼저 옮기거나 지워주세요.`);
      return;
    }
    if (!window.confirm(`${v.name} 거래처를 지울까요?`)) return;
    L.removeVendor(v);
  };

  /** 같은 가게가 이름이 다르게 읽혀 둘로 나뉜 경우를 하나로 합친다 */
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

    const merged = makeVendor({
      ...target,
      address: target.address || from.address,
      phone: target.phone || from.phone,
      bizNo: target.bizNo || from.bizNo,
      accounts: [
        ...target.accounts,
        ...from.accounts.filter(
          (a) =>
            !target.accounts.some((b) => b.number.replace(/\D/g, "") === a.number.replace(/\D/g, "")),
        ),
      ],
    });
    L.mergeVendors(from, target, merged);
  };

  // -------------------------------------------------------------- 거래

  const openBlank = () => setForm({ _k: Date.now(), date: defaultDate() });

  const editTx = async (t) => {
    const photoUrl = t.hasPhoto ? await L.getPhoto(t.id) : "";
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
    L.removeTx(t);
    if (form?.id === t.id) setForm(null);
  };

  const submitForm = async ({ vendorId, newVendorName, vendorInfo, tx: data, photoFile }) => {
    // 1) 거래처를 정한다 — 새로 만들거나, 고른 거래처에 새 정보를 채운다
    let id = vendorId;
    let nextVendors = vendors;
    if (!id) {
      const created = makeVendor({ name: newVendorName, ...vendorInfo });
      nextVendors = [...vendors, created];
      id = created.id;
      L.saveVendor(created);
    } else {
      const v = vendors.find((x) => x.id === id);
      const known = new Set(v.accounts.map((a) => a.number.replace(/\D/g, "")));
      const merged = makeVendor({
        ...v,
        address: vendorInfo.address || v.address,
        phone: vendorInfo.phone || v.phone,
        bizNo: vendorInfo.bizNo || v.bizNo,
        accounts: [
          ...v.accounts,
          ...vendorInfo.accounts.filter((a) => !known.has(a.number.replace(/\D/g, ""))).map(makeAccount),
        ],
      });
      nextVendors = vendors.map((x) => (x.id === id ? merged : x));
      L.saveVendor(merged);
    }

    // 2) 거래를 저장한다
    const record = makeTx({ ...data, vendorId: id, hasPhoto: !!photoFile || !!form?.hasPhoto });
    L.saveTxRecord(record, nextVendors);

    // 3) 사진은 따로 — 실패해도 거래는 남는다
    if (photoFile) {
      const saved = await L.putPhoto(record.id, photoFile);
      if (!saved) {
        L.setNotice("장끼 사진을 저장하지 못했어요. 거래는 저장됐습니다.");
        L.patchTx(record.id, { hasPhoto: false });
      }
    }

    // 저장한 날짜가 보고 있는 기간 밖이면 안 보이므로 그 달로 옮겨준다
    if (!filterRange([{ date: data.date }], range).length) {
      setPreset("custom");
      setCustom({ from: monthOf(data.date) + "-01", to: data.date });
    }
    setForm(null);
  };

  // ------------------------------------------------------------ 장끼 읽기

  const onReceipt = async (file) => {
    setBusy(true);
    L.setNotice("");
    const result = await readReceipt(file);
    setBusy(false);

    if (!result.ok) {
      L.setNotice(result.message);
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
    // 이체(부가세O) → 이체(부가세X) → 삼촌 순으로 돈다
    onToggleMethod: (id) => {
      const t = tx.find((x) => x.id === id);
      if (t) L.patchTx(id, nextMode(t));
    },
    onToggleInvoice: (id) => L.patchTx(id, { invoice: !tx.find((t) => t.id === id)?.invoice }),
    onEdit: editTx,
    onDelete: deleteTx,
  };

  // ------------------------------------------------------------ 그리기

  if (!L.authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (L.mode === "remote" && !L.session) return <Login />;

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
          {(L.notice || S.notice) && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-600">
              <span className="flex-1">{L.notice || S.notice}</span>
              <button
                type="button"
                onClick={() => {
                  L.setNotice("");
                  S.setNotice("");
                }}
                className="shrink-0 text-stone-400"
              >
                닫기
              </button>
            </div>
          )}

          {L.canUpload && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
              <span className="flex-1 text-rose-900">
                이 기기에만 저장된 거래가 {L.uploadLocalCount}건 있어요. 공유 장부로 옮길까요?
              </span>
              <button
                type="button"
                onClick={L.uploadLocal}
                className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 font-medium text-white"
              >
                <UploadCloud size={15} /> 옮기기
              </button>
            </div>
          )}

          {L.loading ? (
            <div className="flex justify-center py-20 text-stone-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <>
              <Modal open={!!form} onClose={() => setForm(null)} labelledBy="tx-form-title">
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
              </Modal>

              <Modal open={!!request} onClose={() => setRequest(null)} labelledBy="tx-form-title">
                {request && (
                  <RequestMessage
                    key={request._k}
                    vendor={request.vendor}
                    text={request.text}
                    onClose={() => setRequest(null)}
                  />
                )}
              </Modal>

              {page === "home" ? (
                <HomePage
                  salesRows={S.rows}
                  salesConf={S.conf}
                  purchaseTotals={sumTotals(tx)}
                  onPage={setPage}
                />
              ) : page === "sales" ? (
                <SalesPage
                  rows={S.rows}
                  conf={S.conf}
                  onConf={S.saveConf}
                  onDaily={S.putDaily}
                  onAds={S.putAds}
                  onClear={S.clearAll}
                  range={salesRange}
                  preset={salesPreset}
                  custom={salesCustom}
                  onRange={({ preset: p, custom: c }) => {
                    setSalesPreset(p);
                    setSalesCustom(c);
                  }}
                />
              ) : page === "work" || page === "people" || page === "content" ? (
                <Soon page={page} />
              ) : page === "ledger" ? (
                <LedgerPage
                  days={days}
                  totals={totals}
                  range={range}
                  preset={preset}
                  custom={custom}
                  onRange={({ preset: p, custom: c }) => {
                    setPreset(p);
                    setCustom(c);
                  }}
                  taxType={taxType}
                  onTaxType={pickTaxType}
                  busy={busy}
                  onReceipt={onReceipt}
                  onAddBlank={openBlank}
                  vendorName={vendorName}
                  rowProps={rowProps}
                />
              ) : page === "vendors" ? (
                <VendorsPage
                  vendors={vendors}
                  rows={tx}
                  taxType={taxType}
                  onSaveVendor={L.saveVendor}
                  onDeleteVendor={deleteVendor}
                  onMergeVendor={mergeVendor}
                  rowProps={rowProps}
                />
              ) : (
                <InvoicePage
                  vendors={vendors}
                  rows={tx}
                  onRequestMessage={(vendor, text) => setRequest({ vendor, text, _k: Date.now() })}
                />
              )}
            </>
          )}

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 text-xs text-stone-400">
            <span>기록·집계·확인용 장부예요. 신고 판단은 세무 담당자와 확인하세요.</span>
            {L.session && (
              <button
                type="button"
                onClick={L.signOut}
                className="flex items-center gap-1 hover:text-stone-600"
              >
                <LogOut size={13} /> {L.session.user.email} 로그아웃
              </button>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
