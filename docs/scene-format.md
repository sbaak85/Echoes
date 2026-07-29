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
- `interactables`: reserved object targets for pointer/gamepad actions. Each
  record can define its cursor hit radius, reachable interaction point,
  activation distance, and action name.
- `worldLayout`: reserved world-space placement for seamless map assembly.
- `connections`: reserved scene entry/exit records. A future record will store
  its trigger area, target scene, target landing position and facing, and the
  relative placement of both scenes.

When an interactable is reached, the runtime emits the window event
`echoes:interaction` with the object id, label, action name, and input source.
No interactable records are enabled in `map_test01` yet.

The runtime currently loads `map_test01.scene.json`. Scene switching and the
world-layout preview are intentionally reserved for a later editor version.
