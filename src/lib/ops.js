// 멈추면 바로 보이게 (2026-11-20 세원 "CS 고도화 — 멈춰도 모름", 포클로_방향성 창 전달)
// 사무실 PC(poclo-cafe24 cs_worker ops_fail/ops_ok)가 settings ops_alerts {at, items:[{at, kind, name, msg, state: fail|ok}]} 에 쓴다:
//   네이버페이센터·톡톡·이지어드민 재고는 두 번 연속 실패면 fail 한 줄, 다시 되면 ok 한 줄 · 카톡은 멈추면 바로 fail.
// 종류마다 마지막 줄이 fail 이면 '멈춤' — 위 오른쪽 알림 종 + CS 관리 맨 위 빨간 줄. ok 가 오면 사라진다.
// PC 자체가 꺼지면 ops_alerts 도 못 쓰니까 cs_worker.at(1분마다 살아 있음)이 오래되면 그것도 알린다(9~23시만 — 밤엔 PC 를 끄기도 함).

export const OPS = {
  npay: { name: "네이버페이센터", fix: "어사이드에서 네이버페이센터 다시 로그인", url: "https://admin.pay.naver.com/o/v3/n/sale/delivery" },
  talk: { name: "네이버 톡톡", fix: "어사이드에서 톡톡 파트너센터 다시 로그인", url: "https://partner.talk.naver.com/web/accounts/102608245/chat?state=wait" },
  kakao: { name: "카톡 채널", fix: "카카오비즈니스 화면을 직접 확인한 뒤 CS 관리에서 [카톡 다시 켜기]", url: "https://business.kakao.com/space/10151425/channel/_xixaxbRX/chats" },
  stock: { name: "이지어드민 재고", fix: "어사이드에서 이지어드민 다시 로그인", url: "https://ka01.ezadmin.co.kr/template35.htm?template=I100" },
  pc: { name: "사무실 PC 자동화", fix: "사무실 PC 가 켜져 있는지, 분석기(PocloReels)가 돌고 있는지 확인", url: "" },
};
export const PC_STALE_MIN = 15;

/** 받침 있으면 '이', 없으면 '가' */
export const iga = (word) => {
  const c = String(word || "").trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이" : "가";
};
const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
/** 오늘이면 '10:17', 아니면 '11/19 22:10' */
export function sinceText(iso, now = Date.now()) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toDateString() === new Date(now).toDateString() ? hm(d) : `${d.getMonth() + 1}/${d.getDate()} ${hm(d)}`;
}

/** 지금 멈춘 것들 [{kind, name, since, msg, fix, url, line}] — 종류마다 마지막 줄이 fail 이면, 그 연속 실패의 첫 줄 시각부터 */
export function opsDown(ops, worker, now = Date.now()) {
  const byKind = {};
  for (const r of ops?.items || []) (byKind[r.kind] ||= []).push(r);
  const out = [];
  for (const [kind, rows] of Object.entries(byKind)) {
    rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const last = rows[rows.length - 1];
    if (!last || last.state !== "fail") continue;
    let i = rows.length - 1;
    while (i > 0 && rows[i - 1].state === "fail") i--;
    // 카톡은 세원이 [카톡 다시 켜기]를 누르면 PC 가 채널 상태를 ok 로 다시 적는다 — 그게 멈춤보다 나중이면 풀린 것(예전 PC 코드는 ok 줄을 안 썼다)
    const ch = worker?.channels?.[kind];
    if (kind === "kakao" && ch?.ok && new Date(ch.at || 0).getTime() > new Date(last.at || 0).getTime()) continue;
    const meta = OPS[kind] || { name: last.name || kind, fix: "확인 필요", url: "" };
    const name = meta.name || last.name || kind;
    out.push({ kind, name, since: rows[i].at, msg: last.msg || "", fix: meta.fix, url: meta.url, line: `${name}${iga(name)} ${sinceText(rows[i].at, now)}부터 멈췄어요` });
  }
  // 사무실 PC 가 아예 응답 없음(ops_alerts 도 못 씀) — 9~23시만
  const h = new Date(now).getHours();
  const wAt = worker?.at ? new Date(worker.at).getTime() : 0;
  if (wAt && now - wAt > PC_STALE_MIN * 60000 && h >= 9 && h < 23) {
    const m = OPS.pc;
    out.push({ kind: "pc", name: m.name, since: worker.at, msg: "", fix: m.fix, url: "", line: `${m.name}${iga(m.name)} ${sinceText(worker.at, now)}부터 응답이 없어요` });
  }
  return out.sort((a, b) => String(a.since).localeCompare(String(b.since)));
}
