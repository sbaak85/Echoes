import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

const host=document.querySelector('#viewport'),status=document.querySelector('#status');
const scene=new THREE.Scene();scene.background=new THREE.Color('#090f15');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;host.append(renderer.domElement);
const camera=new THREE.OrthographicCamera(-20,20,15,-15,.1,200);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.minZoom=.5;orbit.maxZoom=4;orbit.maxPolarAngle=Math.PI*.48;orbit.minPolarAngle=.03;orbit.target.set(0,.6,0);
scene.add(new THREE.HemisphereLight(0xc4def4,0x3e454b,2.3));
const sun=new THREE.DirectionalLight(0xffe4bf,3.5);sun.position.set(-9,22,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:18,bottom:-18,near:1,far:65});sun.shadow.bias=-.00025;sun.shadow.normalBias=.03;scene.add(sun);
const fill=new THREE.DirectionalLight(0x7badcf,2);fill.position.set(12,10,-15);scene.add(fill);
const ship=new THREE.Group();scene.add(ship);
const materials={};
const mat=(name,color,metal=.55,rough=.55,emissive=0)=>materials[name]??(materials[name]=new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive,emissiveIntensity:emissive?1.8:0}));
const steel=mat('steel',0x697780),dark=mat('dark',0x26353f),trim=mat('trim',0x9ca8ad),panel=mat('panel',0x7e8990),floorMat=mat('floor',0x59656b),black=mat('black',0x101d25),red=mat('red',0x8e4039),olive=mat('olive',0x64715a),cream=mat('cream',0xb8b5a3),copper=mat('copper',0x855e40),cyan=mat('cyan',0x65dbe9,.15,.35,0x19a1c1),amber=mat('amber',0xffd296,.2,.4,0xeeb362),cushion=mat('cushion',0x883f36,.1,.9);
const geometryCache=new Map();
function box(parent,x,y,z,w,h,d,m=steel,edge=false){const key=[w,h,d].join(',');let geo=geometryCache.get(key);if(!geo){geo=new THREE.BoxGeometry(w,h,d);geometryCache.set(key,geo);}const mesh=new THREE.Mesh(geo,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);if(edge){const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0xa0b0b5,transparent:true,opacity:.22}));mesh.add(lines);}return mesh;}
function cyl(parent,x,y,z,r,h,m=steel,segments=20){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function torus(parent,x,y,z,r,t,m=trim){const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,32),m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
function group(parent,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function bar(parent,a,b,width,m=steel){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),len=av.distanceTo(bv);const g=box(parent,0,0,0,width,len,width,m);g.position.copy(av.add(bv).multiplyScalar(.5));g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize());return g;}
function pipe(parent,points,r=.1,m=copper){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,24,r,8,false),m);mesh.castShadow=true;parent.add(mesh);return mesh;}
function screenTexture(text,color='#5dccf2'){
 const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle='#081b29';g.fillRect(0,0,256,128);g.strokeStyle='#184252';g.lineWidth=1;
 for(let x=12;x<256;x+=18){g.beginPath();g.moveTo(x,0);g.lineTo(x,128);g.stroke();}for(let y=8;y<128;y+=16){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();}
 g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.arc(65,65,39,0,Math.PI*2);g.stroke();g.beginPath();g.arc(65,65,24,0,Math.PI*1.65);g.stroke();g.fillStyle=color;g.font='bold 14px monospace';g.fillText(text,120,28);for(let i=0;i<5;i++)g.fillRect(123,43+i*13,35+(i*19)%70,4);g.fillRect(13,112,220,2);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const screens={};
function monitor(parent,x,y,z,w=1.1,h=.6,caption='SYSTEM'){
 const g=group(parent,x,y,z);box(g,0,0,0,w+.12,h+.12,.16,black);const texture=screens[caption]??(screens[caption]=screenTexture(caption));const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.6,roughness:.4}));mesh.position.z=.091;g.add(mesh);box(g,w*.34,-h*.5-.035,.09,.12,.025,.015,cyan);return g;
}
function label(parent,text,x,y,z,w=2.5,color='#cbd3d3'){
 const c=document.createElement('canvas');c.width=512;c.height=80;const g=c.getContext('2d');g.font='bold 38px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle=color;g.fillText(text,256,40);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w*80/512),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
// Chamfered hull footprint. X runs along the ship; Z runs across the shared corridor.
const outline=[[-14.4,-.7],[-13.45,-2.8],[-8.6,-5],[12.5,-5],[14,-3.6],[14,3.6],[12.5,5],[-8.6,5],[-13.45,2.8],[-14.4,.7]];
const shape=new THREE.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
const hullGeo=new THREE.ExtrudeGeometry(shape,{depth:.6,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.09,bevelThickness:.09});hullGeo.rotateX(-Math.PI/2);
const base=new THREE.Mesh(hullGeo,dark);base.position.y=-.65;base.receiveShadow=true;base.castShadow=true;ship.add(base);
function clipToHull(poly){for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],cross=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),next=[];for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length],cp=cross(p),cq=cross(q);if(cp>=0)next.push(p);if((cp>=0)!==(cq>=0)){const t=cp/(cp-cq);next.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}poly=next;if(!poly.length)break;}return poly;}
function polygonDeck(parent,points,y,depth,m){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const geo=depth?new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false}):new THREE.ShapeGeometry(s);geo.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geo,m);mesh.position.y=y;mesh.receiveShadow=true;mesh.castShadow=!!depth;parent.add(mesh);return mesh;}
for(let x=-14.5;x<14;x+=1){for(let z=-4.5;z<5;z+=1){const tile=clipToHull([[x-.485,z-.485],[x+.485,z-.485],[x+.485,z+.485],[x-.485,z+.485]]);if(tile.length>=3)polygonDeck(ship,tile,.02,0,floorMat);}}
// Longitudinal corridor stripes and floor grates.
for(const z of [-.96,.96]){box(ship,4.7,.03,z,17.9,.018,.07,cream);for(let x=-3.5;x<13;x+=1.1)box(ship,x,.042,z,.38,.018,.075,mat('yellow',0xc29439));}
for(let x=-2;x<13;x+=2.1){box(ship,x,.034,0,.65,.02,1.18,dark);for(let z=-.47;z<.6;z+=.14)box(ship,x,.049,z,.6,.012,.025,steel);}
label(ship,'ECHOES  /  DECK 01',-6,.06,2.05,3.0,'#849da8');label(ship,'SERVICE SPINE',5,.07,0,3.2,'#bdad79');
// Outer walls consist of independent side groups, including trim and piping.
const port=group(ship),starboard=group(ship),ends=group(ship),partitions=group(ship);
function wallSegment(parent,x,z,length,height=2.45,rotation=0,exterior=false){
 const g=group(parent,x,0,z);g.rotation.y=rotation;box(g,0,height/2,0,length,height,.25,dark);
 const count=Math.max(1,Math.round(length/1.6)),step=length/count;
 for(let i=0;i<count;i++){const px=-length/2+step*(i+.5);box(g,px,height/2,.015,step-.1,height-.3,.32,panel,true);box(g,px,.24,.195,step-.17,.18,.05,dark);box(g,px,height-.2,.015,step+.02,.24,.46,trim);
  box(g,px,1.1,.187,step-.34,.78,.026,steel);for(const side of [-1,1])box(g,px+side*(step/2-.12),height/2,.2,.07,height-.42,.08,dark);
  if(exterior&&i%4===1){box(g,px,1.1,-.177,.42,1.95,.05,red);box(g,px,height/2,0,.17,height+.1,.55,trim);}
  if(i%3===1){box(g,px,1.83,.22,.73,.13,.06,black);box(g,px,1.83,.258,.61,.047,.02,amber);}
 }
 box(g,0,.075,0,length,.15,.52,steel);return g;
}
wallSegment(port,1.95,-5,21.1,2.55,0,true);wallSegment(starboard,1.95,5,21.1,2.55,Math.PI,true);
for(const [a,b] of [[[12.5,-5],[14,-3.6]],[[14,3.6],[12.5,5]]]){const dx=b[0]-a[0],dz=b[1]-a[1];wallSegment((a[1]+b[1])<0?port:starboard,(a[0]+b[0])/2,(a[1]+b[1])/2,Math.hypot(dx,dz),2.3,-Math.atan2(dz,dx),true);}
wallSegment(ends,14,0,7.2,2.55,Math.PI/2,true);
// The bow tapers from the bridge bulkhead to a subtly blunted point.
const bridge=group(ship);
const bowEdges=[[outline[0],outline[1],port],[outline[1],outline[2],port],[outline[7],outline[8],starboard],[outline[8],outline[9],starboard],[outline[9],outline[0],ends]];
for(const [a,b,parent] of bowEdges){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),g=group(parent,(a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=-Math.atan2(dz,dx);if(length>4){wallSegment(g,0,0,length,2.55,0,true);continue;}wallSegment(g,0,0,length,.95);const glass=box(g,0,1.65,0,length-.20,1.22,.15,mat('glass',0x103745,.62,.2));glass.name='bridge-observation-window';for(const x of [-length/2,length/2])box(g,x,1.65,0,.12,1.48,.25,steel);box(g,0,2.37,0,length+.05,.14,.3,trim);box(g,0,1.0,.13,length,.07,.08,steel);}
// Door modules: real openings in wall, two leaves slide into the flanking pockets.
const doors=[];const interactable=[];
function doorway(name,x,z,length,rotation=0){
 const g=group(partitions,x,0,z);g.rotation.y=rotation;const opening=1.7,H=2.32,side=(length-opening)/2;
 if(side>0){wallSegment(g,-opening/2-side/2,0,side,H);wallSegment(g,opening/2+side/2,0,side,H);}
 box(g,0,2.22,0,opening+.4,.3,.5,trim);box(g,0,.035,0,opening+.3,.08,.65,steel);
 for(const s of [-1,1]){box(g,s*(opening/2+.06),1.1,0,.18,2.2,.5,trim);box(g,s*(opening/2+.17),1.3,.3,.17,.28,.055,black);box(g,s*(opening/2+.17),1.3,.332,.075,.13,.02,cyan);}
 const leaves=[];
 for(const s of [-1,1]){const leaf=group(g,s*opening/4,0,0);box(leaf,0,1.02,0,opening/2-.025,2.04,.18,steel,true);box(leaf,0,1.06,.11,.52,1.38,.08,dark);box(leaf,0,1.06,.17,.43,1.24,.03,panel);box(leaf,0,1.65,.2,.055,.42,.03,amber);box(leaf,-s*.3,.82,.2,.065,.35,.04,black);leaves.push({node:leaf,sign:s});}
 const hit=box(g,0,1.08,0,1.8,2.16,.5,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
 const door={name,group:g,leaves,open:true,amount:1,button:null,hit};hit.userData.door=door;interactable.push(hit);doors.push(door);return door;
}
doorway('駕駛艙',-8.6,0,9.6,Math.PI/2);doorway('中央通道',-4.25,0,2.45,Math.PI/2);
doorway('餐飲艙',-1.75,-1.25,5);doorway('動力艙',4,-1.25,6.5);doorway('工作艙',10.5,-1.25,6.3);
doorway('醫療／通訊',-2.5,1.25,3.3);doorway('休息艙',1.25,1.25,4.2);doorway('衛生艙',4.65,1.25,2.6);doorway('貨物艙',10,1.25,8.1);
for(const x of [-4.25,.8,7.3])wallSegment(partitions,x,-3.13,3.75,2.3,Math.PI/2);
for(const x of [-4.25,-.85,3.4])wallSegment(partitions,x,3.12,3.75,2.3,Math.PI/2);
// Move the sanitary/cargo divider into the central corridor at the same station.
wallSegment(partitions,5.95,0,2.5,2.3,Math.PI/2);
// Fixed bridge console wraps around the bow; it is deliberately absent from equipment toggles.
function consoleBank(parent,x,z,angle=0,n=3){const g=group(parent,x,0,z);g.rotation.y=angle;box(g,0,.52,0,n*.95,1.04,.85,dark);box(g,0,1.06,.05,n*.99,.16,1.04,steel);for(let i=0;i<n;i++){const px=(i-(n-1)/2)*.95;const m=monitor(g,px,1.46,-.25,.81,.55,'FLIGHT');m.rotation.x=-.27;box(g,px,1.17,.29,.72,.035,.3,black);for(let k=0;k<4;k++)box(g,px-.25+k*.16,1.195,.35,.085,.015,.03,k===3?amber:cyan);}return g;}
// Only the forward pilot console has a worktop. Side bays are floor/wall installations.
const consolePath=[[-12.75,2.36],[-13.56,.55],[-13.56,-.55],[-12.75,-2.36]];
function offsetPath(path,distance){return path.map((p,i)=>{const normal=(a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);return [-dz/l,dx/l];};const n0=normal(path[Math.max(0,i-1)],path[i===0?1:i]),n1=normal(path[i===path.length-1?i-1:i],path[Math.min(path.length-1,i+1)]),sx=n0[0]+n1[0],sz=n0[1]+n1[1],scale=distance/(sx*n1[0]+sz*n1[1]);return [p[0]+sx*scale,p[1]+sz*scale];});}
polygonDeck(bridge,[...offsetPath(consolePath,.42),...offsetPath(consolePath,-.42).reverse()],0,1.04,dark);
polygonDeck(bridge,[...offsetPath(consolePath,.53),...offsetPath(consolePath,-.53).reverse()],1.04,.14,steel);
for(const i of [0,2]){
 const a=consolePath[i],b=consolePath[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),g=group(bridge,(a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=-Math.atan2(dz,dx);
 for(let j=0;j<2;j++){const px=(j-.5)*length/2,m=monitor(g,px,1.49,-.21,.80,.53,'FLIGHT');m.name='bridge-flight-computer';m.rotation.x=-.27;box(g,px,1.195,.26,.85,.025,.32,black);for(let k=0;k<4;k++)box(g,px+(k-1.5)*.13,1.214,.31,.075,.015,.03,k===3?amber:cyan);}
}
// Service bays have their own frames, floor anchors and connected utility routes.
const bridgeSystems=[];
function bridgeServiceBay(a,b,side){
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),g=group(ship,(a[0]+b[0])/2-dz/length*.39,0,(a[1]+b[1])/2+dx/length*.39);g.rotation.y=-Math.atan2(dz,dx);g.name='bridge-service-bay';
 const rackX=side===0?-1.68:1.65,pumpX=-rackX*.83;
 // Load-bearing rails and diagonal brackets remain with the hardware when hull is hidden.
 for(const x of [-2.15,-.65,.65,2.15]){box(g,x,1.13,-.08,.10,2.26,.14,trim);box(g,x,.06,.24,.28,.12,.78,dark);bar(g,[x,.18,.5],[x,.65,-.08],.065,steel);}
 box(g,0,2.20,-.03,4.52,.16,.24,dark);box(g,0,.16,-.12,4.52,.12,.16,steel);
 // Tall floor-mounted avionics cabinet with removable modules and cooling fan.
 box(g,rackX,.11,.28,1.22,.22,.90,black);box(g,rackX,1.16,.16,1.10,2.1,.64,dark);
 for(const x of [-.49,.49])box(g,rackX+x,1.19,.50,.075,2.05,.07,trim);
 for(let i=0;i<4;i++){const y=.40+i*.33;box(g,rackX,y,.52,.88,.27,.10,i%2?steel:panel);for(let k=0;k<5;k++)box(g,rackX-.31+k*.15,y,.58,.08,.12,.025,black);box(g,rackX-.35,y,.62,.055,.06,.03,amber);box(g,rackX+.34,y,.61,.06,.17,.055,trim);}
 const fan=cyl(g,rackX,1.89,.54,.23,.08,black,24);fan.rotation.x=Math.PI/2;torus(g,rackX,1.89,.60,.235,.03,trim);for(let k=0;k<6;k++){const blade=box(g,rackX,1.89,.61,.34,.045,.02,steel);blade.rotation.z=k*Math.PI/3;}
 // Suspended duct and stepped wall-mounted junction box with visible brackets.
 box(g,0,2.05,.16,1.42,.36,.52,steel);for(let x=-.56;x<.65;x+=.16)box(g,x,2.05,.44,.06,.27,.04,dark);
 box(g,pumpX,1.70,.02,1.08,.70,.44,side===0?olive:panel);box(g,pumpX,1.70,.26,.87,.52,.035,dark);
 for(const x of [-.36,.36]){bar(g,[pumpX+x,1.24,-.12],[pumpX+x,1.42,.30],.07,trim);box(g,pumpX+x,1.72,.30,.10,.28,.09,steel);}
 for(let i=0;i<3;i++){box(g,pumpX-.23+i*.23,1.75,.30,.11,.19,.05,steel);box(g,pumpX-.23+i*.23,1.57,.32,.04,.07,.03,i===0?amber:red);}
 // Exposed low pump assembly, motor housing and bolted skid, not a tabletop prop.
 box(g,pumpX,.12,.48,1.24,.20,.89,steel);
 for(const x of [-.42,.42])box(g,pumpX+x,.34,.47,.15,.34,.64,dark);
 const motor=cyl(g,pumpX,.52,.48,.26,.81,steel,24);motor.rotation.z=Math.PI/2;
 for(const x of [-.38,-.18,.04,.27]){const ring=torus(g,pumpX+x,.52,.48,.27,.035,dark);ring.rotation.y=Math.PI/2;}
 const piston=cyl(g,pumpX+.54,.52,.48,.10,.38,trim,16);piston.rotation.z=Math.PI/2;
 // Vertical pressure vessels, restraining bands, and a manifold linked to the pump.
 for(const x of [-.32,.27]){cyl(g,x,.81,.38,.17,1.19,side===0?copper:steel);for(const y of [.35,1.15]){const band=torus(g,x,y,.38,.18,.026,dark);band.rotation.x=Math.PI/2;}cyl(g,x,1.44,.38,.07,.13,trim);pipe(g,[[x,1.48,.38],[x,1.67,.37],[pumpX*.55,1.67,.37],[pumpX*.55,.62,.48],[pumpX,.62,.48]],.044,copper);}
 // Cable ladder, rising feeds, pipe elbows and retaining clips connect the entire bay.
 for(const y of [.24,1.02,1.86]){pipe(g,[[rackX,y,.01],[rackX*.60,y,.01],[rackX*.48,y+.12,.01],[pumpX,y+.12,.01]],.04,y===1.02?copper:black);}
 for(let x=-2.05;x<2.1;x+=.28)box(g,x,2.33,.04,.055,.06,.38,trim);
 for(const z of [-.07,.08,.20])pipe(g,[[-2.2,2.34,z],[-.6,2.34,z],[.5,2.34,z],[2.17,2.34,z],[2.17,.35,z]],.034,z<0?copper:black);
 bridgeSystems.push({name:side===0?'駕駛艙左側機電系統':'駕駛艙右側機電系統',group:g,button:null});
}
bridgeServiceBay(outline[1],outline[2],0);bridgeServiceBay(outline[7],outline[8],1);
let bridgeComputerCount=0;bridge.traverse(o=>{if(o.name==='bridge-flight-computer')bridgeComputerCount++;});host.dataset.bridgeComputers=String(bridgeComputerCount);
const props=[...bridgeSystems];
function equipment(name,x,z,build){const g=group(ship,x,0,z);build(g);const record={name,group:g,button:null};props.push(record);return g;}
function chair(g,x=0,z=0,angle=0){const q=group(g,x,0,z);q.rotation.y=angle;cyl(q,0,.12,0,.4,.14,dark);cyl(q,0,.42,0,.11,.55,steel);box(q,0,.73,0,.7,.2,.74,dark);box(q,0,.86,0,.61,.11,.65,mat('seat',0x344c57,.15,.8));box(q,0,1.21,-.28,.67,.65,.18,steel);box(q,0,1.25,-.16,.52,.45,.075,mat('seat',0x344c57));for(const s of [-1,1])box(q,s*.39,1.03,0,.12,.13,.62,black);box(q,0,1.63,-.29,.43,.2,.19,dark);return q;}
equipment('駕駛座椅',-11.25,0,g=>{chair(g,0,-1.08,-Math.PI/2);chair(g,0,1.08,-Math.PI/2);});
equipment('航圖全息圓桌',-6.5,0,g=>{cyl(g,0,.37,0,.85,.7,dark,12);cyl(g,0,.82,0,1.25,.2,steel,12);cyl(g,0,.94,0,1.07,.045,black,32);const ring=torus(g,0,.98,0,.86,.028,cyan);ring.rotation.x=Math.PI/2;const ring2=torus(g,0,.98,0,.51,.018,cyan);ring2.rotation.x=Math.PI/2;cyl(g,0,1,0,.19,.05,cyan,24);for(let a=0;a<Math.PI*2;a+=Math.PI/4){box(g,Math.cos(a)*1.07,.97,Math.sin(a)*1.07,.16,.07,.14,cyan);const m=monitor(g,Math.cos(a)*1.07,1.13,Math.sin(a)*1.07,.3,.18,'MAP');m.lookAt(g.position.x,1.13,g.position.z);}const holo=new THREE.Mesh(new THREE.ConeGeometry(.43,.78,24,1,true),new THREE.MeshBasicMaterial({color:0x36cbef,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}));holo.position.y=1.4;g.add(holo);});
equipment('指揮監測終端',-6.55,-4.15,g=>{consoleBank(g,0,0,0,3);chair(g,0,1.05);});
equipment('醫療檢測台',-6.55,3.6,g=>{box(g,0,.45,0,2.5,.85,.8,steel);box(g,0,.91,0,2.65,.14,.95,cream);box(g,-.75,1.05,0,.6,.12,.6,dark);box(g,-.75,1.12,0,.4,.02,.2,cyan);box(g,.7,.72,.44,.55,.25,.04,black);});
equipment('餐飲艙料理台',-1.7,-4.23,g=>{box(g,0,.52,0,3.6,1.04,1.05,cream);box(g,0,1.09,0,3.8,.15,1.15,trim);for(let x=-1.4;x<1.6;x+=.7){box(g,x,.52,.55,.64,.77,.04,dark);box(g,x,.55,.58,.55,.64,.03,steel);box(g,x,.82,.62,.27,.04,.04,trim);}box(g,.65,1.185,0,.9,.06,.65,black);box(g,.65,1.215,0,.64,.015,.43,steel);pipe(g,[[.7,1.2,-.3],[.7,1.55,-.3],[.7,1.65,0],[.7,1.45,.12]],.04,trim);for(let x=-1.25;x<0;x+=.5){const b=torus(g,x,1.2,0,.18,.027,dark);b.rotation.x=Math.PI/2;}box(g,0,2.07,-.25,3.7,.5,.55,cream);box(g,0,1.78,0,3.1,.035,.06,amber);});
equipment('餐桌與沙發',-1.65,-2.55,g=>{box(g,0,.42,-.27,2.95,.64,.75,dark);box(g,0,.77,-.3,2.85,.2,.65,cushion);box(g,0,1.09,-.64,3,.63,.19,cushion);for(let x=-1.0;x<1.2;x+=.7)box(g,x,1.09,-.52,.035,.6,.015,dark);box(g,0,.97,.52,2.25,.12,.9,cream);for(const x of [-.8,.8])box(g,x,.48,.52,.12,.96,.55,steel);for(const x of [-.65,.55])cyl(g,x,1.1,.5,.09,.18,copper);cyl(g,0,1.08,.57,.2,.1,olive);});
equipment('餐飲艙冷藏櫃',.12,-3.3,g=>{box(g,0,1.0,0,.65,2,.85,dark);box(g,0,1.01,.45,.55,1.84,.04,panel);box(g,0,1.25,.49,.57,.025,.02,dark);box(g,-.15,1.05,.5,.035,.22,.04,trim);});
equipment('反應爐總成',4,-3.2,g=>{
 box(g,0,.16,0,3.8,.3,2.7,dark);for(const x of [-1.2,1.2])box(g,x,.48,0,.36,.65,2.2,steel);
 const drum=cyl(g,0,1.26,0,1.0,3.1,steel,32);drum.rotation.z=Math.PI/2;
 for(const x of [-1.58,-1.28,-.7,0,.7,1.28,1.58]){const ring=torus(g,x,1.26,0,1.025,.075,x===0?dark:trim);ring.rotation.y=Math.PI/2;}
 for(const x of [-1.59,1.59]){const disk=cyl(g,x,1.26,0,.75,.05,dark);disk.rotation.z=Math.PI/2;const hub=cyl(g,x*1.02,1.26,0,.34,.06,steel);hub.rotation.z=Math.PI/2;for(let a=0;a<6.28;a+=Math.PI/4)box(g,x,1.26+Math.sin(a)*.87,Math.cos(a)*.87,.08,.11,.1,mat('yellow',0xc29439));}
 for(const z of [-1.15,1.15]){bar(g,[-1.85,.3,z],[-1.85,1.07,z],.045,mat('yellow',0xc29439));bar(g,[1.85,.3,z],[1.85,1.07,z],.045,mat('yellow',0xc29439));bar(g,[-1.85,1.07,z],[1.85,1.07,z],.045,mat('yellow',0xc29439));}
});
equipment('動力艙管路',4,-4.66,g=>{for(let i=0;i<4;i++){const y=.55+i*.47;pipe(g,[[-2.3,.2,0],[-2.3,y,0],[-1.9,y+.22,0],[1.7,y+.22,0],[2.15,y,0],[2.15,.3,0]],.085,i%2?steel:copper);for(const x of [-1.6,.3,1.4])box(g,x,y+.22,0,.1,.23,.23,dark);}box(g,-2.38,1.15,.12,.7,1.35,.5,dark);monitor(g,-2.38,1.4,.4,.48,.35,'POWER');});
equipment('工作台與工具牆',10.5,-4.15,g=>{box(g,0,.51,0,3.8,1.02,.95,dark);box(g,0,1.09,0,4,.16,1.15,cream);box(g,-1.45,.52,.52,.9,.95,.1,red);for(let y=.2;y<1;y+=.2){box(g,-1.45,y,.59,.8,.035,.04,trim);}box(g,0,1.65,-.4,3.8,1.0,.12,dark);for(let x=-1.5;x<1.8;x+=.25){bar(g,[x,1.35,-.29],[x+.04,1.8,-.29],.04,trim);}monitor(g,-.9,1.87,-.28,.8,.45,'FAB');for(const x of [.35,.8,1.25])cyl(g,x,1.24,0,.12,.18,copper);box(g,.8,1.23,.23,.6,.15,.4,steel);box(g,.8,1.72,.0,.12,.8,.13,steel);});
equipment('機械加工設備',11.5,-2.35,g=>{box(g,0,.5,0,1.0,1.0,1.0,dark);box(g,0,1.1,0,1.3,.2,1.15,steel);box(g,.34,1.65,-.26,.3,1.1,.38,dark);box(g,.05,2.15,-.26,.87,.24,.5,steel);cyl(g,-.21,1.9,-.15,.09,.4,trim);box(g,-.2,1.25,0,.4,.13,.6,copper);});
equipment('通訊工作站',-2.5,3.7,g=>{const c=consoleBank(g,0,0,Math.PI,2);chair(g,0,-1.0,Math.PI);});
equipment('休息艙床鋪',1.2,3.95,g=>{box(g,0,.37,0,2.95,.5,1.1,dark);box(g,0,.69,0,2.8,.21,1.0,olive);box(g,-.93,.84,0,.72,.16,.82,cream);box(g,.47,.81,0,1.7,.07,1.01,mat('blanket',0x627f80,.05,.98));box(g,-1.47,.78,0,.1,1,1.22,steel);box(g,1.8,.48,0,.48,.9,.83,steel);monitor(g,1.8,1.15,-.1,.38,.25,'LIFE');});
equipment('衛生設備',4.65,3.82,g=>{box(g,0,.12,0,1.8,.16,1.5,steel);const bowl=cyl(g,.13,.46,.22,.39,.5,cream,24);cyl(g,.13,.73,.22,.3,.07,dark);box(g,.13,.85,-.25,.68,.72,.25,cream);box(g,-.6,1.0,-.4,.6,.16,.55,cream);box(g,-.6,1.6,-.65,.62,.65,.055,trim);});
function crate(g,x,z,w=1,h=.8,m=olive){box(g,x,h/2,z,w,h,w,m,true);box(g,x,h+.01,z,w*.82,.06,w*.82,m);for(const s of [-1,1]){box(g,x+s*w*.37,h/2,z,.09,h+.08,w+.04,dark);box(g,x,h*.62,z+s*(w/2+.015),w*.37,.12,.045,black);}box(g,x,h+.05,z,.3,.02,.15,cream);}
equipment('貨艙貨箱',10.25,3.65,g=>{crate(g,-1.75,0,1.5,1.0,steel);box(g,-1.75,.6,.76,.18,1.15,.04,red);crate(g,.5,.05,.94,1.15);crate(g,1.6,.1,.9,.8);crate(g,-.1,-1.0,.85,.7,steel);});
equipment('貨艙儲罐',8,4.05,g=>{for(let i=0;i<2;i++){cyl(g,i*.72,.55,0,.31,1.07,steel);for(const y of [.12,.9]){const t=torus(g,i*.72,y,0,.315,.038,dark);t.rotation.x=Math.PI/2;}cyl(g,i*.72,1.12,0,.12,.07,trim);}});
equipment('後艙備用箱',12.4,-2.8,g=>{crate(g,0,0,.82,.8);crate(g,-.2,-.8,.7,.65);});
// Installation detail belongs to its equipment toggle, including its supports and feeds.
function retrofit(name,build){const p=props.find(p=>p.name===name);const g=group(p.group,-p.group.position.x,0,-p.group.position.z);build(g);}
function anchorFeet(g,x,z,w,d){for(const sx of [-1,1])for(const sz of [-1,1]){box(g,x+sx*w/2,.065,z+sz*d/2,.18,.13,.18,dark);cyl(g,x+sx*w/2,.14,z+sz*d/2,.035,.025,trim,8);}}
function rack(g,x,z,w=.7,h=1.9,angle=0){const q=group(g,x,0,z);q.rotation.y=angle;box(q,0,.11,0,w+.16,.22,.76,black);box(q,0,h/2,0,w,h,.58,dark);for(const s of [-1,1])box(q,s*(w/2-.04),h/2,.32,.06,h,.07,trim);for(let y=.36;y<h-.12;y+=.32){box(q,0,y,.33,w-.17,.24,.06,steel);for(let k=0;k<4;k++)box(q,(k-1.5)*(w-.22)/4,y,.37,.05,.13,.015,black);box(q,-w*.3,y,.385,.035,.045,.015,amber);}anchorFeet(q,0,0,w,.54);return q;}
function wallUnit(g,x,y,z,w,h,angle=0,m=steel){const q=group(g,x,y,z);q.rotation.y=angle;box(q,0,0,0,w,h,.28,m);box(q,0,0,.16,w-.13,h-.13,.035,dark);for(const sx of [-1,1]){box(q,sx*(w/2+.035),0,-.10,.07,h+.13,.14,trim);bar(q,[sx*w*.32,-h*.5,-.13],[sx*w*.32,-h*.5-.18,.20],.045,steel);}for(let px=-w*.32;px<w*.4;px+=.14)box(q,px,0,.19,.06,h*.56,.035,steel);return q;}
function tray(g,a,b,y){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),q=group(g,(a[0]+b[0])/2,y,(a[1]+b[1])/2);q.rotation.y=-Math.atan2(dz,dx);for(const z of [-.16,.16])box(q,0,0,z,length,.09,.05,steel);for(let x=-length/2;x<=length/2;x+=.24)box(q,x,-.045,0,.05,.035,.36,trim);for(const z of [-.08,.02,.10])pipe(q,[[-length/2,.025,z],[0,.025,z],[length/2,.025,z]],.024,z<0?copper:black);}
function valve(g,x,y,z,r=.13){torus(g,x,y,z,r,.023,copper);bar(g,[x-r,y,z],[x+r,y,z],.025,copper);bar(g,[x,y-r,z],[x,y+r,z],.025,copper);}
// Command room: anchored avionics rack, wall distribution, and deck-fed holographic table.
retrofit('指揮監測終端',g=>{
 rack(g,-7.93,-3.87,.64,2.05);wallUnit(g,-5.12,1.86,-4.58,.82,.56);tray(g,[-8,-4.52],[-4.7,-4.52],2.35);
 pipe(g,[[-7.94,2.12,-3.87],[-7.94,2.34,-4.43],[-5.1,2.34,-4.43],[-5.1,1.86,-4.43]],.045,black);
 for(const x of [-7.1,-6.1])pipe(g,[[x,.70,-4.3],[x,.20,-4.3],[x,.16,-3.67]],.045,copper);
 anchorFeet(g,-6.55,-4.15,2.65,.70);
});
retrofit('航圖全息圓桌',g=>{for(let a=0;a<6.28;a+=Math.PI/2){const x=-6.5+Math.cos(a)*.88,z=Math.sin(a)*.88;box(g,x,.09,z,.27,.16,.27,steel);bar(g,[x,.13,z],[-6.5+Math.cos(a)*.65,.58,Math.sin(a)*.65],.065,trim);}box(g,-6.5,.03,-1.56,.31,.04,1.40,dark);pipe(g,[[-6.5,.08,-2.15],[-6.5,.08,-1.2],[-6.5,.44,-.78]],.05,black);});
// Medical station: floor-mounted scan mast, articulated head and wall-mounted supplies.
retrofit('醫療檢測台',g=>{
 anchorFeet(g,-6.55,3.6,2.28,.67);box(g,-7.87,.11,4.12,.48,.22,.56,steel);box(g,-7.87,1.13,4.12,.19,2.1,.22,trim);
 bar(g,[-7.87,2.12,4.12],[-6.98,2.12,4.12],.13,steel);bar(g,[-6.98,2.12,4.12],[-6.55,1.9,3.64],.11,trim);box(g,-6.55,1.85,3.64,.59,.17,.4,cream);box(g,-6.55,1.755,3.64,.37,.025,.22,cyan);
 wallUnit(g,-5.2,1.72,4.61,.93,.83,Math.PI,cream);wallUnit(g,-6.6,2.13,4.6,1.3,.31,Math.PI);
 for(const x of [-5.05,-5.4]){cyl(g,x,.65,4.30,.12,1.15,cream);pipe(g,[[x,1.25,4.3],[x,1.47,4.32],[-5.8,1.47,4.32],[-5.8,.55,4.0]],.028,copper);}tray(g,[-7.95,4.5],[-4.9,4.5],2.39);
});
// Galley: extraction trunk, under-counter filtration and hard-mounted water connections.
retrofit('餐飲艙料理台',g=>{
 anchorFeet(g,-1.7,-4.23,3.38,.86);box(g,-2.75,2.45,-4.48,.62,.34,.46,steel);pipe(g,[[-2.75,2.35,-4.46],[-2.75,2.53,-4.46],[-3.6,2.53,-4.46],[-3.78,.24,-4.46]],.105,steel);
 for(const x of [-1.2,-.83]){cyl(g,x,.40,-3.78,.115,.48,cream);pipe(g,[[x,.65,-3.78],[x,.8,-3.78],[-1,.8,-3.73],[-1,1.1,-4.23]],.026,copper);}
 box(g,-2.7,.24,-3.71,1.04,.22,.19,dark);for(let x=-3.13;x<-2.22;x+=.12)box(g,x,.24,-3.60,.045,.15,.03,steel);
});
retrofit('餐飲艙冷藏櫃',g=>{anchorFeet(g,.12,-3.3,.57,.75);box(g,.48,.50,-3.56,.22,.8,.4,black);pipe(g,[[.48,.85,-3.56],[.48,2.23,-3.56],[.42,2.35,-4.53],[-.15,2.35,-4.53]],.04,copper);wallUnit(g,.34,1.81,-4.58,.48,.58);});
retrofit('餐桌與沙發',g=>{anchorFeet(g,-1.65,-2.03,1.6,.53);for(const x of [-2.9,-.4])bar(g,[x,.06,-2.93],[x,.54,-2.93],.075,steel);});
// Power room: isolated pump skid, service valves and routed connections to the reactor.
retrofit('反應爐總成',g=>{
 anchorFeet(g,4,-3.2,3.5,2.35);box(g,1.55,.16,-3.25,.71,.28,1.52,dark);for(const z of [-3.68,-2.9]){const p=cyl(g,1.55,.49,z,.24,.49,steel);p.rotation.x=Math.PI/2;}
 pipe(g,[[1.55,.52,-2.68],[1.55,.85,-2.36],[2.17,.85,-2.36],[2.45,1.2,-2.7]],.085,copper);valve(g,1.55,.94,-2.3,.16);
 pipe(g,[[1.55,.53,-3.96],[1.55,1.12,-4.30],[2.45,1.12,-4.30],[2.65,1.28,-3.95]],.08,steel);
});
retrofit('動力艙管路',g=>{wallUnit(g,4.6,2.02,-4.51,1.42,.64);tray(g,[1.2,-4.34],[6.8,-4.34],2.52);for(const x of [1.3,3,5.8,6.65]){box(g,x,1.22,-4.75,.10,2.35,.12,trim);box(g,x,.08,-4.53,.32,.16,.45,steel);}pipe(g,[[6.6,2.4,-4.34],[6.6,1.30,-4.34],[6.3,1.12,-3.8]],.08,copper);valve(g,6.6,1.5,-4.15);});
// Fabrication room: anchored press, wall hose reel, compressor and overhead supply line.
retrofit('工作台與工具牆',g=>{
 anchorFeet(g,10.5,-4.15,3.6,.80);tray(g,[7.8,-4.43],[12.75,-4.43],2.47);wallUnit(g,12.57,1.8,-4.53,.60,.81,0,olive);
 for(const x of [8.75,10.5,12.15]){box(g,x,1.74,-4.52,.07,1.36,.11,trim);bar(g,[x,1.0,-4.5],[x,1.0,-3.72],.055,steel);}
 const reel=cyl(g,8.35,1.69,-4.15,.24,.23,dark);reel.rotation.x=Math.PI/2;torus(g,8.35,1.69,-3.99,.27,.04,copper);
 pipe(g,[[8.35,1.69,-3.94],[8.20,1.15,-3.90],[8.48,.30,-3.72],[9.15,.30,-3.72],[9.15,1.08,-3.79]],.04,black);
});
retrofit('機械加工設備',g=>{
 anchorFeet(g,11.5,-2.35,1.06,.91);box(g,11.5,.06,-2.35,1.46,.10,1.37,steel);
 box(g,8.15,.11,-3.00,.67,.22,1.04,dark);const tank=cyl(g,8.15,.57,-3.0,.28,.9,steel);tank.rotation.x=Math.PI/2;box(g,8.15,.94,-3,.41,.25,.46,dark);
 pipe(g,[[8.15,.72,-3.43],[8.15,2.35,-4.3],[11.84,2.35,-4.3],[11.84,2.18,-2.61]],.055,copper);
 pipe(g,[[11.86,2.1,-2.65],[12.1,1.6,-2.88],[12.1,.19,-2.88],[11.5,.19,-2.74]],.045,black);
});
// Communications room: narrow floor rack, wall switchgear and clamped data cable ladder.
retrofit('通訊工作站',g=>{
 rack(g,-3.77,4.12,.49,2.0,Math.PI);wallUnit(g,-2.4,1.86,4.6,1.31,.78,Math.PI);tray(g,[-3.91,4.5],[-1.18,4.5],2.38);
 pipe(g,[[-3.77,1.95,4.13],[-3.77,2.34,4.38],[-2.4,2.34,4.38],[-2.4,1.86,4.38]],.044,black);for(const x of [-3.1,-2])pipe(g,[[x,.64,3.82],[x,.2,4.27],[x,1.44,4.45]],.035,black);anchorFeet(g,-2.5,3.7,1.75,.74);
});
// Quarters: secured bunk, high lockers and ventilation duct instead of extra worktops.
retrofit('休息艙床鋪',g=>{
 anchorFeet(g,1.2,3.95,2.7,.89);wallUnit(g,.12,1.98,4.62,1.1,.43,Math.PI);wallUnit(g,1.48,1.99,4.62,1.15,.69,Math.PI,olive);
 for(const x of [-.18,2.57]){box(g,x,1.02,4.51,.07,1.88,.12,trim);bar(g,[x,.23,4.49],[x,.23,3.51],.06,steel);}
 box(g,2.96,1.04,4.31,.43,2.03,.61,dark);box(g,2.96,1.1,3.985,.33,1.77,.04,olive);box(g,2.86,1.15,3.95,.035,.24,.05,trim);
 tray(g,[-.45,4.51],[3.1,4.51],2.43);pipe(g,[[.12,2.16,4.44],[.12,2.4,4.44],[2.88,2.4,4.44],[2.88,1.9,4.44]],.07,steel);
});
// Sanitation: wall-mounted water treatment, separate supply/return, and deck drain.
retrofit('衛生設備',g=>{
 wallUnit(g,4.93,1.82,4.58,.84,.84,Math.PI,cream);box(g,5.49,.49,4.29,.36,.87,.42,steel);anchorFeet(g,5.49,4.29,.31,.36);
 for(const x of [4.62,4.9]){pipe(g,[[x,1.5,4.38],[x,.33,4.38],[4.8,.22,4.13],[4.8,.42,3.89]],.038,x<4.8?copper:steel);valve(g,x,1.22,4.31,.08);}
 pipe(g,[[4.07,.91,3.42],[4.07,.43,3.42],[4.07,.19,4.30],[5.49,.19,4.30],[5.49,.48,4.30]],.065,steel);
 box(g,4.63,.04,2.9,.64,.04,.44,dark);for(let x=4.38;x<4.9;x+=.10)box(g,x,.07,2.9,.035,.022,.37,trim);wallUnit(g,4.66,2.34,4.6,.97,.24,Math.PI);
});
// Cargo: deck tie-downs, wall docking hardware and a supported lifting rail.
retrofit('貨艙貨箱',g=>{
 for(const x of [8.5,10.75,11.85]){box(g,x,.06,3.7,.12,.10,1.7,dark);for(const z of [2.94,4.48]){const r=torus(g,x,.14,z,.10,.023,trim);r.rotation.x=Math.PI/2;}}
 for(const x of [6.6,12.1]){box(g,x,1.23,4.54,.15,2.4,.19,trim);box(g,x,.08,4.54,.42,.16,.5,dark);bar(g,[x,2.1,4.54],[x,2.37,3.91],.09,steel);}
 box(g,9.35,2.41,3.91,5.6,.21,.22,steel);box(g,10.28,2.27,3.91,.53,.24,.43,dark);cyl(g,10.28,2.02,3.91,.026,.35,trim);const hook=torus(g,10.28,1.79,3.91,.13,.03,copper);
 wallUnit(g,10.43,1.77,4.59,1.68,.65,Math.PI);tray(g,[6.5,4.51],[12.15,4.51],2.58);
 pipe(g,[[10.43,1.44,4.4],[10.43,.28,4.4],[11.84,.28,4.4],[11.84,.6,4.12]],.043,black);
});
retrofit('貨艙儲罐',g=>{box(g,8.36,.065,4.05,1.51,.12,.83,steel);for(const x of [7.7,8.98]){box(g,x,.64,4.39,.075,1.3,.085,trim);bar(g,[x,1.19,4.39],[x,1.19,3.71],.05,steel);}box(g,8.36,.63,3.7,1.42,.11,.055,dark);wallUnit(g,7.82,1.86,4.6,.83,.61,Math.PI);for(const x of [8,8.72])pipe(g,[[x,1.15,4.05],[x,1.44,4.1],[7.82,1.44,4.4],[7.82,1.83,4.4]],.033,copper);});
retrofit('後艙備用箱',g=>{for(const z of [-2.8,-3.6]){box(g,12.4,.045,z,1.15,.07,.08,steel);for(const x of [11.88,12.92])cyl(g,x,.1,z,.06,.06,dark,8);}});
// Ship ribs, fixed service luminaires and transverse structural accents.
for(const x of [-8.6,-4.25,.8,7.3,12.5]){for(const z of [-4.78,4.78]){const side=z<0?port:starboard;box(side,x,1.27,z,.36,2.66,.54,trim);box(side,x,1.25,z+(z<0?.31:-.31),.15,1.75,.055,dark);}}
for(let x=-3;x<13;x+=2.2){for(const z of [-1.05,1.05])box(ship,x,.075,z,.26,.045,.07,amber);}
// A subdued plinth helps the silhouette read without introducing a fake floor plan.
const plinth=box(scene,0,-.94,0,29.1,.2,11.15,mat('plinth',0x0c1720,.3,.8));plinth.receiveShadow=true;
starboard.visible=false;
const outlineGroup=new THREE.Group();ship.add(outlineGroup);const grid=new THREE.GridHelper(30,30,0x63bbc5,0x34505c);grid.position.y=.065;grid.material.transparent=true;grid.material.opacity=.28;outlineGroup.add(grid);outlineGroup.visible=false;

function stateReport(){const open=doors.filter(d=>d.open).length,visible=props.filter(p=>p.group.visible).length;status.textContent=`艙門 ${open}/${doors.length} 開啟 · 設備 ${visible}/${props.length} 顯示`;host.dataset.doorsOpen=String(open);host.dataset.propsVisible=String(visible);host.dataset.port=String(port.visible);host.dataset.starboard=String(starboard.visible);host.dataset.drawcalls=String(renderer.info.render.calls);document.querySelector('#all-doors').textContent=open===doors.length?'全部關閉':'全部開啟';document.querySelector('#all-props').textContent=visible===props.length?'全部隱藏':'全部顯示';}
function toggle(container,label,get,set,on='顯示',off='隱藏'){
 const b=document.createElement('button');b.className='toggle';b.type='button';b.innerHTML=`<span>${label}</span><span class="lamp"></span>`;b.setAttribute('aria-label',label);function sync(){b.setAttribute('aria-pressed',String(get()));b.querySelector('.lamp').textContent=get()?on:off;}b.addEventListener('click',()=>{set(!get());sync();stateReport();});document.querySelector(container).append(b);sync();return {button:b,sync};
}
const hullControls=[];
for(const [label,g] of [['左舷外壁（後側）',port],['右舷外壁（前側）',starboard],['內部隔間與門框',partitions],['地面比例網格',outlineGroup]])hullControls.push(toggle('#hull-controls',label,()=>g.visible,v=>g.visible=v));
for(const door of doors){const t=toggle('#door-controls',door.name,()=>door.open,v=>{door.open=v;},'開啟','關閉');door.button=t.button;door.sync=t.sync;}
for(const p of props){const t=toggle('#prop-controls',p.name,()=>p.group.visible,v=>p.group.visible=v);p.button=t.button;p.sync=t.sync;}
document.querySelector('#all-doors').onclick=()=>{const value=!doors.every(d=>d.open);for(const d of doors){d.open=value;d.sync();}document.querySelector('#all-doors').textContent=value?'全部關閉':'全部開啟';stateReport();};
document.querySelector('#all-props').onclick=()=>{const value=!props.every(p=>p.group.visible);for(const p of props){p.group.visible=value;p.sync();}document.querySelector('#all-props').textContent=value?'全部隱藏':'全部顯示';stateReport();};
function view(name){orbit.target.set(0,.5,0);camera.zoom=1;camera.up.set(0,1,0);if(name==='bridge'){orbit.target.set(-11.2,.8,0);camera.position.set(-2.2,14,14);camera.zoom=2.65;}else if(name==='top'){camera.position.set(0,40,.001);}else if(name==='reverse'){camera.position.set(-19,25,-30);}else camera.position.set(19,25,30);camera.lookAt(orbit.target);orbit.update();fit();host.dataset.view=name;}
document.querySelector('#bridge-view').onclick=()=>view('bridge');
function fit(){const w=host.clientWidth,h=host.clientHeight,aspect=w/h,span=Math.max(19,35/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(w,h);}
document.querySelector('#iso').onclick=()=>view('iso');document.querySelector('#top').onclick=()=>view('top');document.querySelector('#reverse').onclick=()=>view('reverse');document.querySelector('#closer').onclick=()=>{camera.zoom=Math.min(4,camera.zoom*1.2);camera.updateProjectionMatrix();};document.querySelector('#farther').onclick=()=>{camera.zoom=Math.max(.5,camera.zoom/1.2);camera.updateProjectionMatrix();};
document.querySelector('#reset').onclick=()=>{for(const d of doors){d.open=true;d.sync();}for(const p of props){p.group.visible=true;p.sync();}port.visible=true;starboard.visible=false;partitions.visible=true;outlineGroup.visible=false;hullControls.forEach(h=>h.sync());document.querySelector('#all-doors').textContent='全部關閉';document.querySelector('#all-props').textContent='全部隱藏';view('iso');stateReport();};
// Raycast only door apertures, and reject blocked hits through the surrounding geometry.
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;down=null;if(!partitions.visible)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObject(ship,true).filter(hit=>{let o=hit.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});const hit=hits.find(h=>h.object.userData.door);if(!hit)return;const blocker=hits.find(h=>!h.object.userData.door&&h.distance<hit.distance-.35);if(blocker)return;const door=hit.object.userData.door;door.open=!door.open;door.sync();stateReport();});renderer.domElement.addEventListener('pointercancel',()=>down=null);
// One directional owner for all preview controls; no secondary cursor or native focus ring.
let focusIndex=0,owner='mouse';const buttons=[...document.querySelectorAll('button')];
function own(mode){owner=mode;document.body.dataset.owner=mode;buttons.forEach((b,i)=>b.dataset.selected=String(mode==='directional'&&i===focusIndex));}
function navigate(delta){focusIndex=(focusIndex+delta+buttons.length)%buttons.length;own('directional');buttons[focusIndex].focus({preventScroll:true});buttons[focusIndex].scrollIntoView({block:'nearest'});}
document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&(e.movementX||e.movementY))own('mouse');});document.addEventListener('pointerdown',e=>own(e.pointerType==='touch'?'touch':'mouse'));
document.addEventListener('keydown',e=>{if(e.key==='Tab'){own('directional');return;}if(e.key.startsWith('Arrow')){e.preventDefault();navigate(e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:1);}else if((e.key==='Enter'||e.key===' ')&&!e.repeat&&owner==='directional'){e.preventDefault();buttons[focusIndex].click();}});
document.addEventListener('focusin',e=>{const n=buttons.indexOf(e.target);if(n>=0){focusIndex=n;own(owner);}});
let padA=false,padDir=0,nextRepeat=0,armed=false;window.addEventListener('blur',()=>{down=null;armed=false;own('none');});
function gamepad(now){const p=navigator.getGamepads?.()?.find(p=>p?.connected);if(!p){padA=false;padDir=0;armed=false;return;}const x=p.axes[0]||0,y=p.axes[1]||0,a=!!p.buttons[0]?.pressed;const dir=(x<-.6||y<-.6||p.buttons[12]?.pressed||p.buttons[14]?.pressed)?-1:(x>.6||y>.6||p.buttons[13]?.pressed||p.buttons[15]?.pressed)?1:0;if(!dir&&!a)armed=true;if(armed){if(dir&&(dir!==padDir||now>nextRepeat)){navigate(dir);nextRepeat=now+(dir===padDir?170:420);}if(a&&!padA){own('directional');buttons[focusIndex].click();}}padDir=dir;padA=a;}
new ResizeObserver(fit).observe(host);view('iso');own('mouse');stateReport();document.querySelector('#loading').classList.add('hidden');
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min(.08,(now-last)/1000);last=now;gamepad(now);for(const d of doors){const target=d.open?1:0;d.amount+=Math.sign(target-d.amount)*Math.min(Math.abs(target-d.amount),dt/ .65);const eased=d.amount*d.amount*(3-2*d.amount);for(const l of d.leaves)l.node.position.x=l.sign*(.425+eased*.85);d.button.dataset.openAmount=d.amount.toFixed(3);}orbit.update();renderer.render(scene,camera);host.dataset.ready='true';});
window.addEventListener('error',e=>{status.textContent='預覽錯誤：'+e.message;});
