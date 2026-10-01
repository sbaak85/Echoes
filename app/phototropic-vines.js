import { createVineGeometry, vineGeometryAtReach, smoothVineProgress } from './phototropic-vine-geometry.js';
const NS='http://www.w3.org/2000/svg';

function el(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent?.append(n);return n}
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}

// Layered, tapering stems and individually articulated foliage; each side has its own silhouette.
export function createPlantVines(hostL,hostR){
 const rigs=[];
 const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
 function drawVines(){
 rigs.length=0;
 for(const side of ['L','R']){
  const host=side==='L'?hostL:hostR;host.replaceChildren();
  const rng=random(side==='L'?812:1973),prefix='vine-'+side;
  const svg=el('svg',{viewBox:'0 0 1000 520',preserveAspectRatio:'xMidYMid meet',class:'vine-art','aria-hidden':'true'},host);
  const defs=el('defs',{},svg);
  const bark=el('linearGradient',{id:prefix+'-bark',x1:'0',y1:'0',x2:'.2',y2:'1'},defs);
  [[0,'#53604a'],[.24,'#7b7753'],[.52,'#394c36'],[1,'#172a22']].forEach(([offset,color])=>el('stop',{offset,'stop-color':color},bark));
  for(let i=0;i<3;i++){
   const grad=el('linearGradient',{id:prefix+'-leaf'+i,x1:'0',y1:'1',x2:'.8',y2:'0'},defs);
   [[0,['#123b30','#263d2c','#153e3b'][i]],[.42,['#356846','#526c39','#326c5a'][i]],[.73,['#73914f','#829250','#649a76'][i]],[1,'#adc37d']].forEach(([offset,color])=>el('stop',{offset,'stop-color':color},grad));
  }
  const leaf=el('g',{id:prefix+'-shape'},defs);
  el('path',{d:'M 0 0 C 14 -9 21 -33 52 -44 C 81 -53 100 -40 122 -42 C 104 -24 90 7 59 10 C 33 12 13 4 0 0 Z',class:'leaf-surface'},leaf);
  el('path',{d:'M 1 0 Q 62 -24 120 -42',class:'leaf-spine'},leaf);
  for(let i=0;i<6;i++){
   const x=18+i*14,y=-x*.32;
   el('path',{d:`M ${x} ${y} Q ${x+2} ${y-12} ${x+7} ${y-23} M ${x} ${y} Q ${x+12} ${y+9} ${x+20} ${y+9}`,class:'leaf-vein'},leaf);
  }
  const stems=[
   'M -90 450 C 105 388 130 70 339 112 S 602 176 738 68 Q 804 11 929 88',
   'M -100 402 C 129 430 205 252 372 230 S 688 288 875 170 Q 950 120 1010 194',
   'M -80 498 C 167 441 238 389 414 344 S 694 356 814 295 Q 893 249 980 313',
   'M -50 470 C 153 407 208 483 377 452 S 634 420 771 447 Q 892 469 952 392',
   'M -110 218 C 47 162 184 244 297 176 S 525 49 661 104 Q 774 144 848 49'
  ];
  stems.forEach((d,i)=>{
   const group=el('g',{class:'vine-bough',style:`--duration:${7+i*1.3}s;--delay:${-i*1.7}s;--sway:${i%2?-.45:.6}deg`},svg);
   const width=18-i*2.4;
   // All four bark layers share one curve; mutate its geometry only once.
   const path=el('path',{id:prefix+'-stem'+i,d},defs),href='#'+prefix+'-stem'+i;
   el('use',{href,fill:'none',stroke:'#071c17','stroke-width':width+6,'stroke-linecap':'round',opacity:'.8'},group);
   el('use',{href,fill:'none',stroke:`url(#${prefix}-bark)`,'stroke-width':width,'stroke-linecap':'round'},group);
   el('use',{href,fill:'none',stroke:'#aeb683','stroke-width':1.6,opacity:'.4',transform:'translate(0,-3)'},group);
   el('use',{href,fill:'none',stroke:'#b8c4a0','stroke-width':1,'stroke-dasharray':'2 21 3 15',opacity:'.3'},group);
   const length=path.getTotalLength();
   const rig={side,index:i,path,geometry:createVineGeometry(d),leaves:[],previous:0,energy:0,lastReach:null};
   rigs.push(rig);
   for(let j=0;j<13;j++){
    const distance=length*(.14+j*.06),p=path.getPointAtLength(distance),next=path.getPointAtLength(distance+2);
    const tangent=Math.atan2(next.y-p.y,next.x-p.x)*180/Math.PI,flip=j%2===0;
    const category=rng();
    const size=(category<.3?.22+rng()*.13:category<.75?.43+rng()*.2:.78+rng()*.24)*(j>9?.82:1);
    const rotation=tangent+(flip?-18:52)+rng()*26;
    const twig=el('g',{transform:`translate(${p.x},${p.y}) rotate(${rotation})`},group);
    rig.leaves.push({twig,p,next,fraction:distance/length,offset:rotation-tangent,phase:rng()*6.28,opacity:null});
    el('path',{d:`M 0 0 Q 12 ${flip?-7:7} 28 0`,fill:'none',stroke:'#667553','stroke-width':2.2},twig);
    const foliage=el('g',{class:'vine-foliage',style:`--duration:${4+rng()*4}s;--delay:${-rng()*9}s;--leaf-sway:${2+rng()*3}deg`,transform:`translate(24,0)`},twig);
    el('use',{href:'#'+prefix+'-shape',transform:`scale(${size},${flip?size:-size})`,fill:`url(#${prefix}-leaf${j%3})`},foliage);
    // Smaller fresh leaf grows at a different angle, breaking the repeating pairs.
    if(j%3===1)el('use',{href:'#'+prefix+'-shape',transform:`rotate(-58) scale(${size*.54},${size*.54})`,fill:`url(#${prefix}-leaf2)`,opacity:'.94'},twig);
    if(j%4===0){
     el('path',{d:`M 0 0 C 18 -22 58 -23 61 -8 C 64 7 44 15 40 1 C 37 -7 48 -12 52 -6`,class:'vine-tendril'},twig);
     el('circle',{cx:5,cy:-4,r:2.1,class:'vine-node-glow'},twig);
    }
   }
   // Fine curling terminal growth gives every branch a tapered end.
   const tip=path.getPointAtLength(length);
   rig.tip=el('path',{d:`M ${tip.x-23} ${tip.y} Q ${tip.x+12} ${tip.y-22} ${tip.x+24} ${tip.y-6} Q ${tip.x+31} ${tip.y+12} ${tip.x+10} ${tip.y+13}`,class:'vine-tendril'},group);
  });
 }
}

// Grow by exposing more of a fixed-length curved stem, never by compressing its geometry.
function updateVines(left,right,seconds,dt,growth=1){
 const reduced=motionPreference.matches;
 for(const rig of rigs){
  const displacement=rig.side==='L'?left:-right;
  rig.energy+=(Math.min(1,Math.abs(displacement-rig.previous)/Math.max(dt,.001)/24)-rig.energy)*(1-Math.exp(-dt*5));
  rig.previous=displacement;
  const energy=reduced?0:rig.energy;
  const reach=Math.max(0,Math.min(1.25,1+displacement*.012))*Math.max(0,Math.min(1,growth));
  if(rig.lastReach===reach&&energy<.0001)continue;
  rig.lastReach=energy<.0001?reach:null;
  const warp=p=>{
   const u=Math.max(0,Math.min(1,p.x/1010));
   return {x:p.x,
    y:p.y+Math.sin(u*8-seconds*2+rig.index)*energy*3*u};
  };
  const visible=vineGeometryAtReach(rig.geometry,reach);
  const curves=visible.curves.map(curve=>curve.map(warp));
  const xy=p=>`${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  const d=`M ${xy(curves[0][0])} `+curves.map(curve=>`C ${curve.slice(1).map(xy).join(' ')}`).join(' ');
  rig.path.setAttribute('d',d);
  for(const leaf of rig.leaves){
   const p=warp(leaf.p),next=warp(leaf.next);
   // Leaves retain their own size, emerging behind the growing tip.
   const emerge=smoothVineProgress((reach-leaf.fraction)/.055);
   if(leaf.opacity!==emerge){leaf.twig.style.opacity=emerge;leaf.opacity=emerge;}
   if(emerge===0)continue;
   const orient=Math.atan2(next.y-p.y,next.x-p.x)*180/Math.PI+leaf.offset+(1-emerge)*35+energy*Math.sin(seconds*2+leaf.phase)*3;
   leaf.twig.setAttribute('transform',`translate(${p.x},${p.y}) rotate(${orient})`);
  }
  const last=curves.at(-1),tip=last[3],tangent=visible.tangent;
  const angle=reach>0?Math.atan2(tip.y-last[2].y,tip.x-last[2].x)*180/Math.PI:Math.atan2(tangent.y,tangent.x)*180/Math.PI;
  const curl=energy*Math.sin(seconds*3+rig.index)*5;
  rig.tip.setAttribute('transform',`translate(${tip.x},${tip.y}) rotate(${angle})`);
  rig.tip.setAttribute('d',`M -12 0 Q 12 ${-18-curl} 24 -6 Q 31 ${12+curl} 10 13`);
 }
}


 drawVines();
 return { update: updateVines, dispose(){rigs.length=0;hostL.replaceChildren();hostR.replaceChildren();} };
}
