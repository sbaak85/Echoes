import React, { useRef, useState } from "react";
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
 window.craftingTest={inventory,control:control.current,setInventory,setInput,crafts:crafts.current};
 return <><button id="world-button" onClick={()=>{throw new Error("World click leaked");}}>World</button>{open?<StarshipInteractionMenu ref={control} inventory={inventory} inputMode={input} onInputModeChange={setInput}
 onControlModeChange={(_mode:StarshipInteractionControlMode)=>{}} onInput={()=>{}} onSleep={()=>{}} onClose={()=>setOpen(false)}
 onCraft={(id,quantity=1)=>{const result=craftInventoryRecipe(inventoryRef.current,id,quantity);if(result.ok){inventoryRef.current=result.inventory;setInventory(result.inventory);crafts.current++;}return result;}}/>:null}</>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
