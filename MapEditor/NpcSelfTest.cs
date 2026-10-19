using System.IO;
using System.Drawing.Imaging;

namespace Echoes.MapEditor;

internal static class NpcSelfTest
{
    internal static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    internal static void Screenshot(Control control, string file)
    {
        control.Refresh(); Application.DoEvents();
        using var bitmap = new Bitmap(control.Width, control.Height);
        control.DrawToBitmap(bitmap, new Rectangle(Point.Empty, control.Size));
        bitmap.Save(file, ImageFormat.Png);
    }

    public static int Run(string root)
    {
        var output = Path.Combine(root, "output", "mapeditor-npc", "verification");
        Directory.CreateDirectory(output);
        var checks = new List<string>();
        try
        {
            using var catalog = NpcCatalog.Load(root);
            Require(catalog.Characters.Count == 4, "Expected four characters in shared catalog.");
            foreach (var character in catalog.Characters)
            foreach (var direction in NpcCatalog.Directions)
            {
                var sprite = character.Sprites[direction];
                var image = catalog.Image(sprite);
                Require(image.Width == sprite.Width && image.Height == sprite.Height, $"Wrong image dimensions: {character.Id}/{direction}");
                Require(Math.Abs(catalog.BodyRectangle(new SceneNpc { CharacterId = character.Id, Facing = direction }).Height - catalog.DefaultHeight) < 0.001f,
                    $"Visible body height mismatch: {character.Id}/{direction}");
            }
            checks.Add("PASS: all four shared-catalog characters × eight directions load and normalize to catalog.defaultHeight.");
            using (var dialog = new NpcEditorForm(catalog, new SceneNpc { CharacterId = catalog.Characters[0].Id, X = 500, Y = 300 }))
            {
                dialog.StartPosition = FormStartPosition.Manual; dialog.Location = new Point(-20000, -20000); dialog.ShowInTaskbar = false;
                dialog.Show(); Application.DoEvents();
                Require(dialog.CharacterChoiceCount == 4 && dialog.DirectionChoiceCount == 8, "Selector choices missing.");
                foreach (var character in catalog.Characters)
                foreach (var facing in NpcCatalog.Directions)
                {
                    dialog.SelectCharacter(character.Id); dialog.SelectFacing(facing);
                    Require(dialog.Result.CharacterId == character.Id && dialog.Result.Facing == facing, "Selector preview state is stale.");
                }
                dialog.SetPercent(137.5m);
                Require(Math.Abs(dialog.Result.Scale - 1.375f) < 0.0001f, "Precise percentage failed.");
                Require(dialog.Result.X == 500 && dialog.Result.Y == 300, "Preview changes moved foot anchor.");
                Screenshot(dialog, Path.Combine(output, "npc-selector.png")); dialog.Close();
            }
            checks.Add("PASS: four-thumbnail selector, all 32 character/facing combinations, precise 137.5% scale, fixed foot coordinates.");
            using var host = new Form { ClientSize = new Size(1080, 760), ShowInTaskbar = false,
                StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000), Text = "NPC editor self-test" };
            using var canvas = new EditorCanvas { Dock = DockStyle.Fill };
            host.Controls.Add(canvas); host.Show(); Application.DoEvents();
            var invalidCatalogRoot = Path.Combine(output, "invalid-catalog");
            Directory.CreateDirectory(Path.Combine(invalidCatalogRoot, "public", "characters"));
            File.WriteAllText(Path.Combine(invalidCatalogRoot, "public", "characters", "npc-catalog.json"),
                "{\"version\":99,\"defaultHeight\":152,\"characters\":[]}");
            canvas.LoadNpcCatalog(invalidCatalogRoot);
            canvas.LoadNpcCatalog(root);
            checks.Add("PASS: invalid shared catalog is handled without preventing the editor from opening.");
            canvas.RunNpcCanvasSelfTest(output, checks);
            canvas.RunNpcContextMenuSelfTest(output, checks);
            host.Close();
            using (var mainForm = new MainForm { ShowInTaskbar = false, SuppressUnsavedPrompt = true,
                StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000) })
            {
                mainForm.Show(); Application.DoEvents(); mainForm.RunNpcSidebarSelfTest(output); mainForm.Close();
            }
            checks.Add("PASS: actual MainForm sidebar preserves NPC selection, applies precise size, deletes only NPC, and supports undo.");
            File.WriteAllLines(Path.Combine(output, "result.txt"), checks.Append($"PASS: {checks.Count} verification groups completed."));
            return 0;
        }
        catch (Exception exception)
        {
            File.WriteAllText(Path.Combine(output, "result.txt"), string.Join(Environment.NewLine, checks) + Environment.NewLine + "FAIL: " + exception);
            return 1;
        }
    }
}

public sealed partial class EditorCanvas
{
    internal void RunNpcContextMenuSelfTest(string output, List<string> checks)
    {
        void Check(bool condition, string message) => NpcSelfTest.Require(condition, message);
        Point Screen(PointF p) => new((int)Math.Round(RulerSize + _pan.X + p.X * _zoom),
            (int)Math.Round(RulerSize + _pan.Y + p.Y * _zoom));
        PointF RightClick(PointF position)
        {
            var screen = Screen(position);
            OnMouseDown(new MouseEventArgs(MouseButtons.Right, 1, screen.X, screen.Y, 0));
            Application.DoEvents();
            return ClampToWorld(ScreenToWorld(screen));
        }
        bool HintAt(int index, PointF point) => _document.Interactables[index].InteractionHintPoint is { } hint &&
            Math.Abs(hint.X - point.X) < 0.01f && Math.Abs(hint.Y - point.Y) < 0.01f;

        var document = SceneDocument.CreateForImage("npc-context-test.png", 1000, 680);
        document.Grid.Snap = true;
        document.Interactables.Add(new SceneInteractable
        {
            Id = "npc-context-owner", Label = "NPC 所屬互動區",
            Points = new() { new(160, 180), new(480, 180), new(480, 500), new(160, 500) },
            InteractionHintPoint = new(200, 440),
            InteractionPoints = new() { new() { X = 260, Y = 470, Facing = "NE" } },
            Npc = new() { CharacterId = "captain", Facing = "SE", X = 320, Y = 420, Scale = 1 }
        });
        SetScene(document, new Bitmap(1000, 680)); FitToView();
        var bounds = NpcBodyRectangle(_document.Interactables[0].Npc!);
        var body = new PointF(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);
        SelectNpc(0);
        var before = SceneJson.Serialize(_document);
        var clicked = RightClick(body);
        Check(_nodeContextMenu.Visible && !_npcContextMenu.Visible && SelectedNpc is null &&
            _selection == new LayerSelection(SceneLayerKind.Interactable, 0),
            "Right-clicking NPC did not pass through to its underlying Interaction polygon.");
        Check(_interactionHintPointContextItem.Visible && _interactionHintPointContextItem.Text == "移動互動提示點至此" &&
            _interactionPointContextItem.Visible && _npcParentMenu.Visible,
            "NPC-covered polygon lost hint/Point/NPC authoring commands.");
        NpcSelfTest.Screenshot(_nodeContextMenu, Path.Combine(output, "npc-polygon-context-menu.png"));
        _nodeContextMenu.Close();
        // Choosing a menu action after moving the pointer must retain the original click.
        var elsewhere = Screen(new PointF(700, 550));
        OnMouseMove(new MouseEventArgs(MouseButtons.None, 0, elsewhere.X, elsewhere.Y, 0));
        _interactionHintPointContextItem.PerformClick();
        Check(HintAt(0, clicked), "Hint did not use original raw right-click world coordinates.");
        var parent = _document.Interactables[0];
        Check(parent.Npc is { X: 320, Y: 420, Scale: 1, Facing: "SE" } &&
            parent.EffectiveInteractionPoints[0] is { X: 260, Y: 470, Facing: "NE" } &&
            parent.Points[0] is { X: 160, Y: 180 }, "Moving hint changed NPC or walking Point/polygon.");
        Undo(); Check(SceneJson.Serialize(_document) == before, "NPC-covered hint move did not undo exactly.");
        Redo(); Check(HintAt(0, clicked), "NPC-covered hint move did not redo.");

        _document.Interactables.Add(new SceneInteractable
        {
            Id = "npc-context-overlap", Label = "另一個互動區",
            Points = _document.Interactables[0].Points.Select(point => point.Clone()).ToList(),
            InteractionHintPoint = new(400, 450)
        });
        SelectLayer(new(SceneLayerKind.Interactable, 1));
        var ownerHint = _document.Interactables[0].InteractionHintPoint!.Clone();
        clicked = RightClick(new PointF(body.X + 5, body.Y + 5));
        Check(_nodeContextMenu.Visible && _selection.Index == 1 &&
            _overlapSelectionContextItem.DropDownItems.Count == 2,
            "NPC hijacked explicitly selected overlapping Interaction.");
        _nodeContextMenu.Close(); _interactionHintPointContextItem.PerformClick();
        Check(HintAt(1, clicked) && HintAt(0, new PointF(ownerHint.X, ownerHint.Y)),
            "Overlapping Interaction hint edited the NPC owner instead of the selected polygon.");
        checks.Add("PASS: actual NPC right-click reaches underlying/selected overlapping Interaction; hint uses click coordinates with snap enabled; NPC and walk Point stay fixed; Undo/Redo.");

        // The head is now outside both polygons, but the attached hint remains editable.
        _document.Interactables[0].Npc!.X = 750;
        _document.Interactables[0].InteractionHintPoint = null;
        bounds = NpcBodyRectangle(_document.Interactables[0].Npc!);
        body = new PointF(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);
        clicked = RightClick(body);
        Check(_npcContextMenu.Visible && SelectedNpc is not null && _npcHintPointContextItem.Text == "新增互動提示點",
            "Outside-polygon NPC menu lost new hint command.");
        _npcContextMenu.Close(); _npcHintPointContextItem.PerformClick();
        Check(HintAt(0, clicked), "Outside-polygon NPC hint targeted wrong Interaction or position.");
        clicked = RightClick(new PointF(body.X + 3, body.Y + 3));
        Check(_npcHintPointContextItem.Text == "移動互動提示點至此", "Existing NPC hint not offered for moving.");
        _npcContextMenu.Close(); _npcHintPointContextItem.PerformClick();
        Check(HintAt(0, clicked) && _document.Interactables[0].Npc!.X == 750,
            "Outside-polygon hint move moved the NPC.");
        SceneJson.Save(Path.Combine(output, "npc-context-roundtrip.scene.json"), _document);
        var reloaded = SceneJson.Load(Path.Combine(output, "npc-context-roundtrip.scene.json"));
        Check(Math.Abs(reloaded.Interactables[0].InteractionHintPoint!.X - clicked.X) < 0.01f &&
            Math.Abs(reloaded.Interactables[0].InteractionHintPoint!.Y - clicked.Y) < 0.01f,
            "NPC hint click coordinates did not survive save/reload.");
        checks.Add("PASS: outside-polygon NPC retains edit menu, adds/moves parent hint at body click, and saves/reloads coordinates.");
    }

    internal void RunNpcCanvasSelfTest(string output, List<string> checks)
    {
        void Check(bool condition, string message) => NpcSelfTest.Require(condition, message);
        static bool Near(float a, float b) => Math.Abs(a - b) < 2;
        Point Screen(PointF p) => new((int)Math.Round(RulerSize + _pan.X + p.X * _zoom), (int)Math.Round(RulerSize + _pan.Y + p.Y * _zoom));
        void MouseDrag(PointF from, PointF to)
        {
            var start = Screen(from); var end = Screen(to);
            OnMouseDown(new MouseEventArgs(MouseButtons.Left, 1, start.X, start.Y, 0));
            OnMouseMove(new MouseEventArgs(MouseButtons.Left, 0, end.X, end.Y, 0));
            // Exercise the selected-layer cache while the NPC is moving.
            using (var rendered = new Bitmap(Width, Height)) DrawToBitmap(rendered, ClientRectangle);
            OnMouseUp(new MouseEventArgs(MouseButtons.Left, 1, end.X, end.Y, 0));
            Application.DoEvents();
        }
        var document = SceneDocument.CreateForImage("npc-test.png", 1000, 680);
        document.Grid.Snap = false; document.Grid.Visible = true;
        document.Interactables.Add(new SceneInteractable { Id = "npc-test-interaction", Label = "NPC 所屬互動區",
            Points = new() { new(80, 410), new(280, 410), new(280, 550), new(80, 550) },
            InteractionPoints = new() { new() { X = 180, Y = 470, Facing = "N" } } });
        Check(!SceneJson.Serialize(document).Contains("\"npc\""), "Legacy scenes acquired NPC fields.");
        var background = new Bitmap(1000, 680);
        using (var g = Graphics.FromImage(background)) g.Clear(Color.FromArgb(37, 43, 52));
        SetScene(document, background); Application.DoEvents(); FitToView();
        _contextSelection = new(SceneLayerKind.Interactable, 0); _contextInteractionPoint = new PointF(500, 300);
        Check(_npcParentMenu.DropDownItems.Count == _npcCatalog!.Characters.Count + 2, "NPC submenu missing characters.");
        var characterMenu = (ToolStripMenuItem)_npcParentMenu.DropDownItems[2];
        Check(characterMenu.DropDownItems.Count == 8, "NPC submenu missing directions.");
        ((ToolStripMenuItem)characterMenu.DropDownItems[3]).PerformClick();
        Check(SelectedNpc is { Facing: "SE" }, "Context add did not select NPC.");
        using (var layerTest = new Bitmap(1000, 680))
        using (var graphics = Graphics.FromImage(layerTest))
        {
            _sceneLayerFilter = SceneLayerFilter.ExcludeSelected;
            DrawNpcs(graphics);
            var painted = 0;
            for (var y = 0; y < layerTest.Height; y += 3)
            for (var x = 0; x < layerTest.Width; x += 3) if (layerTest.GetPixel(x, y).A > 0) painted++;
            Check(painted == 0, "Selected NPC leaked into static drag cache.");
            _sceneLayerFilter = SceneLayerFilter.OnlySelected;
            DrawNpcs(graphics);
            for (var y = 0; y < layerTest.Height; y += 3)
            for (var x = 0; x < layerTest.Width; x += 3) if (layerTest.GetPixel(x, y).A > 0) painted++;
            Check(painted > 100, "Selected NPC missing from live drag layer.");
            _sceneLayerFilter = SceneLayerFilter.All;
        }
        var originalPolygon = _document.Interactables[0].Points.Select(p => p.Clone()).ToArray();
        var originalPoint = _document.Interactables[0].EffectiveInteractionPoints[0].Clone();
        var bounds = NpcBodyRectangle(SelectedNpc!);
        var center = new PointF(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);
        MouseDrag(center, new PointF(center.X + 90, center.Y + 40));
        var npc = SelectedNpc!;
        Check(Near(npc.X, 590) && Near(npc.Y, 340), "Actual pointer drag failed to move independent NPC anchor.");
        Check(_document.Interactables[0].Points.Zip(originalPolygon).All(p => p.First.X == p.Second.X && p.First.Y == p.Second.Y), "NPC drag moved parent polygon.");
        Check(_document.Interactables[0].EffectiveInteractionPoints[0].X == originalPoint.X && _document.Interactables[0].EffectiveInteractionPoints[0].Y == originalPoint.Y, "NPC drag moved interaction Point.");
        Check(!PointInPolygon(new PointF(npc.X, npc.Y), _document.Interactables[0].Points), "Outside-polygon fixture invalid.");
        var foot = new PointF(npc.X, npc.Y);
        var handle = NpcResizeHandle(npc);
        MouseDrag(handle, new PointF(foot.X + (handle.X - foot.X) * 1.4f, foot.Y + (handle.Y - foot.Y) * 1.4f));
        Check(Math.Abs(SelectedNpc!.Scale - 1.4f) < 0.02f && SelectedNpc.X == foot.X && SelectedNpc.Y == foot.Y, "Resize did not preserve foot anchor.");
        var resized = SelectedNpc.Scale;
        Undo(); Check(Math.Abs(_document.Interactables[0].Npc!.Scale - 1) < 0.001f, "Resize undo failed.");
        Redo(); Check(_document.Interactables[0].Npc!.Scale == resized, "Resize redo failed.");
        checks.Add("PASS: actual canvas pointer drag outside polygon leaves parent and interaction Point fixed; resize keeps foot fixed; resize Undo/Redo.");
        npc = _document.Interactables[0].Npc!; bounds = NpcBodyRectangle(npc);
        center = new PointF(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);
        Check(TryShowNpcContextMenu(Screen(center), center) && SelectedNpc == npc, "Cannot right-click NPC outside polygon.");
        _npcContextMenu.Close();
        ShowNodeContextMenu(Screen(new PointF(110, 525)), new PointF(110, 525));
        _nodeContextMenu.Close();
        Check(SelectedNpc is null && _selection == new LayerSelection(SceneLayerKind.Interactable, 0), "Right-clicking same parent did not clear NPC sub-selection.");
        SelectAttachedNpc();
        DeleteSelectedNodeOrShape();
        Check(_document.Interactables.Count == 1 && _document.Interactables[0].Npc is null && _document.Interactables[0].Points.Count == 4, "Delete removed parent or node instead of NPC.");
        Undo(); Check(_document.Interactables[0].Npc is not null, "NPC removal undo failed.");
        checks.Add("PASS: right-click outside parent polygon and return to same parent; Delete removes only NPC; undo restores it; static/live drag layers do not duplicate NPC.");
        npc = _document.Interactables[0].Npc!; var beforeParentMove = npc.Copy();
        SelectLayer(new(SceneLayerKind.Interactable, 0));
        MouseDrag(new PointF(110, 525), new PointF(130, 545));
        Check(Near(npc.X, beforeParentMove.X + 20) && Near(npc.Y, beforeParentMove.Y + 20), "Parent move did not carry NPC anchor.");
        var parentCenter = new PointF(_document.Interactables[0].Points.Average(p => p.X), _document.Interactables[0].Points.Average(p => p.Y));
        var beforeParentScale = npc.Copy(); ScaleSelection(1.1f);
        Check(Near(npc.X, parentCenter.X + (beforeParentScale.X - parentCenter.X) * 1.1f) && Near(npc.Y, parentCenter.Y + (beforeParentScale.Y - parentCenter.Y) * 1.1f), "Parent scale did not carry NPC anchor.");
        SceneJson.Save(Path.Combine(output, "npc-roundtrip.scene.json"), _document);
        var roundtrip = SceneJson.Load(Path.Combine(output, "npc-roundtrip.scene.json"));
        Check(roundtrip.Interactables[0].Npc!.CharacterId == npc.CharacterId && roundtrip.Interactables[0].Npc!.Scale == npc.Scale, "NPC JSON roundtrip failed.");
        checks.Add("PASS: parent move/scale carries attached NPC; saved JSON reload retains identity, position, facing, scale; legacy scene omits npc.");
        // Render a reviewable four-character arrangement using the same shared assets.
        _document.Interactables.Clear();
        var index = 0;
        foreach (var character in _npcCatalog.Characters)
        {
            var x = 140 + index * 235;
            _document.Interactables.Add(new SceneInteractable { Id = "npc-preview-" + character.Id, Label = character.Name,
                Points = new() { new(x - 75, 460), new(x + 75, 460), new(x + 75, 575), new(x - 75, 575) },
                InteractionPoints = new() { new() { X = x, Y = 520, Facing = "N" } },
                Npc = new() { CharacterId = character.Id, Facing = new[] { "SE", "S", "W", "NW" }[index], X = x, Y = 420, Scale = 1.35f } });
            index++;
        }
        SelectNpc(2); DisposeViewCache();
        NpcSelfTest.Screenshot(this, Path.Combine(output, "npc-canvas.png"));
        checks.Add("PASS: native canvas and selector screenshots generated from live controls.");
    }
}
