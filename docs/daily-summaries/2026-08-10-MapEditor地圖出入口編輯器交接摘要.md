# 2026-08-10 MapEditor 地圖出入口編輯器交接摘要

## 本次範圍

- 僅完成 MapEditor 的地圖進出資料編輯能力。
- 沒有實作遊戲端載入第二張地圖、角色傳送、尋路、鏡頭滑動或黑幕轉場。
- 目標是讓 `Scene_3` 與 `Scene_2` 已具備可供下一版遊戲端讀取的雙向設定。

## 新增的 MapEditor 功能

### 地圖 Entry Point

- 工具列新增 `Entry Point`。
- Entry Point 必須建立及拖曳在 NavMesh 內。
- 每張地圖可建立複數 Entry Point。
- 每個 Entry Point 可設定：
  - Point ID（同一地圖內不可重複）
  - 顯示名稱
  - X／Y 座標
  - N／NE／E／SE／S／SW／W／NW 面向
- Entry Point 是地圖切換後的角色落點，不取代單一的 `playerSpawn` 預設出生點。
- 畫布以橘色菱形、方向箭頭與 `ENTRY` 標籤顯示。

### 地圖出入口多邊形

- 工具列新增 `出入口多邊形`。
- 操作方式與其他多邊形相同：逐點點擊，以雙擊、右鍵或 Enter 完成。
- 可選取、拖曳、縮放、重新命名、插入／刪除 Node、刪除整個圖形及復原／重做。
- 畫布以橘色半透明底與橘色虛線框顯示，並標示目標地圖及 Entry Point。
- 右側設定欄位包括：
  - 出口 ID
  - 目標地圖 ID
  - 目標 Entry Point ID
  - 啟動方式：`auto`／`manual`／`choice`
  - 轉場方式：`seamless`／`blackout`
  - 角色移動：`teleport`／`pathfind`
  - 鏡頭定位：`player`／`sceneRoot`
- 儲存時會驗證目前多邊形至少有 3 個 Node、ID 不重複、目標地圖存在，以及目標 Entry Point 存在。

## 場景格式

- `SceneDocument` 新增 `entryPoints`。
- 原預留的 `connections` 已正式用於出入口多邊形。
- `connections[].targetEntryPointId` 只引用目標落點 ID，不重複保存落點座標。
- 舊草稿欄位 `targetSpawn` 與 `targetRelativePosition` 仍可讀取，但新資料不再輸出這兩個欄位。

## Scene_3 與 Scene_2 雙向資料

### Scene_3 → Scene_2

- Entry Point：`entry-scene3-from-scene2`
  - 座標：`100, 1140`
  - 面向：`NE`
  - 用途：角色由 Scene_2 返回 Scene_3 時的落點
- 出入口：`exit-scene3-to-scene2`
  - 位置：Scene_3 左下方地圖邊緣
  - 目標：`Scene_2 / entry-scene2-from-scene3`
  - 設定：`auto + seamless + teleport + player`

### Scene_2 → Scene_3

- Entry Point：`entry-scene2-from-scene3`
  - 座標：`1170, 1140`
  - 面向：`NW`
  - 與目前 Scene_2 出生點位置、面向相同，但兩者仍是獨立資料
- 出入口：`exit-scene2-to-scene3`
  - 位置：Scene_2 右下方地圖邊緣
  - 目標：`Scene_3 / entry-scene3-from-scene2`
  - 設定：`auto + seamless + teleport + player`

以上位置是可運作的第一版編輯資料，之後仍可在 MapEditor 直接拖曳及修改。

## 主要檔案

- `MapEditor/EditorCanvas.cs`
- `MapEditor/MainForm.cs`
- `MapEditor/SceneModels.cs`
- `MapEditor/Program.cs`
- `MapEditor/MapEditor.exe`
- `MapEditor/README.md`
- `docs/scene-format.md`
- `public/maps/map_test01.scene.json`
- `public/maps/map_test02.scene.json`

## 驗證結果

- .NET Release build：成功，0 warnings、0 errors。
- MapEditor self-test：成功。
- MapEditor UI smoke test：成功，Exit Code 0。
- 正式 `MapEditor/MapEditor.exe` 已重新發佈並再次通過 self-test 與 UI smoke test。
- `Scene_2` 目前仍維持使用者建立的 1 個 NavMesh 與原出生點資料。
- 本次沒有修改遊戲端的場景執行流程。

## 下一版接續建議

1. 遊戲端建立 Scene Loader，只讓目前地圖載入完整資料。
2. 切換前預載目標地圖圖片；斜向滑動時只預載經過地圖的背景圖層。
3. 角色進入 `connections[].area` 時依 `triggerMode` 決定是否啟動。
4. 讀取 `targetSceneId` 與 `targetEntryPointId`，依 `transferMode` 放置或引導角色。
5. 依 `transitionMode` 播放無縫滑動或黑幕流程，並依 `cameraFocus` 決定鏡頭終點。
6. 加入切換鎖、冷卻與回程防連續觸發，避免角色落點仍接觸出口而立即折返。

## 注意事項

- `playerSpawn` 只代表直接載入地圖時的預設出生點；跨地圖落點一律使用 `entryPoints`。
- 若修改 Entry Point ID，所有指向它的其他地圖出入口也必須一起更新。
- 遊戲端尚未支援這些欄位，因此目前在遊戲中不會真的切換地圖。
- 工作目錄中原有的 `app/story-content.ts` 未提交修改與本次 MapEditor 功能無關，沒有在本次調整。
