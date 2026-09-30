-- Ejecuta esto completo en Supabase: Panel → SQL Editor → New query → pega y "Run"
create table if not exists productos(
  id bigserial primary key,
  codigo_interno text unique,
  codigo_barras text,
  descripcion text not null,
  categoria text,
  unidad_medida text default 'UN',
  precio_compra numeric default 0,
  precio_venta numeric default 0,
  stock_actual numeric default 0,
  stock_minimo numeric default 5,
  fecha_vencimiento date,
  activo boolean default true
);
create index if not exists ix_productos_barras on productos(codigo_barras);

create table if not exists clientes(
  id bigserial primary key,
  identificacion text unique,
  nombre text not null,
  telefono text,
  direccion text
);

create table if not exists cajas(
  id bigserial primary key,
  vendedor text not null,
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz,
  monto_inicial numeric not null,
  monto_efectivo_cierre numeric,
  monto_sistema_efectivo numeric,
  monto_sistema_tarjeta numeric,
  monto_sistema_otros numeric,
  diferencia numeric,
  estado text default 'ABIERTA'
);

create table if not exists caja_movimientos(
  id bigserial primary key,
  caja_id bigint not null references cajas(id),
  tipo text not null,
  monto numeric not null,
  motivo text,
  fecha timestamptz default now()
);

create table if not exists ventas(
  id bigserial primary key,
  caja_id bigint not null references cajas(id),
  cliente_id bigint references clientes(id),
  cliente text default 'Cliente Varios',
  vendedor text,
  fecha timestamptz default now(),
  total numeric not null,
  descuento_total numeric default 0
);

create table if not exists venta_pagos(
  id bigserial primary key,
  venta_id bigint not null references ventas(id),
  metodo text not null,
  monto numeric not null
);

create table if not exists detalle_ventas(
  id bigserial primary key,
  venta_id bigint not null references ventas(id),
  producto_id bigint not null references productos(id),
  cantidad numeric not null,
  precio_unitario numeric not null,
  descuento numeric default 0,
  subtotal numeric not null
);

create table if not exists movimientos_inventario(
  id bigserial primary key,
  producto_id bigint not null references productos(id),
  tipo text not null,
  motivo text not null,
  cantidad numeric not null,
  fecha timestamptz default now(),
  usuario text,
  observaciones text
);

create table if not exists config(
  k text primary key,
  v text
);

-- Habilita Realtime (sincronización en vivo) para que PC y celular se actualicen solos
alter publication supabase_realtime add table productos;
alter publication supabase_realtime add table cajas;

-- RLS: como este panel no tiene login propio, dejamos lectura pública (solo lectura,
-- necesaria para que Realtime funcione en el navegador) y las escrituras SOLO las hace
-- el backend con la llave "service role" (nunca expuesta al navegador).
alter table productos enable row level security;
alter table cajas enable row level security;
create policy "lectura publica productos" on productos for select using (true);
create policy "lectura publica cajas" on cajas for select using (true);
