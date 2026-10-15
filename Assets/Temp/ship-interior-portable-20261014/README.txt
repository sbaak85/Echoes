遠星迴聲：船艙 3D 可攜預覽（2026-10-14）

使用方式（Windows）
1. 完整解壓縮此資料夾。不要直接從 ZIP 內啟動。
2. 雙擊 start-preview.cmd。保持這個命令視窗開著。
3. 瀏覽器開啟 http://127.0.0.1:3054/ 。
4. 若缺少 Node.js，請家裡的 Codex 找出本機已安裝的 Node.js 並執行 preview/server.mjs；套件不包含 Node 執行檔。
5. 若 3054 被使用，在 PowerShell 中執行：
   $env:PORT='3064'; node ./preview/server.mjs
   然後開啟 http://127.0.0.1:3064/ 。

macOS/Linux 或已知 Node 路徑：在此目錄執行 node preview/server.mjs。
Three.js 已包含在 preview/vendor，不需要 npm install、CDN 或下載套件。

繼續開發
在家裡的 Codex 選擇此解壓資料夾作為工作目錄，先讀 AGENTS.md 與
docs/daily-summaries/2026-10-14-ship-preview-handoff.md，再繼續修改。
若要放進家裡 Echoes 遊戲專案，建議放在該專案的 output/ 之下，維持隔離。
不需要照搬原電腦的 .git、整個 Worktree、node_modules 或絕對路徑。

範圍
本包只有船艙預覽，不含正式遊戲、存檔、完整 Git 歷史，也不含先前的道具 Icon 預覽。
scene.js 是可編輯的 Three.js 程式化建模來源，並非單一 GLB/FBX 檔案。
index.html + style.css + scene.js 共同保留完整預覽介面與互動功能。
視角、開關選擇、正在運行的伺服器與舊工具工作階段不會從原電腦搬過來；啟動後使用預設狀態。
這是 2026-10-14 的快照，不會自動同步後續修改。兩台電腦輪流修改時，請搬回最新的整份預覽檔案。

references/layout.png：使用者提供的空間配置參考。
references/art-direction.png：使用者提供的美術參考。
references/current-preview.png：本次打包的預覽畫面。
preview/vendor/LICENSE：Three.js 原始授權。
