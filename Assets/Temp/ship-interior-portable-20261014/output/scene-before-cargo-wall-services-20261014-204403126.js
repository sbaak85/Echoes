import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

const host=document.querySelector('#viewport'),status=document.querySelector('#status');
const scene=new THREE.Scene();scene.background=new THREE.Color('#090f15');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.append(renderer.domElement);
const camera=new THREE.OrthographicCamera(-20,20,15,-15,.1,200);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.minZoom=.5;orbit.maxZoom=4;orbit.maxPolarAngle=Math.PI*.48;orbit.minPolarAngle=.03;orbit.target.set(0,.6,0);
// Low neutral fill preserves cutaway readability; local fixtures now set each room's mood.
scene.add(new THREE.HemisphereLight(0xb5cad7,0x222831,.55));
const sun=new THREE.DirectionalLight(0xc1cfdb,.90);sun.position.set(-9,22,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:18,bottom:-18,near:1,far:65});sun.shadow.bias=-.00025;sun.shadow.normalBias=.03;scene.add(sun);
const fill=new THREE.DirectionalLight(0x7badcf,.40);fill.position.set(12,10,-15);scene.add(fill);
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
const port=group(ship),starboard=group(ship),ends=group(ship),partitions=group(ship),airlock=group(ship);
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
wallSegment(port,1.95,-5,21.1,2.55,0,true);
// The forward starboard span is replaced by the independently visible exterior doorway.
wallSegment(starboard,4.125,5,16.75,2.55,Math.PI,true);
for(const [a,b] of [[[12.5,-5],[14,-3.6]],[[14,3.6],[12.5,5]]]){const dx=b[0]-a[0],dz=b[1]-a[1];wallSegment((a[1]+b[1])<0?port:starboard,(a[0]+b[0])/2,(a[1]+b[1])/2,Math.hypot(dx,dz),2.3,-Math.atan2(dz,dx),true);}
wallSegment(ends,14,0,7.2,2.55,Math.PI/2,true);
// The bow tapers from the bridge bulkhead to a subtly blunted point.
const bridge=group(ship);
const bowEdges=[[outline[0],outline[1],port],[outline[1],outline[2],port],[outline[7],outline[8],starboard],[outline[8],outline[9],starboard],[outline[9],outline[0],ends]];
for(const [a,b,parent] of bowEdges){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),g=group(parent,(a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=-Math.atan2(dz,dx);if(length>4){wallSegment(g,0,0,length,2.55,0,true);continue;}wallSegment(g,0,0,length,.95);const glass=box(g,0,1.65,0,length-.20,1.22,.15,mat('glass',0x103745,.62,.2));glass.name='bridge-observation-window';for(const x of [-length/2,length/2])box(g,x,1.65,0,.12,1.48,.25,steel);box(g,0,2.37,0,length+.05,.14,.3,trim);box(g,0,1.0,.13,length,.07,.08,steel);}
// Door modules: real openings in wall, two leaves slide into the flanking pockets.
const doors=[];const interactable=[];
function doorway(name,x,z,length,rotation=0,parent=partitions,defaultOpen=true){
 const g=group(parent,x,0,z);g.rotation.y=rotation;const opening=1.7,H=2.32,side=(length-opening)/2;
 if(side>0){wallSegment(g,-opening/2-side/2,0,side,H);wallSegment(g,opening/2+side/2,0,side,H);}
 box(g,0,2.22,0,opening+.4,.3,.5,trim);box(g,0,.035,0,opening+.3,.08,.65,steel);
 for(const s of [-1,1]){box(g,s*(opening/2+.06),1.1,0,.18,2.2,.5,trim);box(g,s*(opening/2+.17),1.3,.3,.17,.28,.055,black);box(g,s*(opening/2+.17),1.3,.332,.075,.13,.02,cyan);}
 const leaves=[];
 for(const s of [-1,1]){const leaf=group(g,s*opening/4,0,0);box(leaf,0,1.02,0,opening/2-.025,2.04,.18,steel,true);box(leaf,0,1.06,.11,.52,1.38,.08,dark);box(leaf,0,1.06,.17,.43,1.24,.03,panel);box(leaf,0,1.65,.2,.055,.42,.03,amber);box(leaf,-s*.3,.82,.2,.065,.35,.04,black);leaves.push({node:leaf,sign:s});}
 const hit=box(g,0,1.08,0,1.8,2.16,.5,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
 const door={name,group:g,leaves,defaultOpen,open:defaultOpen,amount:defaultOpen?1:0,button:null,hit};hit.userData.door=door;interactable.push(hit);doors.push(door);return door;
}
doorway('駕駛艙',-8.6,0,9.6,Math.PI/2);doorway('中央通道',-4.25,0,2.45,Math.PI/2);
doorway('餐飲艙',-1.75,-1.25,5);doorway('動力艙',4,-1.25,6.5);doorway('工作艙',10.5,-1.25,6.3);
doorway('浴室',-2.5,1.25,3.3);doorway('休息艙',1.25,1.25,4.2);doorway('貨艙側門',4.65,1.25,2.6);doorway('貨物艙',10,1.25,8.1);
// Close the former medical access at the hull edge; keep its door operable in cutaway views.
const outerDoor=doorway('對外艙門',-6.425,5,4.35,0,airlock,false);
box(outerDoor.group,0,2.45,0,4.35,.26,.5,trim);
for(const x of [-1.72,1.72])box(outerDoor.group,x,1.1,.19,.23,1.72,.035,red);
label(airlock,'AIRLOCK',-6.425,.08,4.25,1.65,'#d5bd80');
for(const x of [-7.38,-5.47])box(airlock,x,.07,4.63,.10,.025,.5,amber);
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
// Former communications bay: clear entry aisle, basin at left, shower and WC aft.
// All wet-room finishes, fixtures and services belong to this one visibility group.
equipment('浴室衛生設備',-2.55,3.12,g=>{
 const ceramic=mat('bath-ceramic',0xd9e0dc,.08,.3),tile=mat('bath-tile',0x7b9699,.12,.72),rubber=mat('bath-rubber',0x344c52,.05,.93);
 box(g,0,.065,0,3.06,.08,3.42,tile);
 for(let x=-1.5;x<1.55;x+=.51)box(g,x,.109,0,.012,.008,3.4,steel);
 for(let z=-1.68;z<1.72;z+=.57)box(g,0,.109,z,3.04,.008,.012,steel);
 // Nonslip shower pan, open entry, glazed splash divider and wall-mounted mixer.
 box(g,-.86,.16,1.0,1.18,.10,1.32,ceramic);box(g,-.86,.217,1.0,1.04,.018,1.18,rubber);
 for(let z=.51;z<1.58;z+=.12)box(g,-.86,.231,z,.96,.01,.018,steel);
 box(g,-.86,.24,1.48,.51,.025,.12,dark);
 for(let x=-1.06;x<-.59;x+=.08)box(g,x,.257,1.48,.027,.009,.10,trim);
 const glass=new THREE.MeshStandardMaterial({color:0x8dc4ce,metalness:.05,roughness:.2,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide});
 box(g,-.21,1.08,1.04,.035,1.8,1.23,glass);
 for(const z of [.42,1.66])box(g,-.21,1.08,z,.055,1.86,.055,trim);
 box(g,-.21,2.01,1.04,.055,.055,1.29,trim);
 pipe(g,[[-1.4,.4,1.43],[-1.4,1.1,1.43],[-1.4,2.06,1.43],[-1.12,2.15,1.43],[-.94,2.15,1.43]],.035,trim);
 cyl(g,-.92,2.12,1.43,.18,.045,trim);cyl(g,-.92,2.09,1.43,.15,.015,dark);
 box(g,-1.39,1.12,1.43,.13,.16,.38,steel);box(g,-1.29,1.12,1.43,.10,.04,.23,trim);
 box(g,-1.39,1.33,.74,.18,.07,.35,ceramic);
 // Compact vacuum toilet: recognizable oval seat, pedestal, cistern and flush plate.
 box(g,.79,.27,.94,.43,.36,.54,ceramic);
 const bowl=cyl(g,.79,.47,.88,.34,.22,ceramic,32);bowl.scale.z=1.27;
 const inner=cyl(g,.79,.584,.84,.245,.018,dark,32);inner.scale.z=1.26;
 const seat=torus(g,.79,.61,.84,.285,.055,ceramic);seat.rotation.x=Math.PI/2;seat.scale.y=1.25;
 box(g,.79,.65,1.43,.63,.96,.26,ceramic);box(g,.79,1.15,1.43,.68,.07,.3,ceramic);
 box(g,.79,.99,1.282,.22,.12,.025,steel);box(g,.79,1.0,1.261,.12,.055,.02,trim);
 bar(g,[1.43,.82,.67],[1.43,.82,.99],.04,trim);const roll=cyl(g,1.39,.82,.82,.105,.23,ceramic);roll.rotation.x=Math.PI/2;
 // Wall-hung washbasin and mirror face the entry aisle, leaving the doorway clear.
 box(g,-1.12,.64,-.85,.65,.64,.87,dark);box(g,-.78,.65,-.85,.035,.51,.73,steel);
 box(g,-1.09,.99,-.85,.76,.10,.94,ceramic);
 box(g,-1.06,1.047,-.85,.49,.016,.63,dark);box(g,-1.06,1.056,-.85,.39,.018,.51,steel);
 cyl(g,-1.06,1.07,-.85,.045,.012,black);
 pipe(g,[[-1.37,1.03,-.85],[-1.37,1.31,-.85],[-1.15,1.31,-.85],[-1.1,1.22,-.85]],.027,trim);
 box(g,-1.5,1.63,-.85,.08,.83,.86,dark);box(g,-1.448,1.63,-.85,.015,.73,.76,mat('bath-mirror',0xb8d4dd,.9,.12));
 box(g,-1.42,2.09,-.85,.10,.06,.8,cream);box(g,-1.36,2.085,-.85,.02,.025,.68,cyan);
 bar(g,[-.73,.84,-1.16],[-.73,.84,-.57],.035,trim);box(g,-.70,.65,-.89,.035,.34,.32,cream);
 // Supported filtration cabinet, connected supply/return and high extractor.
 box(g,1.31,.60,1.43,.34,1.04,.40,steel);anchorFeet(g,1.31,1.43,.28,.33);
 for(const z of [1.55,1.64])pipe(g,[[1.31,.45,z],[.50,.25,z],[-.65,.25,z],[-1.43,.25,z],[-1.43,1.1,1.43]],.025,z<1.6?copper:steel);
 pipe(g,[[-1.43,.26,1.55],[-1.43,.26,.2],[-1.43,.3,-.85],[-1.12,.80,-.85]],.035,steel);
 pipe(g,[[.79,.26,1.22],[.79,.19,1.57],[1.31,.19,1.57],[1.31,.45,1.43]],.06,dark);
 wallUnit(g,-1.46,2.03,.03,.53,.34,Math.PI/2);pipe(g,[[-1.46,2.15,.03],[-1.46,2.29,.03],[-1.46,2.29,1.58]],.065,steel);
});
// Two longitudinal bunk frames flank the room; four berths share a clear centre aisle.
equipment('休息艙床鋪',1.25,3.23,g=>{
 const bedding=mat('blanket',0x627f80,.05,.98),mattress=mat('bunk-mattress',0xa8b1aa,.02,.94);
 for(const side of [-1,1]){
  const x=side*1.32,inner=x-side*.53;
  for(const dx of [-.52,.52])for(const z of [-1.35,1.35]){
   box(g,x+dx,1.08,z,.075,2.16,.075,trim);
   box(g,x+dx,.07,z,.18,.14,.18,dark);cyl(g,x+dx,.15,z,.035,.025,trim,8);
  }
  for(const y of [.35,1.45]){
   box(g,x,y,0,1.09,.14,2.77,dark);box(g,x,y+.14,0,.96,.16,2.57,mattress);
   box(g,x,y+.235,-.32,.97,.045,1.84,bedding);box(g,x,y+.27,1.0,.73,.16,.43,cream);
   for(const z of [-1.35,1.35])box(g,x,y+.26,z,1.07,.43,.065,steel);
   // Wall-side rail plus a shorter aisle-side guard leaves access beside the ladder.
   box(g,x+side*.53,y+.43,0,.055,.075,2.70,trim);
   box(g,inner,y+.43,.27,.055,.075,2.16,trim);
   for(const z of [-.78,.27,1.32])box(g,inner,y+.25,z,.045,.36,.045,steel);
   box(g,x+side*.50,y+.39,.92,.04,.07,.31,cream);
   box(g,x+side*.475,y+.39,.92,.018,.035,.24,amber);
  }
  // A fixed ladder on the aisle side at the foot of each frame.
  for(const z of [-1.29,-.84])bar(g,[inner-side*.12,.16,z],[inner,1.98,z],.055,steel);
  for(const y of [.35,.66,.97,1.28,1.59])bar(g,[inner-side*.12*(1-(y-.16)/1.82),y,-1.29],[inner-side*.12*(1-(y-.16)/1.82),y,-.84],.065,trim);
  for(const y of [.30,1.43])for(const z of [-1.15,1.15])bar(g,[x+side*.5,y,z],[side*1.98,y,z],.07,steel);
  pipe(g,[[x+side*.5,.18,1.31],[x+side*.5,1.89,1.31],[x+side*.5,1.89,.94]],.025,black);
 }
});
// Low central locker at the outer wall, between the two bed heads (blue marked area).
equipment('休息艙收納櫃',1.25,4.55,g=>{
 box(g,0,.08,0,1.22,.16,.65,dark);box(g,0,.80,0,1.18,1.42,.60,steel);
 box(g,0,1.54,0,1.24,.07,.66,trim);
 for(const x of [-.29,.29])for(const y of [.45,1.13]){
  box(g,x,y,-.317,.55,.62,.04,olive);box(g,x+.17,y,-.355,.035,.21,.045,trim);
  box(g,x-.08,y+.18,-.346,.19,.055,.016,cream);
  for(const dx of [-.13,-.04,.05])box(g,x+dx,y-.18,-.346,.035,.075,.016,dark);
 }
 anchorFeet(g,0,0,1.08,.5);
});
function crate(g,x,z,w=1,h=.8,m=olive){box(g,x,h/2,z,w,h,w,m,true);box(g,x,h+.01,z,w*.82,.06,w*.82,m);for(const s of [-1,1]){box(g,x+s*w*.37,h/2,z,.09,h+.08,w+.04,dark);box(g,x,h*.62,z+s*(w/2+.015),w*.37,.12,.045,black);}box(g,x,h+.05,z,.3,.02,.15,cream);}
// Cargo workstation occupies the marked left-hand L, facing into the clear aisle.
equipment('貨艙電腦台',0,0,g=>{
 box(g,4.02,.54,3.42,.66,1.02,2.20,dark);box(g,4.02,1.09,3.42,.85,.15,2.36,steel);
 box(g,5.03,.54,4.43,2.54,1.02,.64,dark);box(g,5.03,1.09,4.43,2.68,.15,.82,steel);
 // One continuous display mesh and panoramic UV strip, including the bevelled L corner.
 const displayPath=[[3.86,2.40],[3.86,4.38],[4.08,4.60],[6.22,4.60]],lengths=[0],normals=[];
 for(let i=0;i<displayPath.length-1;i++){
  const a=displayPath[i],b=displayPath[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  lengths.push(lengths[i]+len);normals.push([dz/len,-dx/len]);
  const backing=box(g,(a[0]+b[0])/2,1.60,(a[1]+b[1])/2,len+.02,.78,.12,black);backing.rotation.y=-Math.atan2(dz,dx);
  for(const y of [1.22,1.98])bar(g,[a[0],y,a[1]],[b[0],y,b[1]],.055,steel);
 }
 const displayCanvas=document.createElement('canvas');displayCanvas.width=1536;displayCanvas.height=256;
 const dc=displayCanvas.getContext('2d');dc.fillStyle='#071e2a';dc.fillRect(0,0,1536,256);
 dc.strokeStyle='#16414e';dc.lineWidth=1;
 for(let x=0;x<1536;x+=32){dc.beginPath();dc.moveTo(x,0);dc.lineTo(x,256);dc.stroke();}
 for(let y=0;y<256;y+=32){dc.beginPath();dc.moveTo(0,y);dc.lineTo(1536,y);dc.stroke();}
 dc.fillStyle='#76ddeb';dc.font='bold 24px monospace';dc.fillText('CARGO BAY  /  INVENTORY CONTROL',28,38);
 for(let i=0;i<12;i++){
  const x=28+i*124;dc.fillStyle=i%3?'#215c70':'#337b82';dc.fillRect(x,70,106,92);
  dc.strokeStyle='#74d5dd';dc.strokeRect(x,70,106,92);dc.fillStyle='#9bdce3';dc.font='18px monospace';dc.fillText(String(i+1).padStart(2,'0'),x+12,98);
  for(let row=0;row<3;row++)dc.fillRect(x+12,112+row*13,45+(i*7+row*11)%35,4);
  dc.fillStyle='#3c8794';dc.fillRect(x,185,106,10);dc.fillStyle='#91dad9';dc.fillRect(x,185,30+i*6,10);
 }
 dc.fillStyle='#67c7d4';dc.fillRect(24,228,1488,3);
 const displayTexture=new THREE.CanvasTexture(displayCanvas);displayTexture.colorSpace=THREE.SRGBColorSpace;
 const vertices=[],uv=[],indices=[];
 for(let i=0;i<displayPath.length;i++){
  const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)],sx=a[0]+b[0],sz=a[1]+b[1],scale=.071/(sx*b[0]+sz*b[1]);
  const x=displayPath[i][0]+sx*scale,z=displayPath[i][1]+sz*scale,u=lengths[i]/lengths.at(-1);
  vertices.push(x,1.27,z,x,1.93,z);uv.push(u,0,u,1);
  if(i<displayPath.length-1){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
 }
 const displayGeo=new THREE.BufferGeometry();displayGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));displayGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));displayGeo.setIndex(indices);displayGeo.computeVertexNormals();
 const display=new THREE.Mesh(displayGeo,new THREE.MeshStandardMaterial({map:displayTexture,emissiveMap:displayTexture,emissive:0xffffff,emissiveIntensity:.75,roughness:.35}));display.name='cargo-continuous-l-display';g.add(display);
 for(const z of [2.85,3.65]){
  box(g,4.22,1.19,z,.30,.035,.65,black);
  for(let dz=-.22;dz<.3;dz+=.1)box(g,4.22,1.214,z+dz,.18,.012,.045,trim);
 }
 for(const x of [4.75,5.60]){box(g,x,.56,4.09,.70,.79,.04,panel);box(g,x,.83,4.05,.30,.035,.04,trim);}
 box(g,5.68,1.20,4.43,.54,.09,.42,black);box(g,5.68,1.255,4.43,.39,.018,.26,cyan);
 // Chair's local forward is +Z: turn toward the screen's inner corner (-X,+Z).
 chair(g,5.04,3.43,-Math.PI/4);anchorFeet(g,4.02,3.42,.56,1.97);anchorFeet(g,5.03,4.43,2.3,.53);
 pipe(g,[[3.83,.80,2.7],[3.83,.18,2.7],[3.83,.18,4.44],[5.7,.18,4.44],[5.7,.85,4.44]],.04,black);
});
// Two chemical gas vessels on a restrained skid against the corridor wall.
equipment('化學氣槽',7.48,2.03,g=>{
 const tankPaint=mat('chemical-tank',0x929e9f,.65,.36),hazard=mat('chemical-band',0xd69643,.25,.55);
 box(g,0,.10,0,2.48,.20,1.13,dark);
 for(const x of [-.63,.63]){
  cyl(g,x,1.01,0,.43,1.55,tankPaint,32);
  for(const y of [.25,1.77]){const cap=new THREE.Mesh(new THREE.SphereGeometry(.43,24,12),tankPaint);cap.scale.y=.38;cap.position.set(x,y,0);cap.castShadow=true;cap.receiveShadow=true;g.add(cap);}
  for(const y of [.42,1.52]){const band=torus(g,x,y,0,.438,.045,hazard);band.rotation.x=Math.PI/2;}
  cyl(g,x,1.97,0,.095,.20,steel);valve(g,x,2.07,.09,.12);
  box(g,x,1.05,.439,.26,.35,.025,cream);const mark=box(g,x,1.06,.463,.14,.14,.018,hazard);mark.rotation.z=Math.PI/4;
  box(g,x,.95,-.46,.09,1.75,.12,trim);bar(g,[x,.2,-.46],[x,.2,.40],.09,steel);
  pipe(g,[[x,1.99,0],[x,2.15,-.25],[x,2.15,-.47],[0,2.15,-.47]],.038,copper);
 }
 wallUnit(g,0,1.13,-.49,.40,.68,0,steel);pipe(g,[[0,2.15,-.47],[0,1.7,-.47],[0,1.43,-.43]],.05,copper);
 anchorFeet(g,0,0,2.28,.94);
});
// Marked red zones: palletised stacks of varying heights, clear of the central doorway.
equipment('貨櫃堆疊',0,0,g=>{
 function stack(x,z,size,levels,tint){
  box(g,x,.10,z,size+.10,.18,size+.10,dark);
  for(const dx of [-size*.34,size*.34])box(g,x+dx,.055,z,.12,.11,size+.16,steel);
  for(let level=0;level<levels;level++){
   const q=group(g,0,.20+level*.69,0);crate(q,x,z,size,.61,level%2?steel:tint);
   box(q,x,.33,z+size/2+.043,size*.58,.16,.025,cream);
   for(let k=0;k<4;k++)box(q,x-size*.22+k*size*.14,.33,z+size/2+.06,.035,.09,.01,dark);
  }
  for(const dx of [-size*.36,size*.36])box(g,x+dx,.20+levels*.345,z,.055,levels*.69+.06,size+.08,tint===olive?copper:red);
 }
 // Keep the left column and the first three aisle-side positions clear (red crosses).
 for(let col=1;col<4;col++){
  stack(7.85+col*1.10,4.38,.87,col===1?3:2,col%2?olive:steel);
 }
 stack(11.15,3.37,.87,2,steel);
 stack(12.47,4.13,.80,2,olive);stack(13.26,3.35,.72,3,steel);
 stack(12.49,2.14,.76,3,olive);stack(13.38,2.14,.70,2,steel);
 // Fill the marked right-hand pocket without extending into the central access aisle.
 stack(12.43,3.17,.66,2,olive);
});
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
retrofit('後艙備用箱',g=>{for(const z of [-2.8,-3.6]){box(g,12.4,.045,z,1.15,.07,.08,steel);for(const x of [11.88,12.92])cyl(g,x,.1,z,.06,.06,dark,8);}});
// Ship ribs, fixed service luminaires and transverse structural accents.
for(const x of [-8.6,-4.25,.8,7.3,12.5]){for(const z of [-4.78,4.78]){const side=z<0?port:starboard;box(side,x,1.27,z,.36,2.66,.54,trim);box(side,x,1.25,z+(z<0?.31:-.31),.15,1.75,.055,dark);}}
for(let x=-3;x<13;x+=2.2){for(const z of [-1.05,1.05])box(ship,x,.075,z,.26,.045,.07,amber);}
// Compartment fixtures: finite ranges and shadowed cones limit colour bleed through walls.
function roomSpot(parent,position,target,color,intensity,range,angle=1.0){
 const light=new THREE.SpotLight(color,intensity,range,angle,.65,2);
 light.position.set(...position);light.target.position.set(...target);parent.add(light,light.target);
 light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.12;
 light.shadow.bias=-.0003;light.shadow.normalBias=.025;
 return light;
}
function wallLamp(parent,x,y,z,width,color,name){
 const glow=mat('lamp-'+name,color,.05,.4,color);glow.emissiveIntensity=1.5;
 box(parent,x,y,z,width+.14,.16,.13,dark);
 const lens=box(parent,x,y-.03,z+.075,width,.055,.025,glow);lens.castShadow=false;
}
const roomLights=group(ship);
// Bridge: icy screen light and a cold wash from the forward consoles.
roomSpot(roomLights,[-12.5,2.15,-1.7],[-10.5,.3,0],0x70bbff,22,6,1.05);
roomSpot(roomLights,[-12.5,2.15,1.7],[-10.5,.3,0],0x70bbff,18,6,1.05);
// Command area: restrained cyan, sourced from the rear wall and holographic station.
wallLamp(roomLights,-6.5,2.40,-4.65,1.6,0x8adbe9,'command');
roomSpot(roomLights,[-6.5,2.32,-4.48],[-6.5,.1,-.3],0x8adbe9,22,7,1.0);
// Galley: warmer domestic light; fabrication bay: clear neutral task lighting.
wallLamp(roomLights,-1.7,2.40,-4.62,2.1,0xffd29a,'galley');
roomSpot(roomLights,[-1.7,1.72,-4.02],[-1.7,.3,-2.3],0xffd29a,16,5.0,1.1);
wallLamp(roomLights,10.4,2.40,-4.60,2.3,0xd2e7ef,'workshop');
roomSpot(roomLights,[10.4,2.30,-4.38],[10.4,.5,-2.4],0xd2e7ef,28,5.8,1.1);
// Reactor: two steady red warning lamps, avoiding animated flashes.
for(const x of [2,6]){
 wallLamp(roomLights,x,2.40,-4.59,.75,0xff3024,'reactor');
 roomSpot(roomLights,[x,2.32,-4.35],[x,.55,-2.25],0xff3024,32,5.3,1.05);
}
// Cargo: a subdued amber service pool keeps the aft deck readable.
wallLamp(roomLights,10,2.40,4.60,1.6,0xe7b979,'cargo');
roomSpot(roomLights,[10,2.28,4.35],[10,.1,2.8],0xe7b979,17,5.6,1.1);
// Bathroom mirror light follows the bathroom equipment visibility, including its target.
retrofit('浴室衛生設備',g=>roomSpot(g,[-3.86,2.04,2.27],[-2.8,.25,3.25],0xb1d6d5,4.2,3.5,1.05));
// Quarters have no ceiling/task light: only four warm lights at the bed-side sconces.
retrofit('休息艙床鋪',g=>{
 for(const side of [-1,1])for(const y of [.74,1.84]){
  const x=1.25+side*1.795,light=new THREE.PointLight(0xffc28a,1.25,1.65,2);
  light.position.set(x-side*.06,y,4.15);g.add(light);
 }
});
// Low corridor guide lights, with short falloff to keep sleeping and wet areas subdued.
for(const x of [-2,3,9]){const light=new THREE.PointLight(0xe9c28c,.75,2.1,2);light.position.set(x,.20,-.95);roomLights.add(light);}
// A subdued plinth helps the silhouette read without introducing a fake floor plan.
const plinth=box(scene,0,-.94,0,29.1,.2,11.15,mat('plinth',0x0c1720,.3,.8));plinth.receiveShadow=true;
starboard.visible=false;
const outlineGroup=new THREE.Group();ship.add(outlineGroup);const grid=new THREE.GridHelper(30,30,0x63bbc5,0x34505c);grid.position.y=.065;grid.material.transparent=true;grid.material.opacity=.28;outlineGroup.add(grid);outlineGroup.visible=false;

function stateReport(){renderer.shadowMap.needsUpdate=true;const open=doors.filter(d=>d.open).length,visible=props.filter(p=>p.group.visible).length;status.textContent=`艙門 ${open}/${doors.length} 開啟 · 設備 ${visible}/${props.length} 顯示`;host.dataset.doorsOpen=String(open);host.dataset.propsVisible=String(visible);host.dataset.port=String(port.visible);host.dataset.starboard=String(starboard.visible);host.dataset.drawcalls=String(renderer.info.render.calls);document.querySelector('#all-doors').textContent=open===doors.length?'全部關閉':'全部開啟';document.querySelector('#all-props').textContent=visible===props.length?'全部隱藏':'全部顯示';}
function toggle(container,label,get,set,on='顯示',off='隱藏'){
 const b=document.createElement('button');b.className='toggle';b.type='button';b.innerHTML=`<span>${label}</span><span class="lamp"></span>`;b.setAttribute('aria-label',label);function sync(){b.setAttribute('aria-pressed',String(get()));b.querySelector('.lamp').textContent=get()?on:off;}b.addEventListener('click',()=>{set(!get());sync();stateReport();});document.querySelector(container).append(b);sync();return {button:b,sync};
}
const hullControls=[];
for(const [label,g] of [['左舷外壁（後側）',port],['右舷外壁（前側）',starboard],['對外艙門與牆',airlock],['內部隔間與門框',partitions],['地面比例網格',outlineGroup]])hullControls.push(toggle('#hull-controls',label,()=>g.visible,v=>g.visible=v));
for(const door of doors){const t=toggle('#door-controls',door.name,()=>door.open,v=>{door.open=v;},'已開 · 按此關閉','已關 · 按此開啟');door.button=t.button;door.sync=t.sync;}
for(const p of props){const t=toggle('#prop-controls',p.name,()=>p.group.visible,v=>p.group.visible=v);p.button=t.button;p.sync=t.sync;}
document.querySelector('#all-doors').onclick=()=>{const value=!doors.every(d=>d.open);for(const d of doors){d.open=value;d.sync();}document.querySelector('#all-doors').textContent=value?'全部關閉':'全部開啟';stateReport();};
document.querySelector('#all-props').onclick=()=>{const value=!props.every(p=>p.group.visible);for(const p of props){p.group.visible=value;p.sync();}document.querySelector('#all-props').textContent=value?'全部隱藏':'全部顯示';stateReport();};
function view(name){orbit.target.set(0,.5,0);camera.zoom=1;camera.up.set(0,1,0);if(name==='bridge'){orbit.target.set(-11.2,.8,0);camera.position.set(-2.2,14,14);camera.zoom=2.65;}else if(name==='top'){camera.position.set(0,40,.001);}else if(name==='reverse'){camera.position.set(-19,25,-30);}else camera.position.set(19,25,30);camera.lookAt(orbit.target);orbit.update();fit();host.dataset.view=name;}
document.querySelector('#bridge-view').onclick=()=>view('bridge');
function fit(){const w=host.clientWidth,h=host.clientHeight,aspect=w/h,span=Math.max(19,35/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(w,h);}
document.querySelector('#iso').onclick=()=>view('iso');document.querySelector('#top').onclick=()=>view('top');document.querySelector('#reverse').onclick=()=>view('reverse');document.querySelector('#closer').onclick=()=>{camera.zoom=Math.min(4,camera.zoom*1.2);camera.updateProjectionMatrix();};document.querySelector('#farther').onclick=()=>{camera.zoom=Math.max(.5,camera.zoom/1.2);camera.updateProjectionMatrix();};
document.querySelector('#reset').onclick=()=>{for(const d of doors){d.open=d.defaultOpen;d.sync();}for(const p of props){p.group.visible=true;p.sync();}port.visible=true;starboard.visible=false;airlock.visible=true;partitions.visible=true;outlineGroup.visible=false;hullControls.forEach(h=>h.sync());document.querySelector('#all-props').textContent='全部隱藏';view('iso');stateReport();};
// Raycast only door apertures, and reject blocked hits through the surrounding geometry.
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;down=null;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObject(ship,true).filter(hit=>{let o=hit.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});const hit=hits.find(h=>h.object.userData.door);if(!hit)return;const blocker=hits.find(h=>!h.object.userData.door&&h.distance<hit.distance-.35);if(blocker)return;const door=hit.object.userData.door;door.open=!door.open;door.sync();stateReport();});renderer.domElement.addEventListener('pointercancel',()=>down=null);
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
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min(.08,(now-last)/1000);last=now;gamepad(now);for(const d of doors){const target=d.open?1:0;if(d.amount!==target)renderer.shadowMap.needsUpdate=true;d.amount+=Math.sign(target-d.amount)*Math.min(Math.abs(target-d.amount),dt/ .65);const eased=d.amount*d.amount*(3-2*d.amount);for(const l of d.leaves)l.node.position.x=l.sign*(.425+eased*.85);d.button.dataset.openAmount=d.amount.toFixed(3);}orbit.update();renderer.render(scene,camera);host.dataset.ready='true';});
window.addEventListener('error',e=>{status.textContent='預覽錯誤：'+e.message;});
