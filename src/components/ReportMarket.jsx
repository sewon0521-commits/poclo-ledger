import { useState } from "react";
import { Sun, Cloud, CloudSun, CloudRain, CloudSnow, Thermometer, Newspaper, ChevronDown } from "lucide-react";

/**
 * 매일 보고 — 시장 종합 (2026-10-22)
 * 세원: "광고만 이야기하지 말고 시장 트렌드·기온·뉴스·경쟁사 신상·경쟁사 인스타를 종합해서 무엇을 소싱하고 어떤 콘텐츠를 기획하고
 *        어떻게 팔고 어떤 소재를 만들지 판단해서 보고. 광고 상황도 꼭 — 광고는 쇼만마가 하고 있으니 그걸 고려해서."
 * 자료는 r.market (poclo-cafe24/market.py), 판단은 r.market_take (api/report.js).
 * 10/24 세원: "매일 보고 맨날 안 봐 — 간단 코멘트 · 기온 · 시장 흐름 빼고 다 없애" → 소싱할 것 · 기획할 콘텐츠 · 이렇게 팔아요 ·
 *   만들 광고 소재 · 광고 상황 칸을 뺐다(예전 보고에 그 값이 남아 있어도 안 그린다).
 * 예전 보고(10/21 전)에는 없으니 있을 때만 그린다.
 */

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (k) => {
  const d = new Date(`${k}T00:00:00Z`);
  return { md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, wd: WEEK[d.getUTCDay()], sun: d.getUTCDay() === 0, sat: d.getUTCDay() === 6 };
};
const mdOf = (k) => (k ? `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}` : "");
function SkyIcon({ code, size = 18 }) {
  const c = Number(code);
  const I = c <= 1 ? Sun : c === 2 ? CloudSun : c >= 71 && c <= 77 ? CloudSnow : c >= 51 ? CloudRain : Cloud;
  const tone = c <= 1 ? "text-amber-500" : c >= 71 && c <= 77 ? "text-sky-400" : c >= 51 ? "text-sky-600" : "text-stone-400";
  return <I size={size} className={tone} />;
}

function Card({ icon: Icon, title, sub, children, className = "" }) {
  return (
    <section className={"rounded-2xl border border-stone-200 bg-white p-4 " + className}>
      <h3 className="mb-2 flex items-baseline gap-1.5 text-sm font-bold text-stone-900">
        <Icon size={15} className="shrink-0 translate-y-0.5 text-rose-700" />
        {title}
        {sub && <span className="text-xs font-normal text-stone-400">{sub}</span>}
      </h3>
      {children}
    </section>
  );
}

function Weather({ w, take }) {
  const days = w?.days || [];
  const ly = w?.lastYear;
  if (!days.length && !take) return null;
  return (
    <Card icon={Thermometer} title="기온" sub="서울 · 지금 · 앞으로 7일 · 작년 이맘때">
      {days.length > 0 && (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {days.map((x) => {
            const l = dayLabel(x.date);
            const isToday = x.date === w.today;
            const past = x.date < w.today;
            return (
              <div
                key={x.date}
                title={`${x.sky} · ${x.wear}`}
                className={
                  "flex min-w-[3.4rem] flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-2 text-center " +
                  (isToday ? "bg-rose-50 ring-1 ring-rose-200" : past ? "bg-stone-50 opacity-60" : "bg-stone-50")
                }
              >
                <span className={"text-[11px] font-semibold " + (l.sun ? "text-rose-600" : l.sat ? "text-sky-700" : "text-stone-600")}>
                  {isToday ? "오늘" : past ? "어제" : `${l.md} ${l.wd}`}
                </span>
                <SkyIcon code={x.code} />
                <span className="text-xs tabular-nums">
                  <b className="text-stone-900">{Math.round(x.max)}°</b>
                  <span className="text-stone-400"> / </span>
                  <span className={x.min <= 0 ? "font-semibold text-sky-700" : "text-stone-500"}>{Math.round(x.min)}°</span>
                </span>
                {x.rain >= 40 && <span className="text-[10px] text-sky-700 tabular-nums">비 {x.rain}%</span>}
              </div>
            );
          })}
        </div>
      )}
      {ly?.weeks?.length > 0 && (
        <div className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <div className="mb-1 font-semibold text-stone-700">
            작년 이맘때 한 달 <span className="font-normal text-stone-400">· 평균 {ly.avgMax}° / {ly.avgMin}°{ly.firstBelow0 ? ` · 첫 영하 ${mdOf(ly.firstBelow0)}` : ""}</span>
          </div>
          <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {ly.weeks.map((k) => (
              <li key={k.from} className="flex gap-1.5 tabular-nums">
                <span className="w-[5.5rem] shrink-0 text-stone-400">
                  {mdOf(k.from)}~{mdOf(k.to)}
                </span>
                <span className="w-16 shrink-0 font-medium text-stone-800">
                  {Math.round(k.max)}° / {Math.round(k.min)}°
                </span>
                <span className="min-w-0 truncate">{k.wear}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {take && <p className="mt-2 text-sm leading-relaxed text-stone-800">{take}</p>}
      {w?.error && <p className="mt-1 text-xs text-amber-700">{w.error}</p>}
    </Card>
  );
}

function Trend({ trend, news, comp, insta }) {
  const [open, setOpen] = useState(false);
  const n1 = comp?.new1;
  const n7 = comp?.new7;
  if (!trend?.length && !news?.length && !n1) return null;
  const chips = (s) =>
    [...(s?.cats || []).slice(0, 5).map((c) => `${c.cat} ${c.malls}곳`), ...(s?.details || []).slice(0, 5).map((c) => `${c.word} ${c.malls}곳`)];
  return (
    <Card icon={Newspaper} title="시장 흐름" sub="뉴스 · 경쟁몰 신상 · 경쟁사 인스타">
      {trend?.length > 0 && (
        <ul className="space-y-1.5 text-sm leading-relaxed text-stone-800">
          {trend.map((t, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-rose-400">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {(n1 || n7) && (
        <div className="mt-3 space-y-1.5 text-xs">
          {[
            ["어제 대비 새로 든 상품", n1],
            ["7일 전 대비", n7],
          ]
            .filter(([, s]) => s?.count)
            .map(([label, s]) => (
              <div key={label} className="flex flex-wrap items-center gap-1">
                <span className="mr-1 font-semibold text-stone-600">
                  {label} {s.count}개{s.made ? ` (MADE ${s.made})` : ""}
                </span>
                {chips(s).map((c) => (
                  <span key={c} className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
                    {c}
                  </span>
                ))}
              </div>
            ))}
          {comp?.malls > 0 && <p className="text-[11px] text-stone-400">경쟁몰 {comp.malls}곳 베스트 · 사입 트래커 {mdOf(comp.date)} 기록</p>}
        </div>
      )}
      {insta?.postKinds && (
        <p className="mt-2 text-xs text-stone-500">
          경쟁사 인스타 최근 7일: {Object.entries(insta.postKinds).map(([k, v]) => `${{ carousel: "캐러셀", reel: "릴스", photo: "사진" }[k] || k} ${v}`).join(" · ")}
          {insta.newAdCount ? ` · 경쟁몰 새 광고 ${insta.newAdCount}개(${Object.entries(insta.newAdFormats || {}).map(([k, v]) => `${k} ${v}`).join(" · ")})` : ""}
        </p>
      )}
      {news?.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800">
            <ChevronDown size={13} className={open ? "rotate-180" : ""} /> 뉴스 {news.length}개 {open ? "접기" : "보기"}
          </button>
          {open && (
            <ul className="mt-1.5 space-y-1 text-xs">
              {news.map((x, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-9 shrink-0 text-stone-400 tabular-nums">{mdOf(x.date)}</span>
                  <a href={x.link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-stone-700 hover:text-rose-700 hover:underline">
                    {x.title} <span className="text-stone-400">· {x.source}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/** 기온 · 시장 흐름 (10/24 소싱·콘텐츠·판매·소재·광고 칸은 뺌) */
export function MarketBrief({ r }) {
  const m = r.market || {};
  const t = r.market_take || {};
  if (!r.market && !r.market_take) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Weather w={m.weather} take={t.weather} />
      <Trend trend={t.trend} news={Array.isArray(m.news) ? m.news : []} comp={m.compNew} insta={m.insta} />
    </div>
  );
}
