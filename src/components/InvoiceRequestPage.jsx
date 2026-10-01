import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, ChevronRight, ChevronDown, Search, Copy, Check, FileSpreadsheet, Undo2, Receipt, Building2, ImagePlus, Loader2 } from "lucide-react";
import { won } from "../lib/sales";
import { loadKey, changeKey, upsert, remove, putPhoto, photoUrls, md, FIELD } from "../lib/shoot";
import { dayKey } from "../lib/journal";
import { newId } from "../lib/id";
import { monthBoard, monthRange, monthTitle, shiftMonth, accountFor, accountText, requestText, vatDoneText, transferRows, bizLines } from "../lib/invoice";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 돈 › 정산·세무 › 계산서 발행 요청·확인 (lib/invoice.js 머리말).
 * 탭 ① 계산서 챙기기 — 그 달 거래처마다 받을 계산서(공급가+부가세)와 받았는지, 요청 글 / 거래처 상세
 *    ② 거래처 부가세 송금 — 부가세 후입금 거래처에 보낼 부가세, 계좌, 대량이체 표, 이체 완료 처리, 입금 안내 글
 * 알림톡은 아직 연결 전 — 카카오 채널·발송 서비스·양식 승인을 세원이 정해 주면 붙인다. 지금은 글을 복사해 카톡으로.
 */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const STATUS = {
  todo: ["발행 전", "border-amber-300 bg-amber-50 text-amber-800"],
  part: ["일부 받음", "border-sky-300 bg-sky-50 text-sky-800"],
  done: ["받음", "border-emerald-300 bg-emerald-50 text-emerald-800"],
};

function StatusChip({ s }) {
  const [label, tone] = STATUS[s] || STATUS.todo;
  return <span className={"shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold " + tone}>{label}</span>;
}

// ---------------------------------------------------------------- 우리 사업자 정보

const BIZ_FIELDS = [
  ["name", "상호", "포클로 POCLO"],
  ["bizNo", "사업자등록번호", "000-00-00000"],
  ["ceo", "대표자", ""],
  ["address", "사업장 주소", ""],
  ["type", "업태", "도소매"],
  ["item", "종목", "의류"],
  ["email", "계산서 받을 이메일", "tax@…"],
  ["phone", "담당자 연락처", "010-…"],
];

function BizCard({ biz, onSave, online }) {
  const empty = !bizLines(biz).length;
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(biz);
  const [busy, setBusy] = useState(false);
  const [cert, setCert] = useState("");
  useEffect(() => {
    let alive = true;
    if (biz.certKey) photoUrls([biz.certKey], online).then((m) => alive && setCert(m[biz.certKey] || ""));
    return () => {
      alive = false;
    };
  }, [biz.certKey, online]);
  return (
    <section className="mb-4 rounded-2xl border border-stone-200 bg-white">
      <button type="button" onClick={() => { setX(biz); setOpen(!open); }} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Building2 size={16} className="text-stone-500" />
        <span className="flex-1 text-sm font-semibold text-stone-800">
          우리 사업자 정보 <span className="font-normal text-stone-400">· 계산서 요청 글에 같이 들어가요</span>
        </span>
        {empty ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">아직 비어 있어요</span> : <span className="text-xs text-stone-500">{biz.name} · {biz.bizNo}</span>}
        <ChevronDown size={16} className={"text-stone-400 " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-stone-100 px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {BIZ_FIELDS.map(([k, label, ph]) => (
              <label key={k} className={"space-y-1 text-sm " + (k === "address" ? "sm:col-span-2" : "")}>
                <span className="text-xs font-semibold text-stone-500">{label}</span>
                <input value={x[k] || ""} onChange={(e) => setX({ ...x, [k]: e.target.value })} placeholder={ph} className={FIELD} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs font-medium text-stone-600 hover:border-stone-500">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} 사업자등록증 사진 {x.certKey ? "바꾸기" : "올리기"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  try {
                    const key = await putPhoto(f, online);
                    setX((v) => ({ ...v, certKey: key || "" }));
                    if (key) setCert((await photoUrls([key], online))[key] || "");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {cert && (
              <a href={cert} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-700 hover:underline">
                등록증 보기 (거래처가 달라고 하면 이걸 보내요)
              </a>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-stone-500">
              닫기
            </button>
            <button type="button" onClick={async () => { await onSave(x); setOpen(false); }} className="rounded-lg bg-rose-700 px-4 py-1.5 text-sm font-semibold text-white">
              저장
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 요청 글 창

function RequestSheet({ rows, month, biz, sendsOn, reqs, onMark, onClose }) {
  const [done, setDone] = useState({});
  const say = async (r) => {
    const ok = await copyText(requestText(r, month, biz, sendsOn(r.id)));
    setDone((d) => ({ ...d, [r.id]: ok ? "복사했어요" : "복사가 막혔어요" }));
    if (ok) onMark([r.id]);
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={`계산서 발행 요청 · ${rows.length}곳`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <b>알림톡은 아직 연결 전이에요.</b> 지금은 거래처마다 글을 복사해 카톡에 붙여넣어 주세요(복사하면 '요청함'으로 표시돼요).
          카카오 채널·발송 서비스·양식 승인이 준비되면 Claude 에게 알려 주세요 — 여기서 바로 보내지게 붙여요.
        </p>
        {!bizLines(biz).length && <p className="text-xs text-rose-700">위 '우리 사업자 정보'를 먼저 채우면 글에 상호·사업자번호·이메일이 같이 들어가요.</p>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-stone-200">
            <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-2">
              <b className="text-stone-900">{r.vendor.name}</b>
              <span className="flex items-center gap-2">
                {reqs[r.id] && <span className="text-[11px] text-emerald-700">요청함 {md(reqs[r.id])}</span>}
                <button type="button" onClick={() => say(r)} className="flex items-center gap-1 rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white">
                  <Copy size={12} /> {done[r.id] || "글 복사"}
                </button>
              </span>
            </div>
            <pre className="px-3 py-2 font-sans text-xs leading-relaxed whitespace-pre-wrap text-stone-700">{requestText(r, month, biz, sendsOn(r.id))}</pre>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 거래처 상세

function VendorSheet({ row, month, tx, vendors, sends, reqOn, biz, onInvoice, onBreakdown, onRequest, onGoVat, onClose }) {
  const v = row.vendor;
  // 최근 6달 — 같은 규칙으로
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => shiftMonth(month, -i)).map((m) => ({ m, r: monthBoard(tx.filter((t) => t.vendorId === v.id), vendors, m, sends)[0] })),
    [month, tx, vendors, sends, v.id],
  );
  const late = row.late.length > 0;
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={`${v.name}${v.address ? ` · ${v.address}` : ""}`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="rounded-xl bg-stone-50 p-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-stone-800">요청할 계산서 금액 <span className="font-normal text-stone-400">· {monthTitle(month)}</span></span>
            <b className="text-lg tabular-nums text-stone-900">{won(row.total)}원</b>
          </div>
          <p className="mt-0.5 text-right text-xs text-stone-500 tabular-nums">
            공급가 {won(row.supply)} + 부가세 {won(row.vat)} · 장끼 {row.inv.length}건
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2">
            <span className="flex items-center gap-2 text-stone-600">
              받은 계산서 <StatusChip s={row.status} /> <span className="text-xs text-stone-400">{row.issued}/{row.inv.length}건</span>
            </span>
            {row.status === "done" ? (
              <button type="button" onClick={() => onInvoice(row.inv.map((t) => t.id), false)} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800">
                <Undo2 size={12} /> 받음 취소
              </button>
            ) : (
              <button type="button" onClick={() => onInvoice(row.inv.map((t) => t.id), true)} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">
                <Check size={12} /> 계산서 받음
              </button>
            )}
          </div>
        </div>

        {late && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-xs leading-relaxed text-violet-900">
            <b className="text-sm">부가세를 따로(후입금) 보내는 거래처예요</b>
            <p className="mt-1">· 장끼에는 공급가 {won(row.lateSupply)}원만 보냈어요(부가세 빼고).</p>
            <p>
              · 부가세 {won(row.vatDue + row.vatSent)}원은 '거래처 부가세 송금' 탭에서 따로 보내요 —{" "}
              {row.vatDue ? (
                <button type="button" onClick={onGoVat} className="font-semibold underline">
                  아직 {won(row.vatDue)}원 안 보냈어요 →
                </button>
              ) : (
                <b>보냈어요</b>
              )}
            </p>
            <p>· 그래도 계산서는 <b>전액 {won(row.total)}원</b>으로 받아야 맞아요(공급가 + 부가세).</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRequest} disabled={late && row.vatDue > 0} className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:bg-stone-300" title={late && row.vatDue > 0 ? "부가세를 먼저 보내야 해요" : ""}>
            <Send size={13} /> 요청 글 만들기 {reqOn && <span className="font-normal opacity-80">(요청함 {md(reqOn)})</span>}
          </button>
          <button
            type="button"
            onClick={() => onBreakdown({ title: `${v.name} · ${monthTitle(month)}`, range: monthRange(month), vendorIds: [v.id], initialBy: "day" })}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700"
          >
            <Receipt size={13} /> 장끼 내역 보기 {row.inv.length + row.samchon.length}건
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200">
          <div className="bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-500">월별 현황</div>
          {months.map(({ m, r }) => (
            <div key={m} className="flex items-center gap-2 border-t border-stone-100 px-3 py-1.5 text-xs">
              <span className="w-16 text-stone-600">{monthTitle(m).slice(5)}</span>
              {r && r.inv.length ? (
                <>
                  <span className="flex-1 tabular-nums text-stone-800">{won(r.total)}원</span>
                  {r.late.length > 0 && <span className={r.vatDue ? "text-violet-700" : "text-stone-400"}>{r.vatDue ? `부가세 ${won(r.vatDue)} 안 보냄` : "부가세 보냄"}</span>}
                  <StatusChip s={r.status} />
                </>
              ) : (
                <span className="flex-1 text-stone-400">{r?.samchon.length ? `삼촌 대납 ${won(r.samchonSupply)}원 · 계산서 없음` : "거래 없음"}</span>
              )}
            </div>
          ))}
        </div>

        <dl className="divide-y divide-stone-100 text-xs">
          {[
            ["위치", v.address],
            ["연락처", v.phone],
            ["사업자번호", v.bizNo || "없음 — 돈 › 거래처에서 넣어 두면 좋아요"],
            ...(v.accounts || []).filter((a) => a.number).map((a, i) => [`계좌 ${i + 1}`, accountText(a)]),
            ["메모", v.memo],
          ]
            .filter(([, val]) => val)
            .map(([k, val]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5">
                <dt className="shrink-0 text-stone-500">{k}</dt>
                <dd className="text-right text-stone-800 select-all">{val}</dd>
              </div>
            ))}
        </dl>
        {!bizLines(biz).length && <p className="text-xs text-stone-400">요청 글에 우리 사업자 정보를 넣으려면 화면 위 '우리 사업자 정보'를 채워 주세요.</p>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 부가세 송금 탭

function VatTab({ rows, month, sends, biz, onDone, onUndo }) {
  const due = rows.filter((r) => r.vatDue > 0);
  const [picked, setPicked] = useState(() => new Set(due.map((r) => r.id)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // 달이 바뀌거나 목록이 바뀌면 남은 곳 전부 고른 채로
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setPicked(new Set(due.map((r) => r.id)));
  }, [month, due.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = due.filter((r) => picked.has(r.id));
  const sum = chosen.reduce((a, r) => a + r.vatDue, 0);
  const done = sends.filter((s) => s.month === month);
  const total = new Set([...rows.filter((r) => r.late.length).map((r) => r.id)]).size;
  const nameOf = (id) => rows.find((r) => r.id === id)?.vendor.name || "거래처";
  const flip = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const xlsx = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(transferRows(chosen, month, biz));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "부가세 이체");
    XLSX.writeFile(wb, `부가세이체_${month}.xlsx`);
  };
  const list = chosen.map((r) => { const a = accountFor(r); return `${r.vendor.name}\t${a?.bank || ""}\t${a?.number || ""}\t${a?.holder || ""}\t${r.vatDue}`; }).join("\n");

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
          <span className="text-xs font-semibold text-violet-800">아직 안 낸 부가세 (고른 곳)</span>
          <b className="mt-0.5 block text-2xl tabular-nums text-violet-900">{won(sum)}원</b>
          <span className="text-xs text-violet-700">{chosen.length}곳</span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <span className="text-xs font-semibold text-emerald-800">부가세 입금 완료</span>
          <b className="mt-0.5 block text-2xl tabular-nums text-emerald-900">{done.length}곳</b>
          <span className="text-xs text-emerald-700">{won(done.reduce((a, s) => a + (s.amount || 0), 0))}원</span>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
          <span className="text-xs font-semibold text-stone-500">{monthTitle(month)} · 부가세 따로 보낼 곳</span>
          <b className="mt-0.5 block text-2xl tabular-nums text-stone-900">{total}곳</b>
        </div>
      </div>

      {due.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-stone-800">부가세 보낼 곳</span>
            <button type="button" onClick={() => setPicked(chosen.length === due.length ? new Set() : new Set(due.map((r) => r.id)))} className="text-xs text-stone-500">
              {chosen.length === due.length ? "전체 해제" : "전체 고르기"}
            </button>
          </div>
          {due.map((r) => {
            const on = picked.has(r.id);
            const a = accountFor(r);
            return (
              <button key={r.id} type="button" onClick={() => flip(r.id)} className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-stone-50">
                <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full border " + (on ? "border-violet-700 bg-violet-700 text-white" : "border-stone-300 text-transparent")}>
                  <Check size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-stone-900">{r.vendor.name}</b>
                  <span className={"block truncate text-xs " + (a ? "text-stone-500" : "text-rose-700")}>
                    {accountText(a)} · 공급가 {won(r.lateSupply)}원
                  </span>
                </span>
                <span className="text-right">
                  <b className="block tabular-nums text-violet-800">{won(r.vatDue)}원</b>
                  <span className="text-[11px] text-stone-400">부가세 10%</span>
                </span>
              </button>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 bg-stone-50 px-4 py-3">
            <span className="mr-auto text-sm text-stone-700">
              선택 {chosen.length}곳 · 부가세 합계 <b className="tabular-nums text-violet-800">{won(sum)}원</b>
              {note && <span className="ml-2 text-xs text-emerald-700">{note}</span>}
            </span>
            <button type="button" disabled={!chosen.length} onClick={async () => setNote((await copyText(list)) ? "이체 목록을 복사했어요" : "복사가 막혔어요")} className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 disabled:opacity-40">
              <Copy size={12} /> 이체 목록 복사
            </button>
            <button type="button" disabled={!chosen.length} onClick={xlsx} className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 disabled:opacity-40" title="은행 대량이체에 올릴 표 — 은행 양식과 칸 이름이 다르면 알려 주세요">
              <FileSpreadsheet size={12} /> 대량이체 엑셀
            </button>
            <button
              type="button"
              disabled={!chosen.length || busy}
              onClick={async () => {
                if (!window.confirm(`${chosen.length}곳에 부가세 ${won(sum)}원을 보냈다고 표시할까요? 그 장끼들은 매입 장부에서 '부가세O'로 바뀌어요(취소하면 되돌아가요).`)) return;
                setBusy(true);
                await onDone(chosen);
                setBusy(false);
                setNote("");
              }}
              className="flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:bg-stone-300"
            >
              <Check size={12} /> 이체 완료 처리
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center text-sm text-stone-500">{monthTitle(month)}에 부가세를 따로 보낼 곳이 없어요.</p>
      )}

      {done.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 bg-emerald-50/60 px-4 py-2 text-xs font-semibold text-emerald-800">부가세 입금 완료 {done.length}곳</div>
          {done.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-2 text-sm last:border-b-0">
              <Check size={14} className="text-emerald-600" />
              <span className="flex-1 text-stone-700">
                {nameOf(s.vendorId)} <span className="text-xs text-stone-400">{md(s.on)} · {s.account}</span>
              </span>
              <b className="tabular-nums text-stone-700">{won(s.amount)}원</b>
              <button type="button" onClick={async () => copyText(vatDoneText(nameOf(s.vendorId), month, s.amount, biz)).then((ok) => setNote(ok ? `${nameOf(s.vendorId)} 입금 안내 글을 복사했어요` : "복사가 막혔어요"))} className="rounded-md border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600">
                안내 글
              </button>
              <button type="button" onClick={() => window.confirm(`${nameOf(s.vendorId)} 부가세 보낸 표시를 취소할까요? 장끼는 다시 '부가세X'로 돌아가요.`) && onUndo(s)} className="rounded-md border border-stone-200 px-2 py-0.5 text-[11px] text-stone-500">
                취소
              </button>
            </div>
          ))}
          <p className="px-4 py-2 text-[11px] text-stone-400">'안내 글'은 거래처에 "부가세 입금드렸어요" 보낼 글이에요. 알림톡이 연결되면 이체 완료 때 저절로 나가게 할 수 있어요.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 화면

export default function InvoiceRequestPage({ tx, vendors, online, onPatchTxs, onBreakdown }) {
  const months = useMemo(() => [...new Set(tx.map((t) => String(t.date || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [tx]);
  const last = shiftMonth(dayKey().slice(0, 7), -1);
  const [month, setMonth] = useState(() => (months.includes(last) ? last : months[0] || last));
  const [tab, setTab] = useState("inv");
  const [q, setQ] = useState("");
  const [sends, setSends] = useState([]);
  const [reqList, setReqList] = useState([]);
  const [biz, setBiz] = useState({});
  const [open, setOpen] = useState(null); // 거래처 id
  const [reqFor, setReqFor] = useState(null); // 요청 글 창에 띄울 거래처 id 들
  const [showSamchon, setShowSamchon] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([loadKey("vat_sends", online), loadKey("invoice_reqs", online), loadKey("biz_info", online, {})]);
      setSends(a.items || []);
      setReqList(b.items || []);
      setBiz(c || {});
    } catch {
      setMsg("기록을 불러오지 못했어요. 인터넷을 확인해 주세요.");
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
  }, [load]);

  const board = useMemo(() => monthBoard(tx, vendors, month, sends), [tx, vendors, month, sends]);
  const reqs = useMemo(() => Object.fromEntries(reqList.filter((r) => r.month === month).map((r) => [r.vendorId, r.on])), [reqList, month]);
  const sendOn = (vid) => sends.find((s) => s.month === month && s.vendorId === vid)?.on || "";

  const needle = q.trim().toLowerCase();
  const match = (r) => !needle || r.vendor.name.toLowerCase().includes(needle);
  const byAmount = (a, b) => b.total - a.total;
  const late = board.filter((r) => r.kind === "late" && match(r)).sort(byAmount);
  const paid = board.filter((r) => r.kind === "paid" && match(r)).sort(byAmount);
  const samchon = board.filter((r) => r.samchon.length && match(r)).sort((a, b) => b.samchonSupply - a.samchonSupply);
  const targets = board.filter((r) => r.inv.length);
  const arrived = targets.filter((r) => r.status === "done").length;
  const vatDue = board.filter((r) => r.vatDue > 0);
  // 요청할 수 있는 곳 — 아직 다 안 받았고, 후입금이면 부가세를 다 보낸 곳
  const askable = targets.filter((r) => r.status !== "done" && r.vatDue === 0);

  const markReq = (ids) =>
    changeKey("invoice_reqs", online, (v) => {
      let next = v;
      for (const id of ids) next = upsert({ id: `${month}|${id}`, month, vendorId: id, on: dayKey() })(next);
      return next;
    }).then((v) => setReqList(v.items || []));

  const vatDoneAll = async (rows) => {
    // 장끼 부가세O 로 — 한 번에(patchTxs 를 여러 번 부르면 마지막 것만 남는다)
    onPatchTxs(rows.flatMap((r) => r.unsent.map((t) => t.id)), { vatPaid: true });
    const today = dayKey();
    const v = await changeKey("vat_sends", online, (cur) => {
      let next = cur;
      for (const r of rows) next = upsert({ id: newId("vs"), month, vendorId: r.id, txIds: r.unsent.map((t) => t.id), amount: r.vatDue, on: today, account: accountText(accountFor(r)) })(next);
      return next;
    });
    setSends(v.items || []);
  };
  const vatUndo = async (s) => {
    onPatchTxs(s.txIds || [], { vatPaid: false });
    setSends((await changeKey("vat_sends", online, remove(s.id))).items || []);
  };
  const saveBiz = async (x) => setBiz(await changeKey("biz_info", online, () => x, {}));

  const openRow = board.find((r) => r.id === open);

  const Row = ({ r }) => (
    <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5 last:border-b-0 hover:bg-stone-50">
      <button type="button" onClick={() => setOpen(r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <b className="truncate text-stone-900">{r.vendor.name}</b>
        {r.kind === "late" && <span className="shrink-0 rounded-full border border-violet-300 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">부가세 후입금</span>}
        {reqs[r.id] && r.status !== "done" && <span className="shrink-0 text-[11px] text-stone-400">요청함 {md(reqs[r.id])}</span>}
      </button>
      <StatusChip s={r.status} />
      <b className="w-20 shrink-0 text-right tabular-nums text-stone-900">{won(r.total)}</b>
      {r.vatDue > 0 ? (
        <button type="button" onClick={() => setTab("vat")} className="w-24 shrink-0 rounded-lg border border-violet-300 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50">
          부가세 먼저 →
        </button>
      ) : r.status !== "done" ? (
        <button type="button" onClick={() => setReqFor([r.id])} className="w-24 shrink-0 rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">
          요청 글 →
        </button>
      ) : (
        <span className="w-24 shrink-0" />
      )}
      <button type="button" onClick={() => setOpen(r.id)} aria-label="자세히" className="text-stone-300 hover:text-stone-600">
        <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">계산서 발행 요청·확인</h2>
        <p className="mt-0.5 text-sm text-stone-500">달마다 거래처에 계산서를 요청하고, 부가세를 따로 보내는 곳은 부가세부터 보내요. 받았는지는 장끼의 '세금계산서 받음'과 같은 값이에요.</p>
      </div>
      {msg && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold">
          {[...new Set([month, ...months])].sort().reverse().map((m) => (
            <option key={m} value={m}>
              {monthTitle(m)}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
          {[
            ["inv", "계산서 챙기기"],
            ["vat", `거래처 부가세 송금${vatDue.length ? ` ${vatDue.length}` : ""}`],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={"rounded-lg px-3 py-1.5 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <BizCard key={JSON.stringify(biz)} biz={biz} onSave={saveBiz} online={online} />

      {tab === "vat" ? (
        <VatTab key={month} rows={board} month={month} sends={sends} biz={biz} onDone={vatDoneAll} onUndo={vatUndo} />
      ) : (
        <>
          <section className="mb-4 rounded-2xl border border-stone-200 bg-white px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-stone-500">{monthTitle(month)} 계산서 도착</span>
                <b className="mt-0.5 block text-3xl tabular-nums text-stone-900">
                  {arrived} / {targets.length}곳
                </b>
              </div>
              <button type="button" disabled={!askable.length} onClick={() => setReqFor(askable.map((r) => r.id))} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
                <Send size={15} /> {askable.length}곳 요청 글 만들기
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${targets.length ? (arrived / targets.length) * 100 : 0}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-stone-500 tabular-nums">
              <span>받을 계산서 합계 {won(targets.reduce((a, r) => a + r.total, 0))}원</span>
              {vatDue.length > 0 && (
                <button type="button" onClick={() => setTab("vat")} className="font-medium text-violet-700 hover:underline">
                  부가세 먼저 보낼 곳 {vatDue.length}곳 · {won(vatDue.reduce((a, r) => a + r.vatDue, 0))}원 →
                </button>
              )}
            </div>
          </section>

          <div className="relative mb-2">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 이름으로 찾기" className="w-full rounded-xl border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm" />
          </div>

          {[
            [late, "받을 계산서 · 부가세 후입금", "bg-violet-600", "부가세를 먼저 따로 보내야 계산서를 요청할 수 있어요. 계산서는 전액(공급가+부가세)으로 받아요."],
            [paid, "받을 계산서 · 부가세 포함 입금", "bg-emerald-600", "부가세까지 이미 보낸 곳 — 계산서만 받으면 돼요."],
          ].map(
            ([list, title, dot, hint]) =>
              list.length > 0 && (
                <section key={title} className="mb-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <div className="border-b border-stone-100 bg-stone-50 px-4 py-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                      <span className={"h-2 w-2 rounded-full " + dot} /> {title} <span className="font-normal text-stone-400">{list.length}곳 · {won(list.reduce((a, r) => a + r.total, 0))}원</span>
                    </span>
                    <span className="text-[11px] text-stone-500">{hint}</span>
                  </div>
                  {list.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                </section>
              ),
          )}
          {!late.length && !paid.length && <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center text-sm text-stone-500">{monthTitle(month)}에 계산서 받을 이체 장끼가 없어요.</p>}

          {samchon.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <button type="button" onClick={() => setShowSamchon(!showSamchon)} className="flex w-full items-center gap-2 bg-stone-50 px-4 py-2 text-left text-sm font-semibold text-stone-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> 계산서 안 받는 곳 · 삼촌 대납 <span className="font-normal text-stone-400">{samchon.length}곳 · 공급가 {won(samchon.reduce((a, r) => a + r.samchonSupply, 0))}원</span>
                <ChevronDown size={14} className={"ml-auto " + (showSamchon ? "rotate-180" : "")} />
              </button>
              {showSamchon &&
                samchon.map((r) => (
                  <button key={r.id} type="button" onClick={() => setOpen(r.id)} className="flex w-full items-center justify-between border-t border-stone-100 px-4 py-2 text-left text-sm hover:bg-stone-50">
                    <span className="text-stone-700">{r.vendor.name}</span>
                    <span className="tabular-nums text-stone-500">{won(r.samchonSupply)}원</span>
                  </button>
                ))}
            </section>
          )}
        </>
      )}

      {openRow && (
        <VendorSheet
          row={openRow}
          month={month}
          tx={tx}
          vendors={vendors}
          sends={sends}
          reqOn={reqs[openRow.id]}
          biz={biz}
          onInvoice={(ids, on) => onPatchTxs(ids, { invoice: on })}
          onBreakdown={(spec) => {
            setOpen(null);
            onBreakdown(spec);
          }}
          onRequest={() => {
            setOpen(null);
            setReqFor([openRow.id]);
          }}
          onGoVat={() => {
            setOpen(null);
            setTab("vat");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {reqFor && (
        <RequestSheet rows={board.filter((r) => reqFor.includes(r.id))} month={month} biz={biz} sendsOn={sendOn} reqs={reqs} onMark={markReq} onClose={() => setReqFor(null)} />
      )}
    </div>
  );
}
