// Screen coordinates are calibrated to the 1920 x 1080 signal-detector artwork.
const radar={x:959,y:345,rx:115,ry:103};
const radarCoverageScale=1.0815;
const wave={x:869,y:506,w:156,h:65};
const TAU=Math.PI*2;

export function isSignalDetectorIllustration(imagePath: string): boolean {
  try {
    const pathname=decodeURIComponent(imagePath.split(/[?#]/,1)[0]).replace(/\\/g,"/");
    return pathname.split("/").pop()==="訊號探測儀_C.png";
  } catch { return false; }
}

export function drawSignalDetectorScreens(ctx: CanvasRenderingContext2D, ms: number) {
  const t=ms/1000, angle=t*TAU/3-Math.PI/2;
  ctx.clearRect(0,0,1920,1080);
  // Opaque screen replacement is clipped inside the glass, leaving its rim untouched.
  ctx.save();ctx.translate(radar.x,radar.y);ctx.scale(radarCoverageScale,radarCoverageScale*radar.ry/radar.rx);
  ctx.beginPath();ctx.arc(0,0,radar.rx,0,TAU);ctx.clip();
  const depth=ctx.createRadialGradient(-24,-28,0,0,0,130);
  depth.addColorStop(0,"#07394e");depth.addColorStop(1,"#010f26");
  ctx.fillStyle=depth;ctx.fillRect(-120,-120,240,240);
  ctx.strokeStyle="rgba(72,178,221,.5)";ctx.lineWidth=.8;
  for(let r=23;r<116;r+=23){ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();}
  for(let i=0;i<12;i++){const a=i*TAU/12;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*115,Math.sin(a)*115);ctx.stroke();}
  // An 84-degree afterglow trails the beam (0.7 seconds at this speed).
  // Angular decay softens the tail; radial brightness emphasizes the outer glass.
  ctx.save();ctx.globalCompositeOperation="lighter";
  const trailSpan=84*Math.PI/180,trailSteps=216,trailStep=trailSpan/trailSteps;
  const trailGlow=ctx.createRadialGradient(0,0,0,0,0,radar.rx);
  trailGlow.addColorStop(0,"rgba(0,100,255,.025)");
  trailGlow.addColorStop(.3,"rgba(0,126,255,.14)");
  trailGlow.addColorStop(.65,"rgba(0,166,255,.48)");
  trailGlow.addColorStop(.9,"rgba(20,205,255,.9)");
  trailGlow.addColorStop(1,"rgba(80,225,255,.85)");
  ctx.fillStyle=trailGlow;
  for(let i=trailSteps-1;i>=0;i--){
    const age=(i+.5)/trailSteps,a=angle-i*trailStep;
    ctx.globalAlpha=.85*Math.pow(1-age,2.2);
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.arc(0,0,radar.rx,a-trailStep*1.12,Math.min(angle,a+trailStep*.12));
    ctx.closePath();ctx.fill();
  }
  ctx.restore();
  // Additive bloom: broad blue halo, cyan flare, then a near-white exposed core.
  ctx.save();ctx.globalCompositeOperation="lighter";ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle)*115,Math.sin(angle)*115);
  for(const [width,blur,color] of ([[11,24,"rgba(0,132,255,.28)"],[5,14,"rgba(18,220,255,.72)"],[2,5,"#f0ffff"]] as const)){
    ctx.lineWidth=width;ctx.shadowBlur=blur;ctx.shadowColor="#18d7ff";ctx.strokeStyle=color;ctx.stroke();
  }
  for(const [x,y] of [[66,-27],[-44,55],[29,74]]){
    const a=Math.atan2(y,x),age=((angle-a)%TAU+TAU)%TAU/(TAU/3),alpha=Math.exp(-age*1.8);
    const flash=Math.exp(-age*7);
    ctx.globalAlpha=alpha;
    const halo=ctx.createRadialGradient(x,y,0,x,y,19);
    halo.addColorStop(0,"rgba(183,255,255,.95)");halo.addColorStop(.22,"rgba(31,209,255,.8)");halo.addColorStop(1,"rgba(0,100,255,0)");
    ctx.shadowBlur=0;ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,19,0,TAU);ctx.fill();
    ctx.fillStyle="#ffffff";ctx.shadowColor="#50eaff";ctx.shadowBlur=18;
    ctx.beginPath();ctx.arc(x,y,3.1+flash*1.4,0,TAU);ctx.fill();ctx.fill();
    ctx.shadowBlur=6;ctx.lineWidth=1;ctx.strokeStyle="#bfffff";ctx.globalAlpha=alpha*flash;
    ctx.beginPath();ctx.moveTo(x-9,y);ctx.lineTo(x+9,y);ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();
    ctx.globalAlpha=alpha*.8;ctx.lineWidth=1.1;ctx.strokeStyle="#62ecff";ctx.beginPath();ctx.arc(x,y,4+age*10,0,TAU);ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha=1;ctx.shadowBlur=0;
  // Fixed luminous dial marks share the radar transform and outer feather mask.
  ctx.save();ctx.globalCompositeOperation="lighter";ctx.lineCap="round";
  const tickRadius=107;
  ctx.strokeStyle="rgba(42,181,255,.7)";ctx.lineWidth=.8;
  ctx.shadowColor="#19bdff";ctx.shadowBlur=5;
  ctx.beginPath();ctx.arc(0,0,tickRadius+1.5,0,TAU);ctx.stroke();
  for(let i=0;i<180;i++){
    const a=i*TAU/180-Math.PI/2,major=i%15===0,medium=i%5===0;
    const length=major?7:medium?4.5:2.3;
    ctx.lineWidth=major?1.3:medium?.95:.65;
    ctx.strokeStyle=major?"#e3fcff":medium?"#83e8ff":"rgba(72,201,255,.85)";
    ctx.shadowBlur=major?7:3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*(tickRadius-length),Math.sin(a)*(tickRadius-length));
    ctx.lineTo(Math.cos(a)*tickRadius,Math.sin(a)*tickRadius);ctx.stroke();
  }
  ctx.restore();
  const glass=ctx.createLinearGradient(-80,-110,90,110);
  glass.addColorStop(0,"rgba(111,224,255,.12)");glass.addColorStop(.5,"rgba(10,80,110,0)");glass.addColorStop(1,"rgba(0,0,15,.24)");
  ctx.fillStyle=glass;ctx.fillRect(-120,-120,240,240);ctx.restore();
  // Feather only the outer six artwork pixels. The center remains opaque,
  // so the original static sweep cannot show through the animated screen.
  // Apply before drawing the waveform so its opacity is unaffected.
  ctx.save();
  ctx.translate(radar.x,radar.y);ctx.scale(radarCoverageScale,radarCoverageScale*radar.ry/radar.rx);
  ctx.globalCompositeOperation="destination-in";
  const edgeMask=ctx.createRadialGradient(0,0,radar.rx-6,0,0,radar.rx);
  edgeMask.addColorStop(0,"rgba(255,255,255,1)");
  edgeMask.addColorStop(.25,"rgba(255,255,255,.844)");
  edgeMask.addColorStop(.5,"rgba(255,255,255,.5)");
  edgeMask.addColorStop(.75,"rgba(255,255,255,.156)");
  edgeMask.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=edgeMask;ctx.fillRect(-120,-120,240,240);
  ctx.restore();
  // Oscilloscope: a continuously scrolling signal with two moving pulse packets.
  ctx.save();ctx.beginPath();ctx.rect(wave.x,wave.y,wave.w,wave.h);ctx.clip();
  ctx.fillStyle="#021729";ctx.fillRect(wave.x,wave.y,wave.w,wave.h);
  ctx.strokeStyle="rgba(36,132,184,.52)";ctx.lineWidth=.6;
  for(let x=0;x<=wave.w;x+=19.5){ctx.beginPath();ctx.moveTo(wave.x+x,wave.y);ctx.lineTo(wave.x+x,wave.y+wave.h);ctx.stroke();}
  for(let y=0;y<=wave.h;y+=16){ctx.beginPath();ctx.moveTo(wave.x,wave.y+y);ctx.lineTo(wave.x+wave.w,wave.y+y);ctx.stroke();}
  ctx.beginPath();
  for(let x=0;x<=wave.w;x++){
    const u=x+t*42,phase=((u%180)+180)%180;
    const envelope=3+22*Math.exp(-Math.pow((phase-50)/9,2))+10*Math.exp(-Math.pow((phase-125)/13,2));
    const y=wave.y+wave.h/2+envelope*(.72*Math.sin(u*1.75)+.28*Math.sin(u*3.3));
    if(!x)ctx.moveTo(wave.x+x,y);else ctx.lineTo(wave.x+x,y);
  }
  ctx.shadowColor="#0bcfff";ctx.shadowBlur=7;ctx.strokeStyle="#42ceff";ctx.lineWidth=2.3;ctx.stroke();
  ctx.shadowBlur=0;ctx.strokeStyle="#c1fbff";ctx.lineWidth=.8;ctx.stroke();
  const glow=ctx.createLinearGradient(wave.x,wave.y,wave.x,wave.y+wave.h);
  glow.addColorStop(0,"rgba(67,186,233,.12)");glow.addColorStop(1,"transparent");ctx.fillStyle=glow;ctx.fillRect(wave.x,wave.y,wave.w,wave.h);ctx.restore();
  // The narrow level indicator remains within its own original blue frame.
  ctx.fillStyle="#02182b";ctx.fillRect(1037,508,13,62);
  const level=Math.round(8+3*Math.sin(t*3.4)+2*Math.sin(t*8.1));
  for(let i=0;i<13;i++){ctx.fillStyle=i<level?"#3cdfff":"#0b3d58";ctx.fillRect(1038,566-i*4.4,11,2.4);}
}
