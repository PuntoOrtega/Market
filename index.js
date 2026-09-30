const express=require('express'),path=require('path'),{Pool}=require('pg'),PDFDocument=require('pdfkit');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const q=(text,params)=>pool.query(text,params);
const app=express();app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

const wrap=f=>async(req,res)=>{try{const r=await f(req);res.json(r===undefined?{ok:true}:r);}catch(e){console.error(e);res.status(400).json({error:e.message});}};
async function cajaAbierta(){const r=await q("SELECT * FROM cajas WHERE estado='ABIERTA' ORDER BY id DESC LIMIT 1");return r.rows[0];}
async function mov(client,pid,tipo,motivo,cant,usuario,obs){
  const p=(await client.query('SELECT stock_actual FROM productos WHERE id=$1',[pid])).rows[0];
  if(!p)throw new Error('Producto no existe');
  const d=tipo==='INGRESO'?cant:-cant;
  await client.query('UPDATE productos SET stock_actual=stock_actual+$1 WHERE id=$2',[d,pid]);
  await client.query('INSERT INTO movimientos_inventario(producto_id,tipo,motivo,cantidad,usuario,observaciones) VALUES($1,$2,$3,$4,$5,$6)',[pid,tipo,motivo,cant,usuario||'',obs||'']);
}

// PRODUCTOS
app.get('/api/productos',wrap(async r=>{const s=`%${r.query.q||''}%`;
  return(await q('SELECT * FROM productos WHERE activo=true AND (descripcion ILIKE $1 OR codigo_barras ILIKE $1 OR codigo_interno ILIKE $1) ORDER BY descripcion LIMIT 200',[s])).rows;}));
app.get('/api/productos/barcode/:c',wrap(async r=>(await q('SELECT * FROM productos WHERE activo=true AND (codigo_barras=$1 OR codigo_interno=$1)',[r.params.c])).rows[0]||{}));
app.post('/api/productos',wrap(async r=>{const b=r.body;const client=await pool.connect();try{await client.query('BEGIN');
  const ins=await client.query(`INSERT INTO productos(codigo_interno,codigo_barras,descripcion,categoria,unidad_medida,precio_compra,precio_venta,stock_minimo,fecha_vencimiento) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [b.codigo_interno||null,b.codigo_barras||null,b.descripcion,b.categoria||'',b.unidad_medida||'UN',b.precio_compra||0,b.precio_venta||0,b.stock_minimo??5,b.fecha_vencimiento||null]);
  const id=ins.rows[0].id;if(b.stock_inicial>0)await mov(client,id,'INGRESO','INVENTARIO_INICIAL',b.stock_inicial,b.usuario);
  await client.query('COMMIT');return{id};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.put('/api/productos/:id',wrap(async r=>{const b=r.body;
  await q(`UPDATE productos SET codigo_interno=$1,codigo_barras=$2,descripcion=$3,categoria=$4,unidad_medida=$5,precio_compra=$6,precio_venta=$7,stock_minimo=$8,fecha_vencimiento=$9 WHERE id=$10`,
    [b.codigo_interno||null,b.codigo_barras||null,b.descripcion,b.categoria||'',b.unidad_medida,b.precio_compra,b.precio_venta,b.stock_minimo,b.fecha_vencimiento||null,r.params.id]);}));
app.delete('/api/productos/:id',wrap(async r=>{await q('UPDATE productos SET activo=false WHERE id=$1',[r.params.id]);}));

// CLIENTES
app.get('/api/clientes',wrap(async r=>{const s=`%${r.query.q||''}%`;
  return(await q('SELECT * FROM clientes WHERE nombre ILIKE $1 OR identificacion ILIKE $1 OR telefono ILIKE $1 ORDER BY nombre LIMIT 50',[s])).rows;}));
app.post('/api/clientes',wrap(async r=>{const b=r.body;if(!b.nombre)throw new Error('Falta el nombre');
  const ins=await q('INSERT INTO clientes(identificacion,nombre,telefono,direccion) VALUES($1,$2,$3,$4) RETURNING id',[b.identificacion||null,b.nombre,b.telefono||'',b.direccion||'']);
  return{id:ins.rows[0].id};}));
app.put('/api/clientes/:id',wrap(async r=>{const b=r.body;
  await q('UPDATE clientes SET identificacion=$1,nombre=$2,telefono=$3,direccion=$4 WHERE id=$5',[b.identificacion||null,b.nombre,b.telefono||'',b.direccion||'',r.params.id]);}));

// KARDEX
app.post('/api/movimientos',wrap(async r=>{const b=r.body;if(!(b.cantidad>0))throw new Error('Cantidad inválida');
  const client=await pool.connect();try{await client.query('BEGIN');await mov(client,b.producto_id,b.tipo,b.motivo,b.cantidad,b.usuario,b.observaciones);await client.query('COMMIT');}
  catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.get('/api/kardex/:pid',wrap(async r=>(await q('SELECT * FROM movimientos_inventario WHERE producto_id=$1 ORDER BY id DESC LIMIT 100',[r.params.pid])).rows));

// CAJA
app.get('/api/caja',wrap(async()=>(await cajaAbierta())||{}));
app.post('/api/caja/abrir',wrap(async r=>{if(await cajaAbierta())throw new Error('Ya hay una caja abierta');
  await q('INSERT INTO cajas(vendedor,monto_inicial) VALUES($1,$2)',[r.body.vendedor||'Cajero',r.body.monto_inicial||0]);}));
app.post('/api/caja/movimiento',wrap(async r=>{const c=await cajaAbierta();if(!c)throw new Error('No hay caja abierta');
  await q('INSERT INTO caja_movimientos(caja_id,tipo,monto,motivo) VALUES($1,$2,$3,$4)',[c.id,r.body.tipo,r.body.monto,r.body.motivo||'']);}));
async function metodoSum(cajaId,pred){return+((await q(`SELECT COALESCE(SUM(vp.monto),0) t FROM venta_pagos vp JOIN ventas v ON v.id=vp.venta_id WHERE v.caja_id=$1 AND ${pred}`,[cajaId])).rows[0].t);}
async function resumen(c){const ef=await metodoSum(c.id,"vp.metodo='EFECTIVO'"),tj=await metodoSum(c.id,"vp.metodo='TARJETA'"),ot=await metodoSum(c.id,"vp.metodo NOT IN ('EFECTIVO','TARJETA')");
  const mv=async t=>+((await q('SELECT COALESCE(SUM(monto),0) t FROM caja_movimientos WHERE caja_id=$1 AND tipo=$2',[c.id,t])).rows[0].t);
  const entradas=await mv('ENTRADA'),salidas=await mv('SALIDA');
  return{efectivo_ventas:ef,tarjeta:tj,otros:ot,entradas,salidas,esperado_efectivo:+c.monto_inicial+ef+entradas-salidas};}
app.get('/api/caja/resumen',wrap(async()=>{const c=await cajaAbierta();return c?await resumen(c):{};}));
app.post('/api/caja/cerrar',wrap(async r=>{const c=await cajaAbierta();if(!c)throw new Error('No hay caja abierta');const s=await resumen(c),cont=+r.body.efectivo_contado;
  const dif=+(cont-s.esperado_efectivo).toFixed(2);
  await q("UPDATE cajas SET fecha_cierre=now(),monto_efectivo_cierre=$1,monto_sistema_efectivo=$2,monto_sistema_tarjeta=$3,monto_sistema_otros=$4,diferencia=$5,estado='CERRADA' WHERE id=$6",
    [cont,s.esperado_efectivo,s.tarjeta,s.otros,dif,c.id]);
  return{...s,contado:cont,diferencia:dif,resultado:dif===0?'CUADRADO':dif>0?'SOBRANTE':'FALTANTE'};}));

// VENTAS
app.post('/api/ventas',wrap(async r=>{const b=r.body,c=await cajaAbierta();if(!c)throw new Error('Abre la caja primero');
  if(!b.items?.length)throw new Error('Carrito vacío');if(!b.pagos?.length)throw new Error('Falta el método de pago');
  const client=await pool.connect();try{await client.query('BEGIN');
    let total=0,descTotal=0;
    for(const i of b.items){const sub=+(i.cantidad*i.precio-(i.descuento||0)).toFixed(2);if(sub<0)throw new Error('Descuento mayor al subtotal');total+=sub;descTotal+=(i.descuento||0);}
    total=+total.toFixed(2);
    const pagado=+b.pagos.reduce((a,p)=>a+(+p.monto||0),0).toFixed(2);
    if(pagado<total-0.01)throw new Error('El pago no cubre el total');
    let cliente_id=b.cliente_id||null,clienteNom=b.cliente||'Cliente Varios';
    if(cliente_id){const cl=(await client.query('SELECT nombre FROM clientes WHERE id=$1',[cliente_id])).rows[0];if(cl)clienteNom=cl.nombre;}
    const vIns=await client.query('INSERT INTO ventas(caja_id,cliente_id,cliente,vendedor,total,descuento_total) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [c.id,cliente_id,clienteNom,c.vendedor,total,descTotal]);
    const ventaId=vIns.rows[0].id;
    for(const i of b.items){const p=(await client.query('SELECT stock_actual,descripcion FROM productos WHERE id=$1',[i.producto_id])).rows[0];
      if(!p)throw new Error('Producto inexistente');if(+p.stock_actual<i.cantidad)throw new Error(`Stock insuficiente: ${p.descripcion}`);
      const sub=+(i.cantidad*i.precio-(i.descuento||0)).toFixed(2);
      await client.query('INSERT INTO detalle_ventas(venta_id,producto_id,cantidad,precio_unitario,descuento,subtotal) VALUES($1,$2,$3,$4,$5,$6)',
        [ventaId,i.producto_id,i.cantidad,i.precio,i.descuento||0,sub]);
      await mov(client,i.producto_id,'SALIDA','VENTA',i.cantidad,c.vendedor,`Venta #${ventaId}`);}
    for(const p of b.pagos)if(p.monto>0)await client.query('INSERT INTO venta_pagos(venta_id,metodo,monto) VALUES($1,$2,$3)',[ventaId,p.metodo,p.monto]);
    await client.query('COMMIT');return{id:ventaId,total,vuelto:+(pagado-total).toFixed(2)};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.get('/api/ventas/:id',wrap(async r=>({
  venta:(await q('SELECT * FROM ventas WHERE id=$1',[r.params.id])).rows[0],
  items:(await q('SELECT d.*,p.descripcion FROM detalle_ventas d JOIN productos p ON p.id=d.producto_id WHERE venta_id=$1',[r.params.id])).rows,
  pagos:(await q('SELECT * FROM venta_pagos WHERE venta_id=$1',[r.params.id])).rows})));

// CONFIG
app.get('/api/config',wrap(async()=>Object.fromEntries((await q('SELECT * FROM config')).rows.map(x=>[x.k,x.v]))));
app.post('/api/config',wrap(async r=>{for(const[k,v]of Object.entries(r.body))
  await q('INSERT INTO config(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=$2',[k,String(v)]);}));

// REPORTES
app.get('/api/reportes/stock',wrap(async()=>(await q('SELECT codigo_interno,codigo_barras,descripcion,stock_actual,stock_minimo,precio_compra,precio_venta,stock_actual*precio_compra as valor FROM productos WHERE activo=true ORDER BY descripcion')).rows));
app.get('/api/reportes/vencimientos',wrap(async r=>(await q("SELECT descripcion,stock_actual,fecha_vencimiento FROM productos WHERE activo=true AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento<=(CURRENT_DATE+($1||' days')::interval) ORDER BY fecha_vencimiento",[+r.query.dias||30])).rows));
async function rotacionQ(r){const desde=r.query.desde||'2000-01-01',hasta=r.query.hasta||'2100-01-01',motivo=r.query.motivo,tipo=r.query.tipo;
  let sql=`SELECT m.fecha,p.descripcion,m.tipo,m.motivo,m.cantidad,m.usuario,m.observaciones FROM movimientos_inventario m JOIN productos p ON p.id=m.producto_id WHERE m.fecha::date>=$1::date AND m.fecha::date<=$2::date`;
  const args=[desde,hasta];let i=3;if(motivo){sql+=` AND m.motivo=$${i++}`;args.push(motivo);}if(tipo){sql+=` AND m.tipo=$${i++}`;args.push(tipo);}
  sql+=' ORDER BY m.fecha DESC LIMIT 1000';return(await q(sql,args)).rows;}
app.get('/api/reportes/rotacion',wrap(async r=>rotacionQ(r)));
app.get('/api/reportes/stock.csv',async(req,res)=>{const rows=(await q('SELECT codigo_interno,codigo_barras,descripcion,stock_actual,precio_compra,precio_venta FROM productos WHERE activo=true')).rows;
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=stock.csv'});
  res.send('\ufeff'+['codigo_interno,codigo_barras,descripcion,stock,precio_compra,precio_venta',...rows.map(x=>Object.values(x).map(v=>`"${v??''}"`).join(','))].join('\n'));});
app.get('/api/reportes/rotacion.csv',async(req,res)=>{const rows=await rotacionQ(req);
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=rotacion.csv'});
  res.send('\ufeff'+['fecha,producto,tipo,motivo,cantidad,usuario,observaciones',...rows.map(x=>Object.values(x).map(v=>`"${v??''}"`).join(','))].join('\n'));});
function pdfTable(res,filename,title,cols,rows){
  res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename=${filename}`});
  const doc=new PDFDocument({margin:30,size:'A4'});doc.pipe(res);
  doc.fontSize(16).text(title,{align:'center'});doc.moveDown();
  const colW=(doc.page.width-60)/cols.length;doc.fontSize(9);
  const row=(vals,bold)=>{const y=doc.y;cols.forEach((c,i)=>{doc.font(bold?'Helvetica-Bold':'Helvetica').text(String(vals[i]??''),30+i*colW,y,{width:colW-4});});doc.moveDown(0.6);};
  row(cols,true);doc.moveTo(30,doc.y).lineTo(doc.page.width-30,doc.y).stroke();doc.moveDown(0.3);
  rows.forEach(r=>{if(doc.y>doc.page.height-50){doc.addPage();row(cols,true);}row(r);});
  doc.end();}
app.get('/api/reportes/stock.pdf',async(req,res)=>{const rows=(await q('SELECT codigo_interno,descripcion,stock_actual,precio_compra,precio_venta,stock_actual*precio_compra as valor FROM productos WHERE activo=true ORDER BY descripcion')).rows;
  pdfTable(res,'stock.pdf','Reporte de Stock Actual',['Código','Descripción','Stock','P.Compra','P.Venta','Valorizado'],rows.map(x=>[x.codigo_interno,x.descripcion,x.stock_actual,(+x.precio_compra).toFixed(2),(+x.precio_venta).toFixed(2),(+x.valor).toFixed(2)]));});
app.get('/api/reportes/rotacion.pdf',async(req,res)=>{const rows=await rotacionQ(req);
  pdfTable(res,'rotacion.pdf','Reporte de Rotación / Movimientos',['Fecha','Producto','Tipo','Motivo','Cant.','Usuario'],rows.map(x=>[String(x.fecha).slice(0,16),x.descripcion,x.tipo,x.motivo,x.cantidad,x.usuario]));});

// IMPORTACIÓN MASIVA DE PRODUCTOS (Excel/CSV) Y BORRADO TOTAL
// Empareja por codigo_barras o codigo_interno si existen (actualiza); si no, crea nuevo.
app.post('/api/productos/importar',wrap(async r=>{const filas=r.body.filas;if(!Array.isArray(filas)||!filas.length)throw new Error('No se recibieron filas');
  const client=await pool.connect();let creados=0,actualizados=0,errores=[];
  try{await client.query('BEGIN');
    for(const[idx,f]of filas.entries()){try{
      const descripcion=(f.descripcion||'').toString().trim();if(!descripcion)throw new Error('Falta descripción');
      const cb=(f.codigo_barras||'').toString().trim()||null,ci=(f.codigo_interno||'').toString().trim()||null;
      let existente=null;
      if(cb)existente=(await client.query('SELECT id FROM productos WHERE codigo_barras=$1',[cb])).rows[0];
      if(!existente&&ci)existente=(await client.query('SELECT id FROM productos WHERE codigo_interno=$1',[ci])).rows[0];
      const datos=[ci,cb,descripcion,(f.categoria||'').toString(),(f.unidad_medida||'UN').toString(),+f.precio_compra||0,+f.precio_venta||0,+f.stock_minimo||5,f.fecha_vencimiento||null];
      if(existente){await client.query(`UPDATE productos SET codigo_interno=$1,codigo_barras=$2,descripcion=$3,categoria=$4,unidad_medida=$5,precio_compra=$6,precio_venta=$7,stock_minimo=$8,fecha_vencimiento=$9,activo=true WHERE id=$10`,[...datos,existente.id]);
        if(f.stock_actual!==undefined&&f.stock_actual!==''){await client.query('UPDATE productos SET stock_actual=$1 WHERE id=$2',[+f.stock_actual,existente.id]);}
        actualizados++;
      }else{const ins=await client.query(`INSERT INTO productos(codigo_interno,codigo_barras,descripcion,categoria,unidad_medida,precio_compra,precio_venta,stock_minimo,fecha_vencimiento,stock_actual) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[...datos,+f.stock_actual||0]);
        if(+f.stock_actual>0)await client.query('INSERT INTO movimientos_inventario(producto_id,tipo,motivo,cantidad,usuario,observaciones) VALUES($1,$2,$3,$4,$5,$6)',[ins.rows[0].id,'INGRESO','INVENTARIO_INICIAL',+f.stock_actual,'importacion','Importación masiva']);
        creados++;}
    }catch(e){errores.push(`Fila ${idx+2}: ${e.message}`);}}
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return{creados,actualizados,errores};}));
app.post('/api/productos/eliminar-todos',wrap(async r=>{
  if(r.body.confirmacion!=='ELIMINAR')throw new Error('Confirmación inválida');
  const res=await q('UPDATE productos SET activo=false WHERE activo=true');
  return{eliminados:res.rowCount};}));

// CONSULTA DNI/RUC (RENIEC/SUNAT vía apis.net.pe — requiere token gratuito en APISNET_TOKEN)
app.get('/api/consulta/:numero',wrap(async r=>{const n=(r.params.numero||'').replace(/\D/g,'');
  const token=process.env.APISNET_TOKEN;if(!token)throw new Error('Falta configurar APISNET_TOKEN en el servidor');
  let url;if(n.length===8)url=`https://api.apis.net.pe/v2/reniec/dni?numero=${n}`;
  else if(n.length===11)url=`https://api.apis.net.pe/v2/sunat/ruc?numero=${n}`;
  else throw new Error('El número debe tener 8 dígitos (DNI) u 11 (RUC)');
  const resp=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(!resp.ok)throw new Error('No se encontró el documento o el servicio no respondió');
  const d=await resp.json();
  if(n.length===8)return{identificacion:n,nombre:[d.nombres,d.apellidoPaterno,d.apellidoMaterno].filter(Boolean).join(' '),direccion:d.direccion||''};
  return{identificacion:n,nombre:d.nombre||d.razonSocial||'',direccion:d.direccion||''};}));

module.exports=app;
