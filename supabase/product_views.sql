-- 포클로 상세 'N명이 이 상품을 봤어요' — 우리가 직접 세기 (2026-11-25 세원 "N명이 봤어요는 우리가 직접 세자")
-- 쇼핑몰 상세 화면(스킨 footer)이 손님 브라우저마다 상품당 하루 한 번 bump_view(상품번호) 를 부르고, get_view 로 숫자를 읽는다.
-- 표는 RLS 로 막아 두고(아무도 직접 못 읽고 못 씀), 두 함수만 anon(공개 키)으로 부를 수 있다. 여러 번 실행해도 안전.

create table if not exists public.product_views (
  product_no integer primary key,
  views bigint not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_views enable row level security;

create or replace function public.bump_view(p integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if p is null or p < 1 or p > 999999 then return 0; end if;
  insert into product_views (product_no, views) values (p, 1)
  on conflict (product_no) do update set views = product_views.views + 1, updated_at = now()
  returning views into n;
  return n;
end $$;

create or replace function public.get_view(p integer)
returns bigint
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select views from product_views where product_no = p), 0) $$;

revoke all on function public.bump_view(integer) from public;
revoke all on function public.get_view(integer) from public;
grant execute on function public.bump_view(integer) to anon, authenticated;
grant execute on function public.get_view(integer) to anon, authenticated;
