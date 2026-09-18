import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StarshipInteractionMenu, type StarshipInteractionMenuController, type StarshipInteractionControlMode } from "../../app/starship-interaction-menu";
import { craftInventoryRecipe, CRAFTING_RECIPES } from "../../app/crafting-recipes";
import type { PlayerInventory } from "../../app/item-database";
declare global {interface Window {craftingTest:{inventory:PlayerInventory;control:StarshipInteractionMenuController|null;setInventory:(value:PlayerInventory)=>void;setInput:(mode:"keyboard-mouse"|"gamepad"|"mobile")=>void;crafts:number};}}
function Harness(){
 const [inventory,setInventory]=useState<PlayerInventory>(()=>Object.fromEntries(CRAFTING_RECIPES.flatMap(recipe=>recipe.req.map(([id])=>[id,40]))));
 const [input,setInput]=useState<"keyboard-mouse"|"gamepad"|"mobile">("keyboard-mouse");
 const [open,setOpen]=useState(true),control=useRef<StarshipInteractionMenuController>(null),crafts=useRef(0);
 const inventoryRef=useRef(inventory);inventoryRef.current=inventory;
 const holdTimer=useRef<ReturnType<typeof setInterval>|null>(null);
 useEffect(()=>()=>{if(holdTimer.current)clearInterval(holdTimer.current);},[]);
 const tapTrigger=(direction:number)=>{
  const now=performance.now();control.current?.updateTriggers?.(false,false,now);
  const owned=control.current?.updateTriggers?.(direction<0,direction>0,now);
  if(!owned)control.current?.changePage?.(direction);
  control.current?.updateTriggers?.(false,false,now+1);
 };
 const holdTrigger=(direction:number)=>{
  if(holdTimer.current)clearInterval(holdTimer.current);
  const start=performance.now();control.current?.updateTriggers?.(false,false,start);
  control.current?.updateTriggers?.(direction<0,direction>0,start);
  holdTimer.current=setInterval(()=>{const now=performance.now();if(now-start>=850){clearInterval(holdTimer.current!);holdTimer.current=null;control.current?.updateTriggers?.(false,false,now);}else control.current?.updateTriggers?.(direction<0,direction>0,now);},16);
 };
 window.craftingTest={inventory,control:control.current,setInventory,setInput,crafts:crafts.current};
 const simulate=(action:()=>void)=>{setInput("gamepad");control.current?.setControlMode("directional");action();};
 return <><aside aria-label="Test controller" style={{position:"fixed",zIndex:9999,bottom:0,left:0}}>
 {(["up","down","left","right"] as const).map(d=><button key={d} onClick={()=>simulate(()=>control.current?.move(d))}>{`Test ${d}`}</button>)}
 <button onClick={()=>simulate(()=>control.current?.switchColumn?.(-1))}>Test LB</button><button onClick={()=>simulate(()=>control.current?.switchColumn?.(1))}>Test RB</button>
 <button onClick={()=>simulate(()=>tapTrigger(-1))}>Test LT</button><button onClick={()=>simulate(()=>tapTrigger(1))}>Test RT</button>
 <button onClick={()=>simulate(()=>control.current?.secondary?.())}>Test X</button><button onClick={()=>simulate(()=>control.current?.activate())}>Test A</button>
 <button onClick={()=>simulate(()=>control.current?.back())}>Test B</button>
 <button onClick={()=>simulate(()=>holdTrigger(1))}>Test hold RT</button><button onClick={()=>simulate(()=>holdTrigger(-1))}>Test hold LT</button>
 <button onClick={()=>setInventory(Object.fromEntries(Object.entries(inventory).map(([id])=>[id,1])))}>Test shortage</button>
 <button onClick={()=>{setInput("gamepad");control.current?.setControlMode("cursor");const target=document.querySelector<HTMLElement>('[data-craft-nav="recipe-2"]');control.current?.hover(target?Number(target.dataset.starshipMenuIndex):null);}}>Test cursor hover</button>
 <button onClick={()=>control.current?.activate()}>Test cursor A</button>
 </aside><button id="world-button" onClick={()=>{throw new Error("World click leaked");}}>World</button>{open?<StarshipInteractionMenu ref={control} inventory={inventory} inputMode={input} onInputModeChange={setInput}
 onControlModeChange={(_mode:StarshipInteractionControlMode)=>{}} onInput={()=>{}} onSleep={()=>{}} onClose={()=>setOpen(false)}
 onCraft={(id,quantity=1)=>{const result=craftInventoryRecipe(inventoryRef.current,id,quantity);if(result.ok){inventoryRef.current=result.inventory;setInventory(result.inventory);crafts.current++;}return result;}}/>:null}</>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
