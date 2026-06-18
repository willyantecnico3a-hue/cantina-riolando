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
