const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../..');
const out=path.resolve(process.env.BLUR_BENCH_OUTPUT || path.join(root,'.runtime/blur-first-open-benchmark'));
const backgrounds=[['camp','Assets/map/map_test01.png'],['scene02','Assets/map/map_test02.png'],['ruins','Assets/map/map_scene_06.png'],['jungleB','Assets/map/map_scene_06B.png'],['jungleC','Assets/map/map_scene_06C.png']];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const assets=backgrounds.map(([id,file])=>({id,file,bytes:fs.readFileSync(path.join(root,file))}));
assert.equal(new Set(assets.map(a=>sha(a.bytes))).size,5,'Five distinct background files required');
const css=fs.readFileSync(path.join(root,'app/globals.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'blur-first-open.html'),'utf8');
const runtimeFiles=['app/movement-lab.tsx','app/globals.css','app/dialogue-history.ts','app/gamepad-glyph.ts','app/ui-asset-warmup.ts'];
const before=Object.fromEntries(runtimeFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const id=req.url?.split('/background/')[1],asset=assets.find(a=>a.id===id);
  res.setHeader('Cache-Control','no-store');
  if(asset){res.setHeader('Content-Type','image/png');res.end(asset.bytes);}
  else if(req.url==='/runtime.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  else {res.statusCode=404;res.end();}
});
const median=values=>{const s=[...values].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const results=[];let environment;
  try{
    // Three fresh-process replicates per background and method, alternating order.
    const runs=[];
    for(let round=0;round<3;round++)for(let i=0;i<assets.length;i++){
      const order=(round+i)%2?['snapshot','warm']:['warm','snapshot'];
      for(const mode of order)runs.push({background:assets[i].id,mode,round:round+1});
      if(round===0)runs.push({background:assets[i].id,mode:'cold',round:1});
    }
    if(process.env.BLUR_BENCH_SMOKE==='1')runs.splice(3);
    for(const [i,run] of runs.entries()){
      const browser=await chromium.launch({headless:true,channel:'msedge'});
      try{
        const browserSession=await browser.newBrowserCDPSession();
        if(!environment){const info=await browserSession.send('SystemInfo.getInfo');environment={browser:browser.version(),platform:process.platform,gpu:info.gpu,viewport:{width:1440,height:900},deviceScaleFactor:1,headless:true};}
        const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(({mode,background})=>window.setup(mode,background),run);
        const preparation=await page.evaluate(()=>window.prepare());
        const timing=await page.evaluate(()=>window.measureOpen());
        assert.deepEqual(errors,[]);
        if(run.round===1)await page.screenshot({path:path.join(out,`${run.background}-${run.mode}.png`)});
        results.push({...run,...preparation,...timing});
        fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({environment,backgrounds:assets.map(({id,file,bytes})=>({id,file,sha256:sha(bytes)})),runtimeSourceHashes:before,results},null,2));
        console.log(`${i+1}/${runs.length} ${run.background} ${run.mode} #${run.round}: open=${timing.firstPaintOpportunityMs.toFixed(2)}ms prep=${preparation.prepareMs.toFixed(2)}ms frameMax=${timing.maxFrameGapMs.toFixed(2)}ms`);
      }finally{await browser.close();}
    }
    const summary=assets.map(({id})=>({background:id,...Object.fromEntries(['cold','warm','snapshot'].map(mode=>{const r=results.filter(x=>x.background===id&&x.mode===mode);return [mode,r.length?{samples:r.length,openMedianMs:median(r.map(x=>x.firstPaintOpportunityMs)),prepareMedianMs:median(r.map(x=>x.prepareMs)),frameMaxMedianMs:median(r.map(x=>x.maxFrameGapMs))}:null];}))}));
    const after=Object.fromEntries(runtimeFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
    fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({summary,runtimeFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),runtimeBefore:before,runtimeAfter:after},null,2));
    console.log(JSON.stringify(summary));
  }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
