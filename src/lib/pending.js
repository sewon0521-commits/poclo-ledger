// 미송 · 불량 · 매입금 · 잔액
//
// 장부에는 "돈이 나간 것"만 있는 게 아니다. 돈은 이미 지나갔는데 물건이 아직
// 안 온 것(미송), 물건은 돌려줬는데 돈이 남은 것(불량·매입금), 천원 단위로
// 맞추려고 더 낸 것(잔액)이 늘 섞여 있다. 이걸 못 보면 두 번 내게 된다.
//
// 규칙 하나만 기억하면 된다.
//
//   미송     돈 냈다 · 물건 아직    → 장부 금액에 **든다**
//   미송출고 돈 이미 냄 · 물건 왔다 → 장부 금액에 **안 든다** (또 내면 이중 지불)
//   매입금   돈이 거래처에 남아 있다 → 다음 거래에서 깎아 쓴다
//   잔액     천원 단위로 덜·더 낸 돈 → 다음 거래에서 맞춘다 (장끼와 같은 부호)

import { won } from "./calc";

/** 품목명을 맞대볼 때 쓰는 열쇠. 띄어쓰기·대소문자는 무시한다. */
export const itemKey = (name) => String(name || "").trim().replace(/\s+/g, "").toLowerCase();

const byDate = (a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date));

// ------------------------------------------------------------- 미송 · 불량

/**
 * 미송과 불량은 같은 모양으로 흐른다 — **잡히고, 나중에 풀린다.**
 *
 *   미송  pending(잡음)  → pendingOut(미송 출고 받음)
 *   불량  defect(불량 옴) → defectOut(교환 받음 / 매입으로 정리)
 *
 * 잡은 수량 − 풀린 수량 = 아직 남은 것. 남아 있으면 매입 장부 위에 계속 떠 있고,
 * 다 풀리면 사라진다. 잡은 날·풀린 날을 다 들고 있어서 "언제 생겼고 언제 받았나"를 본다.
 *
 * 불량은 **다른 품목으로 바꿔 받는 일이 많다.** 그래서 defectOut 줄의 품목명은
 * '받은 것'이고, 어느 불량을 푼 것인지는 linkName(원래 불량 품목명)으로 잇는다.
 * (세원 요청 2026-09-16: 불량이 오면 체크만 해 두고, 교환받을 때 그 불량을 골라
 *  무엇으로 몇 장 받았는지 적는 흐름)
 */
export const FLOWS = {
  pending: { in: "pending", out: "pendingOut" },
  defect: { in: "defect", out: "defectOut" },
};

/** 풀린 줄이 어느 잡힌 줄을 푸는지 — 불량 교환은 linkName, 없으면 자기 이름 */
const flowName = (i) => (i.kind === "defectOut" && i.linkName ? i.linkName : i.name);

export function flowBoard(tx, vendorName, flowKey = "pending") {
  const F = FLOWS[flowKey];
  const lines = new Map(); // vendorId|itemKey → 한 줄

  for (const t of [...tx].sort(byDate)) {
    for (const i of t.items || []) {
      if (i.kind !== F.in && i.kind !== F.out) continue;
      const name = flowName(i);
      const k = `${t.vendorId}|${itemKey(name)}`;
      let row = lines.get(k);
      if (!row) {
        row = {
          key: k,
          vendorId: t.vendorId,
          vendor: vendorName(t.vendorId),
          name: name || "(품목명 없음)",
          unitPrice: 0,
          taken: 0,
          out: 0,
          takenDates: [],
          outDates: [],
        };
        lines.set(k, row);
      }
      const qty = Math.abs(Number(i.qty) || 0);
      if (i.kind === F.in) {
        if (i.unitPrice) row.unitPrice = i.unitPrice;
        row.taken += qty;
        row.takenDates.push({ date: t.date, qty, txId: t.id, note: i.note || "" });
      } else {
        row.out += qty;
        row.outDates.push({
          date: t.date,
          qty,
          txId: t.id,
          // 불량 교환: 무엇으로 받았나 (원래 품목과 이름이 다르면 그게 받은 것)
          got: flowKey === "defect" && i.name && itemKey(i.name) !== itemKey(name) ? i.name : "",
          note: i.note || "",
        });
      }
    }
  }

  const all = [...lines.values()].map((r) => ({
    ...r,
    left: r.taken - r.out,
    amount: (r.taken - r.out) * r.unitPrice,
    lastDate: r.takenDates.at(-1)?.date || r.outDates.at(-1)?.date || "",
    firstDate: r.takenDates[0]?.date || "",
  }));

  // 거래처별로 묶는다 — 남은 게 많은 거래처가 위로
  const groups = new Map();
  for (const r of all) {
    if (!groups.has(r.vendorId)) {
      groups.set(r.vendorId, { vendorId: r.vendorId, vendor: r.vendor, lines: [], left: 0, amount: 0 });
    }
    groups.get(r.vendorId).lines.push(r);
  }
  for (const g of groups.values()) {
    g.lines.sort((a, b) => b.left - a.left || b.lastDate.localeCompare(a.lastDate));
    g.left = g.lines.reduce((s, r) => s + Math.max(r.left, 0), 0);
    g.amount = g.lines.reduce((s, r) => s + Math.max(r.amount, 0), 0);
  }

  const list = [...groups.values()].sort((a, b) => b.left - a.left || b.amount - a.amount);
  return {
    groups: list,
    open: list.filter((g) => g.left > 0),
    totalLeft: list.reduce((s, g) => s + g.left, 0),
    totalAmount: list.reduce((s, g) => s + g.amount, 0),
  };
}

export const pendingBoard = (tx, vendorName) => flowBoard(tx, vendorName, "pending");
export const defectBoard = (tx, vendorName) => flowBoard(tx, vendorName, "defect");

/** 이 거래처에 아직 남아 있는 것. 장끼를 넣을 때 폼 안에 띄워 준다. */
export function openOf(tx, vendorId, vendorName, flowKey = "pending") {
  if (!vendorId) return [];
  const board = flowBoard(
    tx.filter((t) => t.vendorId === vendorId),
    vendorName,
    flowKey,
  );
  return (board.groups[0]?.lines || []).filter((r) => r.left > 0);
}
export const pendingOf = (tx, vendorId, vendorName) => openOf(tx, vendorId, vendorName, "pending");
export const defectOf = (tx, vendorId, vendorName) => openOf(tx, vendorId, vendorName, "defect");

/** 그날 잡힌 것 / 그날 풀린 것 — 하루 단위로 보고 싶을 때 */
export function flowByDay(tx, vendorName, flowKey = "pending") {
  const F = FLOWS[flowKey];
  const days = new Map();
  for (const t of [...tx].sort(byDate)) {
    for (const i of t.items || []) {
      if (i.kind !== F.in && i.kind !== F.out) continue;
      if (!days.has(t.date)) days.set(t.date, { date: t.date, taken: [], out: [] });
      const name = flowName(i);
      const row = {
        vendor: vendorName(t.vendorId),
        name: name || "(품목명 없음)",
        got: i.kind === F.out && i.name && itemKey(i.name) !== itemKey(name) ? i.name : "",
        note: i.note || "",
        qty: Math.abs(Number(i.qty) || 0),
        amount: Math.abs(Number(i.amount) || 0),
        txId: t.id,
      };
      days.get(t.date)[i.kind === F.in ? "taken" : "out"].push(row);
    }
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export const pendingByDay = (tx, vendorName) => flowByDay(tx, vendorName, "pending");

// ---------------------------------------------------------------- 매입금

const daysBetween = (from, to) =>
  Math.round((new Date(to + "T00:00:00") - new Date(from + "T00:00:00")) / 86400000);

/**
 * 거래처별 매입금 원장.
 * 언제 얼마가 잡혔고, 언제 무엇 때문에 얼마가 빠졌고, 지금 얼마 남았나.
 * 기한이 있는 거래처는 남은 날짜를 같이 센다 — 지나면 그냥 사라지는 돈이다.
 */
export function creditBoard(tx, vendorName, today) {
  const m = new Map();
  for (const t of [...tx].sort(byDate)) {
    if (!t.creditAdd && !t.creditUse && !t.creditExpiry) continue;
    if (!m.has(t.vendorId)) {
      m.set(t.vendorId, {
        vendorId: t.vendorId,
        vendor: vendorName(t.vendorId),
        entries: [],
        added: 0,
        used: 0,
        expiry: "",
      });
    }
    const v = m.get(t.vendorId);
    v.entries.push({
      txId: t.id,
      date: t.date,
      add: t.creditAdd || 0,
      use: t.creditUse || 0,
      note: t.creditNote || t.memo || "",
      expiry: t.creditExpiry || "",
    });
    v.added += t.creditAdd || 0;
    v.used += t.creditUse || 0;
    // 가장 마지막에 적어 준 기한을 따른다
    if (t.creditExpiry) v.expiry = t.creditExpiry;
  }

  const list = [...m.values()].map((v) => {
    const balance = v.added - v.used;
    const daysLeft = v.expiry && today ? daysBetween(today, v.expiry) : null;
    return {
      ...v,
      balance,
      daysLeft,
      expired: daysLeft !== null && daysLeft < 0 && balance > 0,
      soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && balance > 0,
      entries: v.entries.slice().reverse(),
    };
  });

  list.sort((a, b) => b.balance - a.balance);
  return {
    list,
    open: list.filter((v) => v.balance !== 0),
    total: list.reduce((s, v) => s + v.balance, 0),
    expiring: list.filter((v) => v.soon || v.expired),
  };
}

// ------------------------------------------------------------------ 잔액

/**
 * 잔액은 **장끼와 같은 방향**으로 센다.
 *
 *   당잔 = 전잔 + 당일합계 − 현금입금
 *
 * 양수 = 우리가 **덜 낸** 돈(다음에 더 내야 함), 음수 = 우리가 **더 낸** 돈(다음에 깎음).
 * 3,500원짜리를 4,000원 내면 당잔 −500, 다음 날 3,500원을 3,000원만 내면 당잔 0.
 * (세원 예시: "전잔 −500 = 우리가 500원 더 냈음")
 *
 * 처음엔 반대 방향(낸 돈 − 살 돈)으로 만들었는데, 장끼 숫자를 그대로 옮겨 적으려면
 * 부호가 장끼와 같아야 해서 2026-09-15 에 뒤집었다.
 *
 * 거래 한 건에 손으로 적은 값이 있으면 그걸 믿는다 — 거래처 장부(장끼)가 기준이다.
 *   prevBalance  장끼에 찍힌 전잔. 적으면 그 거래부터 잔액이 이 값에서 다시 시작한다.
 *   balance      장끼에 찍힌 당잔. 적으면 다음 거래로 이 값이 넘어간다.
 *   cashPaid     현금입금. 안 적었고 당잔은 적었으면 거꾸로 풀어서 채운다.
 */
export function stepBalance(running, t) {
  const has = (v) => v !== null && v !== undefined && v !== "";
  const day = t.supply || 0;
  const before = has(t.prevBalance) ? Number(t.prevBalance) : running;
  const cash = has(t.cashPaid)
    ? Number(t.cashPaid)
    : has(t.balance)
      ? before + day - Number(t.balance)
      : day;
  const computedAfter = before + day - cash;
  const after = has(t.balance) ? Number(t.balance) : computedAfter;
  return {
    before,
    day,
    cash,
    after,
    // 앱이 이어서 센 전잔과 장끼에 적은 전잔이 다르면 — 어딘가 빠졌거나 잘못 적은 것
    expectedBefore: running,
    beforeGap: has(t.prevBalance) ? Number(t.prevBalance) - running : 0,
    // 장끼 숫자끼리 안 맞으면(전잔 + 합계 − 입금 ≠ 당잔)
    afterGap: has(t.balance) && has(t.cashPaid) ? Number(t.balance) - computedAfter : 0,
  };
}

/** 거래처별 잔액 흐름. vendorId → [{txId, date, before, day, cash, after, beforeGap, afterGap}] */
export function balanceRuns(tx) {
  const runs = new Map();
  const at = new Map();
  for (const t of [...tx].sort(byDate)) {
    const step = stepBalance(at.get(t.vendorId) || 0, t);
    at.set(t.vendorId, step.after);
    if (!runs.has(t.vendorId)) runs.set(t.vendorId, []);
    runs.get(t.vendorId).push({ txId: t.id, date: t.date, ...step });
  }
  return runs;
}

/** 거래 한 건의 전잔·당잔. 없으면 0으로 시작한 것으로 본다. */
export function balanceOfTx(runs, tx) {
  const row = runs.get(tx.vendorId)?.find((r) => r.txId === tx.id);
  return row || { before: 0, day: tx.supply || 0, cash: tx.supply || 0, after: 0 };
}

/**
 * 새 거래를 넣을 때의 전잔 — 그 거래처의, 그 날짜 **앞**까지 이어 센 잔액.
 * 수정 중인 거래는 빼고 센다(자기 자신이 자기 전잔에 들어가면 안 된다).
 */
export function balanceBefore(tx, vendorId, date, exceptId) {
  if (!vendorId) return 0;
  let bal = 0;
  for (const t of [...tx].sort(byDate)) {
    if (t.vendorId !== vendorId || t.id === exceptId) continue;
    if (date && t.date > date) break;
    if (date && t.date === date && t.id >= (exceptId || "￿")) continue;
    bal = stepBalance(bal, t).after;
  }
  return bal;
}

/**
 * 앱이 이어 센 전잔에 **근거가 있나** — 그 거래처의 앞선 장끼에 현금입금·전잔·당잔 중
 * 하나라도 실제로 적혀 있어야 근거가 있다. 그런 게 없으면 앱의 전잔 0 은 "모름"이지
 * 사실이 아니므로, 장끼에 적힌 전잔과 달라도 알리지 않는다.
 * (지원이 장끼를 날짜 순서 없이 넣다가 "금액이 안 맞는다" 경고를 계속 봤다 — 2026-09-15)
 */
export function balanceBasis(tx, vendorId, date, exceptId) {
  if (!vendorId) return false;
  const has = (v) => v !== null && v !== undefined && v !== "";
  return tx.some(
    (t) =>
      t.vendorId === vendorId &&
      t.id !== exceptId &&
      (!date || t.date < date || (t.date === date && t.id < (exceptId || "\uffff"))) &&
      (has(t.cashPaid) || has(t.prevBalance) || has(t.balance)),
  );
}

/** 잔액을 사람 말로. 부호만 보고는 어느 쪽이 이득인지 알 수가 없다. */
export const balanceText = (n) => {
  if (!n) return "딱 맞아요";
  return n > 0 ? `${won(n)} 덜 냈어요 (다음에 더 내요)` : `${won(-n)} 더 냈어요 (다음에 깎아요)`;
};
