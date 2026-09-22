// 매출(판 쪽) 데이터 한 곳. 매입의 useLedger 와 같은 규칙으로 돈다.
//
//  - remote: Supabase의 sales_daily / settings 에 저장. 둘이 같은 숫자를 본다.
//  - local : Supabase가 없거나 표가 아직 안 만들어졌으면 이 기기에만 저장.
//
// 표가 없을 때 화면을 죽이지 않는다. 로컬로 계속 쓰다가, 스키마를 올리면
// 그때 서버로 옮기면 된다.

import { useCallback, useEffect, useRef, useState } from "react";
import { isRemote, supabase } from "./supabase";
import { DEFAULT_COSTS } from "./sales";
import { SEED_DAYS, SEED_MONTHLY } from "./seed";

const ROWS_KEY = "poclo_sales_rows";
const CONF_KEY = "poclo_sales_conf";
const PRICING_KEY = "poclo_pricing_items";
const REELS_KEY = "poclo_reels_items";
const REEL_FOLDERS_KEY = "poclo_reel_folders";
const CAROUSELS_KEY = "poclo_carousels";
const CAROUSEL_PLANS_KEY = "poclo_carousel_plans";
const REEL_PLANS_KEY = "poclo_reel_plans";

const readLocal = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 시크릿 창이면 저장만 안 될 뿐, 이번 세션에는 그대로 보인다 */
  }
};

const toRow = (r) => ({
  date: r.date,
  cafeGross: Number(r.cafe_gross ?? r.cafeGross) || 0,
  cafeRefund: Number(r.cafe_refund ?? r.cafeRefund) || 0,
  cafeShip: Number(r.cafe_ship ?? r.cafeShip) || 0,
  gross: Number(r.gross) || 0,
  refund: Number(r.refund) || 0,
  net: Number(r.net) || 0,
  cogs: Number(r.cogs) || 0,
  qty: Number(r.qty) || 0,
  orders: Number(r.orders) || 0,
  shipIncome: Number(r.ship_income ?? r.shipIncome) || 0,
  naverNet: Number(r.naver_net ?? r.naverNet) || 0,
  ads: Number(r.ads) || 0,
});

const toDb = (r) => ({
  date: r.date,
  cafe_gross: Math.round(r.cafeGross || 0),
  cafe_refund: Math.round(r.cafeRefund || 0),
  cafe_ship: Math.round(r.cafeShip || 0),
  gross: Math.round(r.gross || 0),
  refund: Math.round(r.refund || 0),
  net: Math.round(r.net || 0),
  cogs: Math.round(r.cogs || 0),
  qty: Math.round(r.qty || 0),
  orders: Math.round(r.orders || 0),
  ship_income: Math.round(r.shipIncome || 0),
  naver_net: Math.round(r.naverNet || 0),
  ads: Math.round(r.ads || 0),
});

const byDate = (a, b) => a.date.localeCompare(b.date);

export function useSales(session) {
  // 저장된 게 하나도 없을 때만 씨앗을 들고 시작한다. 한 번이라도 넣었으면 안 건드린다.
  const [rows, setRows] = useState(() => {
    const saved = readLocal(ROWS_KEY, null);
    return saved?.length ? saved.map(toRow) : SEED_DAYS.map(toRow);
  });
  const [conf, setConf] = useState(() => ({
    costs: DEFAULT_COSTS,
    monthly: SEED_MONTHLY,
    ...readLocal(CONF_KEY, {}),
  }));
  const [notice, setNotice] = useState("");
  const [missingCost, setMissingCost] = useState(null); // { days: {날짜: [{no,name,qty}]}, checked }
  // 판매가 계산기에서 담아 둔 상품들 — settings 의 'pricing' 키
  const [pricing, setPricing] = useState(() => readLocal(PRICING_KEY, []));
  // 릴스 기획 라이브러리 — settings 의 'reels' 키
  const [reels, setReels] = useState(() => readLocal(REELS_KEY, []));
  // 릴스 폴더(상위 → 하위) — settings 의 'reels_folders' 키. items 와 따로 둬야
  // 기획 목록을 저장할 때(changeList 는 {items} 로 통째로 쓴다) 폴더가 안 날아간다.
  const [reelFolders, setReelFolders] = useState(() => readLocal(REEL_FOLDERS_KEY, null));
  // 사무실 PC 분석기에 맡긴 일감과 분석기가 살아 있는지 (poclo-cafe24/reels_worker.py)
  const [reelQueue, setReelQueueState] = useState([]);
  const queueRef = useRef([]);
  const setReelQueue = useCallback((jobs) => {
    queueRef.current = jobs;
    setReelQueueState(jobs);
  }, []);
  const [reelWorker, setReelWorker] = useState(null);
  // 캐러셀 기획 (9/22) — 레퍼런스 'carousels', 기획안 'carousel_plans', 상품 순위 'product_stats'(새벽 갱신이 채움)
  const [carousels, setCarousels] = useState(() => readLocal(CAROUSELS_KEY, []));
  const [carouselPlans, setCarouselPlans] = useState(() => readLocal(CAROUSEL_PLANS_KEY, []));
  const [productStats, setProductStats] = useState(null);
  // 상품에서 시작한 릴스 기획 (9/22) — settings 'reel_plans'
  const [reelPlans, setReelPlans] = useState(() => readLocal(REEL_PLANS_KEY, []));
  const [ready, setReady] = useState(!isRemote);
  // 표가 아직 없으면 서버에 쓰지 않는다. 로컬로만 돈다.
  const remoteOk = useRef(false);

  const online = isRemote && !!session;

  const load = useCallback(async () => {
    try {
      const [s, c, m, p, rl, rf, cr, cp, ps, rp] = await Promise.all([
        supabase.from("sales_daily").select("*").order("date"),
        supabase.from("settings").select("value").eq("key", "sales").maybeSingle(),
        // 공급가 없이 팔린 품목 — 새벽 자동 갱신(daily.py)이 채운다
        supabase.from("settings").select("value").eq("key", "missing_cost").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "pricing").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "reels").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "reels_folders").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "carousels").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "carousel_plans").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "product_stats").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "reel_plans").maybeSingle(),
      ]);
      if (!m.error) setMissingCost(m.data?.value || null);
      if (!p.error && p.data?.value?.items) {
        setPricing(p.data.value.items);
        writeLocal(PRICING_KEY, p.data.value.items);
      }
      if (!rl.error && rl.data?.value?.items) {
        setReels(rl.data.value.items);
        writeLocal(REELS_KEY, rl.data.value.items);
      }
      if (!cr.error && cr.data?.value?.items) {
        setCarousels(cr.data.value.items);
        writeLocal(CAROUSELS_KEY, cr.data.value.items);
      }
      if (!cp.error && cp.data?.value?.items) {
        setCarouselPlans(cp.data.value.items);
        writeLocal(CAROUSEL_PLANS_KEY, cp.data.value.items);
      }
      if (!ps.error) setProductStats(ps.data?.value || null);
      if (!rp.error && rp.data?.value?.items) {
        setReelPlans(rp.data.value.items);
        writeLocal(REEL_PLANS_KEY, rp.data.value.items);
      }
      if (!rf.error && rf.data?.value?.items) {
        setReelFolders(rf.data.value.items);
        writeLocal(REEL_FOLDERS_KEY, rf.data.value.items);
      }
      if (s.error) throw s.error;
      remoteOk.current = true;
      const got = (s.data || []).map(toRow).sort(byDate);
      if (got.length) {
        setRows(got);
      } else {
        // 공유 장부가 아직 비었다 — 지금까지 모은 숫자를 한 번 올려 둔다
        const seed = SEED_DAYS.map(toRow);
        setRows(seed);
        writeLocal(ROWS_KEY, seed);
        await supabase.from("sales_daily").upsert(seed.map(toDb));
      }
      if (!c.error && c.data?.value) {
        setConf((p) => ({ ...p, ...c.data.value }));
      }
    } catch (err) {
      remoteOk.current = false;
      if (String(err?.message || "").match(/sales_daily|settings|relation|schema/i)) {
        setNotice(
          "매출 표가 아직 없어요. Supabase SQL Editor에서 supabase/schema.sql을 다시 실행하면 " +
            "휴대폰에서도 같은 숫자가 보여요. 그때까지는 이 기기에만 저장돼요.",
        );
      } else {
        setNotice("매출을 불러오지 못했어요. 인터넷을 확인하고 새로고침해 주세요.");
      }
      console.error(err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!online) {
      // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    // 서버에서 받아오는 동안만 — 바깥 시스템과 맞추는 일이라 여기가 맞다
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const ch = supabase
      .channel("sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_daily" }, load)
      .subscribe();
    // settings(삼촌비·판매가 목록)는 실시간 알림이 없다. 탭을 다시 볼 때 한 번 읽어
    // 상대가 담은 것이 보이게 한다.
    // 창을 오갈 때마다(확인 창을 닫을 때도) 불리므로 15초에 한 번까지만 읽는다.
    // 매번 읽으면 모든 표가 통째로 다시 그려져서 화면이 버벅인다.
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 15000) return;
      last = Date.now();
      load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(ch);
    };
  }, [online, load]);

  /** 날짜가 겹치면 새 값으로 덮고, 없으면 넣는다. */
  const merge = useCallback(
    async (incoming, patch) => {
      const map = new Map(rows.map((r) => [r.date, r]));
      for (const r of incoming) {
        const prev = map.get(r.date) || {};
        map.set(r.date, { ...prev, ...r, ...(patch ? patch(prev, r) : null) });
      }
      const next = [...map.values()].sort(byDate);
      setRows(next);
      writeLocal(ROWS_KEY, next);

      if (online && remoteOk.current) {
        const touched = next.filter((r) => incoming.some((i) => i.date === r.date));
        const { error } = await supabase.from("sales_daily").upsert(touched.map(toDb));
        if (error) {
          setNotice("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
          console.error(error);
        }
      }
      return next.length;
    },
    [rows, online],
  );

  /** 주문 CSV — 매출·원가·건수를 덮는다. 그날 광고비는 건드리지 않는다. */
  const putDaily = useCallback((daily) => merge(daily), [merge]);

  /** 하루 한 줄을 손으로 고친다. 화면 표에서 숫자를 직접 눌러 바꿀 때 쓴다. */
  const editRow = useCallback((date, patch) => merge([{ date, ...patch }]), [merge]);

  /** 카페24 애널리틱스 CSV — 총매출·환불·배송비만 덮는다. 주문 쪽 숫자는 안 건드린다. */
  const putCafe = useCallback((list) => merge(list), [merge]);

  /** 광고 CSV — 광고비만 덮는다. 매출이 없는 날짜도 줄을 만들어 둔다. */
  const putAds = useCallback(
    (adsByDate) =>
      merge(
        Object.entries(adsByDate).map(([date, ads]) => ({ date, ads })),
        (prev) => ({
          cafeGross: prev.cafeGross || 0,
          cafeRefund: prev.cafeRefund || 0,
          cafeShip: prev.cafeShip || 0,
          gross: prev.gross || 0,
          refund: prev.refund || 0,
          net: prev.net || 0,
          cogs: prev.cogs || 0,
          qty: prev.qty || 0,
          orders: prev.orders || 0,
          shipIncome: prev.shipIncome || 0,
          naverNet: prev.naverNet || 0,
        }),
      ),
    [merge],
  );

  /** 서버에 있는 설정을 지금 바로 읽는다. 둘이 동시에 고칠 때 덮어쓰지 않으려고. */
  const readServerConf = useCallback(async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "sales")
      .maybeSingle();
    if (error) throw error;
    return data?.value || {};
  }, []);

  const saveConf = useCallback(
    async (next) => {
      setConf(next);
      writeLocal(CONF_KEY, next);
      if (online && remoteOk.current) {
        // 비용 칸을 고칠 때 날짜별 삼촌비는 건드리지 않는다. 그건 putSamchon 만 쓴다.
        // 이 화면이 오래 열려 있었으면 상대가 적은 삼촌비를 옛값으로 덮어버리기 때문이다.
        let value = next;
        try {
          const server = await readServerConf();
          if (server.samchonDaily) value = { ...next, samchonDaily: server.samchonDaily };
        } catch {
          /* 못 읽으면 가진 것으로 저장한다 */
        }
        await supabase.from("settings").upsert({ key: "sales", value });
      }
    },
    [online, readServerConf],
  );

  /**
   * 삼촌비 한 날짜를 적는다. 0이면 지운 것과 같다.
   *
   * 삼촌에게 월급을 주는 게 아니라 그날그날 내므로 날짜별로 받는다.
   * sales_daily 칸이 아니라 settings 에 두는 이유: 칸을 새로 만들면 SQL을 또 돌려야 하고,
   * 새벽 자동 갱신(daily.py)이 sales_daily 를 덮어쓰는 것과도 얽히지 않는다.
   * 서버에서 최신을 읽어 그 날짜 하나만 바꿔 쓴다 — 둘이 동시에 적어도 안 지워진다.
   */
  const putSamchon = useCallback(
    async (date, amount) => {
      const n = Math.max(0, Math.round(Number(amount) || 0));
      let base = conf;
      if (online && remoteOk.current) {
        try {
          base = { ...conf, ...(await readServerConf()) };
        } catch {
          /* 못 읽으면 가진 것으로 */
        }
      }
      const samchonDaily = { ...(base.samchonDaily || {}) };
      if (n) samchonDaily[date] = n;
      else delete samchonDaily[date];
      const next = { ...base, samchonDaily };
      setConf(next);
      writeLocal(CONF_KEY, next);
      if (online && remoteOk.current) {
        const { error } = await supabase.from("settings").upsert({ key: "sales", value: next });
        if (error) {
          setNotice("삼촌비를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
          console.error(error);
        }
      }
    },
    [conf, online, readServerConf],
  );

  /**
   * settings 안의 목록 하나를 바꾼다(판매가 계산기 · 릴스 라이브러리).
   * 서버 최신을 읽어 그 줄만 넣고/빼고 쓴다 — 둘이 동시에 담아도 서로 안 지워지게
   * (삼촌비와 같은 방식). `change(items)` 가 새 목록을 돌려준다.
   */
  const changeList = useCallback(
    async (key, localKey, current, setLocal, change, what) => {
      let base = current;
      if (online && remoteOk.current) {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", key)
          .maybeSingle();
        if (!error) base = data?.value?.items || [];
      }
      const items = change(base);
      setLocal(items);
      writeLocal(localKey, items);
      if (online && remoteOk.current) {
        const { error } = await supabase.from("settings").upsert({ key, value: { items } });
        if (error) {
          setNotice(`${what}을(를) 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.`);
          console.error(error);
        }
      }
    },
    [online],
  );

  const changePricing = useCallback(
    (change) => changeList("pricing", PRICING_KEY, pricing, setPricing, change, "판매가 목록"),
    [changeList, pricing],
  );
  const changeReels = useCallback(
    (change) => changeList("reels", REELS_KEY, reels, setReels, change, "릴스 기획"),
    [changeList, reels],
  );

  /** 폴더 목록 통째로 바꾸기 — change(folders) 가 새 목록을 돌려준다 */
  const changeReelFolders = useCallback(
    (change) =>
      changeList(
        "reels_folders",
        REEL_FOLDERS_KEY,
        reelFolders || [],
        setReelFolders,
        change,
        "릴스 폴더",
      ),
    [changeList, reelFolders],
  );

  /**
   * 사무실 PC 분석기에 일감을 맡긴다. target: "ref"(레퍼런스) | "ours"(우리가 찍은 영상).
   * 분석기는 이 작은 목록만 5초마다 본다 — 릴스 전체를 매번 읽으면 전송량이 금방 찬다.
   */
  const queueReel = useCallback(
    async (id, target) => {
      const job = { id, target, status: "queued", step: "", at: new Date().toISOString() };
      await changeList(
        "reels_queue",
        "poclo_reels_queue",
        reelQueue,
        setReelQueue,
        (jobs) => [...jobs.filter((j) => !(j.id === id && j.target === target)), job],
        "분석 요청",
      );
    },
    [changeList, reelQueue, setReelQueue],
  );

  /**
   * 일감 진행 상황과 분석기 상태만 가볍게 읽는다. 일감이 끝나 목록에서 빠지면
   * 그때만 릴스 전체를 다시 읽는다. 릴스 화면이 떠 있는 동안 몇 초마다 부른다.
   */
  const pollReels = useCallback(async () => {
    if (!(online && remoteOk.current)) return;
    const [q, w] = await Promise.all([
      supabase.from("settings").select("value").eq("key", "reels_queue").maybeSingle(),
      supabase.from("settings").select("value").eq("key", "reels_worker").maybeSingle(),
    ]);
    if (!w.error) setReelWorker(w.data?.value || null);
    if (q.error) return;
    // changeList 가 {items} 로 쓴다 — 분석기도 items 를 읽는다
    const jobs = q.data?.value?.items || [];
    const finished = queueRef.current.some(
      (p) => !jobs.some((j) => j.id === p.id && j.target === p.target),
    );
    setReelQueue(jobs);
    if (finished) {
      const [r, c] = await Promise.all([
        supabase.from("settings").select("value").eq("key", "reels").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "carousels").maybeSingle(),
      ]);
      if (!r.error && r.data?.value?.items) {
        setReels(r.data.value.items);
        writeLocal(REELS_KEY, r.data.value.items);
      }
      if (!c.error && c.data?.value?.items) {
        setCarousels(c.data.value.items);
        writeLocal(CAROUSELS_KEY, c.data.value.items);
      }
    }
  }, [online, setReelQueue]);

  /** 목록에 한 줄 담기 — 같은 id 가 있으면 고치고, 없으면 맨 앞에 */
  const upsertInto = (item) => (items) => {
    const next = { ...item, savedAt: new Date().toISOString() };
    return items.some((i) => i.id === item.id)
      ? items.map((i) => (i.id === item.id ? { ...i, ...next } : i))
      : [next, ...items];
  };

  const saveCarousel = useCallback(
    (item) => changeList("carousels", CAROUSELS_KEY, carousels, setCarousels, upsertInto(item), "캐러셀 레퍼런스"),
    [changeList, carousels],
  );
  const removeCarousel = useCallback(
    async (item) => {
      await changeList("carousels", CAROUSELS_KEY, carousels, setCarousels,
        (items) => items.filter((i) => i.id !== item.id), "캐러셀 레퍼런스");
      if (online && remoteOk.current) {
        const keys = Array.from({ length: item.slides || 0 }, (_, i) => `c-${item.id}-${i + 1}.jpg`);
        if (keys.length) await supabase.storage.from("reels").remove(keys);
      }
    },
    [changeList, carousels, online],
  );
  const saveCarouselPlan = useCallback(
    (item) => changeList("carousel_plans", CAROUSEL_PLANS_KEY, carouselPlans, setCarouselPlans, upsertInto(item), "캐러셀 기획안"),
    [changeList, carouselPlans],
  );
  const removeCarouselPlan = useCallback(
    (id) => changeList("carousel_plans", CAROUSEL_PLANS_KEY, carouselPlans, setCarouselPlans,
      (items) => items.filter((i) => i.id !== id), "캐러셀 기획안"),
    [changeList, carouselPlans],
  );

  const saveReelPlan = useCallback(
    (item) => changeList("reel_plans", REEL_PLANS_KEY, reelPlans, setReelPlans, upsertInto(item), "릴스 기획안"),
    [changeList, reelPlans],
  );
  const removeReelPlan = useCallback(
    (id) => changeList("reel_plans", REEL_PLANS_KEY, reelPlans, setReelPlans,
      (items) => items.filter((i) => i.id !== id), "릴스 기획안"),
    [changeList, reelPlans],
  );

  /** 릴스 기획 담기 — 같은 id 가 있으면 고치고, 없으면 맨 앞에 */
  const saveReel = useCallback(
    (item) =>
      changeReels((items) => {
        const next = { ...item, savedAt: new Date().toISOString() };
        return items.some((i) => i.id === item.id)
          ? items.map((i) => (i.id === item.id ? { ...i, ...next } : i))
          : [next, ...items];
      }),
    [changeReels],
  );
  const removeReel = useCallback(
    async (id) => {
      await changeReels((items) => items.filter((i) => i.id !== id));
      if (online && remoteOk.current) {
        await supabase.storage
          .from("reels")
          .remove([id, `${id}-thumb.jpg`, `${id}-ours`, `${id}-ours-thumb.jpg`]);
      }
    },
    [changeReels, online],
  );

  /**
   * 릴스 영상·썸네일은 settings 가 아니라 Storage 의 'reels' 버킷에 둔다.
   * 기획 목록은 통째로 읽고 쓰는 jsonb 한 줄이라, 무거운 파일을 넣으면 화면이 느려진다.
   * @returns {Promise<boolean>} 올렸으면 true (로그인 안 했거나 실패하면 false)
   */
  const putReelFile = useCallback(
    async (key, fileOrBlob, contentType) => {
      if (!(online && remoteOk.current)) return false;
      const { error } = await supabase.storage
        .from("reels")
        .upload(key, fileOrBlob, { upsert: true, contentType });
      if (error) {
        console.error(error);
        // 보관함(버킷)이 없는 게 지금까지 제일 흔한 원인이었다 (9/22 세원: "영상이 저장되지 않았어요")
        setNotice(
          /bucket/i.test(error.message || "")
            ? "영상 보관함이 아직 없어요. Supabase SQL Editor에서 릴스 보관함 SQL을 한 번 실행해 주세요 (supabase/schema.sql 의 '릴스 레퍼런스 영상' 부분)."
            : /exceed|size|large/i.test(error.message || "")
              ? "영상이 너무 커서 보관하지 못했어요 (50MB 한도). 짧게 잘라 넣어 주세요."
              : `영상을 저장하지 못했어요 (${error.message || "알 수 없는 이유"}).`,
        );
        return false;
      }
      return true;
    },
    [online],
  );

  const reelFileUrl = useCallback(
    async (key) => {
      if (!(online && remoteOk.current)) return null;
      const { data } = await supabase.storage.from("reels").createSignedUrl(key, 60 * 60 * 4);
      return data?.signedUrl || null;
    },
    [online],
  );

  /** 담기 — 같은 id 가 있으면 고치고, 없으면 맨 앞에 넣는다 */
  const savePricing = useCallback(
    (item) =>
      changePricing((items) => {
        const next = { ...item, savedAt: new Date().toISOString() };
        return items.some((i) => i.id === item.id)
          ? items.map((i) => (i.id === item.id ? { ...i, ...next } : i))
          : [next, ...items];
      }),
    [changePricing],
  );

  const removePricing = useCallback(
    (id) => changePricing((items) => items.filter((i) => i.id !== id)),
    [changePricing],
  );

  const clearAll = useCallback(async () => {
    setRows([]);
    writeLocal(ROWS_KEY, []);
    if (online && remoteOk.current) {
      await supabase.from("sales_daily").delete().gte("date", "1900-01-01");
    }
  }, [online]);

  return {
    rows,
    conf,
    missingCost,
    pricing,
    savePricing,
    removePricing,
    reels,
    saveReel,
    removeReel,
    putReelFile,
    reelFileUrl,
    reelFolders,
    changeReelFolders,
    reelQueue,
    reelWorker,
    queueReel,
    pollReels,
    carousels,
    saveCarousel,
    removeCarousel,
    carouselPlans,
    saveCarouselPlan,
    removeCarouselPlan,
    productStats,
    reelPlans,
    saveReelPlan,
    removeReelPlan,
    reload: load,
    saveConf,
    putSamchon,
    putDaily,
    putCafe,
    putAds,
    editRow,
    clearAll,
    notice,
    setNotice,
    ready,
  };
}
