import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * 손가락(펜·마우스) 서명 칸. ref.current.toPng() → data URL(빈 칸이면 ""), .clear().
 * 화면 밀림을 막으려고 칸 안에서만 touch-action:none. 그림은 기기 해상도 2배까지만(서명 png 300KB 아래로).
 */
const SignPad = forwardRef(function SignPad({ onChange }, ref) {
  const cv = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);
  const ink = useRef(0); // 그은 길이 — 점 하나 찍은 건 서명으로 안 침

  const setup = () => {
    const c = cv.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = 2.6;
    g.strokeStyle = "#1c1917";
  };
  useEffect(() => {
    setup();
    // 폭이 바뀌면(화면 돌리기) 칸을 새로 — 그린 건 지워진다
    const ro = new ResizeObserver(() => {
      setup();
      ink.current = 0;
      setEmpty(true);
      onChange?.(false);
    });
    if (cv.current) ro.observe(cv.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => {
    const r = cv.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    e.preventDefault();
    cv.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const g = cv.current.getContext("2d");
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    ink.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
    if (empty && ink.current > 40) {
      setEmpty(false);
      onChange?.(true);
    }
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = cv.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    ink.current = 0;
    setEmpty(true);
    onChange?.(false);
  };
  useImperativeHandle(ref, () => ({
    clear,
    toPng: () => (ink.current > 40 ? cv.current.toDataURL("image/png") : ""),
  }));

  return (
    <div className="relative">
      <canvas
        ref={cv}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        aria-label="서명 칸 — 손가락으로 이름을 쓰세요"
        className="block h-44 w-full touch-none rounded-xl border-2 border-dashed border-stone-300 bg-white"
      />
      {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-300">여기에 손가락으로 서명해 주세요</span>}
      <button type="button" onClick={clear} className="absolute top-2 right-2 flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-600">
        <Eraser size={12} /> 지우기
      </button>
    </div>
  );
});

export default SignPad;
