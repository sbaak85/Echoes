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
