const canvas=document.querySelector('#map'),ctx=canvas.getContext('2d'),badge=document.querySelector('#badge'),live=document.querySelector('#live');
const W=1437,H=1095,wall=document.createElement('canvas'),wallCtx=wall.getContext('2d'),temp=document.createElement('canvas'),tempCtx=temp.getContext('2d');wall.width=temp.width=W;wall.height=temp.height=H;
// Manually selected solid panel of the cockpit bulkhead; retained in full-image coordinates.
const polygon=[[257,350],[381,272],[380,263],[391,270],[398,279],[397,348],[314,395],[260,357]];
let baseImage,wallImage,ready=false,mode='composite',enabled=true,guide=true,close=true,walking=false,clock=0,fade=1;
const actor={x:335,y:352},pointer={x:335,y:352},maskRadius=52;
let view={x:178,y:205,w:370,h:300},transform={scale:1,ox:0,oy:0};
const img=url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
function wallPath(c){c.beginPath();polygon.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function footLine(x){return 415-(x-278)*74/129;}
function isBehind(){return actor.y<footLine(actor.x)+6;}
function overlaps(){if(!ready||!isBehind())return false;for(const dy of [-46,-32,-18])for(const dx of [-10,0,10]){const x=Math.round(actor.x+dx),y=Math.round(actor.y+dy);if(x>=0&&y>=0&&x<W&&y<H&&wallCtx.getImageData(x,y,1,1).data[3]>120)return true;}return false;}
function drawActor(c){const x=actor.x,y=actor.y;c.save();c.translate(x,y);c.fillStyle='#00000066';c.beginPath();c.ellipse(0,2,13,5,0,0,Math.PI*2);c.fill();
 c.strokeStyle='#26343e';c.lineWidth=8;c.lineCap='round';c.beginPath();c.moveTo(-5,-19);c.lineTo(-6,0);c.moveTo(5,-19);c.lineTo(6,0);c.stroke();
 c.fillStyle='#e2ad4f';c.strokeStyle='#493c25';c.lineWidth=1.5;c.beginPath();c.roundRect(-11,-38,22,24,6);c.fill();c.stroke();
 c.strokeStyle='#e2ad4f';c.lineWidth=6;c.beginPath();c.moveTo(-11,-33);c.lineTo(-15,-18);c.moveTo(11,-33);c.lineTo(15,-18);c.stroke();
 c.fillStyle='#d9c7a2';c.beginPath();c.arc(0,-45,10,0,Math.PI*2);c.fill();c.strokeStyle='#654c2f';c.lineWidth=1.3;c.stroke();
 c.fillStyle='#183c52';c.beginPath();c.roundRect(-8,-49,16,9,4);c.fill();c.fillStyle='#8dd9ec';c.fillRect(-5,-48,5,2);c.fillStyle='#f6e8c6';c.fillRect(-6,-34,12,6);c.fillStyle='#354754';c.fillRect(-8,-23,16,4);c.restore();}
function redraw(dt){
 if(!ready)return;
 if(walking){clock+=dt;actor.x=330+46*Math.sin(clock*.8);actor.y=footLine(actor.x)-8;}
 const blocked=overlaps(),target=enabled&&blocked?1:0;fade+=(target-fade)*Math.min(1,dt*12);
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2),cw=Math.round(rect.width*dpr),ch=Math.round(rect.height*dpr);if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
 view=close?{x:178,y:205,w:370,h:300}:{x:0,y:0,w:W,h:H};const scale=Math.min(rect.width/view.w,rect.height/view.h)*.93,ox=(rect.width-view.w*scale)/2,oy=(rect.height-view.h*scale)/2;transform={scale,ox:ox-view.x*scale,oy:oy-view.y*scale};
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.fillStyle='#070d12';ctx.fillRect(0,0,rect.width,rect.height);ctx.translate(transform.ox,transform.oy);ctx.scale(scale,scale);
 if(mode==='wall'){
  for(let x=Math.floor(view.x/14)*14;x<view.x+view.w;x+=14)for(let y=Math.floor(view.y/14)*14;y<view.y+view.h;y+=14){ctx.fillStyle=(Math.floor(x/14)+Math.floor(y/14))%2?'#263944':'#1a2a35';ctx.fillRect(x,y,14,14);}ctx.drawImage(wall,0,0);
  ctx.strokeStyle='#e2c479';ctx.lineWidth=1.2/scale;wallPath(ctx);ctx.stroke();
 }else{
  ctx.drawImage(baseImage,0,0,W,H);
  if(mode==='composite'){
   if(isBehind())drawActor(ctx);
   tempCtx.clearRect(0,0,W,H);tempCtx.globalCompositeOperation='source-over';tempCtx.drawImage(wall,0,0);
   if(fade>.005){tempCtx.save();tempCtx.globalCompositeOperation='destination-out';tempCtx.translate(actor.x,actor.y-27);tempCtx.scale(1,.95);const grad=tempCtx.createRadialGradient(0,0,maskRadius*.40,0,0,maskRadius);grad.addColorStop(0,`rgba(0,0,0,${fade*.98})`);grad.addColorStop(.52,`rgba(0,0,0,${fade*.86})`);grad.addColorStop(1,'rgba(0,0,0,0)');tempCtx.fillStyle=grad;tempCtx.fillRect(-maskRadius,-maskRadius,maskRadius*2,maskRadius*2);tempCtx.restore();}
   ctx.drawImage(temp,0,0);if(!isBehind())drawActor(ctx);
   if(guide&&blocked&&enabled){ctx.save();ctx.strokeStyle='#efcf80a8';ctx.lineWidth=1/scale;ctx.setLineDash([4/scale,5/scale]);ctx.beginPath();ctx.ellipse(actor.x,actor.y-27,maskRadius,maskRadius*.95,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  }
 }
 badge.textContent=mode==='wall'?'上層：只有一段牆，其餘透明':mode==='base'?'底層：原始無牆場景':'無牆底圖 ＋ 角色 ＋ 隔牆';
 const message=!isBehind()?'人物在牆前 · 牆面保持完整':blocked?(enabled?'人物被擋住 · 身旁隔牆柔邊透明':'人物被擋住 · 身體被牆蓋住'):'人物未被這段牆遮住';if(live.textContent!==message)live.textContent=message;
 canvas.dataset.occluded=String(blocked);canvas.dataset.effect=String(enabled);canvas.dataset.fade=fade.toFixed(2);canvas.dataset.mode=mode;canvas.dataset.actorSide=isBehind()?'behind':'front';
}
function setMode(next){mode=next;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));document.querySelector('#caption').textContent=mode==='wall'?'牆外的棋盤格完全透明；這一層可以獨立疊上去。':mode==='base'?'這張底圖負責填補牆被移除後的地板與設備。':'點地板移動人物；切換防遮擋，比較身體被蓋住／露出的差別。';}
function stopWalk(){walking=false;document.querySelector('#walk').setAttribute('aria-pressed','false');document.querySelector('#walk').textContent='沿牆行走';}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelector('#behind').onclick=()=>{stopWalk();actor.x=335;actor.y=footLine(335)-8;setMode('composite');};
document.querySelector('#front').onclick=()=>{stopWalk();actor.x=335;actor.y=footLine(335)+54;setMode('composite');};
document.querySelector('#effect').onclick=e=>{enabled=!enabled;e.currentTarget.setAttribute('aria-pressed',String(enabled));e.currentTarget.textContent=`防遮擋：${enabled?'開':'關'}`;};
document.querySelector('#walk').onclick=e=>{walking=!walking;e.currentTarget.setAttribute('aria-pressed',String(walking));e.currentTarget.textContent=walking?'暫停行走':'沿牆行走';setMode('composite');};
document.querySelector('#guide').onclick=e=>{guide=!guide;e.currentTarget.setAttribute('aria-pressed',String(guide));};
document.querySelector('#zoom').onclick=e=>{close=!close;e.currentTarget.setAttribute('aria-pressed',String(close));e.currentTarget.textContent=close?'近看隔牆':'看全船';};
canvas.addEventListener('pointerdown',e=>{if(!ready)return;stopWalk();setMode('composite');const r=canvas.getBoundingClientRect();actor.x=(e.clientX-r.left-transform.ox)/transform.scale;actor.y=(e.clientY-r.top-transform.oy)/transform.scale;});
// One shared directional owner for semantic controls and gamepad A activation.
const buttons=[...document.querySelectorAll('button')];let selected=0,owner='mouse',padA=false,padDir=0,repeat=0;
function own(value){owner=value;document.body.dataset.owner=value;buttons.forEach((b,i)=>b.dataset.selected=String(value==='directional'&&i===selected));}
function move(n){selected=(selected+n+buttons.length)%buttons.length;own('directional');buttons[selected].focus({preventScroll:true});}
document.addEventListener('pointerdown',()=>own('mouse'));document.addEventListener('pointermove',e=>{if(e.movementX||e.movementY)own('mouse');});document.addEventListener('focusin',e=>{const i=buttons.indexOf(e.target);if(i>=0)selected=i;});
document.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1);}else if(e.key==='Tab')own('directional');});
function pad(now){const p=navigator.getGamepads?.()?.find(p=>p?.connected);if(!p){padA=false;padDir=0;return;}const x=p.axes[0]||0,y=p.axes[1]||0,dir=(x<-.6||y<-.6||p.buttons[12]?.pressed||p.buttons[14]?.pressed)?-1:(x>.6||y>.6||p.buttons[13]?.pressed||p.buttons[15]?.pressed)?1:0,a=!!p.buttons[0]?.pressed;if(dir&&(dir!==padDir||now>repeat)){move(dir);repeat=now+(dir===padDir?180:420);}if(a&&!padA){own('directional');buttons[selected].click();}padA=a;padDir=dir;}
Promise.all([img('no-walls.png'),img('with-walls.png')]).then(([b,w])=>{baseImage=b;wallImage=w;wallCtx.save();wallPath(wallCtx);wallCtx.clip();wallCtx.drawImage(w,0,0,W,H);wallCtx.restore();actor.y=footLine(actor.x)-8;ready=true;canvas.dataset.ready='true';}).catch(()=>{document.querySelector('#error').textContent='圖片載入失敗，請重新整理。';});
let last=performance.now();function frame(now){const dt=Math.min(.06,(now-last)/1000);last=now;pad(now);redraw(dt);requestAnimationFrame(frame);}requestAnimationFrame(frame);
