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

-- 待合番号の実体テーブル
create table if not exists public.waiting_cards (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  waiting_number integer not null,
  status text not null default 'assigned' check (status in ('assigned', 'released')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_id)
);

alter table public.waiting_cards enable row level security;

drop policy if exists waiting_cards_select_policy on public.waiting_cards;
drop policy if exists waiting_cards_insert_policy on public.waiting_cards;
drop policy if exists waiting_cards_update_policy on public.waiting_cards;

create policy waiting_cards_select_policy
  on public.waiting_cards
  for select
  using (true);

create policy waiting_cards_insert_policy
  on public.waiting_cards
  for insert
  with check (true);

create policy waiting_cards_update_policy
  on public.waiting_cards
  for update
  using (true)
  with check (true);

create index if not exists idx_waiting_cards_order_id on public.waiting_cards(order_id);
create index if not exists idx_waiting_cards_status on public.waiting_cards(status);

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

-- 待合番号の割り当て情報は、注文 ID とは切り離されないように管理する
-- 受け渡し完了時に「released」へ更新し、次に使える番号として再利用させる
create or replace function public.release_waiting_card_by_order(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  update public.waiting_cards
  set status = 'released', released_at = now()
  where order_id = p_order_id;
end;
$$;

-- メモ: PIN は本番では平文保持ではなくハッシュ化推奨
-- 例: Supabase Auth へ置き換えるか、pin_hash へ変更することを推奨
