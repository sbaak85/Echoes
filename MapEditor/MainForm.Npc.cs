namespace Echoes.MapEditor;

public sealed partial class MainForm
{
    private readonly GroupBox _npcGroup = CreateGroup("NPC", 125);
    private readonly Label _npcSummaryLabel = new() { ForeColor = Color.FromArgb(129, 222, 211) };
    private readonly NumericUpDown _npcScaleInput = new() { Minimum = 10, Maximum = 500, DecimalPlaces = 1, Increment = 5, Value = 100 };

    private void AddNpcSidebar(Control sidebar)
    {
        _npcSummaryLabel.SetBounds(10, 25, SidebarContentWidth, 22);
        _npcGroup.Controls.Add(_npcSummaryLabel);
        var percentLabel = new Label { Text = "大小 %", ForeColor = Color.FromArgb(184, 194, 205) };
        percentLabel.SetBounds(10, 49, 103, 20); _npcGroup.Controls.Add(percentLabel);
        _npcScaleInput.SetBounds(10, 73, 103, 28); _npcGroup.Controls.Add(_npcScaleInput);
        var apply = CreateButton("套用大小", 121, 72, 103, 30);
        apply.Click += (_, _) =>
        {
            var scale = (float)_npcScaleInput.Value / 100;
            _canvas.SelectAttachedNpc(); _canvas.SetSelectedNpcScale(scale);
        };
        _npcGroup.Controls.Add(apply);
        var edit = CreateButton("編輯 NPC…", 232, 72, 103, 30);
        edit.Click += (_, _) => _canvas.EditSelectedNpc(); _npcGroup.Controls.Add(edit);
        _npcGroup.Visible = false; sidebar.Controls.Add(_npcGroup);
    }

    private void RefreshNpcSidebar()
    {
        var npc = _canvas.SelectedInteractable?.Npc;
        _npcGroup.Visible = npc is not null;
        if (npc is null) return;
        _npcSummaryLabel.Text = $"{(_canvas.SelectedNpc is null ? "附掛 NPC" : "已選取 NPC")} · {_canvas.AttachedNpcName} · {npc.Facing}";
        _npcScaleInput.Value = (decimal)Math.Clamp(npc.Scale * 100, 10, 500);
    }

    internal void RunNpcSidebarSelfTest(string output)
    {
        var scene = SceneDocument.CreateForImage("npc-main-form.png", 1100, 700);
        scene.Grid.Snap = false;
        scene.Interactables.Add(new SceneInteractable { Id = "npc-editor-review", Label = "艦長對話",
            Points = new() { new(270, 420), new(560, 420), new(560, 570), new(270, 570) },
            InteractionPoints = new() { new() { X = 410, Y = 480, Facing = "N" } } });
        var background = new Bitmap(1100, 700);
        using (var graphics = Graphics.FromImage(background)) graphics.Clear(Color.FromArgb(37, 43, 52));
        _canvas.SetScene(scene, background); Application.DoEvents(); _canvas.FitToView();
        _canvas.SetNpc(0, new SceneNpc { CharacterId = "captain", X = 410, Y = 390, Facing = "SE", Scale = 1.5f });
        NpcSelfTest.Require(_npcGroup.Visible && _npcScaleInput.Value == 150 && _canvas.SelectedNpc is not null, "MainForm selection refresh lost NPC state.");
        _npcScaleInput.Value = 125;
        _npcGroup.Controls.OfType<Button>().Single(button => button.Text == "套用大小").PerformClick();
        NpcSelfTest.Require(_canvas.SelectedNpc?.Scale == 1.25f && _npcScaleInput.Value == 125, "Sidebar precise percent failed.");
        NpcSelfTest.Screenshot(this, System.IO.Path.Combine(output, "npc-main-form.png"));
        _canvas.DeleteSelectedNodeOrShape();
        NpcSelfTest.Require(_canvas.Document.Interactables.Count == 1 && !_npcGroup.Visible, "NPC delete/selection refresh removed parent or kept stale sidebar.");
        _canvas.Undo();
        NpcSelfTest.Require(_canvas.Document.Interactables[0].Npc is not null, "MainForm NPC delete undo failed.");
    }
}
