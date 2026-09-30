// Solo para probar en tu PC antes de subir a Vercel. En producción Vercel ejecuta index.js directamente.
require('dotenv').config();
const app=require('./index.js');
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`POS (modo local) listo en http://localhost:${PORT}`));
