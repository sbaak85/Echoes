import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StarshipInteractionMenu, type StarshipInteractionMenuController } from "../../app/starship-interaction-menu";
import { STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG as flag, shouldStartStarshipCraftingTutorial } from "../../app/starship-crafting-tutorial";
import { craftInventoryRecipe, isWorkbenchMaterial } from "../../app/crafting-recipes";
import { ITEM_DEFINITIONS, type PlayerInventory } from "../../app/item-database";

// Isolated component QA, no player storage, world state, or production inventory writes.
function Harness() {
  const [open, setOpen] = useState(false), [active, setActive] = useState(true), [completed, setCompleted] = useState(false);
  const [input, setInput] = useState<"keyboard-mouse" | "gamepad" | "mobile">("keyboard-mouse");
  const [inventory, setInventory] = useState<PlayerInventory>({ R0020: 2, R0036: 2 });
  const [failCraft, setFailCraft] = useState(false);
  const control = useRef<StarshipInteractionMenuController>(null);
  const simulate = (action: () => void) => { setInput("gamepad"); control.current?.setControlMode("directional"); action(); };
  const cursorClick = (selector: string) => {
    setInput("gamepad"); control.current?.setControlMode("cursor");
    control.current?.activatePointerTarget?.(document.querySelector(selector));
  };
  return <div className="game-shell">
    <aside aria-label="Tutorial test controls" style={{ position: "fixed", top: 0, left: 0, zIndex: 200, background: "#0c1724", padding: 8 }}>
      <button onClick={() => setOpen(true)}>開啟教學測試</button>
      <button onClick={() => setOpen(false)}>中斷測試</button>
      <button onClick={() => { setOpen(false); setCompleted(false); }}>重置教學測試</button>
      <button onClick={() => setActive(value => !value)}>切換 OBJ17</button>
      <button onClick={() => simulate(() => control.current?.move("down"))}>模擬 LS 下</button>
      <button onClick={() => simulate(() => control.current?.activate())}>模擬 A</button>
      <button onClick={() => simulate(() => control.current?.back())}>模擬 B</button>
      <button onClick={() => simulate(() => { control.current?.switchColumn?.(-1); control.current?.secondary?.(); control.current?.inspect?.(); control.current?.changePage?.(1); })}>模擬 LB X Y RT</button>
      <button onClick={() => simulate(() => { const now=performance.now(); control.current?.updateTriggers?.(false,false,now);control.current?.updateTriggers?.(false,true,now+1); })}>模擬 RT 加一</button>
      <button onClick={() => setFailCraft(value=>!value)}>切換製作失敗模擬</button>
      <label>素材情境<select aria-label="素材情境" onChange={event=>{
        setOpen(false);setCompleted(false);
        const preset=event.target.value;
        setInventory(preset==="full"?Object.fromEntries(ITEM_DEFINITIONS.filter(item=>isWorkbenchMaterial(item.id,"T0006")).map(item=>[item.id,2]))
          :preset==="single"?{R0020:1,R0036:1}:preset==="missing-sac"?{R0036:2}:preset==="missing-tube"?{R0020:2}:{R0020:2,R0036:2});
      }}><option value="normal">兩份素材</option><option value="full">完整素材背包</option><option value="single">一份素材</option><option value="missing-sac">缺螢光包囊</option><option value="missing-tube">缺空試管瓶</option></select></label>
      <button onClick={() => cursorClick('[data-tutorial-action="repair"]')}>游標點鎖定卡</button>
      <button onClick={() => cursorClick('[data-tutorial-action="craft"], [data-tutorial-action="workbench"], [data-tutorial-item-id="T0006"] .recipe-row')}>游標點目標</button>
      <output aria-label="Tutorial flags">OBJ17：{active ? "active" : "locked"}／完成：{String(completed)}／素材：{JSON.stringify(inventory)}</output>
    </aside>
    {open ? <StarshipInteractionMenu ref={control} inventory={inventory} inputMode={input} onInputModeChange={setInput}
      onControlModeChange={() => {}} onInput={() => {}} onSleep={() => {}} onClose={() => setOpen(false)}
      tutorialStart={shouldStartStarshipCraftingTutorial({ isObjectiveInProgress: () => active }, { [flag]: completed })}
      onTutorialCompleted={() => setCompleted(true)} onCraft={(id, quantity = 1) => {
        if(failCraft)return {ok:false,reason:"模擬製作失敗：未扣除素材"};
        const result = craftInventoryRecipe(inventory, id, quantity); if (result.ok) setInventory(result.inventory); return result;
      }} /> : null}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
