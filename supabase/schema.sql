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
  account_id  text not null default '',    -- 실제 송금한 계좌
  memo        text not null default '',
  has_photo   boolean not null default false,
  updated_at  timestamptz not null default now()
);

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
