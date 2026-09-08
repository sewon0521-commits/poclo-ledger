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
import { SEED_DAYS } from "./seed";

const ROWS_KEY = "poclo_sales_rows";
const CONF_KEY = "poclo_sales_conf";

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
    fixed: {},
    ...readLocal(CONF_KEY, {}),
  }));
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(!isRemote);
  // 표가 아직 없으면 서버에 쓰지 않는다. 로컬로만 돈다.
  const remoteOk = useRef(false);

  const online = isRemote && !!session;

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        supabase.from("sales_daily").select("*").order("date"),
        supabase.from("settings").select("value").eq("key", "sales").maybeSingle(),
      ]);
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
    return () => supabase.removeChannel(ch);
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

  /** 카페24 애널리틱스 CSV — 총매출·환불만 덮는다. 주문 쪽 숫자는 안 건드린다. */
  const putCafe = useCallback((list) => merge(list), [merge]);

  /** 광고 CSV — 광고비만 덮는다. 매출이 없는 날짜도 줄을 만들어 둔다. */
  const putAds = useCallback(
    (adsByDate) =>
      merge(
        Object.entries(adsByDate).map(([date, ads]) => ({ date, ads })),
        (prev) => ({
          cafeGross: prev.cafeGross || 0,
          cafeRefund: prev.cafeRefund || 0,
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

  const saveConf = useCallback(
    async (next) => {
      setConf(next);
      writeLocal(CONF_KEY, next);
      if (online && remoteOk.current) {
        await supabase.from("settings").upsert({ key: "sales", value: next });
      }
    },
    [online],
  );

  const clearAll = useCallback(async () => {
    setRows([]);
    writeLocal(ROWS_KEY, []);
    if (online && remoteOk.current) {
      await supabase.from("sales_daily").delete().gte("date", "1900-01-01");
    }
  }, [online]);

  return { rows, conf, saveConf, putDaily, putCafe, putAds, clearAll, notice, setNotice, ready };
}
