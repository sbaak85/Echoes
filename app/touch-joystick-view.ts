/** Approved touch joystick skin. Input and pointer capture remain owned by the game. */
export function createTouchJoystickView(host: HTMLElement) {
 const root=document.createElement("div");
 root.className="touch-joystick-view";
 root.setAttribute("aria-hidden","true");
 root.hidden=true;
 const stick=document.createElement("div");
 stick.className="joystick";
 stick.innerHTML="<span class=\"radar-grid\" aria-hidden=\"true\"></span>\n      <svg class=\"radar-ticks\" viewBox=\"0 0 176 176\" aria-hidden=\"true\">\n        <g fill=\"none\" stroke=\"#bfeaf2\" stroke-opacity=\".47\" stroke-width=\".75\" stroke-linecap=\"butt\">\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(22.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(45 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(67.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(90 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(112.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(135 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(157.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(180 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(202.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(225 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(247.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(270 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(292.5 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(315 88 88)\" />\n          <line x1=\"88\" y1=\"6\" x2=\"88\" y2=\"11\" transform=\"rotate(337.5 88 88)\" />\n        </g>\n      </svg>\n      <span class=\"radar-cross\" aria-hidden=\"true\"></span>\n      <span class=\"travel-ring\" aria-hidden=\"true\"></span>\n      <span class=\"center-shadow\" aria-hidden=\"true\"></span>\n      <span class=\"knob\" aria-hidden=\"true\"><span></span></span>";
 root.appendChild(stick);
 host.appendChild(root);
 const ticks=Array.from(root.querySelectorAll<SVGLineElement>(".radar-ticks line"));
  function move(x: number,y: number){
  const distance=Math.hypot(x,y),scale=distance>52?52/distance:1;
  x*=scale;y*=scale;
  stick.style.setProperty('--jx',`${x}px`);stick.style.setProperty('--jy',`${y}px`);
  stick.classList.toggle('is-active',distance>1);
  const travel=Math.hypot(x,y)/52;
  const onset=Math.max(0,(travel-.3)/.7);
  const radial=onset*onset*(3-2*onset);
  const angle=(Math.atan2(y,x)*180/Math.PI+90+360)%360;
  ticks.forEach((tick,i)=>{
   const difference=Math.abs(((angle-i*22.5+540)%360)-180);
   // The facing tick is strongest; two ticks on either side taper smoothly.
   const proximity=Math.max(0,1-difference/67.5);
   const strength=radial*proximity*proximity*(3-2*proximity);
   tick.setAttribute('y2',String(11+5*strength));
   tick.setAttribute('stroke-width',String(.75+1.05*strength));
   tick.setAttribute('stroke-opacity',String(.47+.53*strength));
   tick.setAttribute('stroke',strength>0?'#dcfaff':'#bfeaf2');
   tick.style.filter=strength>0?`drop-shadow(0 0 ${3*strength}px rgba(134,216,242,${.85*strength}))`:'none';
  });
 }

 return {
  update(visible: boolean, x: number, y: number, deltaX: number, deltaY: number) {
   root.hidden=!visible;
   if(!visible) return;
   root.style.left=`${x}px`;
   root.style.top=`${y}px`;
   // Keep the existing 58px input travel and movement sensitivity unchanged.
   move(deltaX*52/58,deltaY*52/58);
  },
  hide(){root.hidden=true;},
  dispose(){root.remove();}
 };
}
