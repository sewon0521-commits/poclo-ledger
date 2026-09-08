import { useMemo, useState } from "react";
import { Clock, PackageCheck, AlertTriangle, Wallet, Info, CalendarClock } from "lucide-react";
import { won, dayLabel, todayISO } from "../lib/calc";
import { pendingBoard, pendingByDay, defectList, creditBoard, balanceRuns, balanceText } from "../lib/pending";
import { Kpi, Empty, Tab } from "./ui";

/**
 * 미송 · 불량 · 잔액 · 매입금.
 *
 * 매입 장부가 "얼마 썼나"를 본다면 여기는 **"어디에 걸려 있나"**를 본다.
 * 돈은 나갔는데 물건이 안 온 것(미송), 물건은 돌려줬는데 돈이 남은 것(불량·매입금),
 * 천원 단위로 맞추려고 더 낸 것(잔액). 이걸 못 보면 두 번 내게 된다.
 */

const TABS = [
  ["pending", "미송", Clock],
  ["defect", "불량·교환", AlertTriangle],
  ["credit", "잔액·매입금", Wallet],
];

// ------------------------------------------------------------------- 미송

function PendingTab({ board, byDay, onOpen }) {
  const [open, setOpen] = useState("");

  if (board.totalLeft === 0 && byDay.length === 0) {
    return (
      <Empty
        title="잡아 둔 미송이 없어요."
        hint="장끼를 넣을 때 품목 오른쪽 칩을 눌러 '미송'으로 바꾸면 여기에 쌓여요."
      />
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Kpi
          label="남은 미송"
          value={board.totalLeft + "장"}
          tone={board.totalLeft > 0 ? "amber" : undefined}
          sub={`거래처 ${board.open.length}곳`}
        />
        <Kpi label="그 값어치" value={won(board.totalAmount)} sub="공급가 기준 · 이미 낸 돈" />
        <Kpi label="기록된 품목" value={board.groups.reduce((n, g) => n + g.lines.length, 0) + "개"} sub="출고 끝난 것 포함" />
      </div>

      {board.open.length === 0 ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
          <b className="font-semibold">남은 미송이 없어요.</b> 잡은 것이 전부 출고됐습니다.
        </div>
      ) : (
        <div className="mb-6 space-y-2.5">
          {board.open.map((g) => (
            <section key={g.vendorId} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <button
                type="button"
                onClick={() => setOpen(open === g.vendorId ? "" : g.vendorId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-stone-900">
                    {g.vendor || "(거래처 없음)"}
                  </span>
                  <span className="text-xs text-stone-400">
                    {g.lines.filter((r) => r.left > 0).length}개 품목
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums text-amber-700">{g.left}장</span>
                  <span className="text-xs tabular-nums text-stone-400">{won(g.amount)}</span>
                </span>
              </button>

              <table className="w-full text-sm">
                <tbody className="divide-y divide-stone-100">
                  {g.lines
                    .filter((r) => r.left > 0)
                    .map((r) => (
                      <tr key={r.key} className="align-top">
                        <td className="py-2 pr-2 pl-4 text-stone-800">
                          {r.name}
                          {open === g.vendorId && (
                            <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-stone-400">
                              {r.takenDates.map((d, i) => (
                                <button
                                  key={"t" + i}
                                  type="button"
                                  onClick={() => onOpen(d.txId)}
                                  className="block text-left hover:text-rose-700"
                                >
                                  {dayLabel(d.date)} 미송 {d.qty}장 잡음
                                </button>
                              ))}
                              {r.outDates.map((d, i) => (
                                <button
                                  key={"o" + i}
                                  type="button"
                                  onClick={() => onOpen(d.txId)}
                                  className="block text-left text-emerald-600 hover:text-emerald-800"
                                >
                                  {dayLabel(d.date)} {d.qty}장 출고 받음
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right text-xs whitespace-nowrap tabular-nums text-stone-400">
                          {r.taken}장 잡고 {r.out}장 받음
                        </td>
                        <td className="py-2 pr-4 pl-2 text-right whitespace-nowrap">
                          <span className="font-semibold tabular-nums text-amber-700">{r.left}장</span>
                          {r.unitPrice > 0 && (
                            <span className="block text-[11px] tabular-nums text-stone-400">
                              {won(r.amount)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {open !== g.vendorId && (
                <div className="border-t border-stone-100 px-4 py-1.5 text-[11px] text-stone-400">
                  거래처 이름을 누르면 잡은 날·받은 날이 보여요.
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {byDay.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">날짜별 기록</h3>
          <div className="space-y-2.5">
            {byDay.slice(0, 40).map((d) => (
              <div key={d.date} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                <div className="mb-1.5 text-sm font-semibold text-stone-900">{dayLabel(d.date)}</div>
                <ul className="space-y-1 text-sm">
                  {d.taken.map((r, i) => (
                    <li key={"t" + i} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-stone-600">
                        <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          미송
                        </span>
                        {r.vendor} · {r.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-stone-500">
                        {r.qty}장 {won(r.amount)}
                      </span>
                    </li>
                  ))}
                  {d.out.map((r, i) => (
                    <li key={"o" + i} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-stone-600">
                        <span className="mr-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                          출고
                        </span>
                        {r.vendor} · {r.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-stone-400">{r.qty}장</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ 불량

function DefectTab({ rows, onOpen }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="불량으로 잡은 게 없어요."
        hint="장끼에서 품목 칩을 '불량'으로 바꾸면 무엇으로 바꿔 받았는지까지 여기 남아요."
      />
    );
  }
  const total = rows.reduce((s, r) => s + Math.abs(r.amount), 0);
  const qty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Kpi label="불량 건" value={rows.length + "건"} sub={`${qty}장`} tone="rose" />
        <Kpi label="그 값어치" value={won(total)} sub="공급가 기준" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-400">
              {["날짜", "거래처", "품목", "수량", "금액", "바꿔 받은 것"].map((h, i) => (
                <th
                  key={h}
                  className={"px-3 py-2.5 font-medium " + (i >= 3 && i <= 4 ? "text-right" : "text-left")}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onOpen(r.txId)}
                className="cursor-pointer hover:bg-stone-50"
              >
                <td className="px-3 py-2 whitespace-nowrap text-stone-500">{dayLabel(r.date)}</td>
                <td className="px-3 py-2 text-stone-800">{r.vendor}</td>
                <td className="px-3 py-2 text-stone-800">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-600">{r.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-600">{won(r.amount)}</td>
                <td className="px-3 py-2 text-stone-500">
                  {r.note || <span className="text-stone-300">아직 안 적었어요</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------- 잔액 · 매입금

function CreditTab({ credit, balances, vendorName, onOpen }) {
  const [open, setOpen] = useState("");
  const bal = [...balances.entries()]
    .map(([vendorId, runs]) => ({
      vendorId,
      vendor: vendorName(vendorId),
      value: runs.at(-1)?.after || 0,
      last: runs.at(-1),
    }))
    .filter((b) => b.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  if (credit.open.length === 0 && bal.length === 0) {
    return (
      <Empty
        title="걸려 있는 돈이 없어요."
        hint="장끼에서 '현금입금'을 적으면 전잔·당잔이 쌓이고, '매입금'을 적으면 여기에 남아요."
      />
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Kpi
          label="매입금 잔액"
          value={won(credit.total)}
          tone={credit.total > 0 ? "emerald" : undefined}
          sub={`${credit.open.length}곳에 남아 있어요`}
        />
        <Kpi
          label="더 낸 돈 (잔액)"
          value={won(bal.reduce((s, b) => s + b.value, 0))}
          sub={`${bal.length}곳`}
        />
      </div>

      {credit.expiring.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-amber-900">
            <CalendarClock size={14} /> 기한이 있는 매입금
          </div>
          <ul className="mt-1.5 space-y-1 text-amber-800">
            {credit.expiring.map((v) => (
              <li key={v.vendorId} className="flex items-baseline justify-between gap-2">
                <span>
                  {v.vendor} · {v.expiry}까지
                </span>
                <span className="shrink-0 tabular-nums">
                  {won(v.balance)}{" "}
                  <b className="font-semibold">
                    {v.expired ? "기한 지남" : `D-${v.daysLeft}`}
                  </b>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-amber-700">
            기한이 지나면 그냥 사라지는 돈이에요. 그 전에 물건으로 바꿔 오세요.
          </p>
        </div>
      )}

      {credit.open.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-stone-700">매입금 원장</h3>
          <div className="space-y-2.5">
            {credit.open.map((v) => (
              <div key={v.vendorId} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpen(open === v.vendorId ? "" : v.vendorId)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-stone-900">{v.vendor}</span>
                    <span className="text-xs tabular-nums text-stone-400">
                      잡은 돈 {won(v.added)} · 깎아 쓴 돈 {won(v.used)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums text-emerald-700">
                      {won(v.balance)}
                    </span>
                    <span className="text-xs text-stone-400">남음</span>
                  </span>
                </button>
                {open === v.vendorId && (
                  <ul className="divide-y divide-stone-100 border-t border-stone-100">
                    {v.entries.map((e, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onOpen(e.txId)}
                          className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50"
                        >
                          <span className="min-w-0">
                            <span className="text-stone-600">{dayLabel(e.date)}</span>
                            {e.note && (
                              <span className="ml-1.5 text-xs text-stone-400">{e.note}</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {e.add > 0 && <span className="text-emerald-700">+{won(e.add)}</span>}
                            {e.add > 0 && e.use > 0 && " "}
                            {e.use > 0 && <span className="text-stone-500">−{won(e.use)}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {bal.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-stone-700">거래처 잔액</h3>
          <p className="mb-2 text-xs leading-relaxed text-stone-400">
            천원 단위로 맞춰 주고받다 보면 남는 돈. <b className="font-semibold">양수면 우리가 더 낸
            것</b>이라 다음 거래에서 그만큼 덜 내면 돼요.
          </p>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {bal.map((b) => (
              <li key={b.vendorId}>
                <button
                  type="button"
                  onClick={() => b.last && onOpen(b.last.txId)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                >
                  <span className="min-w-0 truncate text-sm text-stone-800">{b.vendor}</span>
                  <span
                    className={
                      "shrink-0 text-sm tabular-nums " +
                      (b.value > 0 ? "text-emerald-700" : "text-rose-700")
                    }
                  >
                    {balanceText(b.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------- 화면

export default function PendingPage({ tx, vendors, onOpenTx }) {
  const [tab, setTab] = useState("pending");
  const vendorName = useMemo(
    () => (id) => vendors.find((v) => v.id === id)?.name || "",
    [vendors],
  );

  const board = useMemo(() => pendingBoard(tx, vendorName), [tx, vendorName]);
  const byDay = useMemo(() => pendingByDay(tx, vendorName), [tx, vendorName]);
  const defects = useMemo(() => defectList(tx, vendorName), [tx, vendorName]);
  const credit = useMemo(() => creditBoard(tx, vendorName, todayISO()), [tx, vendorName]);
  const balances = useMemo(() => balanceRuns(tx), [tx]);

  const open = (txId) => {
    const t = tx.find((x) => x.id === txId);
    if (t) onOpenTx(t);
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">미송 · 매입금</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          돈은 지나갔는데 아직 안 끝난 것들. 여기서 안 보면 같은 값을 두 번 내게 돼요.
        </p>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1">
        {TABS.map(([key, label, Icon]) => (
          <Tab key={key} active={tab === key} onClick={() => setTab(key)}>
            <Icon size={14} /> {label}
          </Tab>
        ))}
      </div>

      {tab === "pending" ? (
        <PendingTab board={board} byDay={byDay} onOpen={open} />
      ) : tab === "defect" ? (
        <DefectTab rows={defects} onOpen={open} />
      ) : (
        <CreditTab credit={credit} balances={balances} vendorName={vendorName} onOpen={open} />
      )}

      <p className="mt-5 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          여기 있는 건 전부 <b className="font-semibold">장끼에서 넣은 것</b>이에요. 품목 오른쪽
          칩을 눌러 <b className="font-semibold">매입 → 미송 → 출고 → 불량</b> 으로 바꾸면 되고,{" "}
          <PackageCheck size={12} className="inline align-[-2px]" /> 출고로 잡은 줄은{" "}
          <b className="font-semibold">당일합계에 안 들어갑니다</b> — 이미 낸 돈이니까요.
        </span>
      </p>
    </div>
  );
}
