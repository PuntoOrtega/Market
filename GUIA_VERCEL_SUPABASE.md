# Instalar y publicar en la web: Vercel + Supabase

Arquitectura: Supabase guarda los datos (base de datos PostgreSQL en la nube, gratis).
Vercel aloja la aplicación web (interfaz + funciones del servidor). No necesitas tu PC
encendida — todo vive en internet, con una URL propia tipo `https://tu-pos.vercel.app`.

## Parte 1 — Crear la base de datos en Supabase

1. Ve a https://supabase.com → crea una cuenta gratis → "New Project".
2. Ponle un nombre (ej. "pos-minimarket"), crea una contraseña de base de datos
   (**guárdala**, la necesitas después) y elige una región cercana (ej. South America).
3. Espera 1-2 minutos a que se cree el proyecto.
4. Ve a **SQL Editor** (menú izquierdo) → "New query".
5. Abre el archivo `supabase_schema.sql` de este proyecto, copia TODO su contenido,
   pégalo ahí, y dale **Run**. Esto crea todas las tablas necesarias.
6. Ve a **Project Settings → Database → Connection string**. Elige la pestaña
   **"Transaction"** (pooler, puerto 6543) — es la recomendada para apps serverless
   como Vercel. Copia esa cadena; reemplaza `[YOUR-PASSWORD]` por la contraseña del
   paso 2. Guárdala, es tu `DATABASE_URL`.
7. Ve a **Project Settings → API**. Copia el **Project URL** y la llave **anon public**
   (empiezan como `https://xxxx.supabase.co` y `eyJ...`). Estas dos SÍ son públicas
   (solo permiten leer, protegidas por las reglas que trae el SQL).

## Parte 2 — Conectar la interfaz a Supabase Realtime

1. Abre `public/index.html` en un editor de texto (o VS Code).
2. Busca estas dos líneas cerca del final:
   ```js
   const SUPABASE_URL='https://TU-PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY='TU_ANON_KEY_AQUI';
   ```
3. Reemplázalas con el "Project URL" y la "anon public" key que copiaste en el paso 7
   anterior. Guarda el archivo.

## Parte 3 — Probarlo en tu PC (opcional pero recomendado)

1. Instala Node.js LTS desde https://nodejs.org
2. En la carpeta del proyecto: copia `.env.example` como `.env` y pega ahí tu
   `DATABASE_URL` del paso 6.
3. ```
   npm install
   npm start
   ```
4. Abre `http://localhost:3000` y prueba: abrir caja, crear un producto, hacer una venta.
   Si algo fallara, revisa que copiaste bien la `DATABASE_URL` (con la contraseña real).

## Parte 4 — Publicar en Vercel

1. Ve a https://vercel.com → crea una cuenta gratis (puedes usar GitHub para entrar).
2. **Opción fácil (recomendada): sube el proyecto a GitHub primero**
   - Crea un repositorio nuevo en https://github.com y sube esta carpeta completa
     (sin el archivo `.env`, que es privado — asegúrate de no subirlo).
   - En Vercel: "Add New… → Project" → conecta tu cuenta de GitHub → elige el repositorio.
3. **Configura la variable de entorno.** En la pantalla de configuración del proyecto
   (o luego en Settings → Environment Variables):
   - Nombre: `DATABASE_URL`
   - Valor: la cadena de conexión del paso 6 (Parte 1)
4. Dale **Deploy**. Tarda 1-2 minutos.
5. Al terminar, Vercel te da tu URL: `https://tu-proyecto.vercel.app`. Ábrela y prueba
   el sistema completo desde ahí — ya está en internet.

### Alternativa sin GitHub (línea de comandos)
```
npm install -g vercel
vercel login
vercel --prod
```
Cuando pregunte por variables de entorno, agrega `DATABASE_URL` con el mismo valor.

## Parte 5 — Usarlo desde el celular
Simplemente abre esa URL de Vercel en Chrome del celular (con cualquier red, no hace
falta el mismo Wi-Fi que nadie) y agrégala a la pantalla de inicio. PC y celular
comparten los mismos datos automáticamente, en tiempo real.

## Notas importantes
- **Nunca** pongas la `DATABASE_URL` (con la contraseña) dentro de `public/index.html`
  ni en ningún archivo que se suba al navegador — esa va SOLO en la variable de entorno
  de Vercel. Las que sí van en `index.html` son la URL y la "anon key" de Supabase,
  que son seguras para exponer.
- Backups: en Supabase, `Database → Backups` guarda copias automáticas según tu plan.
- Si cambias el código, en Vercel basta con hacer commit/push a GitHub (o correr
  `vercel --prod` de nuevo) y se actualiza solo.
- Los reportes en PDF y Excel, la caja, el kardex — todo funciona igual que antes,
  ahora respaldado en Supabase en vez del archivo `pos.db` local.
