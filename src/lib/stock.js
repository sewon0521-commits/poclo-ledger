// 재고 (10/31 세원: "재고가 넥스트팩(이지어드민)과 사무실 렉 두 곳에 나뉘어 있어 한눈에 안 보인다. 할인 상품을 고를 때 사무실 재고를 놓치는 일이 있었다")
//
// settings 'stock':
//   nextpack {at, file, rows:[{name, option, code, location, qty, avail, hold, cost, price, maker, supplyName}]}  이지어드민 현재고조회 — 넣을 때 전체 교체
//   rack     [{id, name, option, rack, qty, cost, memo, at}]                                                       사무실 렉 — 줄마다 고친다
// ⚠ 칸 이름을 바꾸지 말 것: poclo-cafe24/today_ship.py 가 rack 의 name·option·qty, nextpack.rows 의 name·option·avail 을 읽어
//   카페24 오늘출발 분류와 썸네일 배지를 맞춘다. 수량은 숫자로, name 은 비우지 않는다(첫 낱말을 꺼내다 멈춘다).
//
// 같은 상품 맞추기: 상품명 앞 [태그]를 모두 떼고 첫 낱말(고유네임)로 묶는다 — '[주문폭주] 엘비 레이스…' = 엘비 (today_ship 과 같은 규칙).
// 옵션은 대괄호를 뺀 글자가 같으면 한 줄.
// 묶인 돈 = 원가 × 수량. 원가가 0이거나 없으면 0원으로 치지 않고 '원가 없음' 줄로 따로 센다(지금 소슬·엘릭).
// 넥스트팩 줄 원가는 파일 값만 쓴다. 사무실 줄은 직접 적은 값 → 같은 상품의 넥스트팩 원가 → 판매가 목록 순으로 찾는다.

import { parseCsv } from "./sales";
import { shopKey } from "./soOrder";

export const STOCK_KEY = "stock";

const squash = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
export const stripTags = (s) => String(s || "").trim().replace(/^(\[[^\]]*\]\s*)+/, "").trim();
/** 묶는 이름 = [태그]를 뗀 첫 낱말 */
export const groupKey = (name) => stripTags(name).split(/\s+/)[0] || "";
/** '[블랙-L]' → '블랙-L' */
export const cleanOption = (o) => String(o || "").replace(/^[[\]\s]+|[[\]\s]+$/g, "");
/** '70,000' · '1 ' · '3장' → 숫자. 못 읽으면 0 */
export const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[,\s원₩장개]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const pos = (n) => Math.max(0, Number(n) || 0);

/**
 * 표 글 → 줄[칸[]]. 엑셀·화면에서 복사한 표(탭)는 탭으로만 나눈다 —
 * parseCsv 는 쉼표에서도 나눠서 로케이션이력 'H5-4,E1-4,' 뒤 칸(제조사)이 밀린다.
 */
export function parseTable(text) {
  const s = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = s.split("\n").find((l) => l.trim()) || "";
  let rows;
  if (first.includes("\t")) {
    rows = [];
    let row = [];
    let i = 0;
    while (i <= s.length) {
      let cell = "";
      // 칸이 따옴표로 시작하고 닫는 따옴표 바로 뒤가 칸 끝일 때만 따옴표 칸(엑셀이 줄바꿈 든 칸을 이렇게 복사한다)
      const quoted = s[i] === '"' ? s.slice(i + 1).search(/"(?=\t|\n|$)/) : -1;
      if (quoted >= 0) {
        cell = s.slice(i + 1, i + 1 + quoted).replace(/""/g, '"');
        i += quoted + 2;
      } else {
        let end = i;
        while (end < s.length && s[end] !== "\t" && s[end] !== "\n") end++;
        cell = s.slice(i, end);
        i = end;
      }
      row.push(cell);
      if (s[i] === "\t") {
        i++;
        continue;
      }
      rows.push(row);
      row = [];
      i++;
    }
  } else {
    rows = parseCsv(s);
  }
  return rows.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some(Boolean));
}

// ---------------------------------------------------------------- 넥스트팩

const NP_HEAD = { name: "상품명", option: "옵션", code: "상품코드", location: "로케이션", qty: "정상재고", avail: "가용재고", hold: "접수", cost: "원가", price: "판매가", maker: "제조사", supplyName: "공급처상품명" };

/** 이지어드민 현재고조회 표 → rows. 그 파일이 아니면 null */
export function parseNextpack(table) {
  const at = table.findIndex((r) => ["상품명", "정상재고", "가용재고"].every((n) => r.some((c) => squash(c) === n)));
  if (at < 0) return null;
  const col = Object.fromEntries(Object.entries(NP_HEAD).map(([k, n]) => [k, table[at].findIndex((c) => squash(c) === n)]));
  const cell = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? "").trim() : "");
  const rows = [];
  for (const r of table.slice(at + 1)) {
    const name = cell(r, "name");
    if (!groupKey(name) || name === "합계") continue;
    rows.push({
      name,
      option: cleanOption(cell(r, "option")),
      code: cell(r, "code"),
      location: cell(r, "location"),
      qty: toNum(cell(r, "qty")),
      avail: toNum(cell(r, "avail")),
      hold: toNum(cell(r, "hold")),
      cost: toNum(cell(r, "cost")),
      price: toNum(cell(r, "price")),
      maker: cell(r, "maker"),
      supplyName: cell(r, "supplyName"),
    });
  }
  return rows;
}

const lineId = (r) => `${groupKey(r.name)}|${squash(cleanOption(r.option))}`;

/** 넣기 전 미리보기 — 상품코드로 맞추고, 코드가 없으면 상품(첫 낱말)·옵션으로 */
export function diffNextpack(prev, next) {
  const left = [...(prev || [])];
  const take = (r) => {
    let i = r.code ? left.findIndex((p) => p.code === r.code) : -1;
    if (i < 0) i = left.findIndex((p) => lineId(p) === lineId(r));
    return i < 0 ? null : left.splice(i, 1)[0];
  };
  const added = [];
  const changed = [];
  let same = 0;
  for (const r of next || []) {
    const before = take(r);
    if (!before) added.push(r);
    else if (before.qty !== r.qty || before.avail !== r.avail || before.hold !== r.hold) changed.push({ row: r, before });
    else same++;
  }
  return { added, removed: left, changed, same };
}

/** 넥스트팩 줄 요약 */
export function npSummary(rows) {
  const s = { lines: 0, pieces: 0, avail: 0, money: 0, noCost: 0 };
  for (const r of rows || []) {
    s.lines++;
    s.pieces += pos(r.qty);
    s.avail += pos(r.avail);
    if (r.cost > 0) s.money += r.cost * pos(r.qty);
    else if (pos(r.qty) > 0) s.noCost++;
  }
  return s;
}

// ---------------------------------------------------------------- 원가 찾기

const is1p1 = (p) => /1\s*\+\s*1/.test(`${p.name || ""} ${p.memoName || ""}`);
const mostCommon = (list) => {
  const count = new Map();
  for (const x of list) count.set(x, (count.get(x) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
};

/** 사무실 줄 원가 찾는 함수 (name, option) → {cost, from, note} */
export function costFinder(stock, pricing) {
  const np = new Map(); // 첫 낱말 → 넥스트팩 줄(원가 있는 것)
  for (const r of stock?.nextpack?.rows || []) {
    if (!(r.cost > 0)) continue;
    const k = groupKey(r.name);
    if (!np.has(k)) np.set(k, []);
    np.get(k).push(r);
  }
  const exact = new Map();
  const word = new Map();
  for (const p of pricing || []) {
    if (!(p.supply > 0)) continue;
    const a = shopKey(p.name);
    const b = groupKey(p.name);
    if (!exact.has(a)) exact.set(a, []);
    exact.get(a).push(p);
    if (!word.has(b)) word.set(b, []);
    word.get(b).push(p);
  }
  return (name, option) => {
    const k = groupKey(name);
    const rows = np.get(k);
    if (rows) {
      const same = rows.find((r) => squash(cleanOption(r.option)) === squash(cleanOption(option)));
      return { cost: same ? same.cost : mostCommon(rows.map((r) => r.cost)), from: "nextpack", note: "넥스트팩 원가" };
    }
    const full = exact.get(shopKey(name));
    const cands = full || word.get(k);
    if (!cands) return { cost: 0, from: "", note: "" };
    // 1+1 은 목록에 한 장·두 장 줄이 같이 있을 수 있다 — 한 장 줄, 두 장 줄만 있으면 반으로 (SO+ 발주 변환과 같게)
    const single = cands.filter((p) => !is1p1(p));
    if (!single.length) return { cost: Math.round(cands[0].supply / 2), from: "pricing", note: "판매가 목록 1+1 ÷ 2" };
    const newest = [...single].sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0];
    if (full) return { cost: Math.round(newest.supply), from: "pricing", note: "판매가 목록" };
    // 첫 낱말만 같은 줄이 값이 갈리면 고르지 않는다 — 틀린 값이 묶인 돈에 조용히 들어가는 것보다 직접 적는 게 낫다
    const values = [...new Set(single.map((p) => Math.round(p.supply)))];
    if (values.length > 1) return { cost: 0, from: "", note: "판매가 목록에 같은 이름이 여러 개예요" };
    return { cost: values[0], from: "pricing", note: "판매가 목록" };
  };
}

// ---------------------------------------------------------------- 묶어 보기

/** stock → 상품별 묶음 [{key, name, lines:[{key, option, np, rack, npQty, npAvail, rackQty, pieces, money, cost, noCost, held}]}] */
export function buildGroups(stock, pricing) {
  const find = costFinder(stock, pricing);
  const groups = new Map();
  const lineOf = (name, option) => {
    const key = groupKey(name);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, name: stripTags(name), lines: new Map() }));
    const k = squash(option);
    let l = g.lines.get(k);
    if (!l) g.lines.set(k, (l = { key: `${key}|${k}`, option, np: null, rack: [] }));
    return l;
  };
  for (const r of stock?.nextpack?.rows || []) {
    if (!groupKey(r.name)) continue;
    const l = lineOf(r.name, cleanOption(r.option));
    const n = (l.np ||= { qty: 0, avail: 0, hold: 0, money: 0, cost: 0, noCost: 0, locs: [], text: [] });
    n.qty += pos(r.qty);
    n.avail += pos(r.avail);
    n.hold += pos(r.hold);
    if (r.cost > 0) {
      n.money += r.cost * pos(r.qty);
      n.cost ||= r.cost;
    } else if (pos(r.qty) > 0) n.noCost++;
    if (r.location && !n.locs.includes(r.location)) n.locs.push(r.location);
    n.text.push(r.location, r.maker, r.supplyName, r.code);
  }
  for (const r of Array.isArray(stock?.rack) ? stock.rack : []) {
    if (!groupKey(r.name)) continue;
    const option = cleanOption(r.option);
    const auto = r.cost > 0 ? null : find(r.name, option);
    const cost = r.cost > 0 ? r.cost : auto.cost;
    lineOf(r.name, option).rack.push({ ...r, option, qty: pos(r.qty), useCost: cost, costFrom: r.cost > 0 ? "direct" : auto.from, costNote: r.cost > 0 ? "직접 적은 값" : auto.note, money: cost * pos(r.qty) });
  }
  return [...groups.values()].map((g) => ({
    key: g.key,
    name: g.name,
    lines: [...g.lines.values()].map((l) => {
      const npQty = l.np?.qty || 0;
      const npAvail = l.np?.avail || 0;
      const rackQty = l.rack.reduce((n, x) => n + x.qty, 0);
      return {
        ...l,
        npQty,
        npAvail,
        rackQty,
        pieces: npQty + rackQty,
        money: (l.np?.money || 0) + l.rack.reduce((n, x) => n + x.money, 0),
        cost: l.np?.cost || l.rack.find((x) => x.useCost > 0)?.useCost || 0,
        noCost: (l.np?.noCost || 0) + l.rack.filter((x) => x.qty > 0 && !(x.useCost > 0)).length,
        held: l.np ? Math.max(0, npQty - npAvail) : 0,
      };
    }),
  }));
}

/** 맨 위 요약 — 전체 장수 · 묶인 돈 · 곳별 */
export function stockTotals(groups) {
  const t = { products: groups.length, lines: 0, pieces: 0, money: 0, noCost: 0, heldLines: 0, nextpack: { pieces: 0, avail: 0, money: 0, noCost: 0 }, rack: { pieces: 0, money: 0, noCost: 0 } };
  for (const g of groups)
    for (const l of g.lines) {
      t.lines++;
      t.pieces += l.pieces;
      t.money += l.money;
      t.noCost += l.noCost;
      if (l.held > 0) t.heldLines++;
      t.nextpack.pieces += l.npQty;
      t.nextpack.avail += l.npAvail;
      t.nextpack.money += l.np?.money || 0;
      t.nextpack.noCost += l.np?.noCost || 0;
      t.rack.pieces += l.rackQty;
      t.rack.money += l.rack.reduce((n, x) => n + x.money, 0);
      t.rack.noCost += l.rack.filter((x) => x.qty > 0 && !(x.useCost > 0)).length;
    }
  return t;
}

const lineText = (g, l) => squash([g.name, l.option, ...(l.np?.text || []), ...l.rack.flatMap((x) => [x.name, x.rack, x.memo])].join(" "));
const addUp = (lines) => lines.reduce((s, l) => ({ pieces: s.pieces + l.pieces, money: s.money + l.money, noCost: s.noCost + l.noCost, npQty: s.npQty + l.npQty, npAvail: s.npAvail + l.npAvail, rackQty: s.rackQty + l.rackQty }), { pieces: 0, money: 0, noCost: 0, npQty: 0, npAvail: 0, rackQty: 0 });
const SORTS = {
  money: (a, b) => b.money - a.money || b.pieces - a.pieces,
  pieces: (a, b) => b.pieces - a.pieces || b.money - a.money,
  name: () => 0,
};

/** 거르고 정렬 — 곳(all·nextpack·rack) · 검색 · 주문에 묶임(정상 > 가용) · 원가 없음. 줄 값은 거르기와 상관없이 그 옵션 전체 */
export function viewGroups(groups, { place = "all", q = "", held = false, noCost = false, sort = "money" } = {}) {
  const words = String(q).split(/\s+/).map(squash).filter(Boolean);
  const by = SORTS[sort] || SORTS.money;
  const byName = (a, b) => String(a.name || a.option).localeCompare(String(b.name || b.option), "ko");
  return groups
    .map((g) => {
      const lines = g.lines
        .filter((l) => (place === "nextpack" ? !!l.np : place === "rack" ? l.rack.length > 0 : true))
        .filter((l) => !held || l.held > 0)
        .filter((l) => !noCost || l.noCost > 0)
        .filter((l) => !words.length || words.every((w) => lineText(g, l).includes(w)))
        .sort((a, b) => by(a, b) || byName(a, b));
      return { key: g.key, name: g.name, lines, ...addUp(lines) };
    })
    .filter((g) => g.lines.length)
    .sort((a, b) => by(a, b) || byName(a, b));
}

/** 렉에 적을 때 '이 이름이 맞나' 볼 첫 낱말들 — 판매 중 상품 · 넥스트팩 · 판매가 목록 */
export function knownNames(stock, pricing, stats) {
  const names = [...(stats?.all || []).map((p) => p.name), ...(stock?.nextpack?.rows || []).map((r) => r.name), ...(pricing || []).map((p) => p.name)].map(stripTags).filter(Boolean);
  return { names: [...new Set(names)], words: new Set(names.map(groupKey)) };
}

// ---------------------------------------------------------------- 사무실 렉

/** 같은 줄 = 같은 상품(첫 낱말) · 같은 옵션 · 같은 렉 */
const rackKey = (r) => `${groupKey(r.name)}|${squash(cleanOption(r.option))}|${squash(r.rack)}`;
const rackList = (v) => (Array.isArray(v?.rack) ? v.rack : []);

// 저장 변경 함수 — 여러 번 불릴 수 있어서(lib/saveQueue) 안에서 id·시각을 새로 만들지 않는다
export const setNextpack = (nextpack) => (v) => ({ ...v, nextpack });
export const rackAdd = (row) => (v) => {
  const rack = rackList(v);
  return { ...v, rack: rack.some((x) => rackKey(x) === rackKey(row)) ? rack.map((x) => (rackKey(x) === rackKey(row) ? { ...x, qty: pos(x.qty) + pos(row.qty), at: row.at } : x)) : [...rack, row] };
};
export const rackPatch = (ids, patch) => (v) => ({ ...v, rack: rackList(v).map((x) => (ids.includes(x.id) ? { ...x, ...patch } : x)) });
export const rackBump = (id, delta, at) => (v) => ({ ...v, rack: rackList(v).map((x) => (x.id === id ? { ...x, qty: pos(pos(x.qty) + delta), at } : x)) });
export const rackRemove = (id) => (v) => ({ ...v, rack: rackList(v).filter((x) => x.id !== id) });
export const rackRestore = (row) => (v) => ({ ...v, rack: rackList(v).some((x) => x.id === row.id) ? rackList(v) : [...rackList(v), row] });

export const rackSort = (rows) =>
  [...rows].sort(
    (a, b) =>
      // 렉 위치 없는 줄은 뒤로
      (!a.rack - !b.rack) ||
      String(a.rack || "").localeCompare(String(b.rack || ""), "ko", { numeric: true }) ||
      stripTags(a.name).localeCompare(stripTags(b.name), "ko") ||
      String(a.option || "").localeCompare(String(b.option || ""), "ko", { numeric: true }),
  );

export const RACK_FIELDS = [
  ["", "안 씀"],
  ["name", "상품명"],
  ["option", "옵션"],
  ["color", "색상"],
  ["size", "사이즈"],
  ["rack", "렉 위치"],
  ["qty", "수량"],
  ["memo", "메모"],
  ["cost", "원가"],
];
const FIELD_NAMES = {
  name: ["상품명", "상품", "품명", "제품명", "이름", "상품이름", "name"],
  option: ["옵션", "옵션명", "option"],
  color: ["색상", "컬러", "색", "color"],
  size: ["사이즈", "크기", "size"],
  rack: ["렉", "렉위치", "랙", "랙위치", "위치", "로케이션", "칸", "선반", "보관위치"],
  qty: ["수량", "재고", "개수", "갯수", "장수", "재고수량", "가용재고", "정상재고", "qty", "수량(장)"],
  memo: ["메모", "비고", "참고", "note"],
  cost: ["원가", "공급가", "매입가", "사입가", "도매가", "단가"],
};

/** 머리 줄 이름으로 열 찾기 → {headerAt(못 찾으면 -1), map:[칸마다 무엇]} (세원이 줄 렉 표는 형식을 아직 모른다) */
export function guessRackColumns(table) {
  const width = Math.max(0, ...table.map((r) => r.length));
  const empty = Array.from({ length: width }, () => "");
  let best = { headerAt: -1, map: empty, score: 0 };
  table.slice(0, 5).forEach((r, i) => {
    const map = [...empty];
    r.forEach((c, j) => {
      const f = Object.keys(FIELD_NAMES).find((k) => FIELD_NAMES[k].includes(squash(c)) && !map.includes(k));
      if (f) map[j] = f;
    });
    const score = map.filter(Boolean).length;
    if (score >= 2 && (map.includes("name") || map.includes("qty")) && score > best.score) best = { headerAt: i, map, score };
  });
  return { headerAt: best.headerAt, map: best.map };
}

/** 표 + 열 고른 것 → 넣을 줄. 엑셀 병합 칸은 빈칸으로 오니까 상품명·렉 위치는 윗줄 값으로 채운다 */
export function rackRows(table, headerAt, map, at, makeId) {
  const c = Object.fromEntries(RACK_FIELDS.filter(([k]) => k).map(([k]) => [k, map.indexOf(k)]));
  const out = new Map();
  const bad = [];
  let filled = 0;
  let merged = 0;
  let lastName = "";
  let lastRack = "";
  table.slice(headerAt + 1).forEach((r, i) => {
    const get = (k) => (c[k] >= 0 ? String(r[c[k]] ?? "").trim() : "");
    const line = headerAt + i + 2;
    let name = get("name");
    let rack = get("rack");
    if (["합계", "총계", "계"].includes(squash(name))) return;
    if (name) lastName = name;
    else if (lastName) {
      name = lastName;
      filled++;
    }
    if (rack) lastRack = rack;
    else if (lastRack) rack = lastRack;
    const qtyText = get("qty");
    if (!groupKey(name)) return bad.push({ line, why: "상품명이 없어요", text: r.filter(Boolean).join(" · ") });
    if (!/\d/.test(qtyText)) return bad.push({ line, why: "수량이 없어요", text: r.filter(Boolean).join(" · ") });
    const option = [cleanOption(get("option")), cleanOption(get("color")), cleanOption(get("size"))].filter(Boolean).join("-");
    const row = { id: makeId(), name, option, rack, qty: pos(toNum(qtyText)), cost: toNum(get("cost")), memo: get("memo"), at };
    const k = rackKey(row);
    if (out.has(k)) {
      out.get(k).qty += row.qty;
      merged++;
    } else out.set(k, row);
  });
  return { rows: [...out.values()], bad, filled, merged };
}

/** 표를 렉에 합치기 — 같은 줄은 수량·메모·원가를 표 값으로, 없는 줄은 더하기. replaceAll 이면 표에 없는 줄은 지운다 (같은 표를 또 붙여도 두 배가 안 된다) */
export function mergeRack(cur, incoming, replaceAll) {
  const list = rackList({ rack: cur });
  const byKey = new Map(incoming.map((r) => [rackKey(r), r]));
  const used = new Set();
  const changed = [];
  const removed = [];
  let same = 0;
  const kept = [];
  for (const x of list) {
    const r = byKey.get(rackKey(x));
    if (!r) {
      if (replaceAll) removed.push(x);
      else kept.push(x);
      continue;
    }
    used.add(rackKey(x));
    const next = { ...x, qty: r.qty, memo: r.memo || x.memo || "", cost: r.cost > 0 ? r.cost : x.cost || 0 };
    if (next.qty === pos(x.qty) && next.memo === (x.memo || "") && next.cost === (x.cost || 0)) {
      same++;
      kept.push(x);
    } else {
      changed.push({ row: next, before: x });
      kept.push({ ...next, at: r.at });
    }
  }
  const added = incoming.filter((r) => !used.has(rackKey(r)));
  return { next: [...kept, ...added], added, changed, removed, same };
}
export const rackMerge = (incoming, replaceAll) => (v) => ({ ...v, rack: mergeRack(rackList(v), incoming, replaceAll).next });
