import { useEffect, useState } from "react";
import { MessageSquareText, AlertTriangle } from "lucide-react";
import { changeKey, loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { when } from "../lib/cs";
import NpayDelay from "./NpayDelay";

/**
 * 일 › 배송지연 안내 (11/10 세원: "네이버페이도 묶어서 erp에 배송지연 메시지 발송 요런 카테고리 만들어서 진행할 수 있게")
 * ① 네이버페이 발송지연 처리 — NpayDelay (settings npay_delay, 사무실 PC npay_delay.py)
 * ② 카페24 배송지연 문자 — 결제 다음 날부터 평일 3일↑ 미출고(네이버페이 주문형 제외). settings delay_sms (사무실 PC delay_sms.py)
 *    보내기는 카페24 '문자(알림)' 권한이 열리면 붙인다(11/10 확인: SMS API 는 있는데 지금 앱 권한 밖 — 403). 그 전엔 대상·문구만.
 * 흐름은 둘 다 같다: 대상 목록 → 문구·날짜 → 세원 버튼. 사람 확인 없이 안 나간다.
 */

const DEFAULT_SMS = "[포클로] 주문하신 상품 출고 안내\n인기 상품에 주문이 몰려 거래처 입고가 조금 늦어지고 있어요.\n들어오는 대로 가장 먼저 꼼꼼히 검수해서 보내 드리고, 출고되면 송장번호를 다시 안내드릴게요.\n기다려 주셔서 감사합니다 🤍";

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
  const msg = text || v?.text || DEFAULT_SMS;
  const saveText = () => text && changeKey("delay_sms", online, (w) => ({ ...w, text })).catch(() => {});
  const rescan = () => changeKey("cs_queue", online, (q) => ({ ...q, items: [...(q.items || []).filter((j) => j.kind !== "sms_scan"), { id: "sms_scan", kind: "sms_scan", at: new Date().toISOString() }] }));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <MessageSquareText size={15} className="text-rose-700" />
        <span className="text-sm font-bold text-stone-900">카페24 배송지연 문자</span>
        <span className="text-xs text-stone-500">결제 다음 날부터 평일 3일↑ 미출고 · 네이버페이 주문형 빼고 · {items.length}건</span>
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
                <span className="text-xs font-semibold text-amber-700">평일 {x.days}일째</span>
                <span className="text-[11px] text-stone-400">{x.status === "sent" ? `보냄 ${when(x.sentAt)}` : "안 보냄"}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-stone-500">문자 문구 (취소는 먼저 권하지 않아요)</span>
          <textarea value={msg} onChange={(e) => setText(e.target.value)} onBlur={saveText} rows={4} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-rose-600" />
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

export default function DelayPage({ online }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-stone-900">배송지연 안내</h2>
        <p className="mt-0.5 text-sm text-stone-500">늦어지는 주문을 한곳에서 — 대상 목록 → 문구·날짜 → 버튼 하나. 확인하고 누를 때만 나가요.</p>
      </div>
      <NpayDelay online={online} always />
      <DelaySms online={online} />
    </div>
  );
}
