伊薩卡號｜直式主機板與匯流排預覽

啟動：在本資料夾執行 node server.mjs，開啟 http://127.0.0.1:3067/。
橫式版本獨立保留於 ../bus-card-preview，網址 http://127.0.0.1:3066/。
此版本只存在對話 Worktree 的 output，不串接正式遊戲任務、物品或存檔。

直式主板接點 00 至 07 由上往下排列，四路管道在右側縱向延伸。
四個插槽並列在主板下方，卡架、拖曳浮卡與已插入模組都為直向。
卡片標示在上，能源核心居中，六片接點在底部。

操作：拖入空槽插卡，拖出原插槽拔卡；拖到另一張已插入的卡上放開可交換。
Esc、失焦、指標取消、輸入裝置切換會取消拖曳並返回原位。
保留點選插拔、鍵盤方向鍵與 Enter/空白鍵，以及手把左搖桿/方向鍵與 A 操作。
三張卡分別導通 1、2、3 節，插槽入口仍為 00、03、01、04。
只在編號接點相接，交叉處不導通。三段從 00 接至 06，動畫結束並穩定 0.65 秒後完成。

美術：assets/motherboard-portrait.png、assets/bus-module-portrait.png。
由內建 image_gen 依橫式科幻版重新構圖生成，完整提示詞見 assets/prompts.json。
UI 適用 .codex/skills/browser-ui-focus-visuals/SKILL.md。
檢查：node --test model.test.mjs input.test.mjs drag.test.mjs drag-lifecycle.test.mjs。