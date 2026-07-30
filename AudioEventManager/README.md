# Echoes Audio Event Manager

`AudioEventManager.exe` 是獨立的遊戲音效事件設定工具，不需要先啟動
MapEditor。

它會讀寫專案根目錄下的 `app/audio-event-manager.ts`，可調整事件名稱、
觸發說明、原始素材路徑、遊戲 MP3 路徑、音量、延遲與 Loop。原始素材
路徑是選填資料，可完全留空；原始素材與遊戲 MP3 欄位右側的 `▶` 都可
立即預覽第一個檔案。原始素材欄空白時，其預覽按鈕會停用。

儲存時只會替換 TypeScript 內有標記的設定區塊。上一版檔案會備份到
`AudioEventManager/runtime/audio-event-manager.ts.bak`。

請讓整個 `AudioEventManager` 資料夾保持在 Echoes 專案根目錄下。
MapEditor 內的「Audio 音效」按鈕會開啟相同的共用管理視窗。
