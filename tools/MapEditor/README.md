# Echoes Map Editor

`MapEditor.exe` is the first Windows scene-data editor for Echoes. It opens
common image formats, displays rulers and a configurable snapping grid, and
edits the scene JSON consumed by the game.

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
- Export of the image and `<image-name>.scene.json` to `public/maps`.

Polygon drawing is completed with double-click, right-click, or Enter. Escape
cancels the shape being drawn. The mouse wheel zooms; middle mouse or Space-drag
pans the view.

`worldLayout` and `connections` are present in the JSON schema for future
seamless multi-scene layout, entrances, exits, and landing positions. The first
version deliberately does not expose those fields in the editor.
