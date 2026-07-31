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
- Each interaction polygon can optionally reward any registered item after a
  successful complete interaction. The reward setting selects the item,
  quantity (1-99), and whether it is placed directly in the backpack or
  spawned nearby in the scene as a persistent pickup stack. Dialogue, survival
  requirements, and daily-use limits are resolved before the reward is issued.
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
