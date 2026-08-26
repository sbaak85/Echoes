# 2026-08-27 存檔、黑幕字幕、Line ID 與 BGM 重點摘要

## 摘要定位

- 專案權威路徑：`I:\Codex\專案型\Echoes`
- 本摘要整理 2026-08-27 已完成的主要修改；程式內容集中在提交 `7a5f077`（`更新存檔系統`）。
- 本次涉及 Options、阻擋式對話框、黑幕字幕等遊戲 UI；後續修改與測試須繼續遵守 [browser-ui-focus-visuals 專案 UI Skill](../../.codex/skills/browser-ui-focus-visuals/SKILL.md)。本次沒有刻意例外。

## 1. 可攜式 SaveData 系統

- 新增專案根目錄下的本機 `SaveData` 存檔系統，資料可隨資料夾複製至其他電腦，不綁定原裝置。
- Options 第一頁新增「存檔」頁籤，提供 1 格自動存檔與 25 格手動存檔。
- 已完成空格存檔、讀檔、覆蓋、刪除與確認視窗；空存檔列以半透明灰色顯示，選取時恢復清晰度。
- 存檔內容包含：
  - 目前場景，但不保存角色座標與面向。
  - 生存值與背包道具。
  - 任務／Stage／OBJ 級進度，包含同一 Stage 中已完成的個別 OBJ。
  - 劇情完成旗標、營地電力、互動與 ItemPoint 進度。
  - 已拾取的世界道具，以及玩家丟在地面的道具與精確地面位置。
- 不保存進行到一半的小遊戲、尚未完成的對話、UI 狀態與游標位置；沒有完成旗標時會從該流程起點重新開始。
- 本機啟動時由 Vite middleware 寫入實體 JSON；GitHub Pages 版本只使用瀏覽器工作階段暫存。
- 寫檔採原子替換與備份：自動存檔保留 `autosave-previous.json`，手動覆蓋／刪除保留時間戳備份。
- 本機 API 寫入失敗時會明確回報失敗，不再假裝已成功改存到瀏覽器。
- `SaveData/` 已加入 Git 忽略，不會把玩家實際進度提交至版本庫。

## 2. 黑幕白字幕與強制點亮原則

- 新增共用黑幕 Overlay 與黑幕白字幕流程。
- 修正字幕事件設定 FadeOut 後畫面仍保持全黑的嚴重問題。
- 非持續黑幕的固定底層原則：淡入 → 停留 → 淡出到透明度 0 → 解除輸入鎖定 → 移除阻擋層。
- 即使流程錯誤、中止或元件卸載，也必須執行保底清理並恢復完全點亮；只有明確設定 `keepBlack` 的流程才可維持黑幕。
- 章節腳本編輯器的黑幕字幕已改為逐句資料，每句可獨立設定字級，並支援 `Shift+Enter` 手動斷行；同時整理了編輯視窗排版與字級輸入操作。
- `chapter03-End` 由 `chapter03-section-9` 播放完成後觸發，依事件資料執行淡入、停留與淡出。

## 3. 對話 Line ID 與精確 BGM 事件

- 每一列對話新增穩定且可見的唯讀 `Line ID`。
- 舊對話已補齊唯一 ID；新增／插入台詞會自動產生 ID，移動台詞不改 ID，複製整個段落則重新產生新段落的 Line ID。
- ChapterScriptEditor、MapEditor 與 AudioEventManager 已同步支援並重新發佈執行檔。
- `chapter03-section-9` 的指定台詞：
  - Line ID：`chapter03-section-9-line-010`
  - 內容：`警告——偵測到非預期訊號來源。`
- AudioEventManager 新增 `dialogueLine` BGM 觸發類型。
- 規則 `chapter03-section-9-line-010-bgm-silence` 會在該行開始播放時，以 1 秒 Fade 將 BGM 音量降到 0；規則優先權為 500，直到後續明確的對話行 BGM 規則取代。

## 4. 第三章互動與生存條件修正

- `scene3-interaction-025` 已接續 `chapter03-section-9` 與章末黑幕字幕流程。
- `scene3-interaction-024` 若同時有多項生存條件不足，失敗提示會逐項列出，不再只顯示第一個條件。
- 生存計量 UI 改為無條件捨去小數，例如實際值 `59.9` 顯示為 `59`，避免畫面顯示已達 60、實際判定卻未達 60 的落差。

## 5. 啟動與本機服務

- 調整 `啟動遊戲.bat` 對應的 PowerShell 啟動流程與本機服務掛載，使 SaveData middleware 能在固定本機埠正常提供檔案讀寫。
- 已實際確認本機能建立 `SaveData/autosave.json`；該玩家資料維持在 Git 追蹤之外。

## 驗證結果

- 本次重跑 7 組相關測試檔，共 62 項：57 項通過、5 項失敗。
- 已確認通過的核心項目：
  - SaveData 格式、25 個手動槽、瀏覽器暫存、API 失敗回報。
  - 本機 SaveData 原子寫入、覆蓋備份、刪除封存與 Vite middleware 實體寫檔。
  - Options 存檔 UI、刪除確認與手把導覽。
  - 黑幕字幕正常淡入淡出、結束強制點亮，以及錯誤時保底解除鎖定。
  - `chapter03-section-9-line-010` 的 1 秒 BGM FadeOut 規則。
  - 多項生存條件提示與生存值無條件捨去顯示。
- 尚待整理的 5 項測試斷言：
  1. BGM 測試仍期待 `QUEST_CH03_MAIN_002` 的舊音量規則。
  2. 任務提示音效在 `Assets/Audio` 與 `public/audio` 的檔案內容不一致。
  3. 發電機運作聲測試期待 FadeOut 15%，目前資料為 30%。
  4. 焊接成功音效測試期待音量 1，目前資料為 0.4。
  5. `chapter03-section-9` 舊測試要求與 `chapter03-final` 完全深度相等，但新規格刻意為複製段落產生獨立 Line ID。
- 上述失敗均已保留為可追蹤事項；本摘要不將測試狀態誤標為全數通過。

## Git 與檔案注意事項

- 今天的程式修改已在 `7a5f077`，且建立摘要前已同步至 `origin/main`。
- 本摘要另以獨立提交補上並推送。
- 未追蹤的 `Assets/06_SW_FrontLeft_Magnific_Walk_1080p_2s.mp4` 與本次摘要無關，未納入提交。
