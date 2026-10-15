import http from 'node:http';
import {readFile} from 'node:fs/promises';
const allowed=new Set(['index.html','demo.js','with-walls.png','no-walls.png']);
http.createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['GET','HEAD'].includes(req.method)||!allowed.has(name)){res.writeHead(404).end();return;}try{const b=await readFile(new URL(name,import.meta.url));res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(500).end();}}).listen(3065,'127.0.0.1',()=>console.log('Occlusion demo: http://127.0.0.1:3065/'));
