-- Схема базы. Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.

create table if not exists printers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  price numeric not null default 0,
  bought_on date not null default current_date,
  power jsonb,
  created_at timestamptz not null default now()
);

create table if not exists spools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  brand text not null default '',
  weight numeric not null default 1000,
  price numeric not null default 0,
  bought_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category text not null default 'Другое',
  price numeric not null default 0,
  bought_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ordered_on date not null default current_date,
  item text not null default '',
  client text not null default '',
  printer_id uuid references printers on delete set null,
  plastic text not null,
  weight numeric not null default 0,
  waste numeric not null default 0,
  print_price numeric not null default 0,
  model_price numeric not null default 0,
  prepay numeric not null default 0,
  hours numeric not null default 0,
  temps jsonb,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  tariff numeric not null default 6.5,
  presets jsonb not null default '{}'::jsonb
);

-- каждый видит и меняет только свои записи
do $$
declare t text;
begin
  foreach t in array array['printers','spools','extras','orders','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
