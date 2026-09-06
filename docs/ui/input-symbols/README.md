# 手把與鍵鼠按鍵符號索引

基準：2026-09-05 當前 worktree。這是長期規格索引，不是每日進度摘要。UI 工作須遵守 [browser-ui-focus-visuals skill](../../../.codex/skills/browser-ui-focus-visuals/SKILL.md)。

## 給子代理的入口

1. 先讀本頁，再查 [完整清單與規格表](catalog.md)、[機器索引](index.json)、[圖形預覽](preview.html)。
2. **已套用**：19 個手把 SVG、滑鼠左鍵第 5 版、依 2026-09-05 明確需求套用的滑鼠右鍵，以及既有 CSS WASD 輸入指示。**鍵鼠金色 SVG 27 款為原預覽稿**；其中左鍵第 5 版與右鍵已有遊戲來源，其餘 25 款不可視為已核准、已套用。
3. 按 ID 引用，勿用圖片位置或「某個相似版本」替代。遊戲手把 A 是 `gamepad.A`；鍵盤 A 預覽是 `preview.A`，不能混用。
4. 先執行索引驗證。來源或 fixture 有差異時查清使用者指定的版本，不能為了讓驗證通過而更新核准 fixture。
5. 延伸已核准符號只改使用者指定的屬性。保留 SVG 路徑、圖層順序、陰影、外框、字型、尺寸與基線；不要依截圖重繪，也不要使用舊預覽覆蓋 runtime。
6. **27 款鍵盤／滑鼠圖形預設皆為預備款，禁止自行引用或套用。只有使用者明確指定哪些符號要替換，才可將指定款式建立為 runtime 資產；不得從「生成預覽」「建立索引」推定套用授權。** 既有遊戲左鍵第 5 版與本次明確指定的右鍵均由獨立 runtime 來源維持，不代表整套預備款獲准。Debug 的鍵盤文字依既有要求保留。

## 權威來源與狀態

| 資料 | 來源 | 引用方式 |
|---|---|---|
| 手把 19 個圖形 | [gamepad-glyph.ts](../../../app/gamepad-glyph.ts) | `GAMEPAD_GLYPHS`、`GAMEPAD_GLYPH_LABELS`、`getGamepadGlyphSvg`、`getGamepadGlyphUrl` |
| 手把核准快照 | [gamepad-glyph-approved.json](../../../tests/fixtures/gamepad-glyph-approved.json) | 逐一比對 runtime SVG，不自行改基準 |
| React 手把符號／提示 | [gamepad-button-icon.tsx](../../../app/gamepad-button-icon.tsx) | `GamepadButtonIcon`、`GamepadHint` |
| 已套用滑鼠左鍵第 5 版 | [mouse-left.svg](../../../public/ui/input/mouse-left.svg) | `uiAssetUrl("input/mouse-left.svg")` |
| 已套用滑鼠右鍵 | [mouse-right.svg](../../../public/ui/input/mouse-right.svg) | `uiAssetUrl("input/mouse-right.svg")` |
| 現行尺寸、對齊及 CSS WASD | [globals.css](../../../app/globals.css) | 查 selector；index.json 保留相關規則與覆寫順序 |
| DOM／Canvas 實際使用 | [movement-lab.tsx](../../../app/movement-lab.tsx) | 搜尋 `drawMouseLeftClickIcon`、`getGamepadGlyphUrl`、`keyboard-input-hint` |
| 鍵鼠 27 款預覽原稿 | [封存原稿](keyboard-mouse-preview-source.html) | 只供延伸參考，不是 runtime renderer |

預覽原稿從 `C:/Users/sbaak/.codex/visualizations/2026/09/04/01a06ece-bc07-74e2-b26a-e124f02432d8/keyboard-mouse-symbols-preview.html` 原樣封存，避免其他子代理依賴該機器的暫存路徑。SHA-256 收錄於 index.json。預覽上的「互動／任務」名稱是原稿標籤，不是所有情境或可重綁按鍵的權威操作映射。

## 手把清單與圖形規格

全部使用 `viewBox="0 0 40 40"`。SVG 字級是設計座標單位；實際顯示依 CSS 縮放，不能把 25 直接當作畫面文字 25px。

| 系列／全部 ID | 圖形與文字 |
|---|---|
| A、B、X、Y | 圓鍵；底面中心 (20,21)、r16；頂面 (20,18.5)、r16、外框 1.2；文字 x20 y18、25、weight700；底部弧線寬2 |
| LB、RB、LT、RT | 共用厚實矩形；文字 x20 y17、19.5、weight700 |
| Start | 同矩形；三橫線 x12–28，y13/20/27，線寬2；內符號整組 translate(0,-1) |
| Select | 同矩形；重疊框 (10,11,14,11)、(16,17,14,11)，rx1、線寬1.5；內符號整組 translate(0,-1) |
| LS、RS | 無矩形外框；底盤橢圓 (20,32) 與 (20,29)，rx13 ry4；桿寬4；帽 rx11 ry8、頂面 y11；文字 L/R、12；輪廓1.8 |
| L3、R3 | 按下搖桿；整組 x=-3；帽頂 y16、底 y19；文字12；右側下壓箭頭線寬2 |
| DPad、DPadLeft、DPadRight、DPadUp、DPadDown | 無矩形外框；十字頂面與下移3的底面形成厚度；底面框1.1、頂面框1.3；一般版中心圓 r2，其餘各有方向三角形 |

共用文字：`Consolas,monospace`、`#ffe6a0`、`text-anchor=middle`、`dominant-baseline=central`。共用面漸層方向 `x2=.2 y2=1`：0=`#494c3e`、.55=`#30362b`、1=`#171e18`。

矩形依繪製順序：

1. 底座 x1 y6 w38 h29 rx4，`#090e0b`。
2. 本體 x1 y4 w38 h29 rx4，`#111810`。
3. 隆起頂面：上緣 y4、肩部 y8、底肩 y26、底緣 y29，套共用漸層。
4. 底緣曲線：y27–29，`#5a5b43`、opacity .45、stroke .7。
5. 文字或 Start／Select 內符號。
6. **外框最後畫在最上層**：x1 y4 w38 h29 rx4、fill none、`#d4b975`、stroke1.1。

十字完整路徑：`M14 3H26V13H36V25H26V35H14V25H4V13H14Z`。所有完整路徑、搖桿箭頭與配色直接引用 index.json 的 `svg`，不要依本表簡述重建。

## 鍵鼠清單與圖形規格

| 狀態／系列 | 全部符號 | 規格 |
|---|---|---|
| runtime 滑鼠鍵 | mouse.left、mouse.right | 40×40；分別精準吻合左半鍵與右半鍵填色；詳下方 |
| runtime CSS 指示 | W、A、S、D | CSS `.keycap`；11px Consolas/monospace、背景 #172024、字色 #dce6e7、框1px、圓角4px；不是金色 SVG |
| preview 字母／數字 | E、M、Q、R、W、A、S、D、1、2、3、4、5、6、7 | 40×40；字級22、x20 y17、weight700；沿用金色矩形厚度 |
| preview 功能鍵 | Tab、Space、Enter、Escape | 分別64×40、100×40、88×40、64×40；字級17、x為寬度一半、y17；顯示文案依 SVG |
| preview 方向 | ArrowUp、ArrowDown、ArrowLeft、ArrowRight | 40×40；向量箭頭，非字元字型；完整 path 見 index.json |
| preview 滑鼠 | MouseLeft、MouseRight、MouseHoldLeft、MouseDragLeft | 前三個40×40；拖曳40×44；MouseLeft／MouseRight 是已核准 runtime 資產的預覽副本，實際引用使用 mouse.left／mouse.right |

預覽鍵盤矩形以寬 W 計：底座 (1,6,W-2,29)、本體與最上層外框 (1,4,W-2,29)，rx4；其餘高度、漸層、倒角與手把矩形一致。保留寬鍵比例，不能強制壓成方形。預覽頁的 64px 大圖／28px 小圖只是展示尺寸，不代表已決定遊戲內尺寸。

滑鼠左鍵第5版依序為：底座 (7,5,26,32) rx6、`#090e0b`；本體 (7,3,26,32) rx6、`#111810`；頂面 (8,4,24,27) rx5、共用漸層；左鍵填色 `M13 4H20V19H8V9A5 5 0 0 1 13 4Z`、`#ffe6a0`；分隔線 `M20 3V19M8 19H32`、`#d4b975`、1.2；最上層外框 (7,3,26,32) rx6、1.1。

右鍵以相同滑鼠基準改填右半邊，現已依明確需求建立獨立 runtime 資產；長按預覽右下加時鐘，拖曳預覽底部加雙向箭頭，後兩者仍不可誤認為遊戲已有對應資產。現有鍵盤提示 `[M]`、`[TAB]`、Enter/Esc 等仍可能是文字，不能送進手把 parser 假裝成鍵盤圖形；互動鍵也可重綁。

## 介面排版規格（與圖形本體分開）

| 使用位置 | 目前 CSS／Canvas 規格 |
|---|---|
| 一般 DOM 手把 | 1.65em 正方形、min-width1.65em；margin -0.2em 0.1em；vertical-align -0.4em；不接收 pointer、不參與選取 |
| 一組按鍵 | `.gamepad-glyph-group` inline、white-space nowrap；提示其餘文字正常流動，不整段包成 flex |
| 任務目標文字列 | `.quest-objective-label img.gamepad-button-icon` relative、top -2px；已核准預設，不再重複上移 |
| 新手教學 | `.new-player-tutorial-hint img.gamepad-button-icon` translateY(-2px) |
| 背包 LT／RT 翻頁 | 28×28px、margin0、translateY(1px)；單頁時按鈕 opacity .28、disabled |
| 查看大圖退出提示 | `.inventory-item-inspect-exit img` 1.5em、margin0、translateY(1px)；使用當下控制權的 B 或滑鼠左鍵 |
| Canvas 滑鼠互動 | 原圖裁切 (6,2,28,36)，預設畫成20×25；這是 Canvas 顯示裁切，不要修改 SVG viewBox |

所有相關原始 CSS 規則按順序存於 `index.json → layout.cssRules`；特殊容器的層疊仍以實際 globals.css 為準。鍵鼠、手把／虛擬游標、觸控切换須遵守 UI skill，圖示本體不能接管焦點、輸入或殘留舊模式提示。

## 引用與驗證

```tsx
import { GamepadButtonIcon, GamepadHint } from "./gamepad-button-icon";
// 明確按鍵
<GamepadButtonIcon button="Select" />
// 只在手把控制提示使用 parser，勿處理任意劇情／Debug 文字
<GamepadHint text="按 [B] 退出" enabled={inputMode === "gamepad"} />
```

```powershell
node --experimental-strip-types --test tests/gamepad-glyph.test.mjs
node --experimental-strip-types scripts/index-input-symbols.mjs
# 只有核對並獲得對應變更授權後，才刷新衍生資料；不會改 runtime 或核准 fixture。
node --experimental-strip-types scripts/index-input-symbols.mjs --write
```

index.json 收录每個 SVG 的原文、SHA-256、viewBox、文字完整屬性、來源、狀態，以及來源檔案 SHA-256。catalog.md 和 preview.html 由同一腳本產生，勿手改；README 的規格說明如有核准變更應同步更新。刷新來源檔案不等於核准一個新版本，核准的版本仍須獨立保存。
