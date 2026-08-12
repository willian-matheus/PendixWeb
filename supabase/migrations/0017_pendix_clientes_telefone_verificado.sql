alter table public.pendix_clientes
  add column if not exists telefone_verificado boolean not null default false;
