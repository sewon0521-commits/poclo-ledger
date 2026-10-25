-- 포클로 매입 장부 — Supabase 스키마
--
-- Supabase 프로젝트의 SQL Editor에 이 파일을 통째로 붙여넣고 Run 하면 된다.
-- 여러 번 실행해도 안전하다.
--
-- 사장님과 지원님 둘 다 같은 장부를 본다. 서로 남남이 아니므로 행 단위로 주인을
-- 가르지 않고, "로그인한 사람은 전부 읽고 쓴다"로 둔다. 로그인 안 한 사람은 아무것도
-- 못 한다(RLS).

-- ---------------------------------------------------------------- 거래처

create table if not exists public.vendors (
  id          text primary key,
  name        text not null,
  address     text not null default '',
  phone       text not null default '',
  biz_no      text not null default '',
  memo        text not null default '',
  accounts    jsonb not null default '[]'::jsonb,
  created_at  date not null default current_date,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- 거래

create table if not exists public.transactions (
  id          text primary key,
  vendor_id   text not null references public.vendors(id) on delete restrict,
  date        date not null,
  items       jsonb not null default '[]'::jsonb,
  supply      bigint not null default 0,   -- 당일합계 = 장부 금액
  method      text not null default 'samchon' check (method in ('transfer','samchon')),
  invoice     boolean not null default false,
  -- 이체를 했어도 부가세는 안 보낸 경우가 있다. 결제수단과 부가세 납부를 따로 둔다.
  vat_paid    boolean not null default false,
  account_id  text not null default '',    -- 실제 송금한 계좌
  memo        text not null default '',
  has_photo   boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- 이미 만들어진 표에도 칸을 더한다. 예전 기록은 이체=부가세 포함이었으므로 그렇게 채운다.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='transactions' and column_name='vat_paid') then
    alter table public.transactions add column vat_paid boolean not null default false;
    update public.transactions set vat_paid = true where method = 'transfer';
  end if;
end $$;

-- 미송·불량·매입금·잔액을 위해 더한 칸들 (2026-09-09).
-- 이미 만들어진 표에도 안전하게 붙는다. 여러 번 실행해도 된다.
--   cash_paid     실제로 건넨 돈. null 이면 '안 적음' = 당일합계와 같다는 뜻.
--                 0원과 null 은 다른 뜻이다 — 미송 출고분만 받은 날은 진짜 0원이다.
--   credit_add    그날 잡힌 매입금 (샘플 반납·불량 매입 등)
--   credit_use    그날 깎아 쓴 매입금
--   credit_expiry 매입금을 쓸 수 있는 기한. 지나면 사라지는 돈이다.
-- 품목의 성격(매입/미송/출고/불량)은 items jsonb 안의 kind 라서 칸이 따로 없다.
alter table public.transactions add column if not exists cash_paid     bigint;
alter table public.transactions add column if not exists credit_add    bigint  not null default 0;
alter table public.transactions add column if not exists credit_use    bigint  not null default 0;
alter table public.transactions add column if not exists credit_expiry date;
alter table public.transactions add column if not exists credit_note   text    not null default '';
-- 장끼에 찍힌 전잔·당잔을 손으로 옮겨 적은 값 (2026-09-15). null = 안 적음(앱이 이어서 센다).
-- 부호는 장끼와 같다: 양수 = 우리가 덜 냄, 음수 = 더 냄.
alter table public.transactions add column if not exists prev_balance  bigint;
alter table public.transactions add column if not exists balance       bigint;

create index if not exists transactions_date_idx on public.transactions (date desc);
create index if not exists transactions_vendor_idx on public.transactions (vendor_id);

-- --------------------------------------------------------- 고친 시각 자동 갱신

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists vendors_touch on public.vendors;
create trigger vendors_touch before update on public.vendors
  for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- 접근 권한

alter table public.vendors enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "로그인한 사람은 거래처 전부" on public.vendors;
create policy "로그인한 사람은 거래처 전부" on public.vendors
  for all to authenticated using (true) with check (true);

drop policy if exists "로그인한 사람은 거래 전부" on public.transactions;
create policy "로그인한 사람은 거래 전부" on public.transactions
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------- 실시간 (한 쪽이 고치면 바로 보이게)

do $$
begin
  begin
    alter publication supabase_realtime add table public.vendors;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.transactions;
  exception when duplicate_object then null;
  end;
end $$;

-- ------------------------------------------------------------------ 장끼 사진

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "로그인한 사람은 장끼 읽기" on storage.objects;
create policy "로그인한 사람은 장끼 읽기" on storage.objects
  for select to authenticated using (bucket_id = 'receipts');

drop policy if exists "로그인한 사람은 장끼 올리기" on storage.objects;
create policy "로그인한 사람은 장끼 올리기" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts');

drop policy if exists "로그인한 사람은 장끼 바꾸기" on storage.objects;
create policy "로그인한 사람은 장끼 바꾸기" on storage.objects
  for update to authenticated using (bucket_id = 'receipts');

drop policy if exists "로그인한 사람은 장끼 지우기" on storage.objects;
create policy "로그인한 사람은 장끼 지우기" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts');

-- ------------------------------------------------------------- 릴스 레퍼런스 영상
--
-- 릴스 기획 라이브러리에서 쓰는 영상과 썸네일. 기획 내용 자체는 settings 의 'reels' 키에 있고
-- 무거운 파일만 여기 둔다. 키는 `<기획id>` (영상) 과 `<기획id>-thumb.jpg` (썸네일).

insert into storage.buckets (id, name, public)
values ('reels', 'reels', false)
on conflict (id) do nothing;

drop policy if exists "로그인한 사람은 릴스 영상 읽기" on storage.objects;
create policy "로그인한 사람은 릴스 영상 읽기" on storage.objects
  for select to authenticated using (bucket_id = 'reels');

drop policy if exists "로그인한 사람은 릴스 영상 올리기" on storage.objects;
create policy "로그인한 사람은 릴스 영상 올리기" on storage.objects
  for insert to authenticated with check (bucket_id = 'reels');

drop policy if exists "로그인한 사람은 릴스 영상 바꾸기" on storage.objects;
create policy "로그인한 사람은 릴스 영상 바꾸기" on storage.objects
  for update to authenticated using (bucket_id = 'reels');

drop policy if exists "로그인한 사람은 릴스 영상 지우기" on storage.objects;
create policy "로그인한 사람은 릴스 영상 지우기" on storage.objects
  for delete to authenticated using (bucket_id = 'reels');

-- ------------------------------------------------------------------ 매출 (일별)
--
-- 판 쪽. 카페24 주문에서 뽑은 하루치 한 줄과, 그날 쓴 광고비.
-- 매입(transactions)이 '산 돈'이라면 여기는 '판 돈'이다.
--
--   gross  총매출  — 그날 판 금액. 취소·반품 전. 광고비를 여기에 대고 본다.
--   net    순매출  — 취소·반품을 뺀 것. 손익은 여기서 낸다.

create table if not exists public.sales_daily (
  date         date primary key,
  cafe_gross   bigint not null default 0,   -- 카페24 애널리틱스 결제합계 = 총매출
  cafe_refund  bigint not null default 0,   -- 카페24 애널리틱스 환불합계
  gross        bigint not null default 0,
  refund       bigint not null default 0,
  net          bigint not null default 0,
  cogs         bigint not null default 0,
  qty          integer not null default 0,
  orders       integer not null default 0,
  ship_income  bigint not null default 0,
  naver_net    bigint not null default 0,
  ads          bigint not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.sales_daily enable row level security;

drop policy if exists "로그인한 사람은 매출 읽기" on public.sales_daily;
create policy "로그인한 사람은 매출 읽기" on public.sales_daily
  for select to authenticated using (true);

drop policy if exists "로그인한 사람은 매출 쓰기" on public.sales_daily;
create policy "로그인한 사람은 매출 쓰기" on public.sales_daily
  for all to authenticated using (true) with check (true);

-- 비용 가정값(택배비·수수료·고정비)도 둘이 같은 값을 봐야 한다
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "로그인한 사람은 설정 읽기" on public.settings;
create policy "로그인한 사람은 설정 읽기" on public.settings
  for select to authenticated using (true);

drop policy if exists "로그인한 사람은 설정 쓰기" on public.settings;
create policy "로그인한 사람은 설정 쓰기" on public.settings
  for all to authenticated using (true) with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.sales_daily;
  exception when duplicate_object then null;
  end;
end $$;

-- 이미 sales_daily 를 만들어 둔 프로젝트라면 칸만 더한다
alter table public.sales_daily add column if not exists cafe_gross  bigint not null default 0;
alter table public.sales_daily add column if not exists cafe_refund bigint not null default 0;
alter table public.sales_daily add column if not exists cafe_ship bigint not null default 0;


-- 모델 계약서 (2026-10-25) — 모바일 서명. 여러 번 실행해도 안전하다.
-- 로그인한 사람(세원·지원)은 표를 그대로 읽고 쓴다. 모델(로그인 없음)은 표에 직접 못 가고
-- 아래 두 함수만 부른다 — contract_get(토큰) · contract_sign(토큰, 서명 내용). 토큰은 24바이트 무작위(32자).
-- 주민등록번호는 받지 않는다(암호화 저장 의무 — src/lib/contract.js 머리말).

create table if not exists public.contracts (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  terms       jsonb not null default '{}'::jsonb,
  signed      jsonb,
  signed_at   timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.contracts enable row level security;

drop policy if exists "로그인한 사람은 계약서 전부" on public.contracts;
create policy "로그인한 사람은 계약서 전부" on public.contracts
  for all to authenticated using (true) with check (true);

revoke all on table public.contracts from anon;

-- 모델 — 토큰으로 계약 읽기(없으면 null). 서명했으면 사본용으로 서명 내용도 같이.
create or replace function public.contract_get(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('terms', c.terms, 'signed', c.signed, 'signed_at', c.signed_at)
  from public.contracts c
  where p_token is not null and length(p_token) >= 20 and c.token = p_token
$$;

-- 모델 — 서명 보내기. 아직 서명 안 한 계약만 한 번. 서명 그림(png data URL)은 300KB 까지.
create or replace function public.contract_sign(p_token text, p_signed jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.contracts;
  s text := coalesce(p_signed->>'sign', '');
begin
  if p_token is null or length(p_token) < 20 then
    raise exception 'not found';
  end if;
  if p_signed is null or jsonb_typeof(p_signed) <> 'object' then
    raise exception 'bad data';
  end if;
  if length(s) > 300000 or s not like 'data:image/png;base64,%' then
    raise exception 'bad sign';
  end if;
  if length(p_signed::text) > 320000 then
    raise exception 'too big';
  end if;

  update public.contracts
     set signed = p_signed || jsonb_build_object('at', now()),
         signed_at = now()
   where token = p_token and signed_at is null
  returning * into r;

  if r.id is null then
    if exists (select 1 from public.contracts where token = p_token) then
      raise exception 'already signed';
    end if;
    raise exception 'not found';
  end if;

  return jsonb_build_object('ok', true, 'signed_at', r.signed_at);
end
$$;

revoke all on function public.contract_get(text) from public;
revoke all on function public.contract_sign(text, jsonb) from public;
grant execute on function public.contract_get(text) to anon, authenticated;
grant execute on function public.contract_sign(text, jsonb) to anon, authenticated;

-- 촬영 시트 링크 (2026-10-25) — 모델에게 보내는 '그날 촬영' 한 장. 여러 번 실행해도 안전하다.
-- 로그인한 사람(세원·지원)은 표를 그대로 읽고 쓴다. 모델(로그인 없음)은 표에 직접 못 가고
-- 아래 함수 하나만 부른다 — sheet_get(토큰). 닫은 링크(closed)는 null. 토큰은 24바이트 무작위(32자).
-- data 는 ERP 가 고른 칸만 담은 스냅숏이다(도매가·판매가·거래처·위치·신마 링크·내부 메모 없음 — src/lib/shootSheet.js 머리말).

create table if not exists public.shoot_sheets (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  data        jsonb not null default '{}'::jsonb,
  closed      boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.shoot_sheets enable row level security;

drop policy if exists "로그인한 사람은 촬영 시트 전부" on public.shoot_sheets;
create policy "로그인한 사람은 촬영 시트 전부" on public.shoot_sheets
  for all to authenticated using (true) with check (true);

revoke all on table public.shoot_sheets from anon;

-- 모델 — 토큰으로 시트 읽기(없거나 닫혔으면 null)
create or replace function public.sheet_get(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('data', s.data, 'updated_at', s.updated_at)
  from public.shoot_sheets s
  where p_token is not null and length(p_token) >= 20 and s.token = p_token and not s.closed
$$;

revoke all on function public.sheet_get(text) from public;
grant execute on function public.sheet_get(text) to anon, authenticated;
