// 이벤트 막대 끌어 옮기기 (2026-10-22) — 이벤트 캘린더(EventsPage) · 홈 캘린더(HomeCalendar)가 같이 쓴다.
//
// 세원: "이벤트 바 옮길 수 있게 해줘."
//   마우스  = 막대를 누른 채 5px 넘게 움직이면 끌기.
//   손가락 = 0.4초 길게 누르면 끌기(살짝 떨림) — 그 전에 움직이면 예전처럼 화면 스크롤.
//   끄는 동안 놓일 칸(기간 길이 그대로)을 칠하고, 손가락·마우스 옆에 '이름 → 10/24(금) ~ 10/26(일)' 꼬리표. Esc = 그만두기.
//   놓으면 onDrop(item, n) — n = 옮긴 날수(0 이면 안 부름). 저장은 쓰는 쪽이 settings 조건부 쓰기(changeKey)로.
//   짧게 누르기(클릭·탭)는 예전처럼 click 으로 열기 — 끌고 난 바로 뒤 따라오는 click 은 quiet() 로 거른다(칸 click 도).
//   (거르기는 다음에 새로 누르면 바로 풀린다 — 시간으로 막았더니 끌고 곧바로 누른 클릭까지 먹혔다, 10/22 시험)
//
// 쓰는 쪽이 할 것: 달력 칸에 data-day="YYYY-MM-DD" · 막대 onPointerDown={(e) => press(e, {id, s, t, title, ...})} ·
//   달력 바깥 상자에 ref={box}(끄는 동안 손가락 스크롤 막기) · 꼬리표 <div ref={tag}> (style 은 여기서만 만진다).

import { useEffect, useRef, useState } from "react";
import { diffDays } from "./events";
import { shiftDay } from "./journal";

const HOLD = 400; // 손가락 길게 누르기 (ms)
const SLOP_MOUSE = 5; // 이만큼 움직이면 끌기 (px)
const SLOP_TOUCH = 10; // 길게 누르기 전에 이만큼 움직이면 스크롤로 본다 (px)

/** 화면 (x, y) 밑의 달력 칸 날짜 — 막대·꼬리표 밑까지 본다 */
export function dayAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) if (el.dataset?.day) return el.dataset.day;
  return "";
}

const WK = ["일", "월", "화", "수", "목", "금", "토"];
const mdw = (k) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}(${WK[new Date(k + "T00:00:00Z").getUTCDay()]})`;
/** '10/24(금)' 또는 '10/24(금) ~ 10/26(일)' */
export const rangeText = (s, t) => (t > s ? `${mdw(s)} ~ ${mdw(t)}` : mdw(s));

/** 끄는 중인 막대가 놓일 자리 [시작, 끝] — 끄는 중이 아니면 null */
export function dropRange(drag) {
  if (!drag) return null;
  const n = diffDays(drag.grab, drag.target);
  return [shiftDay(drag.item.s, n), shiftDay(drag.item.t || drag.item.s, n)];
}

/**
 * drag  : 끄는 중이면 {item, grab, target} (grab = 처음 잡은 칸, target = 지금 손가락 밑 칸) — 아니면 null
 * press : 막대 onPointerDown 에서 부른다
 * quiet : 방금 끌기가 끝났으면 true — click 을 무시할 때
 */
export function useBarDrag(onDrop) {
  const [drag, setDrag] = useState(null);
  const cur = useRef(null);
  const hushed = useRef(false);
  const box = useRef(null);
  const tag = useRef(null);
  const drop = useRef(onDrop);
  useEffect(() => {
    drop.current = onDrop;
  });

  // 끄는 동안 손가락으로 화면이 스크롤되지 않게 — passive:false 라야 막을 수 있다
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const f = (ev) => cur.current?.on && ev.cancelable && ev.preventDefault();
    el.addEventListener("touchmove", f, { passive: false });
    return () => el.removeEventListener("touchmove", f);
  }, []);
  // 화면이 닫히면 끌기도 끝
  useEffect(() => () => cur.current?.stop(), []);

  const show = (d) => setDrag(d?.on ? { item: d.item, grab: d.grab, target: d.target } : null);
  const place = (x, y) => {
    const el = tag.current;
    if (el) el.style.transform = `translate(${Math.min(x + 14, innerWidth - el.offsetWidth - 8)}px, ${y + 18}px)`;
  };

  const press = (e, item) => {
    if (cur.current) return;
    const touch = e.pointerType !== "mouse";
    if (!touch && e.button !== 0) return;
    const grab = dayAt(e.clientX, e.clientY);
    if (!grab) return;
    if (!touch) e.preventDefault(); // 글자 긁힘 막기 (click 은 그대로 온다)
    // on = 끄는 중 · was = 한 번이라도 끌었음(손을 뗄 때 click 무시) · dead = Esc 로 그만둠(손 뗄 때까지 아무것도 안 함)
    const d = { item, grab, target: grab, on: false, was: false, dead: false, x: e.clientX, y: e.clientY, pid: e.pointerId, timer: 0 };
    const activate = (x, y) => {
      d.on = true;
      d.was = true;
      show(d);
      requestAnimationFrame(() => place(x, y));
      if (touch) {
        try {
          navigator.vibrate?.(12);
        } catch {
          /* 진동 없는 기기 */
        }
      }
    };
    const move = (ev) => {
      if (ev.pointerId !== d.pid || d.dead) return;
      if (!d.on) {
        const far = Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y);
        if (touch) {
          if (far > SLOP_TOUCH) d.stop(); // 길게 누르기 전에 움직임 = 스크롤
          return;
        }
        if (far <= SLOP_MOUSE) return;
        activate(ev.clientX, ev.clientY);
      }
      place(ev.clientX, ev.clientY);
      const day = dayAt(ev.clientX, ev.clientY);
      if (day && day !== d.target) {
        d.target = day;
        show(d);
      }
    };
    const up = (ev) => {
      if (ev.pointerId !== d.pid) return;
      const n = d.on ? diffDays(d.grab, d.target) : 0;
      d.stop();
      if (n) drop.current(d.item, n);
    };
    const cancel = (ev) => ev.pointerId === d.pid && d.stop();
    const key = (ev) => {
      if (ev.key !== "Escape" || !d.on) return;
      ev.preventDefault();
      ev.stopPropagation();
      d.on = false;
      d.dead = true;
      setDrag(null);
    };
    d.stop = () => {
      clearTimeout(d.timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      if (d.was) hush();
      d.on = false;
      cur.current = null;
      setDrag(null);
    };
    cur.current = d;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    if (touch) d.timer = setTimeout(() => activate(d.x, d.y), HOLD);
  };

  // 끌기가 끝나면 따라오는 click 하나만 무시 — 다음에 새로 누르면(또는 1초 뒤) 풀린다
  const hush = () => {
    hushed.current = true;
    const free = () => {
      hushed.current = false;
      window.removeEventListener("pointerdown", free, true);
    };
    window.addEventListener("pointerdown", free, true);
    setTimeout(free, 1000);
  };
  const quiet = () => hushed.current;
  return { drag, press, quiet, box, tag };
}
