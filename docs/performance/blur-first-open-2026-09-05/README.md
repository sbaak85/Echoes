# 回顧視窗模糊圖層：首次開啟效能實驗

日期：2026-09-05。僅獨立測試，未套入正式遊戲。UI 規格遵守 [專案 UI skill](../../../.codex/skills/browser-ui-focus-visuals/SKILL.md)（實際相對入口見下方）。

## 結果

共 35 次新瀏覽器程序：動態預熱 15 次、靜態快照 15 次、未準備對照 5 次。兩個候選在五個背景各重複三次，每次都是該瀏覽器程序第一次開啟。表內候選數字是各背景三次中位數；對照為每背景一次。單位 ms。

| 背景 | 預熱：開啟 | 快照：開啟 | 預熱：準備 | 快照：準備 | 對照：最長幀間隔 | 預熱：最長幀間隔 | 快照：最長幀間隔 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 營地 map_test01 | 45.8 | 46.5 | 15.5 | 107.4 | 108.4 | 58.3 | 58.4 |
| 場景 map_test02 | 46.0 | 45.9 | 15.7 | 109.4 | 100.6 | 58.4 | 58.4 |
| 遺跡 map_scene_06 | 46.2 | 46.9 | 15.6 | 102.8 | 100.1 | 58.7 | 58.5 |
| 叢林 map_scene_06B | 46.5 | 46.5 | 15.6 | 102.3 | 100.2 | 58.5 | 58.4 |
| 叢林 map_scene_06C | 45.8 | 46.4 | 15.9 | 102.7 | 108.4 | 58.4 | 58.5 |

候選全部樣本的開啟中位數：預熱 **46.0ms**、快照 **46.5ms**。範圍分別為 45.6–47.4ms、45.5–47.9ms，沒有足夠證據判定兩者開啟速度存在實質差異。

開啟後觀測窗內，每次「最長幀間隔」的中位數：未準備 **100.6ms**、預熱 **58.5ms**、快照 **58.5ms**。準備工作的中位數：預熱 **15.7ms**、快照 **102.8ms**；兩者另各有相同 500ms 的準備等待期。**這不是 15.7ms 或 102.8ms 的零成本移除，而是將部分工作移到開啟之前。** 預熱在等待期仍保有活的濾鏡成本。

## 兩種實作的精確定義

- warm：提前建立全畫面 blur(7px) 元素，will-change: backdrop-filter, opacity，opacity=.01，等待兩次繪製機會再保留 500ms。用 1% 非零透明度確實試繪濾鏡，不能將 display:none 或 opacity=0 的未繪製元素算成成功預熱。這會預先產生非常淡的模糊，也增加等待期的 GPU 工作；正式產品是否接受需另外決定。
- snapshot：將測試背景 Canvas（含測試 HUD）複製成靜態畫面，四周複製邊緣防止黑邊，Canvas blur(7px)，toBlob PNG 強制完成輸出，再 createImageBitmap 解碼，建立顯示 Canvas。上述複製、模糊、編碼、解碼都計入準備時間，另等 500ms；開啟只顯示結果。背景動畫會停在快照時刻。PNG 往返是這次原型的確定完成方式，不代表最佳快照實作。
- cold：未做濾鏡預熱／快照處理；同样等 500ms，開啟才顯示 blur(7px)。只用來觀察是否真的移走首次成本，五個樣本不能當作高精度統計。

## 量測定義與公平性

1. 測試程式：[runner](../../../tests/benchmarks/blur-first-open.cjs)、[繪製 fixture](../../../tests/benchmarks/blur-first-open.html)。只從 worktree 讀取 CSS／背景，使用獨立臨時 localhost server，沒有掛進遊戲路由或 app 元件。
2. 五張背景來自 Assets/map 的五個不同檔案，SHA-256 均不同，詳 results.json。各方法使用相同 cover 裁切、1440×900、DPR1、18 筆固定測試訊息、相同字體、同一份回顧視窗 CSS。背景每幀有相同移動光暈與 HUD 繪製工作。
3. 每次建立全新 Edge 程序／瀏覽器內容，所有測試 HTTP 回應 no-store，背景先解碼，避免將背景下载混入模糊比較。交替 warm/snapshot 的順序，降低先後順序偏差；不聲稱清除了顯示卡驅動或 OS 快取。
4. **開啟延遲**：從測試頁開始顯示模糊層、掛上回顧 DOM，到下一個 requestAnimationFrame 加後置 setTimeout 回呼。這是「繪製機會完成」的主執行緒延遲代理量，包含列表首次排版、捲動與焦點，不是純 blur shader 時間，也不是螢幕實際呈現／GPU 完工的硬體時間。
5. **最長幀間隔**：開啟後約350ms觀測窗的 rAF 最大間隔，對短暫卡頓更敏感；它是另一個指標，不能當作上述開啟延遲。JSON 的 settledAfterPaintMs 是固定延後150ms後的檢查時間，並非量得的動畫完成時間，不用於結論。
6. 本 fixture 將模糊層與列表容器分離；列表仍沿用100ms入場動畫，模糊層在正式開啟時直接到opacity1。不是完整遊戲的 React／事件／音訊流程重播，沒有完整正式輸入功能；按鈕僅保留相同 DOM 與焦點排版成本。沒有測試行動裝置。
7. snapshot 只擷取 fixture 已合成的 Canvas；正式遊戲的 DOM HUD、其他疊層、縮放、控制權與快照失效時機尚需獨立整合驗證。

## 環境

Windows，Edge 152.0.4191.53，headless，NVIDIA GeForce RTX 3080，ANGLE/D3D11，GPU compositing 與 rasterization enabled。完整環境在 [results.json](results.json)。硬體加速啟用仍不代表 headless 有實體螢幕呈現時間。

## 判斷

本輪數據顯示兩種準備方法都降低開啟期間的尖峰幀間隔，但「第一次繪製機會」本身幾乎一樣。若下一步選擇實驗方向，動態預熱的前置耗時較少且保留動態背景；但1%試繪及常駐成本必須另驗。沒有數據支持為了速度直接換成靜態背景，也沒有證明這就是整個遊戲其他視窗卡頓的共同原因。**未套用任何候選方案。**

## 原始證據與重跑

- [每次完整數據](results.json)、[摘要與正式檔案前後雜湊](summary.json)、[CSV](results.csv)。
- 五張背景各有 warm/snapshot/cold 第一輪截圖，例如 [營地預熱](camp-warm.png)、[營地快照](camp-snapshot.png)、[叢林C預熱](jungleC-warm.png)、[叢林C快照](jungleC-snapshot.png)。
- runtimeFilesUnchanged = **true**，核對 movement-lab.tsx、globals.css、dialogue-history.ts、gamepad-glyph.ts、ui-asset-warmup.ts。此測試只有新增測試與報告檔案，沒有寫入玩家存檔。
- 專案 UI skill：[browser-ui-focus-visuals](../../../.codex/skills/browser-ui-focus-visuals/SKILL.md)。

執行（專案根目錄）：

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node tests/benchmarks/blur-first-open.cjs
```

預設結果輸出 .runtime/blur-first-open-benchmark；以 BLUR_BENCH_OUTPUT 指定新輸出目錄可保留既有結果。

## 逐次數據

| 背景 | 方法 | 輪次 | 開啟代理延遲 ms | 準備 ms | 最長幀间隔 ms |
|---|---|---:|---:|---:|---:|
| 營地 map_test01 | warm | 1 | 45.8 | 15.3 | 58.3 |
| 營地 map_test01 | snapshot | 1 | 46.7 | 104.3 | 58.5 |
| 營地 map_test01 | cold | 1 | 45.9 | 0.1 | 108.4 |
| 場景 map_test02 | snapshot | 1 | 47.5 | 109.4 | 50.0 |
| 場景 map_test02 | warm | 1 | 46.2 | 15.7 | 58.4 |
| 場景 map_test02 | cold | 1 | 46.0 | 0.1 | 100.6 |
| 遺跡 map_scene_06 | warm | 1 | 46.2 | 15.7 | 66.9 |
| 遺跡 map_scene_06 | snapshot | 1 | 45.5 | 102.8 | 66.8 |
| 遺跡 map_scene_06 | cold | 1 | 46.1 | 0.1 | 100.1 |
| 叢林 map_scene_06B | snapshot | 1 | 45.7 | 102.3 | 58.4 |
| 叢林 map_scene_06B | warm | 1 | 45.7 | 15.1 | 66.7 |
| 叢林 map_scene_06B | cold | 1 | 52.4 | 0.2 | 100.2 |
| 叢林 map_scene_06C | warm | 1 | 45.7 | 15.9 | 66.9 |
| 叢林 map_scene_06C | snapshot | 1 | 45.7 | 102.0 | 58.5 |
| 叢林 map_scene_06C | cold | 1 | 46.5 | 0.1 | 108.4 |
| 營地 map_test01 | snapshot | 2 | 45.5 | 108.6 | 58.3 |
| 營地 map_test01 | warm | 2 | 45.6 | 15.5 | 66.8 |
| 場景 map_test02 | warm | 2 | 46.0 | 15.7 | 58.5 |
| 場景 map_test02 | snapshot | 2 | 45.9 | 113.1 | 58.5 |
| 遺跡 map_scene_06 | snapshot | 2 | 46.9 | 108.7 | 58.5 |
| 遺跡 map_scene_06 | warm | 2 | 46.3 | 15.6 | 58.7 |
| 叢林 map_scene_06B | warm | 2 | 46.5 | 15.6 | 58.4 |
| 叢林 map_scene_06B | snapshot | 2 | 46.5 | 102.6 | 58.3 |
| 叢林 map_scene_06C | snapshot | 2 | 47.3 | 103.8 | 58.5 |
| 叢林 map_scene_06C | warm | 2 | 47.4 | 15.9 | 58.4 |
| 營地 map_test01 | warm | 3 | 45.8 | 15.6 | 58.3 |
| 營地 map_test01 | snapshot | 3 | 46.5 | 107.4 | 58.4 |
| 場景 map_test02 | snapshot | 3 | 45.9 | 101.1 | 58.4 |
| 場景 map_test02 | warm | 3 | 46.0 | 15.7 | 58.4 |
| 遺跡 map_scene_06 | warm | 3 | 45.8 | 15.6 | 58.5 |
| 遺跡 map_scene_06 | snapshot | 3 | 47.0 | 102.5 | 58.4 |
| 叢林 map_scene_06B | snapshot | 3 | 47.9 | 101.6 | 58.5 |
| 叢林 map_scene_06B | warm | 3 | 46.5 | 15.9 | 58.5 |
| 叢林 map_scene_06C | warm | 3 | 45.8 | 15.7 | 58.4 |
| 叢林 map_scene_06C | snapshot | 3 | 46.4 | 102.7 | 66.8 |
