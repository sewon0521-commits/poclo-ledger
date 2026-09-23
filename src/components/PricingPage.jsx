import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Plus, Search, Trash2, Target, Info, RotateCcw, Store, Check, Link2, X } from "lucide-react";
import { won, pct, DEFAULT_COSTS, TARGET_AD_RATE } from "../lib/sales";
import { dayLabel } from "../lib/calc";
import { useDays } from "../lib/view";
import { newId } from "../lib/id";
import { searchVendors } from "../lib/match";
import {
  DEFAULT_PRICING,
  actualRates,
  candidates,
  basePrice,
  priceResult,
  searchKey,
} from "../lib/pricing";
import EditNum from "./EditNum";

// 느려지지 않게 지킨 것 (2026-09-14, 실제로 재서 고침 — CPU 4배 느리게 해서 공급가 한 글자에 0.5초 멈췄다)
//  1. 목록(SavedList)은 memo — 계산기에 한 글자 칠 때마다 수백 줄을 다시 그리지 않는다.
//     그러려면 넘기는 값이 매번 새로 만들어지면 안 된다(settings·rates·핸들러를 고정).
//  2. 목록 표는 table-fixed + 처음 60줄만 — 내용에 맞춰 칸 너비를 매번 다시 재지 않는다.
//  3. 가정값 입력은 화면에만 먼저 반영하고 저장은 멈춘 뒤 한 번.
//  4. 숫자 형식기는 하나를 돌려 쓴다(sales.won) — toLocaleString("ko-KR")은 부를 때마다 새로 만든다.

const ALL = { from: "", to: "" };
const EMPTY = { id: "", name: "", vendor: "", vendorId: "", supply: "", price: "", productNo: null };
const PAGE = 60;

const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
const toNum = (s) => Number(digits(s) || 0);

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

/** 이익률 색 — 목표 이상 초록, 목표의 절반 이상 앰버, 그 밑은 로즈 */
const marginTone = (m, target) =>
  m >= target ? "text-emerald-700" : m >= target / 2 ? "text-amber-700" : "text-rose-700";

// ---------------------------------------------------------------- 거래처 칸

/**
 * 거래처 — 그냥 쳐도 되고, 매입 장부에 있는 거래처를 골라도 된다.
 * 고르면 vendorId 가 같이 붙는다(나중에 매입과 이어 볼 때 쓴다). 손으로 고치면 떨어진다.
 */
function VendorInput({ vendors, name, vendorId, onChange }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const found = useMemo(() => {
    const list = searchVendors(vendors, name).slice();
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return list.slice(0, 8);
  }, [vendors, name]);
  const linked = vendorId && vendors.some((v) => v.id === vendorId);

  const pick = (v) => {
    onChange({ vendor: v.name, vendorId: v.id });
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        value={name}
        onChange={(e) => {
          onChange({ vendor: e.target.value, vendorId: "" });
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open || !found.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => (h + 1) % found.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => (h - 1 + found.length) % found.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(found[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={vendors.length ? "치거나 매입 거래처에서 고르기" : "예: 디벨롭"}
        className={FIELD + (linked ? " pr-24" : "")}
      />
      {linked && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
          <Store size={11} /> 매입 거래처
        </span>
      )}
      {open && found.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-stone-300 bg-white py-1 shadow-lg">
          {found.map((v, i) => (
            <li key={v.id}>
              <button
                type="button"
                // 누르는 순간 입력칸 blur 가 먼저 와서 목록이 닫히지 않게
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(v)}
                className={
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm " +
                  (i === hi ? "bg-rose-50" : "hover:bg-stone-50")
                }
              >
                <span className="min-w-0">
                  <span className="block truncate text-stone-900">{v.name}</span>
                  {v.address && <span className="block truncate text-xs text-stone-400">{v.address}</span>}
                </span>
                {v.id === vendorId && <Check size={14} className="shrink-0 text-emerald-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 상품명 칸

/** '가온 셔링 밴딩 롱 스커트 (4color)' → '가온 셔링 밴딩 롱 스커트' (새벽 잇기 pricing_link.display_name 과 같게) */
const ourName = (n) => String(n || "").replace(/\s*\((\d+\s*colou?r|one\s*colou?r)\)\s*$/i, "").trim();

/**
 * 상품명 — 그냥 쳐도 되고(상품명 짓기 전 메모 이름), 이미 등록한 우리 상품을 골라도 된다.
 * 메모 이름으로 담아 두면 등록한 다음 새벽에 우리 상품명으로 저절로 바뀐다 (poclo-cafe24/pricing_link.py).
 */
function NameInput({ products, draft, onChange }) {
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const n = searchKey(draft.name);
    if (!n || draft.productNo) return [];
    return products.filter((p) => searchKey(p.name).includes(n)).slice(0, 6);
  }, [products, draft.name, draft.productNo]);
  return (
    <div className="relative">
      <input
        value={draft.name}
        onChange={(e) => {
          onChange({ name: e.target.value, productNo: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="메모 이름(예: 폴링sk) 또는 우리 상품 찾기"
        className={FIELD + (draft.productNo ? " pr-20" : "")}
      />
      {draft.productNo && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
          <Link2 size={11} /> 우리 상품
        </span>
      )}
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-stone-300 bg-white py-1 shadow-lg">
          {hits.map((p) => (
            <li key={p.no}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ name: ourName(p.name), productNo: p.no, ...(draft.price ? {} : { price: String(p.price || "") }) });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50"
              >
                {p.image && <img src={p.image} alt="" className="h-9 w-7 shrink-0 rounded object-cover" loading="lazy" />}
                <span className="min-w-0 flex-1 truncate text-stone-900">{ourName(p.name)}</span>
                <span className="shrink-0 text-xs text-stone-400 tabular-nums">{won(p.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 이 상품 맞나요

/**
 * 새벽 잇기가 '애매하다'고 남긴 짝(item.suggest) — 세원이 한 번 눌러 확정한다.
 * 맞아요 → 우리 상품명으로 바뀌고 메모 이름은 아래 작게. 아니에요 → 다음 새벽엔 다른 후보를 찾는다.
 */
function SuggestBox({ items, onSave }) {
  const list = items.filter((i) => i.suggest && !i.productNo);
  if (!list.length) return null;
  const drop = (x) => {
    const rest = { ...x };
    delete rest.suggest;
    return rest;
  };
  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <h3 className="text-sm font-semibold text-amber-900">이 상품 맞나요? {list.length}개</h3>
      <p className="mt-0.5 text-xs text-amber-800/80">
        메모 이름과 우리 상품이 거의 맞는데 확실하지 않은 것만 모았어요. 나머지는 새벽마다 저절로 우리 상품명으로 바뀌어요.
      </p>
      <ul className="mt-3 divide-y divide-amber-100 overflow-hidden rounded-xl border border-amber-100 bg-white">
        {list.map((x) => {
          const g = x.suggest;
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              {g.image ? (
                <img src={g.image} alt="" className="h-12 w-9 shrink-0 rounded object-cover" loading="lazy" />
              ) : (
                <span className="h-12 w-9 shrink-0 rounded bg-stone-100" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-500">
                  {x.name} <span className="text-stone-400">· {x.vendor || "거래처 없음"} · 공급가 {won(x.supply)}</span>
                </span>
                <span className="block truncate font-medium text-stone-900">→ {g.name}</span>
                <span className="block truncate text-[11px] text-stone-400">
                  {g.vendor} · 공급가 {won(g.sp)} · 판매가 {won(g.price)} — 같은 점: {g.why}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSave({ ...drop(x), name: g.name, memoName: x.memoName || x.name, productNo: g.no })}
                  className="flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-stone-900"
                >
                  <Check size={13} /> 맞아요
                </button>
                <button
                  type="button"
                  onClick={() => onSave({ ...drop(x), notNo: [...(x.notNo || []), g.no] })}
                  className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                >
                  <X size={13} /> 아니에요
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- 가정값 줄

/** 숫자 칸 — 치는 동안은 화면에만, 멈추면 저장 */
function LazyNumber({ value, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <input
      type="number"
      step="any"
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(Number(v) || 0), 500);
      }}
      onBlur={() => {
        clearTimeout(timer.current);
        if ((Number(draft) || 0) !== value) onCommit(Number(draft) || 0);
      }}
      className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-right text-sm tabular-nums"
    />
  );
}

function Assumptions({ rates, settings, onSettings }) {
  const set = (patch) => onSettings({ ...settings, ...patch });

  return (
    <div className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div>
          <div className="mb-1 text-xs text-stone-500">광고비율</div>
          <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
            {[
              ["target", `목표 ${TARGET_AD_RATE}%`],
              ["actual", `최근 실제 ${pct(rates.adRate)}%`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => set({ adBasis: key })}
                className={
                  "px-3 py-1.5 " +
                  (settings.adBasis === key ? "bg-rose-700 text-white" : "bg-white text-stone-600")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-stone-500">목표 이익률</span>
          <span className="flex items-center gap-1">
            <LazyNumber value={settings.targetMargin} onCommit={(v) => set({ targetMargin: v })} />
            <span className="text-sm text-stone-500">%</span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-stone-500">부가세 (간이, 대략)</span>
          <span className="flex items-center gap-1">
            <LazyNumber value={settings.vat} onCommit={(v) => set({ vat: v })} />
            <span className="text-sm text-stone-500">%</span>
          </span>
        </label>
      </div>

      <p className="mt-3 border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-500">
        <b className="font-semibold text-stone-700">한 벌 기준 실제 평균</b>
        {rates.days > 0 && (
          <span className="text-stone-400">
            {" "}
            · {dayLabel(rates.from)} ~ {dayLabel(rates.to)} ({rates.days}일)
          </span>
        )}
        <br />
        배송비 수입 <b className="tabular-nums">{won(rates.shipIncome)}</b> · 택배비{" "}
        <b className="tabular-nums">{won(rates.shipping)}</b> · 부자재{" "}
        <b className="tabular-nums">{won(rates.material)}</b> · 결제수수료{" "}
        <b className="tabular-nums">{pct(rates.feeRate * 100, 2)}%</b>
        <span className="text-stone-400">
          {" "}
          — 매일 들어오는 주문에서 저절로 바뀝니다. 택배비·부자재 단가는 매출 장부 › 비용
          가정값에서 고쳐요.
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 계산 카드

function CalcCard({ draft, setDraft, rates, settings, vendors, products, onSave }) {
  const supply = toNum(draft.supply);
  const chosen = toNum(draft.price);
  const rows = useMemo(
    () => candidates(supply).map((p) => priceResult(supply, p, rates, settings)),
    [supply, rates, settings],
  );
  const firstOk = rows.find((r) => r.meets)?.price;
  // 판매가를 안 골랐으면 기본 판매가(공급가×2, 끝 800)로 본다
  const price = chosen || (supply ? basePrice(supply) : 0);
  const r = supply && price ? priceResult(supply, price, rates, settings) : null;

  const canSave = draft.name.trim() && supply > 0 && price > 0;

  return (
    <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-stone-900">
          <Calculator size={16} /> {draft.id ? "담아 둔 상품 고치기" : "상품 하나 계산하기"}
        </h3>
        {(draft.id || draft.name || draft.supply) && (
          <button
            type="button"
            onClick={() => setDraft(EMPTY)}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700"
          >
            <RotateCcw size={12} /> 새로 계산
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">상품명</span>
          <NameInput products={products} draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">거래처</span>
          <VendorInput
            vendors={vendors}
            name={draft.vendor}
            vendorId={draft.vendorId}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
          />
        </div>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">공급가 (도매가)</span>
          <input
            value={draft.supply ? won(toNum(draft.supply)) : ""}
            onChange={(e) => setDraft({ ...draft, supply: digits(e.target.value) })}
            inputMode="numeric"
            placeholder="0"
            className={FIELD + " text-right text-lg font-semibold tabular-nums"}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">
            판매가 <span className="text-stone-400">· 비우면 공급가×2 끝자리 800</span>
          </span>
          <input
            value={draft.price ? won(toNum(draft.price)) : ""}
            onChange={(e) => setDraft({ ...draft, price: digits(e.target.value) })}
            inputMode="numeric"
            placeholder={supply ? won(basePrice(supply)) : "0"}
            className={FIELD + " text-right text-lg font-semibold tabular-nums"}
          />
        </label>
      </div>

      {supply > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem]">
          {/* 판매가 후보 — 누르면 그 가격으로 고른다 */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[440px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-400">
                  <th className="w-[38%] px-3 py-2 text-left font-medium">판매가</th>
                  <th className="px-3 py-2 text-right font-medium">정상가</th>
                  <th className="px-3 py-2 text-right font-medium">원가율</th>
                  <th className="px-3 py-2 text-right font-medium">남는 돈</th>
                  <th className="px-3 py-2 text-right font-medium">이익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {rows.map((x) => (
                  <tr
                    key={x.price}
                    onClick={() => setDraft({ ...draft, price: String(x.price) })}
                    className={"cursor-pointer " + (x.price === price ? "bg-rose-50" : "hover:bg-stone-50")}
                  >
                    <td className="px-3 py-1.5 text-left font-medium text-stone-900">
                      {won(x.price)}
                      {x.price === firstOk && (
                        <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          목표 넘는 최저가
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-stone-400">{won(x.retail)}</td>
                    <td className="px-3 py-1.5 text-right text-stone-500">{pct(x.costRate, 0)}%</td>
                    <td className="px-3 py-1.5 text-right text-stone-700">{won(x.profit)}</td>
                    <td
                      className={
                        "px-3 py-1.5 text-right font-semibold " + marginTone(x.margin, settings.targetMargin)
                      }
                    >
                      {pct(x.margin)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 고른 판매가의 한 벌 손익 */}
          {r && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-500">판매가</span>
                <span className="text-lg font-bold tabular-nums text-stone-900">{won(r.price)}</span>
              </div>
              <div className="mb-2 text-right text-xs tabular-nums text-stone-400">
                정상가 {won(r.retail)}
              </div>
              {[
                ["+ 배송비 수입", r.revenue - r.price],
                ["− 공급가", -r.supply],
                ["− 부자재", -r.material],
                ["− 택배비", -r.shipping],
                ["− 결제수수료", -r.fee],
                [`− 광고비 ${pct(r.adRate)}%`, -r.ads],
                [`− 부가세 ${settings.vat}%`, -r.vat],
              ].map(([label, v]) => (
                <div key={label} className="flex justify-between py-0.5 text-xs text-stone-500">
                  <span>{label}</span>
                  <span className="tabular-nums">{won(Math.abs(v))}</span>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between border-t border-stone-200 pt-2">
                <span className="font-semibold text-stone-800">남는 돈</span>
                <span className={"text-lg font-bold tabular-nums " + marginTone(r.margin, settings.targetMargin)}>
                  {won(r.profit)}
                </span>
              </div>
              <div className={"text-right text-xs font-medium " + marginTone(r.margin, settings.targetMargin)}>
                이익률 {pct(r.margin)}% · 원가율 {pct(r.costRate, 0)}%
              </div>

              <button
                type="button"
                disabled={!canSave}
                onClick={() =>
                  onSave({
                    id: draft.id || newId("p"),
                    name: draft.name.trim(),
                    vendor: draft.vendor.trim(),
                    vendorId: draft.vendorId || "",
                    supply,
                    price,
                    ...(draft.productNo ? { productNo: draft.productNo } : {}),
                  })
                }
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-700 py-2.5 font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                <Plus size={15} /> {draft.id ? "고친 값으로 저장" : "목록에 담기"}
              </button>
              {!draft.name.trim() && (
                <p className="mt-1.5 text-center text-[11px] text-stone-400">
                  상품명을 넣으면 담을 수 있어요
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 모은 목록

const SavedList = memo(function SavedList({ items, rates, settings, onEdit, onPatch, onRemove }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent"); // recent | low | high
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const needle = searchKey(q);
    const out = items
      .filter((i) => !needle || searchKey(i.name + i.vendor + (i.memoName || "")).includes(needle))
      .map((i) => ({ ...i, r: priceResult(i.supply, i.price, rates, settings) }));
    if (sort === "low") out.sort((a, b) => a.r.margin - b.r.margin);
    if (sort === "high") out.sort((a, b) => b.r.margin - a.r.margin);
    return out;
  }, [items, q, sort, rates, settings]);

  const below = rows.filter((x) => !x.r.meets).length;
  const avg = rows.length ? rows.reduce((a, x) => a + x.r.margin, 0) / rows.length : 0;
  const shown = rows.slice(0, limit);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-900">모아 둔 상품 {items.length}개</h3>
          {rows.length > 0 && (
            <p className="text-xs text-stone-500">
              평균 이익률 <b className="tabular-nums">{pct(avg)}%</b> · 목표 {settings.targetMargin}% 밑{" "}
              <b className={"tabular-nums " + (below ? "text-rose-700" : "")}>{below}개</b>
              <span className="text-stone-400"> · 위 가정값을 바꾸면 전부 다시 계산돼요</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="상품명·메모 이름·거래처"
              className="w-40 rounded-lg border border-stone-300 bg-white py-1.5 pr-2 pl-8 text-sm"
            />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-stone-300 text-xs">
            {[
              ["recent", "최근 담은 순"],
              ["low", "이익률 낮은 순"],
              ["high", "높은 순"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSort(key);
                  setLimit(PAGE);
                }}
                className={
                  "px-2.5 py-1.5 " + (sort === key ? "bg-stone-800 text-white" : "bg-white text-stone-600")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-400">
          위에서 계산한 상품을 <b className="font-medium text-stone-500">목록에 담기</b>로 모아 두세요.
        </p>
      ) : (
        // content-visibility: 화면 밖에 있는 목록은 위에서 숫자를 칠 때 다시 배치·그리지 않는다
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white [contain-intrinsic-size:auto_1800px] [content-visibility:auto]">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-400">
                <th className="px-3 py-2.5 text-left font-medium">상품</th>
                <th className="px-3 py-2.5 text-left font-medium">거래처</th>
                <th className="px-3 py-2.5 text-right font-medium">공급가</th>
                <th className="px-3 py-2.5 text-right font-medium">판매가</th>
                <th className="px-2 py-2.5 text-right font-medium">원가율</th>
                <th className="px-2 py-2.5 text-right font-medium">남는 돈</th>
                <th className="px-2 py-2.5 text-right font-medium">이익률</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {shown.map((x) => (
                <tr key={x.id} className="hover:bg-stone-50">
                  <td className="truncate px-3 py-1.5 text-left">
                    <button
                      type="button"
                      onClick={() => onEdit(x)}
                      className="max-w-full truncate text-left font-medium text-stone-900 hover:text-rose-700"
                      title="위 계산기로 불러오기"
                    >
                      {x.name}
                    </button>
                    {x.memoName && x.memoName !== x.name && (
                      <span className="block truncate text-[11px] text-stone-400" title="메모할 때 적은 이름 (거래처 상품명)">
                        {x.memoName}
                      </span>
                    )}
                  </td>
                  <td className="truncate px-3 py-1.5 text-left text-stone-500" title={x.vendor}>
                    {x.vendorId && <Store size={11} className="mr-1 inline align-[-1px] text-emerald-600" />}
                    {x.vendor || "—"}
                  </td>
                  <td className="px-1 py-1.5">
                    <EditNum value={x.supply} onSave={(v) => onPatch(x, { supply: v })} />
                  </td>
                  <td className="px-1 py-1.5">
                    <EditNum
                      value={x.price}
                      tone="font-medium text-stone-900"
                      onSave={(v) => onPatch(x, { price: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-stone-500">{pct(x.r.costRate, 0)}%</td>
                  <td className="px-2 py-1.5 text-right text-stone-700">{won(x.r.profit)}</td>
                  <td
                    className={
                      "px-2 py-1.5 text-right font-semibold " + marginTone(x.r.margin, settings.targetMargin)
                    }
                  >
                    {pct(x.r.margin)}%
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(x)}
                      aria-label="목록에서 빼기"
                      className="p-1 text-stone-300 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="w-full border-t border-stone-100 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              더 보기 · {rows.length - shown.length}개 남음
            </button>
          )}
        </div>
      )}
    </section>
  );
});

// ------------------------------------------------------------------- 화면

export default function PricingPage({ rows, conf, onConf, items, vendors, products, onSave, onRemove }) {
  const days = useDays(rows, ALL, conf);
  const costs = useMemo(() => ({ ...DEFAULT_COSTS, ...conf.costs }), [conf.costs]);

  // 새로 읽을 때마다 같은 숫자라도 새 객체가 오면 목록이 통째로 다시 그려진다.
  // 값이 같으면 예전 객체를 그대로 쓴다.
  const fresh = useMemo(() => actualRates(days, costs), [days, costs]);
  const freshKey = JSON.stringify(fresh);
  const rates = useMemo(() => fresh, [freshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const settings = useMemo(() => ({ ...DEFAULT_PRICING, ...conf.pricing }), [conf.pricing]);
  const [draft, setDraft] = useState(EMPTY);

  // 목록 쪽 핸들러는 고정 — 바뀌면 memo 가 소용없다
  const saveRef = useRef(onSave);
  const removeRef = useRef(onRemove);
  useEffect(() => {
    saveRef.current = onSave;
    removeRef.current = onRemove;
  });
  const onEdit = useCallback((x) => {
    setDraft({
      id: x.id,
      name: x.name,
      vendor: x.vendor || "",
      vendorId: x.vendorId || "",
      supply: String(x.supply),
      price: String(x.price),
      productNo: x.productNo || null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const onPatch = useCallback(
    (x, patch) =>
      saveRef.current({
        id: x.id,
        name: x.name,
        vendor: x.vendor,
        vendorId: x.vendorId || "",
        supply: x.supply,
        price: x.price,
        ...patch,
      }),
    [],
  );
  const onRemoveItem = useCallback((x) => {
    if (window.confirm(`${x.name} 을(를) 목록에서 뺄까요?`)) removeRef.current(x.id);
  }, []);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">판매가 계산기</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          공급가를 넣으면 판매가마다 한 벌에 얼마 남는지 나와요. 정한 가격은 담아서 모아 둬요.
          메모 이름(거래처 상품명)으로 담아도 등록한 다음 새벽에 우리 상품명으로 바뀌고, 새로 등록한 상품은 저절로 담겨요.
        </p>
      </div>

      <Assumptions
        rates={rates}
        settings={settings}
        onSettings={(next) => onConf({ ...conf, pricing: next })}
      />

      <CalcCard
        draft={draft}
        setDraft={setDraft}
        rates={rates}
        settings={settings}
        vendors={vendors}
        products={products}
        onSave={async (item) => {
          await onSave(item);
          setDraft(EMPTY);
        }}
      />

      <SuggestBox items={items} onSave={onSave} />

      <SavedList
        items={items}
        rates={rates}
        settings={settings}
        onEdit={onEdit}
        onPatch={onPatch}
        onRemove={onRemoveItem}
      />

      <p className="mt-5 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          <Target size={12} className="inline align-[-2px]" /> 이 계산은 <b className="font-semibold">반품이
          없다고 보고</b> 한 벌이 팔렸을 때의 숫자예요. 실제로 달마다 남은 돈은 손익에서 봐요. 판매가·정상가
          규칙은 상품등록과 같습니다 — 기본 판매가는 공급가×2 끝자리 800원, 정상가는 (판매가+3,000)×1.2.
        </span>
      </p>
    </div>
  );
}
