// 인스타 '포클로에 담기' (10/20 세원: "저장한 릴스 하나씩 클릭해서 링크 복붙하고 있는데, 포클로 담기처럼 한 번에 담아서 링크 받을 수 있게.
// 그리고 안 받아지는 릴스는 자동으로 영상 저장되게").
//
// - 인스타는 바깥 스크립트를 막아서(CSP) 단추 안에 이 코드가 통째로 들어간다 → 여기를 고치면 단추를 다시 끌어다 놓아야 한다
//   (ERP 콘텐츠 › 릴스 기획 › '인스타에서 한 번에 담기'가 이 파일을 읽어 단추를 만든다).
// - 목록(저장됨·프로필·둘러보기)에서 누르면 게시물마다 체크 동그라미 + 아래 막대 → 고르고 'N개 담기'.
//   게시물 하나를 연 화면(/reel/…, /p/…)에서 누르면 그 하나만.
// - 고른 게시물은 로그인한 이 브라우저가 인스타 화면이 쓰는 것과 같은 길(/api/v1/media/<id>/info/)로 정보만 읽는다 —
//   영상 주소(cdn, 서명 붙은 주소라 며칠 동안 로그인 없이 받아짐)·대표 사진·계정·글·좋아요·댓글·조회수·음원.
//   사무실 PC 분석기가 링크로 못 받는 릴스(나이·나라 제한 등)는 이 영상 주소로 받는다. 쿠키·비밀번호는 안 넘긴다.
// - 너무 빨리 읽으면 인스타가 막을 수 있어 하나에 1초쯤 쉬어 간다.
// - 읽은 것은 ERP 작은 창(#reels-clip)에 postMessage 로 보낸다. 어떻게 담을지(보관만/분석, 폴더)는 그 창에서 고른다.
(function () {
  var O = window.__pocloO;
  if (window.__pkiStop) {
    window.__pkiStop();
    return;
  }
  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };
  var CODE = /\/(?:p|reels?|tv)\/(?!audio\/)([A-Za-z0-9_-]{5,})/;
  var codeOf = function (href) {
    var m = String(href || "").match(CODE);
    return m ? m[1] : "";
  };
  var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var idOf = function (code) {
    var n = BigInt(0);
    code
      .slice(0, 11)
      .split("")
      .forEach(function (c) {
        n = n * BigInt(64) + BigInt(ABC.indexOf(c));
      });
    return n.toString();
  };
  var day = function (sec) {
    if (!sec) return "";
    var d = new Date(sec * 1000);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  var widest = function (list) {
    return (list || []).slice().sort(function (a, b) {
      return (b.width || 0) - (a.width || 0);
    })[0];
  };
  var musicOf = function (m) {
    var c = m.clips_metadata || {};
    var a = c.music_info && c.music_info.music_asset_info;
    if (a)
      return { kind: "music", title: a.title || "", artist: a.display_artist || "", audioId: String(a.audio_cluster_id || a.audio_asset_id || ""), trending: !!a.is_trending_in_clips };
    var o = c.original_sound_info;
    if (o) return { kind: "original", title: o.original_audio_title || "", artist: (o.ig_artist && o.ig_artist.username) || "", audioId: String(o.audio_asset_id || "") };
    return null;
  };
  // 게시물 하나 읽기 — 실패해도 링크는 보낸다(분석기가 링크로 받아 본다)
  var read = async function (code) {
    var d = { code: code, url: "https://www.instagram.com/reel/" + code + "/" };
    try {
      var r = await fetch("/api/v1/media/" + idOf(code) + "/info/", {
        credentials: "include",
        headers: { "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest", accept: "*/*" },
      });
      if (!r.ok) throw new Error("정보를 못 읽었어요 (HTTP " + r.status + ")");
      var j = await r.json();
      var m = (j.items || [])[0];
      if (!m) throw new Error("정보가 비어 있어요");
      var vid = m.media_type === 2 ? widest(m.video_versions) : null;
      var img = widest((m.image_versions2 || {}).candidates) || widest((((m.carousel_media || [])[0] || {}).image_versions2 || {}).candidates);
      d.kind = m.media_type === 2 ? "video" : m.media_type === 8 ? "carousel" : "photo";
      if (d.kind !== "video") d.url = "https://www.instagram.com/p/" + code + "/";
      d.video = vid ? vid.url : "";
      d.vw = vid ? vid.width : 0;
      d.vh = vid ? vid.height : 0;
      d.thumb = img ? img.url : "";
      d.user = (m.user && m.user.username) || "";
      d.name = (m.user && m.user.full_name) || "";
      d.caption = ((m.caption && m.caption.text) || "").slice(0, 3000);
      d.likes = m.like_count == null ? null : m.like_count;
      d.comments = m.comment_count == null ? null : m.comment_count;
      d.views = m.play_count || m.ig_play_count || m.view_count || null;
      d.postedAt = day(m.taken_at);
      d.seconds = Math.round(m.video_duration || 0) || null;
      d.slides = m.media_type === 8 ? (m.carousel_media || []).length : m.media_type === 1 ? 1 : 0;
      d.music = musicOf(m);
    } catch (e) {
      d.err = String((e && e.message) || e).slice(0, 200);
    }
    return d;
  };

  // ---------------------------------------------------------------- 보내기 (ERP 작은 창)
  var send = async function (codes, ui) {
    var win = window.open(O + "/#reels-clip", "poclo-reels-clip", "width=500,height=820");
    var ready = false;
    var hear = function (e) {
      if (e.origin === O && e.data && e.data.poclo === "ready") ready = true;
    };
    window.addEventListener("message", hear);
    var post = function (m) {
      try {
        win.postMessage(m, O);
      } catch (e) {
        void e;
      }
    };
    for (var k = 0; k < 150 && !ready; k++) await sleep(100);
    window.removeEventListener("message", hear);
    if (!ready) return { ok: false, why: "담기 창이 준비되지 않았어요 — 포클로ERP 에 로그인돼 있는지 확인하고 다시 눌러 주세요" };
    post({ poclo: "start", n: codes.length, from: location.href });
    var got = 0,
      bad = 0;
    for (var i = 0; i < codes.length; i++) {
      if (ui && ui.halt) break;
      if (ui) ui.step(i, codes.length);
      var d = await read(codes[i]);
      if (d.err) bad++;
      else got++;
      post({ poclo: "item", i: i, n: codes.length, d: d });
      if (i < codes.length - 1) await sleep(900 + Math.random() * 600);
    }
    post({ poclo: "end", n: codes.length, got: got, bad: bad, halted: !!(ui && ui.halt) });
    return { ok: true, got: got, bad: bad };
  };

  // 게시물 하나를 연 화면이면 그 하나만
  var here = codeOf(location.pathname);
  if (here) {
    send([here], null);
    return;
  }

  // ---------------------------------------------------------------- 고르기 (목록 화면)
  var ROSE = "#be123c";
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var css = document.createElement("style");
  css.setAttribute("data-poclo", "1");
  css.textContent = [
    ".pk-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483640}",
    ".pk-ring{position:fixed;box-shadow:inset 0 0 0 3px " + ROSE + ";background:rgba(190,18,60,.1);opacity:0;transition:opacity .15s ease-out}",
    ".pk-ring.on{opacity:1}",
    ".pk-dot{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.94);box-shadow:0 1px 4px rgba(0,0,0,.22),inset 0 0 0 1.5px rgba(28,25,23,.32);display:flex;align-items:center;justify-content:center;transition:transform .15s cubic-bezier(.2,.8,.2,1),background-color .15s,box-shadow .15s}",
    ".pk-dot svg{opacity:0;transform:scale(.6);transition:opacity .12s,transform .15s cubic-bezier(.2,.8,.2,1)}",
    ".pk-dot.hov{transform:scale(1.12);box-shadow:0 2px 8px rgba(0,0,0,.28),inset 0 0 0 2px " + ROSE + "}",
    ".pk-dot.on{background:" + ROSE + ";box-shadow:0 2px 10px rgba(190,18,60,.45)}",
    ".pk-dot.on svg{opacity:1;transform:scale(1)}",
    ".pk-bar{position:fixed;left:50%;bottom:24px;z-index:2147483647;transform:translate(-50%,14px);opacity:0;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .22s;" +
      "display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);padding:10px 10px 10px 12px;background:#fff;color:#1c1917;border:1px solid #e7e5e4;border-radius:18px;" +
      "box-shadow:0 14px 40px rgba(28,25,23,.18),0 2px 6px rgba(28,25,23,.08);font:14px/1.35 Pretendard,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;letter-spacing:-.01em;overflow:hidden}",
    ".pk-bar.in{transform:translate(-50%,0);opacity:1}",
    ".pk-bar *{box-sizing:border-box;font:inherit;letter-spacing:inherit}",
    ".pk-prog{position:absolute;left:0;right:0;top:0;height:3px;background:#f5f5f4;display:none}",
    ".pk-prog i{display:block;height:100%;width:0;background:" + ROSE + ";transition:width .35s ease-out}",
    ".pk-bar.run .pk-prog{display:block}",
    ".pk-logo{flex:none;width:30px;height:30px;border-radius:9px;background:" + ROSE + ";color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}",
    ".pk-bar.done .pk-logo{background:#047857}",
    ".pk-text{display:flex;flex-direction:column;min-width:0;margin-right:4px}",
    ".pk-text b{font-weight:700;white-space:nowrap}",
    ".pk-text small{font-size:12px;color:#78716c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}",
    ".pk-count{flex:none;min-width:34px;text-align:center;padding:4px 9px;border-radius:999px;background:#f5f5f4;color:#78716c;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;transition:background-color .15s,color .15s}",
    ".pk-count.has{background:#fff1f2;color:" + ROSE + "}",
    ".pk-btn{flex:none;border:0;cursor:pointer;border-radius:11px;padding:9px 13px;font-weight:600;font-size:13px;line-height:1;white-space:nowrap;transition:transform .15s ease-out,background-color .15s,color .15s,opacity .15s}",
    ".pk-btn:active{transform:scale(.97)}",
    ".pk-btn:focus-visible,.pk-x:focus-visible{outline:2px solid " + ROSE + ";outline-offset:2px}",
    ".pk-main{background:" + ROSE + ";color:#fff;padding:10px 16px}",
    ".pk-main:hover{background:#9f1239}",
    ".pk-main[disabled]{background:#e7e5e4;color:#a8a29e;cursor:default;transform:none}",
    ".pk-ghost{background:transparent;color:#57534e}",
    ".pk-ghost:hover{background:#f5f5f4}",
    ".pk-x{flex:none;width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:#a8a29e;cursor:pointer;font-size:18px;line-height:30px;padding:0}",
    ".pk-x:hover{background:#f5f5f4;color:#57534e}",
    ".pk-x.wide{width:auto;padding:0 12px;font-size:13px;font-weight:600;color:#57534e}",
    ".pk-hide{display:none!important}",
    "@media (prefers-reduced-motion: reduce){.pk-bar,.pk-dot,.pk-dot svg,.pk-ring,.pk-prog i{transition:none}}",
  ].join("\n");
  document.head.appendChild(css);
  var layer = document.createElement("div");
  layer.className = "pk-layer";
  layer.setAttribute("data-poclo", "1");
  document.body.appendChild(layer);
  var bar = document.createElement("div");
  bar.className = "pk-bar";
  bar.setAttribute("data-poclo", "1");
  bar.setAttribute("role", "toolbar");
  bar.innerHTML =
    '<div class="pk-prog"><i></i></div><span class="pk-logo">P</span>' +
    '<span class="pk-text"><b>포클로에 담기</b><small>담을 릴스를 눌러 골라요</small></span>' +
    '<span class="pk-count">0개</span>' +
    '<button type="button" class="pk-btn pk-ghost" data-a="all" title="지금 화면에 보이는 게시물을 전부 골라요 — 더 내리면 더 고를 수 있어요">보이는 것 전부</button>' +
    '<button type="button" class="pk-btn pk-ghost" data-a="clear">다 지우기</button>' +
    '<button type="button" class="pk-btn pk-main" data-a="go">담기</button>' +
    '<button type="button" class="pk-x" data-a="close" aria-label="그만">×</button>';
  document.body.appendChild(bar);
  requestAnimationFrame(function () {
    bar.classList.add("in");
  });
  var $ = function (s) {
    return bar.querySelector(s);
  };
  var title = $(".pk-text b"),
    hint = $(".pk-text small"),
    count = $(".pk-count"),
    go = $('[data-a="go"]'),
    all = $('[data-a="all"]'),
    clear = $('[data-a="clear"]'),
    x = $('[data-a="close"]'),
    prog = $(".pk-prog i");

  var picked = []; // 게시물 코드, 고른 순서
  var hover = "";
  var running = false;
  // 게시물 칸 — 게시물 주소로 가는 링크 중 사진 칸 크기인 것
  var tiles = function () {
    return [].slice.call(document.querySelectorAll("a[href]")).filter(function (a) {
      if (a.closest("[data-poclo]") || !codeOf(a.getAttribute("href"))) return false;
      var r = a.getBoundingClientRect();
      return r.width >= 70 && r.height >= 70 && r.width <= innerWidth * 0.6;
    });
  };
  var tileOf = function (t) {
    var a = t && t.closest && t.closest("a[href]");
    if (!a || a.closest("[data-poclo]")) return null;
    var c = codeOf(a.getAttribute("href"));
    if (!c) return null;
    var r = a.getBoundingClientRect();
    return r.width >= 70 && r.height >= 70 ? a : null;
  };
  var dots = new Map();
  var place = function () {
    var keep = new Set();
    if (!running)
      tiles().forEach(function (a) {
        var r = a.getBoundingClientRect();
        if (r.bottom < -40 || r.top > innerHeight + 40 || r.right < 0 || r.left > innerWidth) return;
        var c = codeOf(a.getAttribute("href"));
        var d = dots.get(a);
        if (!d) {
          d = { ring: document.createElement("div"), dot: document.createElement("div") };
          d.ring.className = "pk-ring";
          d.dot.className = "pk-dot";
          d.dot.innerHTML = CHECK;
          layer.appendChild(d.ring);
          layer.appendChild(d.dot);
          dots.set(a, d);
        }
        keep.add(a);
        var on = picked.indexOf(c) >= 0;
        d.dot.className = "pk-dot" + (on ? " on" : "") + (hover === c ? " hov" : "");
        d.ring.className = "pk-ring" + (on ? " on" : "");
        d.dot.style.left = Math.round(r.right - 34) + "px";
        d.dot.style.top = Math.round(r.top + 8) + "px";
        d.ring.style.left = Math.round(r.left) + "px";
        d.ring.style.top = Math.round(r.top) + "px";
        d.ring.style.width = Math.round(r.width) + "px";
        d.ring.style.height = Math.round(r.height) + "px";
      });
    dots.forEach(function (d, a) {
      if (keep.has(a)) return;
      d.dot.remove();
      d.ring.remove();
      dots.delete(a);
    });
  };
  var raf = 0;
  var req = function () {
    if (!raf)
      raf = requestAnimationFrame(function () {
        raf = 0;
        place();
      });
  };
  var timer = setInterval(req, 400); // 내리면 새로 불러오는 칸까지

  var draw = function () {
    var n = picked.length;
    count.textContent = n + "개";
    count.classList.toggle("has", n > 0);
    go.textContent = n ? n + "개 담기" : "담기";
    go.disabled = !n;
    clear.classList.toggle("pk-hide", !n);
    hint.textContent = n ? "더 고르거나 '" + n + "개 담기' · 다시 누르면 빠져요" : "담을 릴스를 눌러 골라요";
    req();
  };
  // 고르는 동안은 게시물이 안 열리게 — 누르기를 먼저 받아서 막는다
  var EV = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  var block = function (e) {
    if (running) return;
    var a = tileOf(e.target);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type !== "click") return;
    var c = codeOf(a.getAttribute("href"));
    var i = picked.indexOf(c);
    if (i >= 0) picked.splice(i, 1);
    else picked.push(c);
    draw();
  };
  var over = function (e) {
    if (running) return;
    var a = tileOf(e.target);
    var c = a ? codeOf(a.getAttribute("href")) : "";
    if (c !== hover) {
      hover = c;
      req();
    }
  };
  var key = function (e) {
    if (e.key === "Escape" && !running) end();
  };
  var on = function () {
    EV.forEach(function (t) {
      document.addEventListener(t, block, true);
    });
    document.addEventListener("pointerover", over, true);
    document.addEventListener("keydown", key, true);
    addEventListener("scroll", req, true);
    addEventListener("resize", req);
  };
  var off = function () {
    EV.forEach(function (t) {
      document.removeEventListener(t, block, true);
    });
    document.removeEventListener("pointerover", over, true);
    document.removeEventListener("keydown", key, true);
  };
  var end = function () {
    off();
    removeEventListener("scroll", req, true);
    removeEventListener("resize", req);
    clearInterval(timer);
    bar.classList.remove("in");
    layer.remove();
    css.remove();
    setTimeout(function () {
      bar.remove();
    }, 240);
    window.__pkiStop = null;
  };
  window.__pkiStop = end;
  x.onclick = end;
  clear.onclick = function () {
    picked = [];
    draw();
  };
  all.onclick = function () {
    tiles().forEach(function (a) {
      var r = a.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      var c = codeOf(a.getAttribute("href"));
      if (picked.indexOf(c) < 0) picked.push(c);
    });
    draw();
  };
  on();
  draw();

  var stage = function (s, t, h) {
    bar.classList.toggle("run", s === "run");
    bar.classList.toggle("done", s === "done");
    title.textContent = t;
    hint.textContent = h || "";
    [count, all, clear, go].forEach(function (b) {
      b.classList.toggle("pk-hide", s !== "pick");
    });
    $(".pk-logo").innerHTML = s === "done" ? CHECK : "P";
  };
  go.onclick = async function () {
    if (!picked.length) return;
    running = true;
    off();
    var list = picked.slice();
    picked = [];
    place();
    x.textContent = "멈추기";
    x.setAttribute("aria-label", "멈추기");
    x.classList.add("wide");
    var ui = {
      halt: false,
      step: function (i, n) {
        stage("run", i + 1 + " / " + n + " 읽는 중", "인스타가 막지 않게 천천히 읽어요 — 이 탭은 그대로 두세요");
        prog.style.width = Math.round((i / n) * 100) + "%";
      },
    };
    x.onclick = function () {
      ui.halt = true;
      hint.textContent = "지금 것까지만 읽고 멈춰요";
    };
    stage("run", "담기 창을 여는 중…", "포클로ERP 작은 창이 열려요");
    var r = await send(list, ui);
    prog.style.width = "100%";
    stage(r.ok ? "done" : "pick-off", r.ok ? r.got + r.bad + "개 보냈어요" : "못 보냈어요", r.ok ? (r.bad ? "정보를 못 읽은 것 " + r.bad + "개(링크만) · " : "") + "담기 창에서 어떻게 담을지 골라요" : r.why);
    x.textContent = "닫기";
    x.setAttribute("aria-label", "닫기");
    x.onclick = end;
    if (r.ok) setTimeout(end, 6000);
  };
})();
