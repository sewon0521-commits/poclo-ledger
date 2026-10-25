import { useEffect, useState } from "react";
import { CalendarDays, Clock, Loader2, MapPin, Navigation } from "lucide-react";
import { getSheet, sheetTokenOfHash, SheetError, dayLabel } from "../lib/shootSheet";
import { BigSlides } from "./ContentBits";

// 모델이 폰으로 여는 촬영 시트 — 로그인 없음. main.jsx 가 주소가 #sheet=<토큰> 이면 App 대신 이것만 그린다.
// 내용은 ERP 가 고른 칸만 담은 스냅숏(lib/shootSheet.js) — 날짜·시각·장소·모델에게 한 줄·코디(상품 이름·색상·사진)·스타일링·참고 사진.

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

function Tags({ label, list }) {
  if (!list?.length) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="w-14 shrink-0 pt-1 text-xs font-semibold text-stone-500">{label}</span>
      <span className="flex flex-wrap gap-1.5">
        {list.map((t, i) => (
          <span key={i} className="flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[13px] font-medium text-rose-900">
            {t.photo && <img src={t.photo} alt="" className="h-5 w-5 rounded-full object-cover" />}
            {t.text ?? t}
          </span>
        ))}
      </span>
    </div>
  );
}

function CodiCard({ c, n, onBig }) {
  const st = c.styling || {};
  const photos = c.items.map((x) => x.photo).filter(Boolean);
  const hasStyle = st.hair?.length || st.shoes?.length || st.bag?.length || st.acc?.length || st.memo;
  return (
    <Card className="space-y-3 !p-0 overflow-hidden">
      <div className="px-4 pt-4">
        <div className="text-xs font-semibold text-rose-700">코디 {n}</div>
        <h2 className="mt-0.5 text-[17px] leading-snug font-bold text-stone-900">{c.name}</h2>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {c.items.map((x, i) => (
          <button key={i} type="button" onClick={() => x.photo && onBig(photos, photos.indexOf(x.photo))} className="w-[46%] shrink-0 snap-start text-left">
            <span className="block aspect-[3/4] overflow-hidden rounded-xl bg-stone-100">{x.photo && <img src={x.photo} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
            <span className="mt-1.5 block text-sm font-semibold text-stone-900">{x.name}</span>
            {x.color && <span className="block text-xs text-stone-500">{x.color}</span>}
          </button>
        ))}
      </div>
      {hasStyle ? (
        <div className="space-y-2 border-t border-stone-100 px-4 py-3">
          <Tags label="헤어" list={st.hair} />
          <Tags label="신발" list={st.shoes} />
          <Tags label="가방" list={st.bag} />
          <Tags label="악세서리" list={st.acc} />
          {st.memo && <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm whitespace-pre-line text-stone-700">{st.memo}</p>}
        </div>
      ) : null}
      {c.refs?.length > 0 && (
        <div className="border-t border-stone-100 px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-stone-500">이런 느낌으로 찍어요</div>
          <div className="grid grid-cols-4 gap-1.5">
            {c.refs.map((u, i) => (
              <button key={i} type="button" onClick={() => onBig(c.refs, i)} className="block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SheetPage() {
  const [token] = useState(() => sheetTokenOfHash(window.location.hash));
  const [state, setState] = useState(token ? "loading" : "notfound");
  const [sheet, setSheet] = useState(null);
  const [big, setBig] = useState(null);
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
        {s.note && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-sm whitespace-pre-line text-rose-900">{s.note}</p>}
      </Card>

      {s.codis?.length ? (
        s.codis.map((c, i) => <CodiCard key={i} c={c} n={i + 1} onBig={(urls, at) => setBig({ urls, at })} />)
      ) : (
        <Card className="py-8 text-center text-sm text-stone-500">찍을 코디는 정해지는 대로 알려 드릴게요.</Card>
      )}

      <p className="px-1 pb-6 text-center text-xs text-stone-400">
        궁금한 점은 포클로 DM 으로 편하게 물어봐 주세요 💗
        {until && <span className="mt-1 block">사진은 {until.getMonth() + 1}/{until.getDate()}까지 보여요</span>}
      </p>
      {big && <BigSlides urls={big.urls} start={Math.max(0, big.at)} onClose={() => setBig(null)} />}
    </Shell>
  );
}
