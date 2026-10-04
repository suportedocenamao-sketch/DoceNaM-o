-- =========================================================
-- Doce na Mão — schema do banco (Supabase / Postgres)
-- Rode inteiro no SQL Editor do Supabase, uma vez.
-- =========================================================

-- ---------- Negócio (um por conta) ----------
create table if not exists public.negocios (
  id             uuid primary key default gen_random_uuid(),
  dono           uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  nome           text not null,
  slug           text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  segmento       text not null default 'doces'
                 check (segmento in ('doces','marmita','cestas','arte','servico')),
  pix            text,
  whatsapp       text,
  limite_dia     int  not null default 3 check (limite_dia between 1 and 50),
  texto_cobranca text,
  seq            int  not null default 0,
  criado_em      timestamptz not null default now()
);

-- id do negócio do usuário logado (usado em defaults e políticas)
create or replace function public.meu_negocio()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.negocios where dono = auth.uid()
$$;

-- ---------- Pedidos / encomendas ----------
create table if not exists public.pedidos (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    uuid not null default public.meu_negocio() references public.negocios(id) on delete cascade,
  numero        int  not null default 0,
  cliente_nome  text not null,
  cliente_tel   text,
  descricao     text not null,
  valor         numeric(10,2) not null check (valor >= 0),
  sinal         numeric(10,2) not null default 0 check (sinal >= 0),
  data_entrega  date,                       -- null = venda avulsa
  status        text not null default 'aguardando'
                check (status in ('aguardando','confirmado','producao','entregue','cancelado')),
  obs           text,
  repetir       text check (repetir in ('semanal','mensal')),
  criado_em     timestamptz not null default now(),
  unique (negocio_id, numero)
);
create index if not exists pedidos_negocio_data on public.pedidos (negocio_id, data_entrega);

-- ---------- Pagamentos ----------
create table if not exists public.pagamentos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  negocio_id  uuid not null default public.meu_negocio() references public.negocios(id) on delete cascade,
  valor       numeric(10,2) not null check (valor > 0),
  pago_em     date not null default (now() at time zone 'America/Sao_Paulo')::date,
  forma       text not null default 'Pix',
  criado_em   timestamptz not null default now()
);
create index if not exists pagamentos_pedido on public.pagamentos (pedido_id);

-- ---------- Dias bloqueados (folga) ----------
create table if not exists public.bloqueios (
  negocio_id uuid not null default public.meu_negocio() references public.negocios(id) on delete cascade,
  data       date not null,
  primary key (negocio_id, data)
);

-- ---------- Número sequencial do pedido por negócio ----------
create or replace function public.numerar_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.negocios set seq = seq + 1 where id = new.negocio_id returning seq into new.numero;
  return new;
end $$;

drop trigger if exists trg_numerar on public.pedidos;
create trigger trg_numerar before insert on public.pedidos
  for each row execute function public.numerar_pedido();

-- ---------- Segurança: cada pessoa só vê o próprio negócio ----------
alter table public.negocios   enable row level security;
alter table public.pedidos    enable row level security;
alter table public.pagamentos enable row level security;
alter table public.bloqueios  enable row level security;

drop policy if exists negocios_select on public.negocios;
drop policy if exists negocios_insert on public.negocios;
drop policy if exists negocios_update on public.negocios;
create policy negocios_select on public.negocios for select using (dono = auth.uid());
create policy negocios_insert on public.negocios for insert with check (dono = auth.uid());
create policy negocios_update on public.negocios for update using (dono = auth.uid()) with check (dono = auth.uid());

drop policy if exists pedidos_dono on public.pedidos;
create policy pedidos_dono on public.pedidos for all
  using (negocio_id = public.meu_negocio())
  with check (negocio_id = public.meu_negocio());

drop policy if exists pagamentos_dono on public.pagamentos;
create policy pagamentos_dono on public.pagamentos for all
  using (negocio_id = public.meu_negocio())
  with check (
    negocio_id = public.meu_negocio()
    and exists (select 1 from public.pedidos p where p.id = pedido_id and p.negocio_id = public.meu_negocio())
  );

drop policy if exists bloqueios_dono on public.bloqueios;
create policy bloqueios_dono on public.bloqueios for all
  using (negocio_id = public.meu_negocio())
  with check (negocio_id = public.meu_negocio());

-- ---------- Página pública da agenda (sem login) ----------
-- Mostra só nome, WhatsApp e se cada dia está livre. Nunca os pedidos.
create or replace function public.negocio_publico(p_slug text)
returns table (nome text, whatsapp text, segmento text)
language sql stable security definer set search_path = public as $$
  select nome, whatsapp, segmento from public.negocios where slug = p_slug
$$;

create or replace function public.agenda_publica(p_slug text, p_dias int default 30)
returns table (dia date, livre boolean)
language sql stable security definer set search_path = public as $$
  with n as (select id, limite_dia from public.negocios where slug = p_slug),
       hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
       dias as (
         select generate_series(hoje.d, hoje.d + (least(greatest(p_dias, 1), 90) - 1), interval '1 day')::date as dia
         from hoje
       )
  select dias.dia,
         not exists (select 1 from public.bloqueios b, n where b.negocio_id = n.id and b.data = dias.dia)
         and (select count(*) from public.pedidos p, n
               where p.negocio_id = n.id and p.data_entrega = dias.dia and p.status <> 'cancelado')
             < (select limite_dia from n)
  from dias
  where exists (select 1 from n)
$$;

revoke all on function public.negocio_publico(text)    from public;
revoke all on function public.agenda_publica(text,int) from public;
grant execute on function public.negocio_publico(text)    to anon, authenticated;
grant execute on function public.agenda_publica(text,int) to anon, authenticated;
