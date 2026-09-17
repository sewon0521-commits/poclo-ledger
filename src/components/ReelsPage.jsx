import { useState } from "react";
import {
  Clapperboard,
  Upload,
  Wand2,
  Copy,
  Check,
  Trash2,
  Info,
  Loader2,
  Link2,
  BookOpen,
} from "lucide-react";
import { extractFrames } from "../lib/video";
import { readScript, adaptScript } from "../lib/reels";
import { newId } from "../lib/id";
import { Empty } from "./ui";

/**
 * 릴스 기획 — 레퍼런스 영상에서 대본을 뽑고, 그 구조에 우리 상품을 대입한다.
 *
 * **영상 파일은 어디에도 올라가지 않는다.** 브라우저가 장면 사진 8~14장을 떠서 그것만 보낸다
 * (Claude 가 영상·소리를 직접 못 읽기 때문). 자막이 박힌 릴스는 그대로 읽히고,
 * 목소리만 있는 릴스는 사람이 들은 말을 붙여넣으면 합쳐서 정리한다.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

const KINDS = [
  ["자막형", "화면에 글자가 박힌 영상"],
  ["목소리형", "말로만 하는 영상"],
  ["자막+목소리", "둘 다"],
];

function CopyButton({ text, label = "복사" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("복사해서 쓰세요", text);
        }
      }}
      className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "복사됨" : label}
    </button>
  );
}

function Card({ title, right, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-stone-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------ 1단계: 대본 뽑기

function Step1({ busy, setBusy, onDone, notice, setNotice }) {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("자막형");
  const [transcript, setTranscript] = useState("");
  const [memo, setMemo] = useState("");
  const [over, setOver] = useState(false);
  const [step, setStep] = useState("");

  const run = async (f) => {
    setNotice("");
    setBusy(true);
    try {
      setStep("영상에서 장면 뜨는 중…");
      const { frames, seconds } = await extractFrames(f, {
        onStep: (i, n) => setStep(`영상에서 장면 뜨는 중… ${i}/${n}`),
      });
      setStep(`장면 ${frames.length}장을 읽는 중… (20초쯤 걸려요)`);
      const r = await readScript({ frames, kind, transcript, memo });
      if (!r.ok) {
        setNotice(r.message);
        return;
      }
      onDone({ ...r.data, seconds: r.data.seconds || seconds, fileName: f.name });
    } catch (err) {
      setNotice(err?.message || "영상을 읽지 못했어요.");
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  return (
    <Card title="1. 레퍼런스 영상에서 대본 뽑기">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
      >
        <label
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-6 text-center transition " +
            (over ? "border-rose-500 bg-rose-50" : "border-stone-300 bg-stone-50 hover:bg-stone-100")
          }
        >
          <Upload size={20} className={over ? "text-rose-600" : "text-stone-400"} />
          <span className="text-sm font-medium text-stone-700">
            {file ? file.name : "릴스 영상을 끌어다 놓거나 눌러서 고르기"}
          </span>
          <span className="text-[11px] text-stone-400">
            mp4 · mov · webm · 영상은 어디에도 안 올라가요 (장면 사진만 보냅니다)
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setFile(f);
            }}
          />
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-xs text-stone-500">영상 형태</span>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map(([k, hint]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              title={hint}
              className={
                "rounded-lg border px-3 py-1.5 text-sm font-medium " +
                (kind === k
                  ? "border-rose-700 bg-rose-700 text-white"
                  : "border-stone-300 bg-white text-stone-600")
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {kind !== "자막형" && (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-stone-500">
            받아쓴 말 <span className="text-stone-400">· 소리는 못 읽어요. 인스타 자동자막을 복사해 넣으면 가장 정확해요</span>
          </span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="영상에서 말하는 내용을 붙여넣으세요 (선택)"
            className={FIELD + " h-24 resize-y text-sm"}
          />
        </label>
      )}

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-stone-500">메모 (선택)</span>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 이 계정 팔로워 12만 · 조회수 80만 나온 영상"
          className={FIELD}
        />
      </label>

      <button
        type="button"
        disabled={!file || busy}
        onClick={() => run(file)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
        {busy ? step || "읽는 중…" : "대본 뽑기"}
      </button>
      {notice && <p className="mt-2 text-sm text-rose-700">{notice}</p>}
    </Card>
  );
}

// ------------------------------------------------------------ 대본 결과

function ScriptResult({ ref_, onSave, saved }) {
  return (
    <Card
      title={ref_.title || "레퍼런스 대본"}
      right={
        <div className="flex flex-wrap gap-1.5">
          <CopyButton text={ref_.script || ""} label="대본 복사" />
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            <BookOpen size={13} /> {saved ? "라이브러리에 저장됨" : "라이브러리에 담기"}
          </button>
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">{ref_.kind}</span>
        {ref_.seconds > 0 && (
          <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">{ref_.seconds}초</span>
        )}
        {ref_.structure?.hookType && (
          <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700">
            훅: {ref_.structure.hookType}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
        <div className="text-xs font-semibold text-stone-500">훅 (첫 1~3초)</div>
        <div className="mt-0.5 font-medium text-stone-900">{ref_.hook}</div>
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-stone-500">대본</div>
        <p className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
          {ref_.script}
        </p>
      </div>

      {ref_.scenes?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-stone-500">장면 흐름</div>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
            {ref_.scenes.map((s, i) => (
              <li key={i} className="flex gap-3 px-3 py-2">
                <span className="w-16 shrink-0 text-xs text-stone-400">{s.at}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-stone-700">{s.visual}</span>
                  {s.text && <span className="block text-xs text-rose-700">“{s.text}”</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm leading-relaxed text-stone-700">
        <div className="text-xs font-semibold text-stone-500">구조</div>
        <div className="mt-0.5">{ref_.structure?.flow}</div>
        <div className="mt-1 text-stone-500">
          CTA: {ref_.structure?.cta} · {ref_.structure?.whyItWorks}
        </div>
      </div>

      {ref_.note && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-800">
          <Info size={13} className="mt-0.5 shrink-0" />
          {ref_.note}
        </p>
      )}
    </Card>
  );
}

// ------------------------------------------------------------ 2단계: 우리 상품으로

function Step2({ ref_, busy, setBusy, plan, setPlan }) {
  const [url, setUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState("");

  const run = async () => {
    setMsg("");
    setBusy(true);
    try {
      const r = await adaptScript({ reference: ref_, url: url.trim(), memo });
      if (!r.ok) setMsg(r.message);
      else setPlan(r.data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="2. 우리 상품으로 기획하기">
      <p className="mb-2.5 text-xs leading-relaxed text-stone-500">
        우리 상품 판매페이지 주소를 넣으면 그 상품을 읽고, 위 레퍼런스의 <b className="font-semibold">구조를
        빌려서</b> 우리 릴스 대본을 씁니다.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-stone-500">상품 주소</span>
        <span className="relative block">
          <Link2 size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://ppoclo.cafe24.com/product/..."
            className={FIELD + " pl-8"}
          />
        </span>
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-stone-500">메모 (선택)</span>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 가을 신상으로 밀 것 · 지원이가 착용 · 블랙 위주로"
          className={FIELD}
        />
      </label>
      <button
        type="button"
        disabled={!url.trim() || busy}
        onClick={run}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
        {busy ? "상품 읽고 기획하는 중…" : "우리 릴스 대본 만들기"}
      </button>
      {msg && <p className="mt-2 text-sm text-rose-700">{msg}</p>}

      {plan && (
        <div className="mt-4 border-t border-stone-200 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-stone-900">
              {plan.product?.name}
              {plan.product?.price && (
                <span className="ml-1.5 text-sm font-normal text-stone-500">{plan.product.price}</span>
              )}
            </div>
            <CopyButton
              text={[
                plan.script,
                "",
                plan.caption,
                (plan.hashtags || []).join(" "),
              ].join("\n")}
              label="대본+본문 복사"
            />
          </div>

          <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
            <div className="text-xs font-semibold text-stone-500">훅</div>
            <div className="mt-0.5 font-medium text-stone-900">{plan.hook}</div>
          </div>

          <p className="mt-3 rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
            {plan.script}
          </p>

          {plan.scenes?.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-stone-500">촬영 순서</div>
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
                {plan.scenes.map((s, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="w-16 shrink-0 text-xs text-stone-400">{s.at}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-stone-700">{s.shot}</span>
                      {s.text && <span className="block text-xs text-rose-700">“{s.text}”</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
              <div className="text-xs font-semibold text-stone-500">소구점</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-700">
                {(plan.product?.points || []).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              {plan.product?.target && (
                <div className="mt-1.5 text-xs text-stone-500">누구에게: {plan.product.target}</div>
              )}
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
              <div className="text-xs font-semibold text-stone-500">인스타 본문</div>
              <p className="mt-1 leading-relaxed whitespace-pre-wrap text-stone-700">{plan.caption}</p>
              <p className="mt-1.5 text-xs text-stone-500">{(plan.hashtags || []).join(" ")}</p>
            </div>
          </div>

          {plan.why && <p className="mt-2 text-xs leading-relaxed text-stone-500">{plan.why}</p>}
          {plan.product?.cautions && (
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-amber-800">
              <Info size={13} className="mt-0.5 shrink-0" />
              {plan.product.cautions}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------- 화면

export default function ReelsPage({ items, onSave, onRemove }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ref_, setRef] = useState(null);
  const [plan, setPlan] = useState(null);
  const [savedId, setSavedId] = useState("");

  const save = () => {
    const id = savedId || newId("r");
    setSavedId(id);
    onSave({ id, reference: ref_, plan, title: ref_?.title || "릴스", kind: ref_?.kind || "" });
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <Clapperboard size={20} /> 릴스 기획
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          잘 된 릴스에서 대본과 구조를 뽑고, 그 틀로 우리 상품 릴스를 기획해요.
        </p>
      </div>

      <div className="space-y-4">
        <Step1
          busy={busy}
          setBusy={setBusy}
          notice={notice}
          setNotice={setNotice}
          onDone={(data) => {
            setRef(data);
            setPlan(null);
            setSavedId("");
          }}
        />

        {ref_ && <ScriptResult ref_={ref_} onSave={save} saved={!!savedId} />}
        {ref_ && (
          <Step2 ref_={ref_} busy={busy} setBusy={setBusy} plan={plan} setPlan={setPlan} />
        )}

        <section>
          <h3 className="mb-2 font-semibold text-stone-900">라이브러리 {items.length}개</h3>
          {items.length === 0 ? (
            <Empty
              title="아직 모아 둔 릴스가 없어요."
              hint="대본을 뽑은 뒤 '라이브러리에 담기'를 누르면 여기 쌓여요. 지원님도 같이 봐요."
            />
          ) : (
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRef(it.reference);
                      setPlan(it.plan || null);
                      setSavedId(it.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-medium text-stone-900">{it.title}</span>
                    <span className="block truncate text-xs text-stone-400">
                      {it.kind}
                      {it.reference?.structure?.hookType && ` · 훅: ${it.reference.structure.hookType}`}
                      {it.plan?.product?.name && ` · ${it.plan.product.name}`}
                      {it.savedAt && ` · ${it.savedAt.slice(0, 10)}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`${it.title} 을(를) 지울까요?`)) onRemove(it.id);
                    }}
                    aria-label="지우기"
                    className="shrink-0 p-1 text-stone-300 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-5 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          <b className="font-semibold">영상 파일은 올라가지 않아요.</b> 브라우저가 장면 사진 8~14장을 떠서
          그것만 읽힙니다. <b className="font-semibold">소리는 못 들어요</b> — 자막이 박힌 릴스는 그대로 읽히고,
          목소리형은 인스타 자동자막을 복사해 '받아쓴 말'에 넣어주시면 합쳐서 정리합니다.
        </span>
      </p>
    </div>
  );
}
