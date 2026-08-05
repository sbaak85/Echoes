# Echoes Map Editor

`MapEditor/MapEditor.exe` is the first Windows scene-data editor for Echoes. It opens
common image formats, displays rulers and a configurable snapping grid, and
edits the scene JSON consumed by the game.

Everything owned by the editor is kept under this directory:

- `MapEditor.exe`: the runnable Windows editor.
- `*.cs`, `MapEditor.csproj`, and `app.manifest`: editor source and project files.
- `bin/`, `obj/`, and `publish/`: generated build and publish output.
- `runtime/MapEditor.log`: generated diagnostic log.

The generated directories are ignored by Git. Scene images and JSON exported
to `../public/maps` remain shared game data, rather than private editor data.

The editor currently targets `net6.0-windows`. Running the small,
framework-dependent `MapEditor.exe` requires the x64 .NET 6 Desktop Runtime;
the much larger .NET SDK is a build tool and is not stored in this repository.

Included in version 1:

- NavMesh polygon drawing.
- Polygon, rectangle, and circle collision drawing.
- Selection, whole-shape movement, vertex/radius editing, scaling, deletion,
  undo, and redo.
- NavMesh, collision, interaction, and movement-guide entries in the right-side
  layer list can be renamed in place by double-clicking. Enter or leaving the
  field saves the name, Escape cancels, and the label is stored in scene JSON.
- Closed NavMesh and collision polygons support adding and removing nodes.
  Select a node and press Delete (or use the sidebar/context menu) to remove
  it; right-click near a selected polygon edge to insert a node at that point.
  Polygons always retain at least three nodes and close automatically.
- View zoom, fit, pan, rulers, grid visibility, grid spacing, and snapping.
- Player spawn position and eight-direction facing.
- Multiple interaction Points per interaction polygon. Right-click inside a
  selected interaction polygon to add another Point and choose its facing.
- One optional interaction hint Point per interaction polygon. Right-click
  inside the selected polygon to add or move the translucent white in-game
  prompt dot, or remove it from the same context menu.
- Interaction polygons support five behavior types: dialogue, operation,
  gather, move, and general interaction. The right-side interaction settings
  can define independent preconditions for stamina, hunger, thirst, and spirit:
  unrestricted, at least a value, or below a value. Completion effects support
  stamina, hunger, thirst, and spirit changes from -100 to +100 plus elapsed
  game time in hours. Dialogue always finishes before these effects and usage
  counts are applied. For example, sleep can require stamina below 75, advance
  eight game hours, and then restore 75 stamina.
  Daily interaction limits can be unlimited or 1-10 uses and reset at 06:00.
  Operation defaults to `-5/-3/-3/0`; gather defaults to `-4/-2/-2/-1`
  with three daily uses; general interaction defaults to `-1/-1/-1/0`.
- The dialogue script editor supports Shift-click multi-selection and weighted
  random groups in all three dialogue tabs. Selected non-contiguous lines are
  pulled together beneath the first selected line; each grouped line has a
  weight from 1-999 (default 1), and only one line is chosen from that group
  whenever the dialogue starts. Groups can also be dissolved back into normal
  lines without deleting their text.
- The requirement editor can require registered items, a chapter number, or an
  active `QUEST_...` quest. Quest choices are loaded from
  `public/quests/quest-data.json`; the interaction is enabled only while that
  quest is accepted and currently active.
- Story Trigger polygons reuse the same requirements and completion-effects
  editor. Their automatic entry trigger can be gated by survival meters,
  inventory items, chapter, active quest, quest stage, and daily/one-time use.
  After the story dialogue completes, the same configuration can change
  survival meters, advance game time, grant inventory or world items, and
  record the configured usage limit. Entry is checked exactly once. While the
  player remains inside an ineligible zone there is no polling; inventory,
  survival, chapter, quest-stage, or usage state changes request one contact
  recheck, and the story starts if that single check finds the player inside.
- 劇情觸發區主設定提供 `觸發延遲（秒）`，預設為 0；「需求與完成效果」
  視窗可設定指定任務必須處於已完成、進行中、可啟動等狀態，並在
  `任務啟動` 頁籤複選對話完整結束後要提出啟動的任務。這一階段僅建立
  可儲存的場景資料與編輯介面，實際延遲及任務派發流程由遊戲端接線。
- 任務階段需求同樣從 `quest-data.json` 讀取 Quest 與 Stage，可設定
  `CurrentStageOnly`（僅指定階段）、`UnlockFromStage`（到達後持續啟用）
  或 `UnlockUntilCondition`（到達後啟用，直到另一個任務階段成立）。
- ItemPoint 圖層提供「Spawn 需求設定…」：未設定時照原有規則從一開始
  生成；可設定 `CurrentStageOnly`（只在指定階段生成）或
  `UnlockFromStage`（到達指定階段後持續允許生成）。任務階段資格會先於
  唯一一次、每日 06:00、進入地圖等既有生成週期判斷。
- Each interaction polygon can reward multiple different registered items after
  a successful complete interaction. Every reward row independently selects the
  item, quantity (1-99), and whether it is placed directly in the backpack or
  spawned nearby in the scene as a persistent pickup stack. These rows now live
  in the `完成效果` tab. Dialogue, requirements, and daily-use limits are
  resolved before all rewards are issued together.
- Overlap-safe selection. Right-click an overlapping area and choose a named
  shape from `選取重疊圖形`, or hold `Alt` and left-click repeatedly to cycle
  through interaction, collision, NavMesh, and movement-guide layers.
  Right-click near an existing Point to change or delete that Point. At runtime,
  the Point nearest to the player is chosen once when interaction begins.
- Lightweight `Audio 音效` manager window for event labels, trigger notes,
  original/runtime MP3 paths, volume, delay, and Loop. Saving rewrites only the
  marked configuration block in `app/audio-event-manager.ts`; the previous file
  is backed up to
  `../AudioEventManager/runtime/audio-event-manager.ts.bak`. The same shared
  window can also run independently from
  `../AudioEventManager/AudioEventManager.exe`. Original asset paths are
  optional, and the button beside the game MP3 paths previews the first file.
- Export of the image and `<image-name>.scene.json` to `public/maps`.

Polygon drawing is completed with double-click, right-click, or Enter. Escape
cancels the shape being drawn. The mouse wheel zooms; middle mouse or Space-drag
pans the view.

`worldLayout` and `connections` are present in the JSON schema for future
seamless multi-scene layout, entrances, exits, and landing positions. The first
version deliberately does not expose those fields in the editor.

Build and publish from the repository root:

```powershell
dotnet build MapEditor\MapEditor.csproj -c Release
dotnet publish MapEditor\MapEditor.csproj -c Release -r win-x64 --self-contained false -o MapEditor\publish
Copy-Item MapEditor\publish\MapEditor.exe MapEditor\MapEditor.exe -Force
```
