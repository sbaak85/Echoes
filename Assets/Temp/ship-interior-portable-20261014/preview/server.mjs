import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3054);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be an integer from 1024 to 65535');
const allowed=new Set(['index.html','scene.js','style.css','vendor/three.module.js','vendor/three.core.js','vendor/OrbitControls.js']);
http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const p=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!allowed.has(p)){res.writeHead(404).end();return;}
 try{const b=await readFile(path.join(root,p));res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(500).end();}
}).on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is occupied. Set PORT to another number, then start again.':error.message);process.exitCode=1;}).listen(port,'127.0.0.1',()=>console.log(`Ship interior: http://127.0.0.1:${port}/`));
