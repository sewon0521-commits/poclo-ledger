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

// ------------------------------------------------------------------- 미송

/**
 * 거래처 × 품목별 미송 현황.
 *
 * 미송으로 잡은 수량에서 미송 출고된 수량을 뺀 것이 지금 남은 미송이다.
 * 잡은 날과 출고된 날을 같이 들고 있어야 "언제 잡았더라"를 볼 수 있다.
 */
export function pendingBoard(tx, vendorName) {
  const lines = new Map(); // vendorId|itemKey → 한 줄

  for (const t of [...tx].sort(byDate)) {
    for (const i of t.items || []) {
      if (i.kind !== "pending" && i.kind !== "pendingOut") continue;
      const k = `${t.vendorId}|${itemKey(i.name)}`;
      let row = lines.get(k);
      if (!row) {
        row = {
          key: k,
          vendorId: t.vendorId,
          vendor: vendorName(t.vendorId),
          name: i.name || "(품목명 없음)",
          unitPrice: 0,
          taken: 0,
          out: 0,
          takenDates: [],
          outDates: [],
        };
        lines.set(k, row);
      }
      const qty = Math.abs(Number(i.qty) || 0);
      if (i.unitPrice) row.unitPrice = i.unitPrice;
      if (i.kind === "pending") {
        row.taken += qty;
        row.takenDates.push({ date: t.date, qty, txId: t.id });
      } else {
        row.out += qty;
        row.outDates.push({ date: t.date, qty, txId: t.id });
      }
    }
  }

  const all = [...lines.values()].map((r) => ({
    ...r,
    left: r.taken - r.out,
    amount: (r.taken - r.out) * r.unitPrice,
    lastDate: r.takenDates.at(-1)?.date || "",
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

/** 이 거래처에 아직 남아 있는 미송. 장끼를 넣을 때 옆에 띄워 준다. */
export function pendingOf(tx, vendorId, vendorName) {
  if (!vendorId) return [];
  const board = pendingBoard(
    tx.filter((t) => t.vendorId === vendorId),
    vendorName,
  );
  return (board.groups[0]?.lines || []).filter((r) => r.left > 0);
}

/** 그날 잡힌 미송 / 그날 출고된 미송 — 하루 단위로 보고 싶을 때 */
export function pendingByDay(tx, vendorName) {
  const days = new Map();
  for (const t of [...tx].sort(byDate)) {
    for (const i of t.items || []) {
      if (i.kind !== "pending" && i.kind !== "pendingOut") continue;
      if (!days.has(t.date)) days.set(t.date, { date: t.date, taken: [], out: [] });
      const row = {
        vendor: vendorName(t.vendorId),
        name: i.name || "(품목명 없음)",
        qty: Math.abs(Number(i.qty) || 0),
        amount: Math.abs(Number(i.amount) || 0),
        txId: t.id,
      };
      days.get(t.date)[i.kind === "pending" ? "taken" : "out"].push(row);
    }
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// ------------------------------------------------------------------ 불량

/** 불량으로 잡은 것들. 무엇으로 바꿔 받았는지는 note에 적혀 있다. */
export function defectList(tx, vendorName) {
  const out = [];
  for (const t of tx) {
    for (const i of t.items || []) {
      if (i.kind !== "defect") continue;
      out.push({
        id: `${t.id}|${i.id}`,
        txId: t.id,
        date: t.date,
        vendorId: t.vendorId,
        vendor: vendorName(t.vendorId),
        name: i.name || "(품목명 없음)",
        qty: Math.abs(Number(i.qty) || 0),
        amount: Number(i.amount) || 0,
        note: i.note || "",
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

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

/** 잔액을 사람 말로. 부호만 보고는 어느 쪽이 이득인지 알 수가 없다. */
export const balanceText = (n) => {
  if (!n) return "딱 맞아요";
  return n > 0 ? `${won(n)} 덜 냈어요 (다음에 더 내요)` : `${won(-n)} 더 냈어요 (다음에 깎아요)`;
};
