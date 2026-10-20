namespace Echoes.MapEditor;

// 工具列第二排「顯示」：每一類圖層一個勾選開關，取消勾選就暫時不畫、不能點選（不寫入場景）。
public sealed partial class MainForm
{
    private readonly List<(CheckBox Check, SceneLayerKind Kind)> _visibilityChecks = new();
    private CheckBox? _spawnVisibilityCheck;
    private bool _syncingVisibility;

    private ToolStrip BuildVisibilityBar()
    {
        var bar = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            AutoSize = false,
            Height = 30,
            Padding = new Padding(8, 2, 6, 2),
            BackColor = Color.FromArgb(31, 35, 42),
            ForeColor = Color.FromArgb(200, 208, 216),
            Renderer = new ToolStripProfessionalRenderer(new DarkColorTable()),
        };
        bar.Items.Add(new ToolStripLabel("顯示：") { ForeColor = Color.FromArgb(160, 172, 184) });
        var entries = new (string Text, SceneLayerKind Kind, Color Accent)[]
        {
            ("NavMesh", SceneLayerKind.NavMesh, Color.FromArgb(110, 200, 255)),
            ("碰撞", SceneLayerKind.Collision, Color.FromArgb(255, 120, 120)),
            ("互動", SceneLayerKind.Interactable, Color.FromArgb(255, 220, 90)),
            ("劇情觸發區", SceneLayerKind.StoryTrigger, Color.FromArgb(190, 150, 255)),
            ("強制引導線", SceneLayerKind.MovementGuide, Color.FromArgb(120, 230, 180)),
            ("傳送點", SceneLayerKind.TeleportPoint, Color.FromArgb(150, 220, 255)),
            ("Entry Point", SceneLayerKind.EntryPoint, Color.FromArgb(150, 220, 255)),
            ("出入口", SceneLayerKind.SceneConnection, Color.FromArgb(255, 170, 80)),
            ("遮擋片段", SceneLayerKind.Occluder, Color.FromArgb(93, 202, 165)),
            ("ItemPoint", SceneLayerKind.ItemPoint, Color.FromArgb(240, 200, 120)),
            ("NPC", SceneLayerKind.Npc, Color.FromArgb(129, 222, 211)),
        };
        foreach (var (text, kind, accent) in entries)
        {
            var check = CreateVisibilityCheck(text, accent);
            check.CheckedChanged += (_, _) =>
            {
                if (_syncingVisibility) return;
                _canvas.SetKindVisible(kind, check.Checked);
                RefreshSelectionUi();
            };
            _visibilityChecks.Add((check, kind));
            bar.Items.Add(new ToolStripControlHost(check) { Margin = new Padding(0, 1, 6, 1) });
        }
        _spawnVisibilityCheck = CreateVisibilityCheck("出生點", Color.FromArgb(90, 230, 255));
        _spawnVisibilityCheck.CheckedChanged += (_, _) =>
        {
            if (!_syncingVisibility) _canvas.SpawnVisible = _spawnVisibilityCheck.Checked;
        };
        bar.Items.Add(new ToolStripControlHost(_spawnVisibilityCheck) { Margin = new Padding(0, 1, 10, 1) });
        bar.Items.Add(new ToolStripSeparator());
        var showAll = CreateToolbarButton("全部顯示", "把所有圖層種類重新顯示", (_, _) =>
        {
            foreach (var (_, kind) in _visibilityChecks) _canvas.SetKindVisible(kind, true);
            _canvas.SpawnVisible = true;
        });
        bar.Items.Add(showAll);
        _canvas.LayerVisibilityChanged += (_, _) => SyncVisibilityChecks();
        return bar;
    }

    private static CheckBox CreateVisibilityCheck(string text, Color accent) => new()
    {
        Text = text,
        Checked = true,
        AutoSize = true,
        ForeColor = accent,
        BackColor = Color.Transparent,
        FlatStyle = FlatStyle.Flat,
        Padding = new Padding(0),
        Margin = new Padding(0),
        Cursor = Cursors.Hand,
    };

    private void SyncVisibilityChecks()
    {
        _syncingVisibility = true;
        try
        {
            foreach (var (check, kind) in _visibilityChecks) check.Checked = _canvas.IsKindVisible(kind);
            if (_spawnVisibilityCheck is not null) _spawnVisibilityCheck.Checked = _canvas.SpawnVisible;
        }
        finally { _syncingVisibility = false; }
    }

    internal void RunVisibilitySelfTest()
    {
        var navMesh = _visibilityChecks.Single(item => item.Kind == SceneLayerKind.NavMesh).Check;
        navMesh.Checked = false;
        NpcSelfTest.Require(!_canvas.IsKindVisible(SceneLayerKind.NavMesh), "NavMesh visibility toggle did not hide the layer.");
        var npc = _visibilityChecks.Single(item => item.Kind == SceneLayerKind.Npc).Check;
        npc.Checked = false;
        NpcSelfTest.Require(!_canvas.IsKindVisible(SceneLayerKind.Npc), "NPC visibility toggle did not hide the layer.");
        // 從圖層清單選取隱藏的種類會自動重新顯示，並同步勾選
        if (_canvas.Document.NpcList.Count > 0)
        {
            _canvas.SelectLayer(new LayerSelection(SceneLayerKind.Npc, 0));
            NpcSelfTest.Require(_canvas.IsKindVisible(SceneLayerKind.Npc) && npc.Checked, "Selecting a hidden NPC did not reveal it.");
        }
        _spawnVisibilityCheck!.Checked = false;
        NpcSelfTest.Require(!_canvas.SpawnVisible, "Spawn visibility toggle failed.");
        foreach (var (check, _) in _visibilityChecks) check.Checked = true;
        _spawnVisibilityCheck.Checked = true;
        NpcSelfTest.Require(_visibilityChecks.All(item => _canvas.IsKindVisible(item.Kind)) && _canvas.SpawnVisible, "Show-all state failed.");
    }
}
