import { useMemo, useState } from "react";
import { Calculator, Plus, Search, Trash2, Target, Info, RotateCcw } from "lucide-react";
import { won, pct, DEFAULT_COSTS, TARGET_AD_RATE } from "../lib/sales";
import { dayLabel } from "../lib/calc";
import { useDays } from "../lib/view";
import { newId } from "../lib/id";
import {
  DEFAULT_PRICING,
  actualRates,
  candidates,
  basePrice,
  priceResult,
  searchKey,
} from "../lib/pricing";
import EditNum from "./EditNum";

const ALL = { from: "", to: "" };

const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
const toNum = (s) => Number(digits(s) || 0);

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

/** 이익률 색 — 목표 이상 초록, 목표의 절반 이상 앰버, 그 밑은 로즈 */
const marginTone = (m, target) =>
  m >= target ? "text-emerald-700" : m >= target / 2 ? "text-amber-700" : "text-rose-700";

// ---------------------------------------------------------------- 가정값 줄

function Assumptions({ rates, settings, onSettings }) {
  const s = { ...DEFAULT_PRICING, ...settings };
  const set = (patch) => onSettings({ ...s, ...patch });

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
                  (s.adBasis === key ? "bg-rose-700 text-white" : "bg-white text-stone-600")
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
            <input
              type="number"
              step="any"
              value={s.targetMargin}
              onChange={(e) => set({ targetMargin: Number(e.target.value) || 0 })}
              className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-right text-sm tabular-nums"
            />
            <span className="text-sm text-stone-500">%</span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-stone-500">부가세 (간이, 대략)</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              step="any"
              value={s.vat}
              onChange={(e) => set({ vat: Number(e.target.value) || 0 })}
              className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-right text-sm tabular-nums"
            />
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

function CalcCard({ draft, setDraft, rates, settings, onSave }) {
  const s = { ...DEFAULT_PRICING, ...settings };
  const supply = toNum(draft.supply);
  const chosen = toNum(draft.price);
  const list = useMemo(() => candidates(supply), [supply]);
  const rows = list.map((p) => priceResult(supply, p, rates, s));
  const firstOk = rows.find((r) => r.meets)?.price;
  // 판매가를 안 골랐으면 기본 판매가(공급가×2, 끝 800)로 본다
  const price = chosen || (supply ? basePrice(supply) : 0);
  const r = supply && price ? priceResult(supply, price, rates, s) : null;

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
            onClick={() => setDraft({ id: "", name: "", vendor: "", supply: "", price: "" })}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700"
          >
            <RotateCcw size={12} /> 새로 계산
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">상품명</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="예: 둥실 벌룬 와이드 팬츠"
            className={FIELD}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">거래처</span>
          <input
            value={draft.vendor}
            onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
            placeholder="예: 디벨롭"
            className={FIELD}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">공급가 (도매가)</span>
          <input
            value={draft.supply ? Number(digits(draft.supply)).toLocaleString("ko-KR") : ""}
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
            value={draft.price ? Number(digits(draft.price)).toLocaleString("ko-KR") : ""}
            onChange={(e) => setDraft({ ...draft, price: digits(e.target.value) })}
            inputMode="numeric"
            placeholder={supply ? basePrice(supply).toLocaleString("ko-KR") : "0"}
            className={FIELD + " text-right text-lg font-semibold tabular-nums"}
          />
        </label>
      </div>

      {supply > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem]">
          {/* 판매가 후보 — 누르면 그 가격으로 고른다 */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-400">
                  <th className="px-3 py-2 text-left font-medium">판매가</th>
                  <th className="px-3 py-2 text-right font-medium">정상가</th>
                  <th className="px-3 py-2 text-right font-medium">원가율</th>
                  <th className="px-3 py-2 text-right font-medium">남는 돈</th>
                  <th className="px-3 py-2 text-right font-medium">이익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {rows.map((x) => {
                  const on = x.price === price;
                  return (
                    <tr
                      key={x.price}
                      onClick={() => setDraft({ ...draft, price: String(x.price) })}
                      className={
                        "cursor-pointer " + (on ? "bg-rose-50" : "hover:bg-stone-50")
                      }
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
                          "px-3 py-1.5 text-right font-semibold " +
                          marginTone(x.margin, s.targetMargin)
                        }
                      >
                        {pct(x.margin)}%
                      </td>
                    </tr>
                  );
                })}
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
                [`− 부가세 ${s.vat}%`, -r.vat],
              ].map(([label, v]) => (
                <div key={label} className="flex justify-between py-0.5 text-xs text-stone-500">
                  <span>{label}</span>
                  <span className="tabular-nums">{won(Math.abs(v))}</span>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between border-t border-stone-200 pt-2">
                <span className="font-semibold text-stone-800">남는 돈</span>
                <span className={"text-lg font-bold tabular-nums " + marginTone(r.margin, s.targetMargin)}>
                  {won(r.profit)}
                </span>
              </div>
              <div className={"text-right text-xs font-medium " + marginTone(r.margin, s.targetMargin)}>
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
                    supply,
                    price,
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

function SavedList({ items, rates, settings, onEdit, onPatch, onRemove }) {
  const s = { ...DEFAULT_PRICING, ...settings };
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent"); // recent | low | high

  const rows = useMemo(() => {
    const needle = searchKey(q);
    const out = items
      .filter((i) => !needle || searchKey(i.name + i.vendor).includes(needle))
      .map((i) => ({ ...i, r: priceResult(i.supply, i.price, rates, s) }));
    if (sort === "low") out.sort((a, b) => a.r.margin - b.r.margin);
    if (sort === "high") out.sort((a, b) => b.r.margin - a.r.margin);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, sort, rates, s.adBasis, s.vat, s.targetMargin]);

  const below = rows.filter((x) => !x.r.meets).length;
  const avg = rows.length ? rows.reduce((a, x) => a + x.r.margin, 0) / rows.length : 0;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-900">모아 둔 상품 {items.length}개</h3>
          {rows.length > 0 && (
            <p className="text-xs text-stone-500">
              평균 이익률 <b className="tabular-nums">{pct(avg)}%</b> · 목표 {s.targetMargin}% 밑{" "}
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
              onChange={(e) => setQ(e.target.value)}
              placeholder="상품명·거래처"
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
                onClick={() => setSort(key)}
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
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-400">
                <th className="px-3 py-2.5 text-left font-medium">상품</th>
                <th className="px-3 py-2.5 text-left font-medium">거래처</th>
                <th className="px-3 py-2.5 text-right font-medium">공급가</th>
                <th className="px-3 py-2.5 text-right font-medium">판매가</th>
                <th className="px-3 py-2.5 text-right font-medium">원가율</th>
                <th className="px-3 py-2.5 text-right font-medium">남는 돈</th>
                <th className="px-3 py-2.5 text-right font-medium">이익률</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-stone-50">
                  <td className="px-3 py-1.5 text-left">
                    <button
                      type="button"
                      onClick={() => onEdit(x)}
                      className="text-left font-medium text-stone-900 hover:text-rose-700"
                      title="위 계산기로 불러오기"
                    >
                      {x.name}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-left text-stone-500">{x.vendor || "—"}</td>
                  <td className="w-24 px-1 py-1.5">
                    <EditNum value={x.supply} onSave={(v) => onPatch(x, { supply: v })} />
                  </td>
                  <td className="w-24 px-1 py-1.5">
                    <EditNum
                      value={x.price}
                      tone="font-medium text-stone-900"
                      onSave={(v) => onPatch(x, { price: v })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right text-stone-500">{pct(x.r.costRate, 0)}%</td>
                  <td className="px-3 py-1.5 text-right text-stone-700">{won(x.r.profit)}</td>
                  <td className={"px-3 py-1.5 text-right font-semibold " + marginTone(x.r.margin, s.targetMargin)}>
                    {pct(x.r.margin)}%
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`${x.name} 을(를) 목록에서 뺄까요?`)) onRemove(x.id);
                      }}
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
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- 화면

export default function PricingPage({ rows, conf, onConf, items, onSave, onRemove }) {
  const days = useDays(rows, ALL, conf);
  const costs = useMemo(() => ({ ...DEFAULT_COSTS, ...conf.costs }), [conf.costs]);
  const rates = useMemo(() => actualRates(days, costs), [days, costs]);
  const settings = { ...DEFAULT_PRICING, ...conf.pricing };
  const [draft, setDraft] = useState({ id: "", name: "", vendor: "", supply: "", price: "" });

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">판매가 계산기</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          공급가를 넣으면 판매가마다 한 벌에 얼마 남는지 나와요. 정한 가격은 담아서 모아 둬요.
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
        onSave={async (item) => {
          await onSave(item);
          setDraft({ id: "", name: "", vendor: "", supply: "", price: "" });
        }}
      />

      <SavedList
        items={items}
        rates={rates}
        settings={settings}
        onEdit={(x) => {
          setDraft({ id: x.id, name: x.name, vendor: x.vendor || "", supply: String(x.supply), price: String(x.price) });
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onPatch={(x, patch) => onSave({ id: x.id, name: x.name, vendor: x.vendor, supply: x.supply, price: x.price, ...patch })}
        onRemove={onRemove}
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
