# 匯流排小遊戲可攜式開發包

這是遠星迴聲／伊薩卡號的獨立 Worktree 預覽快照，不是正式遊戲整合版。

- 開始接手前，先讀 [製作還原與繼承指南](docs/製作還原與繼承指南.md) 和 [README](README.md)。
- 最新視覺版本在 `previews/bus-card-portrait-preview/`，橫式版本獨立保留。
- 修改、檢查或測試 UI 前，讀取並套用 [UI 技能](rules/browser-ui-focus-visuals/SKILL.md)。
- 沒有使用者授權，不把預覽套入正式章節、物品、任務或存檔，也不自動 commit 或 push。
- 只在本開發包內接續修改。暫存產物放 `output/`；不建立 `node_modules` 連結。
- 新的工作交接摘要放 `docs/`，UI 交接文件必須連結上述 UI 技能。這是本獨立開發包的文件目錄，不改變正式專案 `docs/daily-summaries` 的規則。
- 所有新路徑以檔案自身或本開發包根目錄為準，不依賴原電腦的磁碟／使用者名稱／Worktree 路徑。
- `reference/` 是歷史驗收截圖；`manifest.json` 是封裝基準，刻意修改後出現 CHANGED 不代表應自動覆蓋修改。
- 橫式／直式目前各自保存程式碼；改共通規則時要明確決定是否同步兩版，不能誤稱它們自動共享模組。
