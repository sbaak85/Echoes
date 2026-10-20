# Echoes scene format v1

Each scene is stored as `public/maps/<scene-id>.scene.json`. The browser game
and `MapEditor/MapEditor.exe` read the same file so NavMesh, collision debug overlays,
spawn position, and runtime movement cannot drift apart.

Version 1 fields:

- `image` and `world`: source image name and world dimensions.
- `foregroundLayers`: optional ordered array of image overlays (last entry drawn
  foremost). Each has `id`, `label`, `file`, world-space `x`/`y`, uniform `scale`
  (default 1, applied to the overlay's native pixel dimensions), `opacity` (0–1),
  and `visible`. Files are relative to the scene JSON and are copied alongside it
  on save/export. Missing array means no overlays. MapEditor draws these above
  the background and below editing markers; the global preview visibility toggle
  is not persisted. In the game, overlays draw above every character, except the
  parts cut out by `occluders` (below).
- `occluders`: optional wall occluder pieces cut from a foreground overlay
  (omitted when a scene has none). Each has `id`, `label`, `layerId` (an existing
  `foregroundLayers` id), a world-space `points` polygon (at least 3 points) and a
  wall-foot line `baselineStart` → `baselineEnd` (scene pixels, two distinct points).
  - The game draws the overlay everywhere except inside the pieces; each piece is
    drawn separately, clipped to its polygon, and sorted together with the player
    and NPCs.
  - Rule: extend the wall-foot line infinitely and compare at the character's foot
    x. A foot below the line (south, screen-down) is in front of the wall, so the
    character draws over the piece. A foot above the line is behind the wall, so
    the piece covers the character. Only pieces whose polygon overlaps the
    character's on-screen bounds constrain the order (topological sort; without
    pieces the order is plain foot-Y sorting).
  - Keep pieces from overlapping each other and split L-shaped corners into two
    pieces with one straight foot line each. Removing a foreground layer in
    MapEditor also removes its pieces.
- `grid`: editor grid size, visibility, and snapping preference.
- `playerSpawn`: player foot position and one of the eight directions.
- `entryPoints`: named, reusable map-entry landing points. Each record stores
  `id`, `label`, `x`, `y`, and eight-direction `facing`; Entry Points must remain
  inside NavMesh and are separate from the one default `playerSpawn`.
- `navMesh`: one or more walkable polygons.
- `collisions`: polygon, rectangle, or circle blocking shapes.
- `interactables`: bright-yellow, non-blocking interaction polygons. Each
  record stores polygon `points`, interaction `type`, prompt `verb`, optional
  `interactionPoints` (one or more `x`, `y`, eight-direction `facing` records),
  optional `interactionHintPoint` (`x`, `y`) for the in-world translucent white
  prompt dot, and a dialogue script. When more than one interaction Point exists,
  the runtime chooses
  the point nearest to the player once when the interaction is triggered, then
  keeps that point for pathfinding, arrival, and facing. The legacy singular
  `interactionPoint` field is still accepted when older scenes are loaded.
  Optional `npcId` names the interaction's talk target from the scene's `npcs`
  list (below). Several dialogues may share one NPC (e.g. Owen's three
  conversations). While that NPC is off stage, the interaction is unavailable.
  Clicking or tapping the NPC's visible body also targets the bound dialogue that
  is currently active.
  `dialogue.characterDelaySeconds` controls the left-to-right typing
  rate and defaults to `0.02`. `dialogue.speakers` stores the selectable speaker
  list (default `Sbaak`, `Echo`). A blank speaker on any line after the first
  inherits the previous line's speaker. Dialogue lines keep their speaker and
  text as one utterance even when the runtime divides a long line into display
  pages. The interaction hint dot gently breathes while idle, grows and floats
  when the player can interact, fades out over `0.1` seconds while its dialogue
  is active, and fades back in over `0.1` seconds when the dialogue closes.
- `npcs`: optional independent scene characters (omitted when a scene has none).
  Example:
  `{ "id": "npc-owen", "label": "歐文", "characterId": "owen", "facing": "NE", "scale": 1, "facePlayer": true, "breathing": true, "presence": { ...questStage requirement... }, "x": 1357, "y": 1546 }`.
  - `x`/`y` are the world-space foot position; the NPC does not move with any
    interaction. `facing` is one of `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`;
    `scale` is positive (the editor authors 10–500%).
  - `presence` is optional. Without it the NPC is always present. With it, the
    NPC appears when the requirement's activation Stage/OBJ is reached and leaves
    when its closing (`UnlockUntilCondition`) or removal condition is reached.
    It uses the same `questStage` shape as interaction requirements and is
    independent of any dialogue's own gates.
  - `facePlayer` (default true): during a bound dialogue the NPC turns toward the
    player one 45° step at a time, then turns back to `facing`. `breathing`
    (default true): a subtle foot-anchored idle breathing scale (about ±0.6%).
  - Size: 100% equals the player's visible body height for the same direction
    (`playerSize × reference.bodyRatio[facing]`), so NPCs follow the player size
    option. The renderer scales the sprite by `bodyHeight_world / sprite.bodyHeight`
    and places `anchorX/anchorY` on the foot point. Shadows reuse the player's
    ambient and per-boot contact shadows (`bootAnchors`, `bodyBounds`).
  - Character IDs, PNG paths, foot anchors, body bounds and boot anchors come from
    `public/characters/npc-catalog.json`, built by
    `node scripts/build-npc-catalog.mjs`. The script scans every folder under
    `public/characters/idle/` (except the player's `Transparent_570x720`) and maps
    folder names to English IDs through `public/characters/npc-roster.json`.
    To add a character: put the eight 570×720 RGBA standing PNGs (`05_S_Front.png`
    style names) in a new folder, add one roster line, and rerun the script.
  - Legacy scenes that stored `npc` inside an interaction are converted on load to
    `npc-<interactionId>` plus `npcId`, keeping the old visibility rules; MapEditor
    saves them in the new format.
  - NPCs add no collision geometry.
- `movementGuides`: non-blocking bidirectional guide polylines for diagonal
  stairs, slopes, and ladders. Each record stores editable `points`, an
  activation `width`, and `bidirectional`. While the player touches the guide
  corridor, movement input is projected onto the nearest segment and gently
  corrected toward its center line.
- `worldLayout`: world-space placement used by MapEditor map-page navigation.
  Pages whose bounds touch are exposed through the four canvas arrows. The
  editor writes a newly created page immediately beside the current page while
  preserving each page as a separate image and scene JSON.
- `connections`: editable entrance/exit polygons. Each record stores polygon
  `area`, `targetSceneId`, `targetEntryPointId`, `triggerMode`
  (`auto`/`manual`/`choice`), `transitionMode` (`seamless`/`blackout`),
  `transferMode` (`teleport`/`pathfind`), and `cameraFocus`
  (`player`/`sceneRoot`). This version authors and validates the data only;
  browser runtime scene switching is not implemented yet.

When an interactable is activated, the runtime emits the window event
`echoes:interaction` with the object id, label, interaction type, and input
source. `map_test01` includes one campfire dialogue test region with the
default single line `...`.

The runtime currently loads `map_test01.scene.json`. MapEditor can now browse
and create adjacent pages, but runtime scene switching and multi-map transition
rendering remain reserved for a later game version.
