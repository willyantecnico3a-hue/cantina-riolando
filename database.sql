-- BANCO DE DADOS - CANTINA RIOLANDO
-- Rode este arquivo no Supabase em SQL Editor > New Query > Run.

create extension if not exists "uuid-ossp";

create table if not exists produtos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  categoria text,
  preco numeric(10,2) not null default 0,
  estoque integer not null default 0,
  imagem_url text,
  ativo boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists pedidos (
  id uuid primary key default uuid_generate_v4(),
  numero_pedido integer not null,
  cliente_nome text not null,
  cliente_email text,
  total numeric(10,2) not null default 0,
  canal_venda text default 'totem',
  turno text,
  status text default 'aguardando_pagamento',
  entregue_em timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table pedidos add column if not exists status_pagamento text default 'pending';
alter table pedidos add column if not exists mercado_pago_payment_id text;
alter table pedidos add column if not exists mp_status_detail text;
alter table pedidos add column if not exists pix_qr_code text;
alter table pedidos add column if not exists pix_qr_code_base64 text;
alter table pedidos add column if not exists pix_ticket_url text;
alter table pedidos add column if not exists expires_at timestamp with time zone;
alter table pedidos add column if not exists pago_em timestamp with time zone;
alter table pedidos add column if not exists horario_pagamento_confirmado timestamp with time zone;
alter table pedidos add column if not exists cancelado_em timestamp with time zone;
alter table pedidos add column if not exists arquivado boolean default false;
alter table pedidos add column if not exists arquivado_em timestamp with time zone;

create table if not exists itens_pedido (
  id uuid primary key default uuid_generate_v4(),
  pedido_id uuid references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id),
  produto_nome text not null,
  quantidade integer not null default 1,
  preco_unitario numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,
  created_at timestamp with time zone default now()
);

create table if not exists configuracoes (
  id uuid primary key default uuid_generate_v4(),
  pix_chave text,
  pix_nome text,
  pix_cidade text,
  totem_pausado boolean default false,
  created_at timestamp with time zone default now()
);

insert into configuracoes (pix_chave, pix_nome, pix_cidade, totem_pausado)
select 'configure-sua-chave-pix', 'APM Riolando Canno', 'DIADEMA', false
where not exists (select 1 from configuracoes);

insert into produtos (nome, categoria, preco, estoque, imagem_url, ativo)
values
('Pão de queijo', 'Salgados', 4.00, 30, '', true),
('Suco natural', 'Bebidas', 5.00, 25, '', true),
('Bolo de chocolate', 'Doces', 3.50, 20, '', true)
on conflict do nothing;

-- ATENÇÃO:
-- Estas políticas são simples para protótipo escolar.
-- Para produção real, crie login com perfis e restrinja o painel administrativo.

alter table produtos enable row level security;
alter table pedidos enable row level security;
alter table itens_pedido enable row level security;
alter table configuracoes enable row level security;

drop policy if exists "produtos_select_publico" on produtos;
create policy "produtos_select_publico"
on produtos for select
using (true);

drop policy if exists "produtos_insert_publico_prototipo" on produtos;
create policy "produtos_insert_publico_prototipo"
on produtos for insert
with check (true);

drop policy if exists "produtos_update_publico_prototipo" on produtos;
create policy "produtos_update_publico_prototipo"
on produtos for update
using (true)
with check (true);

drop policy if exists "pedidos_select_publico" on pedidos;
create policy "pedidos_select_publico"
on pedidos for select
using (true);

drop policy if exists "pedidos_insert_publico" on pedidos;
create policy "pedidos_insert_publico"
on pedidos for insert
with check (true);

drop policy if exists "pedidos_update_publico_prototipo" on pedidos;
create policy "pedidos_update_publico_prototipo"
on pedidos for update
using (true)
with check (true);

drop policy if exists "itens_select_publico" on itens_pedido;
create policy "itens_select_publico"
on itens_pedido for select
using (true);

drop policy if exists "itens_insert_publico" on itens_pedido;
create policy "itens_insert_publico"
on itens_pedido for insert
with check (true);

drop policy if exists "config_select_publico" on configuracoes;
create policy "config_select_publico"
on configuracoes for select
using (true);

drop policy if exists "config_update_publico_prototipo" on configuracoes;
create policy "config_update_publico_prototipo"
on configuracoes for update
using (true)
with check (true);

drop policy if exists "config_insert_publico_prototipo" on configuracoes;
create policy "config_insert_publico_prototipo"
on configuracoes for insert
with check (true);

create or replace function cancelar_pedidos_expirados()
returns integer
language plpgsql
as $$
declare
  total_cancelados integer;
begin
  update pedidos
  set
    status = 'expirado',
    status_pagamento = 'expired',
    cancelado_em = now()
  where status = 'aguardando_pagamento'
    and (
      (expires_at is not null and expires_at < now())
      or (expires_at is null and created_at < now() - interval '5 minutes')
    );

  get diagnostics total_cancelados = row_count;
  return total_cancelados;
end;
$$;

create or replace view relatorio_vendas_confirmadas as
select
  p.id,
  p.numero_pedido,
  p.cliente_nome,
  p.cliente_email,
  p.canal_venda,
  p.turno,
  p.total,
  p.status,
  p.status_pagamento,
  p.created_at as horario_compra,
  coalesce(p.horario_pagamento_confirmado, p.pago_em) as horario_pagamento_confirmado,
  coalesce(
    json_agg(
      json_build_object(
        'produto_nome', i.produto_nome,
        'quantidade', i.quantidade,
        'preco_unitario', i.preco_unitario,
        'subtotal', i.subtotal
      )
      order by i.created_at
    ) filter (where i.id is not null),
    '[]'::json
  ) as itens
from pedidos p
left join itens_pedido i on i.pedido_id = p.id
where p.status_pagamento = 'approved'
group by p.id;

-- =========================================================
-- ACESSO ADMINISTRATIVO (Supabase Auth)
-- 1. Crie o usuário administrador em Authentication > Users.
-- 2. Copie o UUID criado e execute:
--    insert into public.admin_users (user_id) values ('UUID-DO-USUARIO');
-- As políticas abaixo mantêm totem.html e app.html públicos e protegem
-- balcão, produtos administrativos, pedidos e relatórios.
-- =========================================================

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Função mínima usada pela tela pública, sem expor dados do Pix.
create or replace function public.obter_status_totem()
returns table (totem_pausado boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.totem_pausado, false)
  from public.configuracoes c
  order by c.created_at asc
  limit 1;
$$;

revoke all on function public.obter_status_totem() from public;
grant execute on function public.obter_status_totem() to anon, authenticated;

-- Remove as permissões abertas do protótipo.
drop policy if exists "produtos_insert_publico_prototipo" on produtos;
drop policy if exists "produtos_update_publico_prototipo" on produtos;
drop policy if exists "pedidos_select_publico" on pedidos;
drop policy if exists "pedidos_insert_publico" on pedidos;
drop policy if exists "pedidos_update_publico_prototipo" on pedidos;
drop policy if exists "itens_select_publico" on itens_pedido;
drop policy if exists "itens_insert_publico" on itens_pedido;
drop policy if exists "config_select_publico" on configuracoes;
drop policy if exists "config_update_publico_prototipo" on configuracoes;
drop policy if exists "config_insert_publico_prototipo" on configuracoes;

drop policy if exists "produtos_gerenciar_admin" on produtos;
create policy "produtos_gerenciar_admin" on produtos for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pedidos_gerenciar_admin" on pedidos;
create policy "pedidos_gerenciar_admin" on pedidos for all
using (public.is_admin()) with check (public.is_admin());

-- Área do cliente: cada pessoa autenticada pelo Google só pode consultar
-- pedidos registrados com o mesmo e-mail da sua conta.
drop policy if exists "pedidos_cliente_ler_proprios" on pedidos;
create policy "pedidos_cliente_ler_proprios" on pedidos for select to authenticated
using (lower(cliente_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "itens_gerenciar_admin" on itens_pedido;
create policy "itens_gerenciar_admin" on itens_pedido for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "itens_cliente_ler_proprios" on itens_pedido;
create policy "itens_cliente_ler_proprios" on itens_pedido for select to authenticated
using (
  exists (
    select 1 from public.pedidos p
    where p.id = itens_pedido.pedido_id
      and lower(p.cliente_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "configuracoes_gerenciar_admin" on configuracoes;
create policy "configuracoes_gerenciar_admin" on configuracoes for all
using (public.is_admin()) with check (public.is_admin());
