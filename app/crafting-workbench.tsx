"use client";
import { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ITEM_BY_ID, ITEM_DEFINITIONS, type ItemDefinition, type PlayerInventory } from "./item-database";
import { CRAFTING_RECIPES } from "./crafting-recipes";
import { InventoryCategoryIcon } from "./inventory-category-icon";
import { SurvivalNeedIcon } from "./survival-need-icon";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import { resolveRuntimePublicAssetUrl as assetUrl } from "./public-asset-url";
import type { StarshipInteractionMenuController, StarshipInteractionControlMode } from "./starship-interaction-menu";
import "./crafting-workbench.css";

type Props = {
 inventory:PlayerInventory; inputMode:"keyboard-mouse"|"gamepad"|"mobile";
 controlMode:StarshipInteractionControlMode;
 onControlModeChange:(mode:StarshipInteractionControlMode)=>void;
 onInputModeChange:(mode:"keyboard-mouse"|"gamepad"|"mobile")=>void;
 onInput:()=>void; onBack:()=>void;
 onCraft:(recipeId:string,quantity?:number)=>{ok:boolean;reason?:string};
};
const aliases:Record<string,string>={"toughened-vine-bark":"韌化藤皮","luminescent-sac":"螢光包囊","heat-fused-ceramic-shard":"熱熔陶片"};
const image=(item:ItemDefinition,large=false)=>assetUrl(`ui/items/${aliases[item.englishName]||item.englishName}-${large?"inspect-640":"icon-280"}.png`);
function ItemArt({entry,large=false}:{entry:ItemDefinition;large?:boolean}){
 const [failed,setFailed]=useState(false);
 return failed?<span className="craft-art-fallback" aria-label={entry.name}>{entry.symbol}</span>:<img src={image(entry,large)} alt="" onError={()=>setFailed(true)}/>;
}
const item=(id:string)=>ITEM_BY_ID.get(id)!;
const category=(entry:ItemDefinition)=>entry.category==="main"?"quest":entry.category;
const categoryNames={food:"食物",resource:"資源",tool:"工具",quest:"任務道具"};
function Category({entry}:{entry:ItemDefinition}){
 const kind=category(entry);
 return <span className={`material-category is-${kind}`} aria-hidden="true">{kind==="food"?<SurvivalNeedIcon kind="hunger"/>:kind==="quest"?"⚑":<InventoryCategoryIcon kind={kind}/>}</span>;
}
export const CraftingWorkbench=forwardRef<StarshipInteractionMenuController,Props>(function CraftingWorkbench(props,ref){
 const root=useRef<HTMLDivElement>(null), latest=useRef(props);latest.current=props;
 const [selected,setSelected]=useState(0),[allocated,setAllocated]=useState<Set<string>>(new Set());
 const [phase,setPhase]=useState<"select"|"ready"|"crafted">("select");
 const [filter,setFilter]=useState(false),[page,setPage]=useState(0),[nav,setNav]=useState("recipe-0"),[hover,setHover]=useState<string|null>(null);
 const [notice,setNotice]=useState(""),[scale,setScale]=useState(1),[range,setRange]=useState("");
 const navRef=useRef(nav);navRef.current=nav;
 const modeRef=useRef(props.controlMode);modeRef.current=props.controlMode;
 const lastTouch=useRef(0),committing=useRef(false);
 const [quantity,setQuantity]=useState(1);
 const [completion,setCompletion]=useState<{id:string;quantity:number;stage:"in"|"out"}|null>(null);
 const completionRef=useRef(completion);completionRef.current=completion;
 useEffect(()=>{
  if(!completion)return;
  const messagesEnd=200+(completion.quantity-1)*250+1000;
  const fadeOut=window.setTimeout(()=>setCompletion(value=>value?{...value,stage:"out"}:null),messagesEnd);
  const finish=window.setTimeout(()=>{
   setCompletion(null);completionRef.current=null;committing.current=false;
   setAllocated(new Set());setQuantity(1);setPhase("select");setNotice("");
   navRef.current=`recipe-${selected}`;setNav(navRef.current);setHover(null);
  },messagesEnd+200);
  return ()=>{window.clearTimeout(fadeOut);window.clearTimeout(finish);};
 },[completion?.id,completion?.quantity]);
 const baseRecipe=CRAFTING_RECIPES[selected];
 const current={...baseRecipe,req:baseRecipe.req.map(([id,n])=>[id,n*quantity] as [string,number])},locked=phase!=="select";
 const maxQuantity=Math.max(0,Math.min(...baseRecipe.req.map(([id,n])=>Math.floor((props.inventory[id]||0)/n))));
 function changeQuantity(delta:number){
  if(phase!=="ready")return;
  setQuantity(previous=>Math.max(1,Math.min(maxQuantity,previous+delta)));
 }
 const validAllocated=new Set([...allocated].filter(id=>(props.inventory[id]||0)>=(current.req.find(r=>r[0]===id)?.[1]||Infinity)));
 const ready=current.req.every(([id])=>validAllocated.has(id));
 const progress=phase==="crafted"?current.req.length:validAllocated.size;
 const pct=Math.round(progress/current.req.length*100);
 const owned=ITEM_DEFINITIONS.filter(entry=>(props.inventory[entry.id]||0)>0);
 const materials=filter?owned.filter(entry=>current.req.some(([id])=>id===entry.id)):owned;
 const pages=Math.max(1,Math.ceil(materials.length/12)),activePage=Math.min(page,pages-1);
 const choices=()=>Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")||[]).filter(b=>b.getClientRects().length>0);
 function mode(next:StarshipInteractionControlMode){
   modeRef.current=next;setHover(null);setNotice("");
   if(document.activeElement instanceof HTMLElement&&root.current?.contains(document.activeElement))document.activeElement.blur();
   props.onControlModeChange(next);
 }
 function back(){
   if(completionRef.current)return;
   props.onInput();setNotice("");
   if(phase!=="select"){setPhase("select");if(phase==="crafted")setAllocated(new Set());setNav(`recipe-${selected}`);}
   else props.onBack();
 }
 function syncScroll(){
   const list=root.current?.querySelector<HTMLElement>("#craft-recipes");if(!list)return;
   const box=list.getBoundingClientRect(),rows=Array.from(list.children);
   const visible=rows.map((r,i)=>({r:r.getBoundingClientRect(),i})).filter(({r})=>r.bottom>box.top+2&&r.top<box.bottom-2);
   if(visible.length)setRange(`${String(visible[0].i+1).padStart(2,"0")} — ${String(visible.at(-1)!.i+1).padStart(2,"0")} / ${CRAFTING_RECIPES.length}`);
 }
 function move(direction:"left"|"right"|"up"|"down",linear?:number){
   if(completionRef.current)return;
   mode("directional");const list=choices();if(!list.length)return;
   const currentButton=list.find(b=>b.dataset.craftNav===navRef.current)||list[0],index=list.indexOf(currentButton);
   let target:HTMLButtonElement|undefined;
   if(linear)target=list[(index+linear+list.length)%list.length];
   else if(currentButton.classList.contains("recipe-row")&&(direction==="up"||direction==="down")){
     const rows=list.filter(b=>b.classList.contains("recipe-row")),i=rows.indexOf(currentButton);
     target=rows[(i+(direction==="down"?1:-1)+rows.length)%rows.length];
   }else{
     const a=currentButton.getBoundingClientRect(),horizontal=direction==="left"||direction==="right",sign=direction==="right"||direction==="down"?1:-1;
     const candidates=list.filter(b=>b!==currentButton).filter(b=>{
       if(!b.classList.contains("recipe-row"))return true;
       const r=b.getBoundingClientRect(),box=b.parentElement!.getBoundingClientRect();return r.bottom>box.top&&r.top<box.bottom;
     }).map(b=>{const r=b.getBoundingClientRect(),x=r.x+r.width/2-a.x-a.width/2,y=r.y+r.height/2-a.y-a.height/2;return {b,along:(horizontal?x:y)*sign,cross:Math.abs(horizontal?y:x)};});
     target=candidates.filter(c=>c.along>2).sort((a,b)=>(a.along+a.cross*3)-(b.along+b.cross*3))[0]?.b
       ||candidates.sort((a,b)=>(a.along+a.cross*3)-(b.along+b.cross*3))[0]?.b;
   }
   if(target){navRef.current=target.dataset.craftNav!;setNav(navRef.current);props.onInput();}
 }
 const api=useRef<StarshipInteractionMenuController>(null);
 api.current={
   move,back,setControlMode:mode,
   hover:index=>{const b=index===null?null:choices()[index];setHover(b?.dataset.craftNav||null);if(b){navRef.current=b.dataset.craftNav!;setNav(navRef.current);}},
   activate:()=>{if(completionRef.current)return;if(modeRef.current==="cursor"&&!hover)return;choices().find(b=>b.dataset.craftNav===navRef.current)?.click();}
 };
 useImperativeHandle(ref,()=>({
   move:d=>api.current?.move(d),back:()=>api.current?.back(),hover:i=>api.current?.hover(i),
   activate:()=>api.current?.activate(),setControlMode:m=>api.current?.setControlMode(m)
 }),[]);
 useLayoutEffect(()=>{
   const list=choices();list.forEach((b,i)=>{b.dataset.starshipMenuIndex=String(i);});
   let chosen=list.find(b=>b.dataset.craftNav===nav);
   if(!chosen){chosen=list.find(b=>b.dataset.craftNav===`recipe-${selected}`)||list[0];if(chosen)setNav(chosen.dataset.craftNav!);}
   if(props.controlMode==="directional"&&chosen?.classList.contains("recipe-row")){
     const parent=chosen.parentElement!,r=chosen.getBoundingClientRect(),box=parent.getBoundingClientRect();
     if(r.top<box.top)parent.scrollTop-=(box.top-r.top)/scale;
     else if(r.bottom>box.bottom)parent.scrollTop+=(r.bottom-box.bottom)/scale;
   }
   syncScroll();
 });
 useEffect(()=>{
   const resize=()=>{const box=root.current?.getBoundingClientRect();if(box)setScale(Math.min(box.width/1480,box.height/870));};
   resize();window.addEventListener("resize",resize);
   return ()=>window.removeEventListener("resize",resize);
 },[]);
 useEffect(()=>{
   const key=(e:KeyboardEvent)=>{
     if(completionRef.current){e.preventDefault();e.stopImmediatePropagation();return;}
     const directions:Record<string,"left"|"right"|"up"|"down">={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down"};
     if(!directions[e.key]&&!["Tab","Enter"," ","Escape"].includes(e.key))return;
     e.preventDefault();e.stopImmediatePropagation();latest.current.onInputModeChange("keyboard-mouse");
     if(directions[e.key])api.current?.move(directions[e.key]);
     else if(e.key==="Tab")move("right",e.shiftKey?-1:1);
     else if(!e.repeat){api.current?.setControlMode("directional");if(e.key==="Escape")api.current?.back();else api.current?.activate();}
   };
   window.addEventListener("keydown",key,true);
   return ()=>window.removeEventListener("keydown",key,true);
 });
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),2400);return ()=>clearTimeout(timer);},[notice]);
 function add(id:string){
   if(locked)return;
   const need=current.req.find(r=>r[0]===id);
   if(!need){setNotice("此素材不屬於目前配方");return;}
   if(validAllocated.has(id)){setNotice("這項素材已投入，可點右上角勾勾或中央格子取回");return;}
   if((props.inventory[id]||0)<need[1]){setNotice("背包素材數量不足");return;}
   setAllocated(new Set([...validAllocated,id]));
 }
 function prepare(){
   if(completionRef.current)return;
   if(phase==="select"){if(ready){committing.current=false;setPhase("ready");}}
   else if(phase==="ready"){
     if(committing.current)return;committing.current=true;
     try{const result=props.onCraft(current.id,quantity);if(result.ok){setPhase("crafted");setAllocated(new Set());setNotice("");
      const effect={id:current.id,quantity,stage:"in" as const};completionRef.current=effect;setCompletion(effect);
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();}else{setPhase("select");setNotice(result.reason||"素材不足，請重新確認");}}
     catch {committing.current=false;setPhase("select");setNotice("製作未完成，請重新確認背包");}
   }else{setPhase("select");setQuantity(1);setAllocated(new Set());}
 }
 function button(key:string,label:ReactNode,action:()=>void,options:{className?:string;disabled?:boolean;id?:string;aria?:string;pressed?:boolean}={}){
   return <button key={key} type="button" id={options.id?`craft-${options.id}`:undefined} data-craft-nav={key}
     className={`${options.className||""} ${props.controlMode==="directional"&&nav===key?"nav-focus":""} ${props.controlMode==="cursor"&&hover===key?"cursor-hover":""}`}
     disabled={!!completion||options.disabled} aria-label={options.aria} aria-pressed={options.pressed}
     onClick={()=>{if(completionRef.current)return;navRef.current=key;setNav(key);props.onInput();action();}}>{label}</button>;
 }
 const owner=props.controlMode==="pointer"?"mouse":props.controlMode;
 return <div ref={root} className="crafting-workbench starship-interaction-menu" data-owner={owner} data-control-mode={props.controlMode} data-input-mode={props.inputMode}
   onPointerDown={e=>{if(e.pointerType==="touch"){lastTouch.current=performance.now();props.onInputModeChange("mobile");mode("touch");}else if(performance.now()-lastTouch.current>800){props.onInputModeChange("keyboard-mouse");mode("pointer");}}}
   onPointerMove={e=>{if(e.pointerType==="mouse"&&Math.abs(e.movementX)+Math.abs(e.movementY)>1&&performance.now()-lastTouch.current>800&&modeRef.current!=="pointer"){props.onInputModeChange("keyboard-mouse");mode("pointer");}}}>
  <main className="craft-stage" role="dialog" aria-modal="true" aria-label="道具合成系統" style={{"--scale":scale} as CSSProperties}>
   {completion&&<div className={`craft-completion-overlay is-${completion.stage}`} role="status" aria-live="polite" aria-label={`製作完成，已將 ${completion.quantity} 件 ${item(completion.id).name} 放入背包`} data-quantity={completion.quantity} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <div className="craft-completion-shade"/>
    <div className="craft-completion-content"><div className="craft-completion-icon"><ItemArt entry={item(completion.id)} large/></div>
     <div className="craft-completion-messages" aria-hidden="true">{Array.from({length:completion.quantity},(_,i)=><p key={i} style={{animationDelay:`${200+i*250}ms`}}>製作完成，已成功將 1 件 {item(completion.id).name} 放入背包</p>)}</div>
    </div>
   </div>}
   <header className="hero panel"><div className="hero-art"/><div className="hero-shade"/>
    <div className="hero-copy"><div className="eyebrow">ECHOES BEYOND THE STARS <span> / </span> FIELD WORKSHOP</div><h1>道具合成系統</h1><div className="hero-en">CRAFTING WORKBENCH</div><p>從殘骸中重建可能，讓每一份資源成為生存的下一步。</p><div className="hero-meta"><i/> 製作工作台已連線 <b>伊薩卡號 — 工作甲板</b></div></div>
    <div className="preview-tag">CRAFTING STATION<strong>製作工作台</strong>{button("exit","返回製作選單",props.onBack,{className:"text-button"})}</div>
   </header>
   <div className="workspace">
    <section className="panel inventory"><span className="craft-panel-texture" aria-hidden="true"/><div className="panel-head"><div><small>01 / MATERIAL STORAGE</small><h2>素材背包</h2></div><span className="count">{owned.length} 種物品</span></div>
     <div className="toolbar"><span>點選素材投入配方</span>{button("filter","僅顯示需求",()=>{setFilter(!filter);setPage(0);},{id:"filter",className:"text-button",pressed:filter,disabled:locked})}</div>
     <div id="craft-inventory" className="inventory-grid">{materials.slice(activePage*12,(activePage+1)*12).map(entry=>{
       const need=current.req.find(r=>r[0]===entry.id),added=validAllocated.has(entry.id);
       return <div key={entry.id} className="material-cell">{need&&!added&&<span key={current.id} className="material-need-ripple" aria-hidden="true">{[0,1].map(wave=><svg key={wave} className="material-ripple-wave" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M4 1H96L99 4V96L96 99H4L1 96V4Z" vectorEffect="non-scaling-stroke"/></svg>)}</span>}{button(`material-${entry.id}`,<><Category entry={entry}/><ItemArt key={entry.id} entry={entry}/><span className="quantity">{(props.inventory[entry.id]||0)-(added?need![1]:0)}</span><span className="item-name">{entry.name}</span></>,()=>add(entry.id),{className:`item ${need?"is-needed":""} ${added?"is-added":""}`,disabled:locked,aria:`${entry.name}，${categoryNames[category(entry)]}，持有 ${props.inventory[entry.id]||0}，點選投入`})}{added&&button(`unassign-${entry.id}`,"✓",()=>{setAllocated(new Set([...validAllocated].filter(id=>id!==entry.id)));setNotice("");},{className:"material-unassign",disabled:locked,aria:`取消投入${entry.name}`})}</div>;
     })}{!materials.length?<span className="empty-inventory">目前沒有{filter?"所需":"可用"}素材</span>:null}</div>
     <nav className="material-pagination" aria-label="素材分頁">{button("prev-page","◀",()=>setPage((activePage-1+pages)%pages),{id:"prev-page",disabled:locked||pages===1,aria:"上一頁素材"})}<span id="craft-material-page">{activePage+1} / {pages}</span>{button("next-page","▶",()=>setPage((activePage+1)%pages),{id:"next-page",disabled:locked||pages===1,aria:"下一頁素材"})}</nav>
     <div className="panel-note"><i/> 點選投入先暫存，確認製作時才會扣除素材。</div>
    </section>
    <section className={`panel recipe ${ready||phase==="crafted"?"all-ready":""}`}><span className="craft-panel-texture" aria-hidden="true"/><div className="panel-head"><div><small>02 / ASSEMBLY CHAMBER</small><h2>合成配方</h2></div><span id="craft-progress" className="count">{progress} / {current.req.length} {phase==="crafted"?"已完成":"已投入"}</span></div>
     <div className="recipe-target"><span>目前目標</span><strong id="craft-target-name">{item(current.id).name}</strong>{button("auto-fill","自動補齊素材",()=>{const next=new Set(validAllocated);current.req.forEach(([id,n])=>{if((props.inventory[id]||0)>=n)next.add(id);});setAllocated(next);if(next.size<current.req.length)setNotice("已補齊可投入素材，其餘素材數量不足");},{id:"auto-fill",className:"batch text-button",disabled:locked||ready})}</div>
     <div id="craft-requirements" className="requirements">{current.req.map(([id,n],i)=>{
       const added=validAllocated.has(id)||phase==="crafted";
       return button(`require-${id}`,<><span className="slot-label">MATERIAL / 0{i+1}</span><ItemArt key={id} entry={item(id)}/><strong>{item(id).name}</strong><span className="ratio">{added?n:0} / {n} {added?"✓":""}</span></>,()=>setAllocated(new Set([...validAllocated].filter(key=>key!==id))),{className:`requirement ${added?"ready":""}`,disabled:locked,aria:`${item(id).name}，已投入 ${added?n:0} / ${n}，點選取回`});
     })}</div>
     <div className="machine-zone"><div className="feeds"><i/><i/><i/></div><div className="machine-viewport"><img className="machine-scene machine-scene-soft" src={assetUrl("ui/power-devices/工作台.png")} alt="" aria-hidden="true"/><img className="machine-scene machine-scene-sharp" src={assetUrl("ui/power-devices/工作台.png")} alt="製作工作台中央機器"/></div><div className="machine-caption">FABRICATION UNIT <b>{phase==="crafted"?"COMPLETE":ready?"READY":"STANDBY"}</b></div></div>
     <div className="assembly-status"><div><span id="craft-status-title">{phase==="crafted"?"製作完成":ready?"素材已備齊":progress?"素材投入中":"等待投入素材"}</span><strong>{pct}%</strong></div><div className="meter"><i style={{width:`${pct}%`}}/></div><p>{phase==="crafted"?"成品已放入背包。":phase==="ready"?"確認製作將消耗投入素材，並將成品放入背包。":ready?"可以進入製作準備，查看結果物品。":"從左側點選對應素材投入；點中央素材可取回。"}</p></div>
    </section>
    <section className="panel output"><span className="craft-panel-texture" aria-hidden="true"/><div className="panel-head"><div><small>03 / {locked?"CRAFTING RESULT":"RECIPE LIBRARY"}</small><h2>{locked?"製作結果":"可製作物品"}</h2></div><span className="count">{locked?`× ${quantity}`:CRAFTING_RECIPES.length}</span></div>
     {!locked?<div id="craft-recipe-view"><div className="list-caption">選擇目標，查看素材需求</div><div id="craft-recipes" className="recipe-list" onScroll={syncScroll}>{CRAFTING_RECIPES.map((recipe,i)=>button(`recipe-${i}`,<><ItemArt key={recipe.id} entry={item(recipe.id)}/><div><strong>{item(recipe.id).name}</strong><small>{recipe.type} · {recipe.req.length} 種素材</small></div><span className="arrow">{selected===i?"›":"+"}</span></>,()=>{if(i!==selected){setSelected(i);setQuantity(1);setAllocated(new Set());}setPhase("select");},{className:`recipe-row ${selected===i?"selected":""}`,pressed:selected===i}))}</div><div className="scroll-caption"><span>{range}</span><span>捲動瀏覽更多配方 ↓</span></div><p className="output-note">備齊素材並按下「製作準備」後，<br/>此欄將切換為製作結果預覽。</p></div>:
     <div id="craft-result-view"><div className="result-art"><ItemArt key={current.id} entry={item(current.id)} large/><span className="result-badge">{phase==="crafted"?"製作完成":"預期產出"} × {quantity}</span></div><h3 className="result-name">{item(current.id).name}</h3><div className="result-en">{current.en}</div><p className="result-desc">{item(current.id).description}</p><div className="result-spec"><span>分類 <strong>{categoryNames[category(item(current.id))]}</strong></span><span>重量 <strong>{item(current.id).weight} kg</strong></span></div>{phase==="ready"?<div className="craft-quantity-row"><span>指定製作數量</span>{button("quantity-minus",<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 10.5H19L20.5 12L19 13.5H5L3.5 12Z"/></svg>,()=>changeQuantity(-1),{className:"quantity-step",disabled:quantity<=1,id:"quantity-minus",aria:"減少製作數量"})}<output id="craft-quantity" aria-live="polite">{quantity}</output>{button("quantity-plus",<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10.5 5L12 3.5L13.5 5V10.5H19L20.5 12L19 13.5H13.5V19L12 20.5L10.5 19V13.5H5L3.5 12L5 10.5H10.5Z"/></svg>,()=>changeQuantity(1),{className:"quantity-step",disabled:quantity>=maxQuantity,id:"quantity-plus",aria:"增加製作數量"})}</div>:<p className="batch-completed">已製作 {quantity} 件</p>}</div>}
    </section>
   </div>
   <footer><div className="steps"><span className={!locked?"active":""}>01 選擇配方</span><i/><span className={progress>0&&!locked?"active":""}>02 投入素材</span><i/><span className={locked?"active":""}>03 確認結果</span></div><div className="actions">
    {button("reset",locked?"返回配方":"清空投入",()=>{if(locked)back();else setAllocated(new Set());},{id:"reset",className:"button secondary"})}
    {button("prepare",phase==="select"?"製作準備 →":phase==="ready"?"確認製作":"繼續製作",prepare,{id:"prepare",className:"button primary",disabled:(phase==="select"&&!ready)||(phase==="ready"&&(!ready||quantity>maxQuantity))})}
   </div></footer>
   <div className="bottom-line"><span>{props.inputMode==="gamepad"?<><GamepadButtonIcon button="DPad"/><GamepadButtonIcon button="LS"/> 選擇　<GamepadButtonIcon button="A"/> 確認　<GamepadButtonIcon button="B"/> 返回</>:props.inputMode==="mobile"?"輕觸：選擇配方／投入素材":"方向鍵：選擇 · Enter：確認 · Esc：返回"}</span><span>CRAFTING WORKBENCH</span></div>
   <div id="craft-toast" className={notice?"show":""} role="status" aria-live="polite">{notice}</div>
  </main>
 </div>;
});
