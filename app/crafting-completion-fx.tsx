import type { CSSProperties } from "react";
import { craftingCompletionBurstSlots } from "./crafting-completion-timing";
import "./crafting-completion-fx.css";

const ticks = Array.from({length:72},(_,i)=>{
  const a=i*Math.PI/36,r=224,l=i%6===0?9:3;
  return {d:`M${280+Math.cos(a)*r} ${280+Math.sin(a)*r}L${280+Math.cos(a)*(r-l)} ${280+Math.sin(a)*(r-l)}`,opacity:i%6===0?.65:.25};
});
const sparks = Array.from({length:22},(_,i)=>{
  const a=i*2.39996,r=184+i%5*11;
  return {d:`M${280+Math.cos(a)*r} ${280+Math.sin(a)*r}l${Math.cos(a)*(4+i%4)} ${Math.sin(a)*(4+i%4)}`,width:i%3===0?1.7:.8};
});

export function CraftingCompletionFx({quantity}:{quantity:number}) {
  return <div className="craft-completion-fx" aria-hidden="true">
    <div className="craft-fx-sweep"/>
    <div className="craft-fx-idle">
      <div className="craft-fx-idle-glow"/>
      <svg viewBox="0 0 560 560" focusable="false">
        <circle cx="280" cy="280" r="224" opacity=".15"/>
        <g className="craft-fx-idle-orbit craft-fx-origin"><circle cx="280" cy="280" r="211" strokeDasharray="150 280 70 200 110 515" opacity=".8"/><circle cx="280" cy="280" r="202" strokeDasharray="2 25" opacity=".22"/></g>
        <g className="craft-fx-idle-counter craft-fx-origin"><circle cx="280" cy="280" r="239" strokeDasharray="60 340 90 290 45 677" opacity=".45"/><path d="M280 38l-3 6h6Z" fill="#a8d1ce" stroke="none" opacity=".55"/></g>
        <path className="craft-fx-idle-lock" d="M140 166V140H166M394 140H420V166M420 394V420H394M166 420H140V394" stroke="#d6bb83" strokeWidth=".8"/>
      </svg>
    </div>
    <svg viewBox="0 0 560 560" focusable="false">
      <g className="craft-fx-schematic craft-fx-origin"><circle cx="280" cy="280" r="224" className="craft-fx-thin"/><path d="M24 280H116M444 280H536M280 24V96M280 464V536" opacity=".4"/>{ticks.map((tick,i)=><path key={i} {...tick}/>)}<path d="M102 128H69V179M458 432H491V381"/><circle cx="280" cy="280" r="176" strokeDasharray="1 11" opacity=".35"/></g>
      <g className="craft-fx-orbit craft-fx-origin"><circle cx="280" cy="280" r="211" strokeDasharray="250 75 110 95 140 660" strokeWidth="1.3"/><circle cx="280" cy="280" r="202" strokeDasharray="80 350 20 190 80 700" opacity=".4"/></g>
      <g className="craft-fx-counter craft-fx-origin"><circle cx="280" cy="280" r="239" strokeDasharray="130 245 60 210 20 180 95 580"/><path d="M280 35l-4 8h8Z M280 525l-4 -8h8Z" fill="#98d6d7" stroke="none"/></g>
      <g className="craft-fx-triangle craft-fx-origin"><path d="M280 69L463 386H97Z"/><path d="M280 491L97 174H463Z" className="craft-fx-thin"/></g>
      <g className="craft-fx-brackets craft-fx-origin" strokeWidth="1.7"><path d="M140 172V140H172M388 140H420V172M420 388V420H388M172 420H140V388"/><path d="M271 88H289M280 79V97M271 472H289M280 463V481" strokeWidth=".8"/></g>
      <g className="craft-fx-formula"><text x="14" y="198">Σ mᵢ = M</text><text x="14" y="214">SYNC / 03</text><path d="M16 226H78L104 244" opacity=".45"/><text x="423" y="351">ΔE → 0</text><text x="423" y="367">φ = 1.000</text><path d="M419 330H474L491 313" opacity=".45"/><text x="307" y="47">ASSEMBLY / SOLVED</text><text x="108" y="510">0101 · MATERIAL VERIFIED</text></g>
    </svg>
    {craftingCompletionBurstSlots(quantity).map((slot,index)=><div key={index} className="craft-fx-burst" data-burst-count={slot.count} style={{"--burst-delay":`${slot.delayMs}ms`,"--burst-cycle":`${slot.repeatMs}ms`,"--burst-count":slot.count} as CSSProperties}>
      <div className="craft-fx-halo"/><div className="craft-fx-rays"/><div className="craft-fx-flash"/>
      <svg viewBox="0 0 560 560" focusable="false"><circle className="craft-fx-shock craft-fx-origin" cx="280" cy="280" r="227" stroke="#ffe7b2" strokeWidth="1.1"/><g className="craft-fx-sparks craft-fx-origin" stroke="#ffe3a4">{sparks.map((spark,i)=><path key={i} d={spark.d} strokeWidth={spark.width}/>)}</g></svg>
    </div>)}
  </div>;
}
