import { useEffect, useState } from "react";
import { MessageSquareText, AlertTriangle, PackageSearch, Trash2, Plus } from "lucide-react";
import { changeKey, loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { when, etaFor, DELAY_TEMPLATE, fillDelay, scheduleText, codeOf } from "../lib/cs";
import NpayDelay from "./NpayDelay";

/**
 * 일 › 배송지연 안내 (11/10 세원: "네이버페이도 묶어서 erp에 배송지연 메시지 발송 요런 카테고리 만들어서 진행할 수 있게")
 * ① 네이버페이 발송지연 처리 — NpayDelay (settings npay_delay, 사무실 PC npay_delay.py)
 * ② 카페24 배송지연 문자 — 결제 다음 날부터 평일 3일↑ 미출고(네이버페이 주문형 제외). settings delay_sms (사무실 PC delay_sms.py)
 *    보내기는 카페24 '문자(알림)' 권한이 열리면 붙인다(11/10 확인: SMS API 는 있는데 지금 앱 권한 밖 — 403). 그 전엔 대상·문구만.
 * 흐름은 둘 다 같다: 대상 목록 → 문구·날짜 → 세원 버튼. 사람 확인 없이 안 나간다.
 */

// 11/11 세원 배송지연 안내 틀 그대로(네이버 문단 뺌) — (일정)은 주문마다 '거래처 입고 예정'에서 채운다
const DEFAULT_SMS = fillDelay(DELAY_TEMPLATE, { naver: false });

function DelaySms({ online }) {
  const [v, setV] = useState(null);
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => loadKey("delay_sms", online, { items: [] }).then((x) => alive && setV(x)).catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === "delay_sms" && load());
    const off2 = watchKeys(["delay_sms"], load, 30000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);
  const items = (v?.items || []).filter((x) => !x.gone);
  const [inbound, setInbound] = useState(null);
  useEffect(() => {
    loadKey("inbound_eta", online, { items: [] }).then(setInbound).catch(() => {});
  }, [online]);
  const schedOf = (x) => {
    for (const p of x.products || []) {
      const t = scheduleText(inbound, codeOf(p), String(p).split("=").slice(1).join("="));
      if (t) return t;
    }
    return "";
  };
  const msg = text || v?.text || DEFAULT_SMS;
  const saveText = () => text && changeKey("delay_sms", online, (w) => ({ ...w, text })).catch(() => {});
  const rescan = () => changeKey("cs_queue", online, (q) => ({ ...q, items: [...(q.items || []).filter((j) => j.kind !== "sms_scan"), { id: "sms_scan", kind: "sms_scan", at: new Date().toISOString() }] }));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <MessageSquareText size={15} className="text-rose-700" />
        <span className="text-sm font-bold text-stone-900">카페24 배송지연 문자</span>
        <span className="text-xs text-stone-500">평일 3일↑ 미출고 + 거래처 입고 예정으로 늦을 게 정해진 주문 · 네이버페이 주문형 빼고 · {items.length}건</span>
        <span className="ml-auto text-[11px] text-stone-400">{v?.at ? `${when(v.at)} 읽음` : ""}</span>
      </div>
      <div className="space-y-2 px-4 pb-3">
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            보내기는 아직 못 해요 — 카페24 문자 API 는 있는데 우리 앱에 <b>'알림(문자)' 권한</b>이 없어요. 카페24 개발자센터 → 포클로 앱 → 권한에서 알림(문자) 읽기·쓰기를 켜고, 쇼핑몰에서 앱 다시 설치 → 사무실 PC 1_카페24인증.bat. 그러면 이 칸에서 [보내기]가 열려요. (그 전엔 카페24 관리자 › 고객관리 › 문자 보내기로)
          </span>
        </p>
        {!items.length ? (
          <p className="py-2 text-xs text-stone-400">지금은 평일 3일 넘게 못 보낸 주문이 없어요.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {items.map((x) => (
              <li key={x.orderNo} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                <span className="font-mono text-xs text-stone-500">{x.orderNo}</span>
                <span className="min-w-0 flex-1 truncate text-stone-800">{(x.products || []).join(" · ")}</span>
                <span className="text-xs text-stone-500">{x.buyer}</span>
                <span className="text-xs font-semibold text-amber-700">{x.why || `평일 ${x.days}일째`}</span>
                <span className={"text-[11px] " + (schedOf(x) ? "text-stone-500" : "text-rose-600")}>(일정) {schedOf(x) || "채워야 함"}</span>
                <span className="text-[11px] text-stone-400">{x.status === "sent" ? `보냄 ${when(x.sentAt)}` : "안 보냄"}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-stone-500">문자 문구 — 세원 틀(11/11). (일정)은 주문마다 채워져요 · 보내기 전 세원 OK</span>
          <textarea value={msg} onChange={(e) => setText(e.target.value)} onBlur={saveText} rows={10} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-rose-600" />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={rescan} className="rounded-lg px-2 py-1.5 text-xs text-stone-500 hover:text-stone-800">
            지금 다시 읽기
          </button>
          <button type="button" disabled className="ml-auto rounded-xl bg-stone-300 px-4 py-2 text-sm font-semibold text-white" title="카페24 문자 권한이 열리면 보낼 수 있어요">
            문자 보내기 (권한 필요)
          </button>
        </div>
      </div>
    </section>
  );
}

// 11/10 세원 "투톤 네이비만 일밤, 그레이는 오늘 가능 — 말하고 학습해서 다음에도" → 옵션별 입고 예정. CS 초안·배지가 읽는다(lib/cs etaFor)
const ST = [
  ["now", "지금 출고 가능"],
  ["date", "날짜 입고"],
  ["later", "대략·범위"],
  ["unknown", "모름"],
];
function InboundEta({ online }) {
  const [v, setV] = useState(null);
  const [add, setAdd] = useState({ code: "", option: "", status: "date", date: "", memo: "" });
  useEffect(() => {
    let alive = true;
    const load = () => loadKey("inbound_eta", online, { items: [] }).then((x) => alive && setV(x)).catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === "inbound_eta" && load());
    const off2 = watchKeys(["inbound_eta"], load, 30000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);
  const save = (fn) => changeKey("inbound_eta", online, fn).then(setV).catch(() => {});
  const patch = (id, p) => save((w) => ({ ...w, items: (w.items || []).map((x) => (x.id === id ? { ...x, ...p, at: new Date().toISOString(), by: "ERP" } : x)) }));
  const drop = (id) => save((w) => ({ ...w, items: (w.items || []).filter((x) => x.id !== id) }));
  const put = () => {
    const code = add.code.trim();
    if (!code) return;
    const row = { ...add, code, option: add.option.trim(), id: `${code}|${add.option.trim()}`, date: add.status === "date" ? add.date : "", at: new Date().toISOString(), by: "ERP" };
    save((w) => ({ ...w, items: [...(w.items || []).filter((x) => x.id !== row.id), row] }));
    setAdd({ code: "", option: "", status: "date", date: "", memo: "" });
  };
  const items = [...(v?.items || [])].sort((a, b) => `${a.code}${a.option}`.localeCompare(`${b.code}${b.option}`));
  const F = "rounded-lg border border-stone-200 px-2 py-1 text-xs";
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <PackageSearch size={15} className="text-amber-700" />
        <span className="text-sm font-bold text-stone-900">거래처 입고 예정</span>
        <span className="text-xs text-stone-500">옵션마다 언제 나가는지 — CS 초안이 이걸 보고 '가능한 것부터 먼저 보내 드릴까요?'를 써요</span>
      </div>
      <div className="overflow-x-auto px-4 pb-3">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] text-stone-500">
              <th className="py-1 pr-2">상품(고유네임)</th>
              <th className="py-1 pr-2">옵션 (비우면 모든 색)</th>
              <th className="py-1 pr-2">상태</th>
              <th className="py-1 pr-2">입고일</th>
              <th className="py-1 pr-2">메모 (손님에게 그대로 — 범위는 범위로)</th>
              <th className="py-1 pr-2">배지</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((x) => {
              const e = etaFor(v, null, x.code, x.option || "");
              return (
                <tr key={x.id}>
                  <td className="py-1.5 pr-2 font-semibold text-stone-900">{x.code}</td>
                  <td className="py-1.5 pr-2 text-stone-600">{x.option || "모든 색"}</td>
                  <td className="py-1.5 pr-2">
                    <select value={x.status} onChange={(ev) => patch(x.id, { status: ev.target.value })} className={F}>
                      {ST.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">{x.status === "date" ? <input type="date" value={x.date || ""} onChange={(ev) => patch(x.id, { date: ev.target.value })} className={F} /> : <span className="text-stone-300">—</span>}</td>
                  <td className="py-1.5 pr-2">
                    <input defaultValue={x.memo || ""} onBlur={(ev) => ev.target.value !== (x.memo || "") && patch(x.id, { memo: ev.target.value })} className={F + " w-56"} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (e.tone === "ok" ? "bg-emerald-100 text-emerald-800" : e.tone === "wait" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800")}>{e.label}</span>
                  </td>
                  <td className="py-1.5">
                    <button type="button" onClick={() => drop(x.id)} aria-label="지우기" className="text-stone-300 hover:text-rose-700">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-1.5 pr-2">
                <input value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} placeholder="예: 투톤" className={F + " w-24"} />
              </td>
              <td className="py-1.5 pr-2">
                <input value={add.option} onChange={(e) => setAdd({ ...add, option: e.target.value })} placeholder="예: 네이비" className={F + " w-24"} />
              </td>
              <td className="py-1.5 pr-2">
                <select value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value })} className={F}>
                  {ST.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1.5 pr-2">{add.status === "date" && <input type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} className={F} />}</td>
              <td className="py-1.5 pr-2">
                <input value={add.memo} onChange={(e) => setAdd({ ...add, memo: e.target.value })} placeholder="예: 밤 입고 / 11/23~27 출고 예정" className={F + " w-56"} />
              </td>
              <td colSpan={2} className="py-1.5">
                <button type="button" onClick={put} disabled={!add.code.trim()} className="flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1 text-xs font-semibold text-white disabled:bg-stone-300">
                  <Plus size={12} /> 넣기
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-stone-400">다른 창 Claude 는 사무실 PC 에서 `python poclo-cafe24/inbound.py set 투톤 네이비 2026-11-15 "밤 입고"` 로 넣어요. 창고·렉 재고가 있으면 이 표보다 '지금 출고 가능'이 먼저예요.</p>
      </div>
    </section>
  );
}

export default function DelayPage({ online }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-stone-900">배송지연 안내</h2>
        <p className="mt-0.5 text-sm text-stone-500">늦어지는 주문을 한곳에서 — 대상 목록 → 문구·날짜 → 버튼 하나. 확인하고 누를 때만 나가요.</p>
      </div>
      <InboundEta online={online} />
      <NpayDelay online={online} always />
      <DelaySms online={online} />
    </div>
  );
}
