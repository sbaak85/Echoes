# Echoes 任務編輯器

`QuestEditor.exe` 是獨立的任務資料編輯器，不依附 MapEditor 或章節腳本編輯器。

預設讀寫：`public/quests/quest-data.json`

第一版功能：

- 左側章節與任務樹。
- 中間任務階段與目標清單。
- 新增階段會自動使用 `QUEST_..._STAGE_XX`，目標則使用整個任務共用的
  `QUEST_..._OBJ_XX` 流水號。
- 右側章節、任務、階段、目標屬性。
- 每個任務可設定「啟動延遲（秒）」；0 代表派發條件成立後立即啟動，
  大於 0 則保留為遊戲端正式啟動前的現實時間延遲。
- 「前置任務 ID」使用專用勾選視窗，可直接從現有任務的 ID 與名稱複選；
  複數前置任務預設採全部完成（AND）才開放派發。
- 每個 Stage 與 OBJ 也可各自設定「啟動延遲（秒）」。Stage 延遲從進入該
  階段後開始計算；OBJ 延遲則從 Stage 正式啟動後開始計算。尚未啟動的
  目標不會顯示，也不會接受拾取、互動等完成事件。
- Stage 與 OBJ 可設定「完成延遲（秒）」。條件達成當下會先保存完成旗標；
  OBJ 的核取與完成 Tween、Stage 的 NEXT／任務完成演出及下一階段啟動，
  會等待各自設定的秒數後才執行。
- 每個 OBJ 可設定完成後介面操作（無／開啟／關閉）與目標介面；目前已登記
  `Inventory`（背包）及 `Options`（選項）。
- 新增、複製、刪除、排序。
- 從 Item、場景互動區、區域、對話與事件流程讀取外部 ID。
- 檢查全域 Stage ID、任務內 Objective ID、完整 ID 格式、失效 ID、
  空階段、空目標、前置任務循環與主線可放棄等問題。
- JSON 採安全暫存檔覆寫，避免儲存中斷破壞正式資料。

啟動方式：雙擊 `QuestEditor/QuestEditor.exe`。

簡易操作說明請見：[使用教學.md](使用教學.md)，或在編輯器上方按【使用教學】。

測試：

```powershell
QuestEditor.exe --self-test
QuestEditor.exe --ui-smoke-test
```
