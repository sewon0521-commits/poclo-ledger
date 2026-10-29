import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Clock, Film, Image as ImageIcon, Loader2, MapPin, Navigation, Repeat } from "lucide-react";
import { GuideSections, RefLinks } from "./BaseGuide";
import { getSheet, sheetTokenOfHash, SheetError, dayLabel } from "../lib/shootSheet";
import { BigSlides } from "./ContentBits";
import LoopClip, { ClipBig } from "./LoopClip";

// 모델이 폰으로 여는 촬영 시트 — 로그인 없음. main.jsx 가 주소가 #sheet=<토큰> 이면 App 대신 이것만 그린다.
// 내용은 ERP 가 고른 칸만 담은 스냅숏(lib/shootSheet.js) — 날짜·시각·장소 → 모델에게 전할 말(인사 한 줄 + 준비하실 것 · 미리 알려 주세요 · 참고해 주세요)
// → 영상 가이드(10/27~). v4(10/29 저녁~)는 코디 칸이 없다. 예전 링크: v3 = 코디마다 메모 · 참고 영상 · 참고 사진, v2 = 코디 사진 · 메모(그대로 그린다).
// 10/27 세원: "순서를 코디 → 가이드로" — 처음엔 가이드가 코디 위였다. 같은 날 "준비하실 것 … 은 내가 적는 걸로 따로 빼서 코디 바로 위에"(예전엔 가이드 이미지 안).

const timeText = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${m ? ` ${m}분` : ""}`;
};
/** '우베리 스튜디오 (서울 서대문구 북아현로 100, 2층)' → 지도 검색용 주소 */
const mapUrl = (place) => {
  const m = String(place || "").match(/\(([^)]+)\)/);
  const addr = (m ? m[1] : place || "").replace(/,\s*\S*층.*$/, "").trim();
  return addr ? `https://map.naver.com/p/search/${encodeURIComponent(addr)}` : "";
};

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-700 text-sm font-bold text-white">P</span>
          <span className="font-semibold tracking-tight text-stone-900">포클로 POCLO</span>
          <span className="ml-auto text-xs text-stone-400">촬영 시트</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">{children}</main>
    </div>
  );
}
const Card = ({ children, className = "" }) => <section className={"rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5 " + className}>{children}</section>;

/** 글 안의 주소를 누를 수 있게 (10/27 세원: "'모델에게 한 줄' 안의 링크도 누를 수 있게") — 새 탭 */
const URL_RE = /(https?:\/\/[^\s<>"']+|(?:www\.)?(?:instagram\.com|youtu\.be|youtube\.com|naver\.me|tiktok\.com)\/[^\s<>"']*)/gi;
function Linked({ text }) {
  const parts = String(text || "").split(URL_RE);
  return parts.map((p, i) => {
    if (i % 2 === 0) return p;
    const href = /^https?:\/\//i.test(p) ? p.replace(/[).,!?]+$/, "") : "https://" + p.replace(/[).,!?]+$/, "");
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-medium break-all text-rose-700 underline underline-offset-2">
        {p}
      </a>
    );
  });
}

/** 영상 가이드 (10/27) — 촬영 창 '모델에게 보낼 가이드'. 사진은 폭 가득(세로로 긴 안내 이미지도 읽히게).
 *  10/27 세원: "영상 가이드 안 눌리게. 그래도 전체적으로는 키울 수 있게" — 누르면 뜨던 크게 보기를 뺐다(세로로 아주 긴 이미지가 화면 높이에 맞춰 작게 떠서 오히려 안 보였다).
 *  키우기는 페이지째 두 손가락으로 벌려서(화면 설정에 확대 막기 없음 — index.html viewport).
 *  레퍼런스는 적은 순서대로 다 펼쳐서(모델이 내려가면서 보고 따라 하게) — 인스타 릴스·게시물은 시트 안 영상, 그 밖 링크는 새 탭 단추 */
/** 레퍼런스 링크 — 인스타 릴스·게시물은 시트 안 영상(공식 임베드), 그 밖 링크는 새 탭 단추. 영상 가이드 · 코디 카드(v3) 같이 쓴다 */

function GuideCard({ g }) {
  const photos = g?.photos || [];
  const links = g?.links || [];
  if (!photos.length && !links.length) return null;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-1.5 text-base font-bold text-stone-900">
        <Film size={18} className="text-rose-700" /> 영상 가이드
      </div>
      {photos.map((u, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-stone-100">
          <img src={u} alt="촬영 영상 가이드" loading="lazy" className="block h-auto w-full" />
        </div>
      ))}
      {photos.length > 0 && <p className="-mt-1 text-center text-xs text-stone-400">글씨가 작으면 두 손가락으로 벌려 크게 봐 주세요</p>}
      {links.length > 0 && (
        <div className="space-y-4 pt-1">
          <div className="text-xs font-semibold text-stone-500">레퍼런스</div>
          <RefLinks links={links} />
        </div>
      )}
    </Card>
  );
}

/**
 * 코디 카드 v3 (10/29 세원: "모델에게 보낼 시트 중에서 코디는 필요 없을 것 같아. 모델은 입히는 옷만 그냥 입거든. 대신 사진 레퍼런스, 영상 레퍼런스가 정말 중요해.")
 * 코디 번호 · (직접 지은 이름) · 메모 → 참고 영상(릴스에서 자른 장면 — 누르면 그 장면만 반복, 크게 보기) → 참고 사진(누르면 크게) → 인스타 레퍼런스.
 */
function CodiCardV3({ c, n, onBig, onClip }) {
  const clips = c.clips || [];
  const photos = c.photos || [];
  const links = c.links || [];
  const memo = (c.memo || "").trim();
  return (
    <Card className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-rose-700">코디 {n}</div>
        {c.name && <h2 className="mt-0.5 text-[17px] leading-snug font-bold text-stone-900">{c.name}</h2>}
      </div>
      {memo && (
        <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm whitespace-pre-line text-stone-700">
          <Linked text={memo} />
        </p>
      )}
      {clips.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-stone-900">
              <Repeat size={15} className="text-rose-700" /> 이렇게 찍어요
            </h3>
            <span className="text-[11px] text-stone-400">누르면 그 장면만 계속 반복돼요</span>
          </div>
          <div className={clips.length === 1 ? "mx-auto max-w-[16rem]" : "grid grid-cols-2 gap-2.5"}>
            {clips.map((k, i) => (
              <figure key={i} className="min-w-0">
                <LoopClip src={k.src} poster={k.poster} start={k.start} end={k.end} label={k.note || `참고 영상 ${i + 1}`} onBig={k.src ? () => onClip(clips, i) : undefined} className="aspect-[9/16] w-full rounded-xl" />
                {k.note && <figcaption className="mt-1.5 text-[13px] leading-snug font-medium text-stone-800">{k.note}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}
      {photos.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-stone-900">
            <ImageIcon size={15} className="text-rose-700" /> 참고 사진
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((u, i) => (
              <button key={i} type="button" onClick={() => onBig(photos, i)} className="block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}
      {links.length > 0 && (
        <div className="space-y-4">
          <RefLinks links={links} />
        </div>
      )}
      {!clips.length && !photos.length && !links.length && !memo && (
        <p className="rounded-xl bg-stone-50 px-3 py-6 text-center text-sm text-stone-400">참고 사진·영상은 촬영 날 보여 드릴게요</p>
      )}
    </Card>
  );
}

/** 모델에게 전할 말 (10/27) — 인사 한 줄(예전 '모델에게 한 줄') + 준비하실 것 · 미리 알려 주세요 · 참고해 주세요. 코디 바로 위 */
function PrepCard({ note, prep }) {
  const parts = (prep || []).filter((p) => p.items?.length);
  if (!note && !parts.length) return null;
  return (
    <Card className="space-y-4">
      {note && (
        <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm whitespace-pre-line text-rose-900">
          <Linked text={note} />
        </p>
      )}
      {parts.map((p, i) => (
        <section key={i} className={i ? "border-t border-stone-200 pt-4" : ""}>
          <h2 className="mb-2 text-[17px] font-bold text-stone-900">{p.title}</h2>
          <ul className="space-y-1.5">
            {p.items.map((t, j) => (
              <li key={j} className="flex gap-2.5 text-[15px] leading-relaxed text-stone-800">
                <span className={"mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full " + (p.title === "준비하실 것" ? "bg-rose-700/70" : "bg-stone-600")} />
                <span className="min-w-0 break-words">
                  <Linked text={t} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}

// 10/27 세원: "링크에 코디1 에 신상마켓 상품들 나오는데 그거 다 없애고 내가 첨부한 코디 사진 + 메모만" —
// 코디 번호 · (직접 지은 이름) · 코디 사진 · 메모만. 예전(v1) 시트에 든 상품·스타일링 칩·참고 사진도 안 그린다(이름은 자동 = 상품 이름이라 v1 은 숨김).
function CodiCard({ c, n, v, onBig }) {
  const cps = c.codiPhotos || [];
  const memo = (c.memo ?? c.styling?.memo ?? "").trim();
  const name = v >= 2 ? c.name : "";
  return (
    <Card className="space-y-3 !p-0 overflow-hidden">
      <div className="px-4 pt-4">
        <div className="text-xs font-semibold text-rose-700">코디 {n}</div>
        {name && <h2 className="mt-0.5 text-[17px] leading-snug font-bold text-stone-900">{name}</h2>}
      </div>
      {cps.length > 0 ? (
        // 10/27 세원: "코디는 정방형 말고 다 보이게 원본으로" — 자르지 않고 사진 비율 그대로(예전엔 정사각형으로 잘랐다)
        <div className="flex snap-x items-start gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {cps.map((u, i) => (
            <button key={i} type="button" onClick={() => onBig(cps, i)} className={(cps.length > 1 ? "w-[85%]" : "w-full") + " shrink-0 snap-start"}>
              <span className="block overflow-hidden rounded-xl bg-stone-100">
                <img src={u} alt="" loading="lazy" className="block h-auto w-full" />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mx-4 rounded-xl bg-stone-50 px-3 py-6 text-center text-sm text-stone-400">코디 사진은 촬영 날 보여 드릴게요</p>
      )}
      {memo ? (
        <p className="mx-4 mb-4 rounded-xl bg-stone-50 px-3 py-2.5 text-sm whitespace-pre-line text-stone-700">
          <Linked text={memo} />
        </p>
      ) : (
        <div className="pb-1" />
      )}
    </Card>
  );
}

export default function SheetPage() {
  const [token] = useState(() => sheetTokenOfHash(window.location.hash));
  const [state, setState] = useState(token ? "loading" : "notfound");
  const [sheet, setSheet] = useState(null);
  const [big, setBig] = useState(null);
  const [clipBig, setClipBig] = useState(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getSheet(token)
      .then((r) => {
        if (!alive) return;
        if (!r?.data) setState("notfound");
        else {
          setSheet(r.data);
          setState("ok");
        }
      })
      .catch((e) => alive && setState(e instanceof SheetError && e.code === "missing" ? "missing" : "error"));
    return () => {
      alive = false;
    };
  }, [token]);
  useEffect(() => {
    document.title = "포클로 촬영 시트";
  }, []);

  if (state === "loading")
    return (
      <Shell>
        <div className="flex h-60 items-center justify-center text-stone-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      </Shell>
    );
  if (state !== "ok")
    return (
      <Shell>
        <Card className="py-10 text-center">
          <p className="text-base font-semibold text-stone-800">
            {state === "notfound" ? "닫혔거나 없는 링크예요" : state === "missing" ? "촬영 시트 준비가 아직 안 됐어요" : "불러오지 못했어요"}
          </p>
          <p className="mt-1.5 text-sm text-stone-500">{state === "error" ? "인터넷을 확인하고 다시 열어 주세요." : "포클로 DM 으로 새 링크를 받아 주세요."}</p>
        </Card>
      </Shell>
    );

  const s = sheet;
  const map = mapUrl(s.place);
  const until = s.until ? new Date(s.until) : null;
  return (
    <Shell>
      <Card>
        {s.models?.length > 0 && <div className="mb-1 text-sm font-medium text-rose-700">{s.models.map((m) => `${m}님`).join(", ")}, 촬영 미리 봐 주세요 ☺️</div>}
        <div className="flex items-center gap-2 text-xl font-bold text-stone-900">
          <CalendarDays size={20} className="text-rose-700" /> {dayLabel(s.on)} 촬영
        </div>
        <div className="mt-3 space-y-2 text-[15px] text-stone-800">
          {s.time && (
            <div className="flex items-center gap-2">
              <Clock size={16} className="shrink-0 text-stone-400" /> {timeText(s.time)} 시작
            </div>
          )}
          {s.place && (
            <div className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-stone-400" />
              <span className="min-w-0 flex-1">{s.place}</span>
            </div>
          )}
          {map && (
            <a href={map} target="_blank" rel="noreferrer" className="mt-1 flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:border-rose-300">
              <Navigation size={15} /> 네이버 지도에서 보기
            </a>
          )}
        </div>
      </Card>

      <PrepCard note={s.note} prep={s.prep} />

      {/* 10/29 촬영 기본 가이드 — 모든 촬영 공통(동선 · 찍을 영상 · 포즈 …), ERP 촬영 관리 '모델 기본 가이드'에서 쌓아 간다 */}
      {s.base?.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-center gap-1.5 text-base font-bold text-stone-900">
            <BookOpen size={18} className="text-rose-700" /> 촬영 기본 가이드
          </div>
          <GuideSections items={s.base} onBig={(urls, at) => setBig({ urls, at })} onClip={(clips, at) => setClipBig({ clips, at })} />
        </Card>
      )}

      {/* v4(10/29 저녁~): 코디 칸 없음 — 세원 "참고 영상은 우리 보면서 찍으려고 한 거, 코디는 찍을 때 우리가 디렉". 예전 v1~v3 링크는 예전 모양 그대로 */}
      {(s.v || 1) >= 4 ? null : s.codis?.length ? (
        s.codis.map((c, i) =>
          (s.v || 1) >= 3 ? (
            <CodiCardV3 key={i} c={c} n={i + 1} onBig={(urls, at) => setBig({ urls, at })} onClip={(clips, at) => setClipBig({ clips, at })} />
          ) : (
            <CodiCard key={i} c={c} n={i + 1} v={s.v || 1} onBig={(urls, at) => setBig({ urls, at })} />
          ),
        )
      ) : (
        <Card className="py-8 text-center text-sm text-stone-500">찍을 코디는 정해지는 대로 알려 드릴게요.</Card>
      )}

      <GuideCard g={s.guide} />

      <p className="px-1 pb-6 text-center text-xs text-stone-400">
        궁금한 점은 포클로 DM 으로 편하게 물어봐 주세요 💗
        {until && ((s.v || 1) < 4 || s.guide?.photos?.length > 0 || s.base?.some((x) => x.photos?.length)) && (
          <span className="mt-1 block">
            {(s.v || 1) >= 4 ? "가이드 사진" : (s.v || 1) >= 3 ? "사진·영상" : "사진"}은 {until.getMonth() + 1}/{until.getDate()}까지 보여요
          </span>
        )}
      </p>
      {big && <BigSlides urls={big.urls} start={Math.max(0, big.at)} onClose={() => setBig(null)} />}
      {clipBig && <ClipBig clips={clipBig.clips} at={clipBig.at} onClose={() => setClipBig(null)} />}
    </Shell>
  );
}
