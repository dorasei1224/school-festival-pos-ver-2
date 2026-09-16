-- Supabase 用スタッフアカウント定義
create table if not exists public.staffs (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  name text not null unique,
  pin text not null,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 注文テーブルに staff_id を追加
alter table public.orders
  add column if not exists staff_id uuid references public.staffs(id);

-- 既存の orders.staff_name を利用しつつも、staff_id を紐づける設計にする
create index if not exists idx_staffs_name on public.staffs(name);
create index if not exists idx_orders_staff_id on public.orders(staff_id);

-- 既存の process_checkout RPC を変更せず、注文登録時に担当者IDを補完する
create or replace function public.set_order_staff_id()
returns trigger
language plpgsql
as $$
begin
  if new.staff_id is null then
    select id into new.staff_id
    from public.staffs
    where is_active = true
      and (display_name = new.staff_name or name = new.staff_name)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_staff_id on public.orders;
create trigger orders_set_staff_id
before insert or update of staff_name on public.orders
for each row execute function public.set_order_staff_id();

-- 会計直後は受け渡し待ちにする。
-- 既存の process_checkout が COMPLETED / completed を登録しても、
-- 新規注文だけ受け渡し画面の「準備中」に入るよう補正する。
create or replace function public.set_new_order_pending()
returns trigger
language plpgsql
as $$
begin
  if upper(coalesce(new.status, '')) = 'COMPLETED' then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_new_order_pending on public.orders;
create trigger orders_set_new_order_pending
before insert on public.orders
for each row execute function public.set_new_order_pending();

-- メモ: PIN は本番では平文保持ではなくハッシュ化推奨
-- 例: Supabase Auth へ置き換えるか、pin_hash へ変更することを推奨
