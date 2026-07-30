# Echoes scene format v1

Each scene is stored as `public/maps/<scene-id>.scene.json`. The browser game
and `MapEditor/MapEditor.exe` read the same file so NavMesh, collision debug overlays,
spawn position, and runtime movement cannot drift apart.

Version 1 fields:

- `image` and `world`: source image name and world dimensions.
- `grid`: editor grid size, visibility, and snapping preference.
- `playerSpawn`: player foot position and one of the eight directions.
- `navMesh`: one or more walkable polygons.
- `collisions`: polygon, rectangle, or circle blocking shapes.
- `interactables`: bright-yellow, non-blocking interaction polygons. Each
  record stores polygon `points`, interaction `type`, prompt `verb`, optional
  `interactionPoints` (one or more `x`, `y`, eight-direction `facing` records),
  and a dialogue script. When more than one point exists, the runtime chooses
  the point nearest to the player once when the interaction is triggered, then
  keeps that point for pathfinding, arrival, and facing. The legacy singular
  `interactionPoint` field is still accepted when older scenes are loaded.
  `dialogue.characterDelaySeconds` controls the left-to-right typing
  rate and defaults to `0.02`. `dialogue.speakers` stores the selectable speaker
  list (default `Sbaak`, `Echo`). A blank speaker on any line after the first
  inherits the previous line's speaker. Dialogue lines keep their speaker and
  text as one utterance even when the runtime divides a long line into display
  pages.
- `movementGuides`: non-blocking bidirectional guide polylines for diagonal
  stairs, slopes, and ladders. Each record stores editable `points`, an
  activation `width`, and `bidirectional`. While the player touches the guide
  corridor, movement input is projected onto the nearest segment and gently
  corrected toward its center line.
- `worldLayout`: reserved world-space placement for seamless map assembly.
- `connections`: reserved scene entry/exit records. A future record will store
  its trigger area, target scene, target landing position and facing, and the
  relative placement of both scenes.

When an interactable is activated, the runtime emits the window event
`echoes:interaction` with the object id, label, interaction type, and input
source. `map_test01` includes one campfire dialogue test region with the
default single line `...`.

The runtime currently loads `map_test01.scene.json`. Scene switching and the
world-layout preview are intentionally reserved for a later editor version.
