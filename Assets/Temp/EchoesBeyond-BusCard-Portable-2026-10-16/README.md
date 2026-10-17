# 伊薩卡號｜匯流排小遊戲可攜式開發包

封裝日期：2026-10-16（Asia/Taipei）。包含橫式科幻版、最新直式科幻版、完整原始碼、圖片、生成提示詞、現有測試與接手文件。**這是獨立預覽，尚未接入遠星迴聲正式遊戲。**

## 帶回家後開始

1. 完整解壓縮 ZIP；不要在壓縮檔內直接點啟動檔。可放在不同磁碟或含空白／中文的資料夾。
2. 電腦需要 Node.js；本包以 **Node.js v24.19.0／Windows x64** 驗證，不附 Node 執行檔。若沒有 Node，從 [Node.js 官方網站](https://nodejs.org/) 安裝，再重新開終端機。**不需要 npm install、pnpm、主遊戲或 Codex 才能試玩。**
3. 雙擊 **`start.cmd`**，預設開直式版本；雙擊 **`start-landscape.cmd`** 開橫式。
4. 保留命令視窗。停止時按 `Ctrl+C`，或關閉該視窗。檔案修改後重新整理網頁；沒有自動熱更新。
5. 接續開發前讀 [製作還原與繼承指南](docs/製作還原與繼承指南.md)。

預設網址：

- 直式：<http://127.0.0.1:3070/portrait/>
- 橫式：<http://127.0.0.1:3070/landscape/>

兩版可以在同一伺服器不同分頁開啟；各自的操作狀態獨立。原先 Worktree 的 3066／3067 不是搬家後必須沿用的位址。

## 檢查與命令

```powershell
# 在本包根目錄
node server.mjs                         # 手動開上面的網址
node server.mjs --port 3071 --open      # 3070 被佔用時
node server.mjs --port 0 --open         # 交給系統選擇空閒埠
node server.mjs --view landscape --open
node scripts/test.mjs                  # 橫式、直式現有測試
node scripts/verify.mjs                # 核對封裝檔案 SHA-256
```

Windows 也可雙擊 `test.cmd`、`verify.cmd`。啟動檔先找本包的 `runtime/node.exe`（可自行放入官方 Windows Node），再找 PATH 的 `node`。macOS／Linux 可用當地 Node 執行同一組命令；本次未在那些系統實測。

## 內容

| 位置 | 用途 |
| --- | --- |
| `previews/bus-card-portrait-preview/` | 最新直式主板、直向卡片、錯開槽位、對齊文字、盲端細線 |
| `previews/bus-card-preview/` | 保留橫式版本及第一版美術歷史資源 |
| `docs/製作還原與繼承指南.md` | 詳細製作、規則、操作、資源、架構、還原與下一位接手指引 |
| `docs/驗證紀錄.md` | 本次封裝與搬移實測結果、未測範圍 |
| `rules/browser-ui-focus-visuals/` | UI 技能完整副本及其附屬文件 |
| `reference/` | 原 Worktree 驗收截圖；不是遊戲材質 |
| `manifest.json` | 封裝基準檔案大小與 SHA-256（不包含 manifest 自身） |
| `server.mjs`、`scripts/`、`*.cmd` | 可搬移的啟動、檢查與測試工具 |

UI 修改適用 [browser-ui-focus-visuals 技能](rules/browser-ui-focus-visuals/SKILL.md)。本包未建立任何 Git 提交，也不會自動推送。請保留原 ZIP，家中改善內容另存版本。
