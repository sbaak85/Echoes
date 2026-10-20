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
            Require(catalog.Characters.Count >= 1 && catalog.Reference is not null, "Shared catalog has no characters or player reference.");
            foreach (var character in catalog.Characters)
            foreach (var direction in NpcCatalog.Directions)
            {
                var sprite = character.Sprites[direction];
                var image = catalog.Image(sprite);
                Require(image.Width == sprite.Width && image.Height == sprite.Height, $"Wrong image dimensions: {character.Id}/{direction}");
                var npc = new SceneNpc { CharacterId = character.Id, Facing = direction };
                Require(Math.Abs(catalog.BodyRectangle(npc).Height - catalog.BodyHeight(npc)) < 0.001f,
                    $"Visible body height mismatch: {character.Id}/{direction}");
                Require(catalog.BodyHeight(npc) < catalog.DefaultHeight && catalog.BodyHeight(npc) > catalog.DefaultHeight * 0.9f,
                    $"100% body height is not the player's visible height: {character.Id}/{direction}");
            }
            checks.Add($"PASS: {catalog.Characters.Count} shared-catalog characters × eight directions load; 100% matches the player's visible body height.");
            using (var dialog = new NpcEditorForm(catalog, new SceneNpc { Id = "npc-keep", Label = "保留", CharacterId = catalog.Characters[0].Id, X = 500, Y = 300 }))
            {
                dialog.StartPosition = FormStartPosition.Manual; dialog.Location = new Point(-20000, -20000); dialog.ShowInTaskbar = false;
                dialog.Show(); Application.DoEvents();
                Require(dialog.CharacterChoiceCount == catalog.Characters.Count && dialog.DirectionChoiceCount == 8, "Selector choices missing.");
                foreach (var character in catalog.Characters)
                foreach (var facing in NpcCatalog.Directions)
                {
                    dialog.SelectCharacter(character.Id); dialog.SelectFacing(facing);
                    Require(dialog.Result.CharacterId == character.Id && dialog.Result.Facing == facing, "Selector preview state is stale.");
                }
                dialog.SetPercent(137.5m);
                Require(Math.Abs(dialog.Result.Scale - 1.375f) < 0.0001f, "Precise percentage failed.");
                Require(dialog.Result.X == 500 && dialog.Result.Y == 300 && dialog.Result.Id == "npc-keep", "Preview changes moved foot anchor or lost identity.");
                Screenshot(dialog, Path.Combine(output, "npc-selector.png")); dialog.Close();
            }
            checks.Add("PASS: character selector covers every character/facing, precise 137.5% scale, fixed foot coordinates and identity.");
            RunLegacyMigrationChecks(checks);
            // 正式場景：讀入後原樣存出必須逐字相同（只在記憶體比對，不寫回檔案）
            var shipPath = Path.Combine(root, "public", "maps", "ship_interior.scene.json");
            var shipText = File.ReadAllText(shipPath);
            var ship = SceneJson.Deserialize(shipText);
            SceneJson.Validate(ship);
            Require(SceneJson.Serialize(ship) == shipText, "ship_interior.scene.json does not roundtrip byte-identically.");
            Require(ship.NpcList.Count > 0 && ship.Interactables.Where(item => item.NpcId is not null)
                .All(item => ship.NpcList.Any(npc => npc.Id == item.NpcId)), "ship_interior NPC bindings are invalid.");
            checks.Add($"PASS: ship_interior loads {ship.NpcList.Count} NPCs / {ship.Interactables.Count(item => item.NpcId is not null)} bound dialogues and re-saves byte-identically.");
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
            canvas.RunOccluderSelfTest(output, checks);
            host.Close();
            using (var mainForm = new MainForm { ShowInTaskbar = false, SuppressUnsavedPrompt = true,
                StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000) })
            {
                mainForm.Show(); Application.DoEvents(); mainForm.RunNpcSidebarSelfTest(output); mainForm.Close();
            }
            checks.Add("PASS: MainForm lists NPC layers; sidebar edits size, options and presence; interaction sidebar binds/clears the talk target; deleting an NPC clears its talk targets and undo restores them.");
            File.WriteAllLines(Path.Combine(output, "result.txt"), checks.Append($"PASS: {checks.Count} verification groups completed."));
            return 0;
        }
        catch (Exception exception)
        {
            File.WriteAllText(Path.Combine(output, "result.txt"), string.Join(Environment.NewLine, checks) + Environment.NewLine + "FAIL: " + exception);
            return 1;
        }
    }

    private static void RunLegacyMigrationChecks(List<string> checks)
    {
        // 舊格式：互動區內嵌 npc。讀檔後轉成獨立 NPC，出場條件沿用啟用／移除、不帶「關閉」。
        var legacy = SceneDocument.CreateForImage("legacy.png", 800, 600);
        legacy.Interactables.Add(new SceneInteractable
        {
            Id = "legacy-talk", Label = "舊對話",
            Points = new() { new(10, 10), new(100, 10), new(100, 100) },
            Npc = new SceneNpc { CharacterId = "owen", Facing = "NE", X = 50, Y = 60, Scale = 1.1f },
            UseRequirements = new()
            {
                new InteractionUseRequirement { Kind = "questStage", Scope = "both", QuestId = "Q", StageId = "Q_STAGE_01",
                    StageMode = "UnlockUntilCondition", DisableQuestId = "Q", DisableStageId = "Q_STAGE_01",
                    RemoveQuestId = "Q", RemoveStageId = "Q_STAGE_03" },
            },
        });
        legacy.Interactables.Add(new SceneInteractable
        {
            Id = "legacy-free", Label = "只限互動",
            Points = new() { new(10, 10), new(100, 10), new(100, 100) },
            Npc = new SceneNpc { CharacterId = "rena", Facing = "S", X = 70, Y = 80, Scale = 1 },
            UseRequirements = new() { new InteractionUseRequirement { Kind = "questStage", Scope = "interaction", QuestId = "Q", StageId = "Q_STAGE_01" } },
        });
        // 直接序列化會保留 npc（模擬舊檔），讀回時才轉換
        var json = SceneJson.Serialize(legacy);
        Require(json.Contains("\"npc\":", StringComparison.Ordinal), "Legacy fixture lost inline npc.");
        var migrated = SceneJson.Deserialize(json);
        Require(migrated.NpcList.Count == 2 && migrated.Interactables.All(item => item.Npc is null), "Legacy NPCs were not converted.");
        var owen = migrated.NpcList.Single(npc => npc.Id == "npc-legacy-talk");
        Require(owen is { CharacterId: "owen", Facing: "NE", X: 50, Y: 60, Label: "舊對話" } && Math.Abs(owen.Scale - 1.1f) < 0.0001f,
            "Legacy NPC body was not preserved.");
        Require(owen.Presence is { StageMode: "UnlockFromStage", DisableStageId: "", RemoveStageId: "Q_STAGE_03" },
            "Legacy presence should keep activation/removal and drop closing.");
        Require(migrated.NpcList.Single(npc => npc.Id == "npc-legacy-free").Presence is null,
            "Interaction-only gate should leave the NPC always present.");
        Require(migrated.Interactables[0].NpcId == "npc-legacy-talk" && migrated.Interactables[1].NpcId == "npc-legacy-free",
            "Legacy interactions were not bound to their NPCs.");
        var saved = SceneJson.Serialize(migrated);
        Require(!saved.Contains("\"npc\":", StringComparison.Ordinal) && saved.Contains("\"npcs\":", StringComparison.Ordinal) &&
            saved.Contains("\"npcId\": \"npc-legacy-talk\"", StringComparison.Ordinal), "Migrated scene did not save in the new format.");
        var plain = SceneJson.Serialize(SceneDocument.CreateForImage("plain.png", 100, 100));
        Require(!plain.Contains("\"npcs\"", StringComparison.Ordinal) && !plain.Contains("\"npcId\"", StringComparison.Ordinal),
            "Scenes without NPCs acquired NPC fields.");
        var dangling = SceneJson.Deserialize(saved);
        dangling.Interactables[0].NpcId = "missing";
        var rejected = false;
        try { SceneJson.Validate(dangling); } catch (InvalidDataException) { rejected = true; }
        Require(rejected, "Validation accepted a talk target that does not exist.");
        checks.Add("PASS: legacy inline npc converts to independent NPCs (activation/removal kept, closing dropped, interaction-only = always present); new format saves; NPC-free scenes unchanged; dangling npcId rejected.");
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

        var document = SceneDocument.CreateForImage("npc-context-test.png", 1000, 680);
        document.Grid.Snap = true;
        document.Interactables.Add(new SceneInteractable
        {
            Id = "npc-context-owner", Label = "NPC 對話區",
            Points = new() { new(160, 180), new(480, 180), new(480, 500), new(160, 500) },
            InteractionHintPoint = new(200, 440),
            InteractionPoints = new() { new() { X = 260, Y = 470, Facing = "NE" } },
            NpcId = "npc-captain",
        });
        document.NpcList.Add(new SceneNpc { Id = "npc-captain", Label = "艦長", CharacterId = "captain", Facing = "SE", X = 320, Y = 420 });
        SetScene(document, new Bitmap(1000, 680)); FitToView();
        var bounds = NpcBodyRectangle(_document.NpcList[0]);
        var body = new PointF(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);

        RightClick(body);
        Check(_npcContextMenu.Visible && SelectedNpc == _document.NpcList[0], "Right-clicking an NPC did not open its own menu.");
        Check(_npcUnderlyingMenuItem.Visible && _npcBoundInteractionsMenu.DropDownItems.Count == 1 &&
            _npcPresenceItem.Text.Contains("一直在場", StringComparison.Ordinal), "NPC menu lacks underlying/bound/presence entries.");
        NpcSelfTest.Screenshot(_npcContextMenu, Path.Combine(output, "npc-context-menu.png"));
        var presenceRequested = false;
        NpcPresenceEditRequested += (_, _) => presenceRequested = true;
        _npcPresenceItem.PerformClick();
        Check(presenceRequested, "Presence menu did not request the presence editor.");
        _npcContextMenu.Close();

        var before = SceneJson.Serialize(_document);
        ((ToolStripMenuItem)_npcFacingMenu.DropDownItems[0]).PerformClick();
        Check(_document.NpcList[0].Facing == "N", "Facing submenu failed.");
        _npcFacePlayerItem.PerformClick();
        Check(!_document.NpcList[0].FacePlayer, "Face-player toggle failed.");
        Undo(); Undo();
        Check(SceneJson.Serialize(_document) == before, "NPC menu edits did not undo exactly.");

        // 角色蓋住互動區時，可以從 NPC 選單切到下方互動區的完整選單（提示點仍用原本點擊位置）
        var clicked = RightClick(body);
        _npcContextMenu.Close();
        _npcUnderlyingMenuItem.PerformClick();
        Check(_nodeContextMenu.Visible && _selection == new LayerSelection(SceneLayerKind.Interactable, 0) && _npcParentMenu.Visible,
            "Underlying interaction menu did not open.");
        Check(_npcParentMenu.Text.Contains("艦長", StringComparison.Ordinal) && ((ToolStripMenuItem)_npcBindMenu.DropDownItems[1]).Checked,
            "Interaction menu does not show the bound talk target.");
        NpcSelfTest.Screenshot(_nodeContextMenu, Path.Combine(output, "npc-interaction-context-menu.png"));
        _nodeContextMenu.Close();
        _interactionHintPointContextItem.PerformClick();
        var hint = _document.Interactables[0].InteractionHintPoint!;
        Check(Math.Abs(hint.X - clicked.X) < 0.01f && Math.Abs(hint.Y - clicked.Y) < 0.01f && _document.NpcList[0].X == 320,
            "Hint did not use the NPC click position or moved the NPC.");
        ((ToolStripMenuItem)_npcBindMenu.DropDownItems[0]).PerformClick();
        Check(_document.Interactables[0].NpcId is null, "Talk target could not be cleared from the interaction menu.");
        checks.Add("PASS: NPC right-click opens its own menu (facing, options, presence request, bound dialogues) and can hand over to the covered interaction menu; talk target binds/clears; hint keeps click coordinates; Undo exact.");
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
        document.Interactables.Add(new SceneInteractable { Id = "npc-test-interaction", Label = "第一段對話",
            Points = new() { new(80, 410), new(280, 410), new(280, 550), new(80, 550) },
            InteractionPoints = new() { new() { X = 180, Y = 470, Facing = "N" } } });
        document.Interactables.Add(new SceneInteractable { Id = "npc-test-second", Label = "第二段對話",
            Points = new() { new(600, 410), new(800, 410), new(800, 550), new(600, 550) } });
        var plainJson = SceneJson.Serialize(document);
        Check(!plainJson.Contains("\"npcs\"", StringComparison.Ordinal) && !plainJson.Contains("\"npcId\"", StringComparison.Ordinal),
            "Scenes without NPCs acquired NPC fields.");
        var background = new Bitmap(1000, 680);
        using (var g = Graphics.FromImage(background)) g.Clear(Color.FromArgb(37, 43, 52));
        SetScene(document, background); Application.DoEvents(); FitToView();
        Check(_addNpcWorldContextItem.DropDownItems.Count == _npcCatalog!.Characters.Count &&
            ((ToolStripMenuItem)_addNpcWorldContextItem.DropDownItems[0]).DropDownItems.Count == 8, "World NPC menu missing characters/directions.");
        // 互動區右鍵「在此新增 NPC 並設為對話對象」
        _contextSelection = new(SceneLayerKind.Interactable, 0); _contextInteractionPoint = new PointF(500, 300);
        ((ToolStripMenuItem)((ToolStripMenuItem)_npcCreateBoundMenu.DropDownItems[0]).DropDownItems[3]).PerformClick();
        Check(SelectedNpc is { Facing: "SE" } && _document.Interactables[0].NpcId == SelectedNpc.Id &&
            SelectedNpc.Id == $"npc-{_npcCatalog.Characters[0].Id}", "Bound NPC creation failed.");
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
        Check(Near(npc.X, 590) && Near(npc.Y, 340), "Actual pointer drag failed to move the NPC.");
        Check(_document.Interactables[0].Points.Zip(originalPolygon).All(p => p.First.X == p.Second.X && p.First.Y == p.Second.Y), "NPC drag moved an interaction polygon.");
        Check(_document.Interactables[0].EffectiveInteractionPoints[0].X == originalPoint.X, "NPC drag moved the interaction Point.");
        var foot = new PointF(npc.X, npc.Y);
        var handle = NpcResizeHandle(npc);
        MouseDrag(handle, new PointF(foot.X + (handle.X - foot.X) * 1.4f, foot.Y + (handle.Y - foot.Y) * 1.4f));
        Check(Math.Abs(SelectedNpc!.Scale - 1.4f) < 0.02f && SelectedNpc.X == foot.X && SelectedNpc.Y == foot.Y, "Resize did not preserve foot anchor.");
        var resized = SelectedNpc.Scale;
        Undo(); Check(Math.Abs(_document.NpcList[0].Scale - 1) < 0.001f, "Resize undo failed.");
        Redo(); Check(_document.NpcList[0].Scale == resized, "Resize redo failed.");
        checks.Add("PASS: interaction menu creates + binds an NPC; static/live drag layers do not duplicate it; pointer drag and foot-anchored resize; Undo/Redo.");

        // 獨立：移動互動區不會帶動 NPC；第二段對話可以共用同一個 NPC
        npc = _document.NpcList[0]; var beforeParentMove = npc.Copy();
        SelectLayer(new(SceneLayerKind.Interactable, 0));
        MouseDrag(new PointF(110, 525), new PointF(130, 545));
        Check(npc.X == beforeParentMove.X && npc.Y == beforeParentMove.Y, "Moving an interaction moved its NPC.");
        BindInteractionNpc(1, npc.Id);
        Check(InteractionsUsingNpc(npc).Count == 2, "Two dialogues could not share one NPC.");
        SelectNpc(0);
        DeleteSelectedNodeOrShape();
        Check(_document.NpcList.Count == 0 && _document.Interactables.Count == 2 &&
            _document.Interactables.All(item => item.NpcId is null), "Deleting the NPC left dangling talk targets or removed dialogues.");
        Undo(); Check(_document.NpcList.Count == 1 && InteractionsUsingNpc(_document.NpcList[0]).Count == 2, "NPC removal undo failed.");
        SceneJson.Save(Path.Combine(output, "npc-roundtrip.scene.json"), _document);
        var roundtrip = SceneJson.Load(Path.Combine(output, "npc-roundtrip.scene.json"));
        Check(roundtrip.NpcList.Count == 1 && roundtrip.NpcList[0].Id == npc.Id && roundtrip.NpcList[0].Scale == _document.NpcList[0].Scale &&
            roundtrip.Interactables.All(item => item.NpcId == npc.Id), "NPC JSON roundtrip failed.");
        checks.Add("PASS: NPC is independent of interaction move; two dialogues share one NPC; delete clears both talk targets; undo restores; save/reload keeps identity and bindings.");

        // Render a reviewable arrangement of every character using the same shared assets.
        _document.Interactables.Clear(); _document.NpcList.Clear();
        var index = 0;
        foreach (var character in _npcCatalog.Characters)
        {
            var x = 140 + index * 235;
            _document.NpcList.Add(new SceneNpc { Id = "npc-preview-" + character.Id, Label = character.Name, CharacterId = character.Id,
                Facing = new[] { "SE", "S", "W", "NW" }[index % 4], X = x, Y = 420, Scale = 1.35f });
            index++;
        }
        SelectNpc(Math.Min(2, _document.NpcList.Count - 1)); DisposeViewCache();
        NpcSelfTest.Screenshot(this, Path.Combine(output, "npc-canvas.png"));
        checks.Add("PASS: native canvas and selector screenshots generated from live controls.");
    }
}
