# POS Minimarket — Web (Vercel + Supabase)

Sistema web de punto de venta + inventario + caja + clientes, publicado en internet.
Supabase guarda los datos (PostgreSQL en la nube). Vercel aloja la aplicación.
No depende de ninguna PC encendida; PC y celular acceden a la misma URL y se
sincronizan en tiempo real.

## Instalación y despliegue
Sigue **`GUIA_VERCEL_SUPABASE.md`** paso a paso — ahí está todo el procedimiento
completo: crear el proyecto en Supabase, correr `supabase_schema.sql`, configurar
`public/index.html`, subir el proyecto a GitHub y desplegarlo en Vercel.

## Estructura del proyecto
- `index.js` — toda la aplicación (API + lógica de negocio), en un solo archivo.
  Es el punto de entrada que usa Vercel.
- `public/index.html` — la interfaz (POS, inventario, clientes, caja, reportes, ticket).
- `supabase_schema.sql` — crea todas las tablas necesarias en Supabase.
- `local-dev-server.js` — solo para probar en tu PC antes de subir cambios
  (`npm start`, usando un archivo `.env` con tu `DATABASE_URL`).
- `.env.example` — plantilla para crear tu `.env` local (nunca subas el `.env` real
  a GitHub).

## Funciones incluidas
- **Ventas:** búsqueda por código de barras/cámara/texto, carrito con descuento por
  ítem, cliente opcional (o "Cliente Varios"), pago mixto (varios métodos a la vez),
  impresión de ticket.
- **Clientes:** búsqueda y registro por nombre, DNI/RUC o teléfono.
- **Caja:** apertura, entradas/salidas manuales, cierre con arqueo automático
  (sobrante/faltante).
- **Inventario:** productos con código, categoría, unidad, precios, stock mínimo,
  vencimiento; kardex de movimientos (compras, mermas, vencimientos, autoconsumo,
  ajustes).
- **Ticket:** configurable (58mm/80mm/A4), con logo textual, datos del negocio,
  mensaje al pie, y qué campos mostrar.
- **Reportes:** stock actual y rotación de movimientos por rango de fechas/tipo/motivo,
  exportables a Excel (CSV) y PDF.

## Pendiente / mejoras futuras
Login con usuarios y roles, factura electrónica SUNAT, impresión Bluetooth ESC/POS
nativa desde una app Android, logo como imagen en el ticket.
