namespace Echoes.MapEditor;

// 側欄 NPC 區塊：
//   - 選取 NPC：大小、角色／方向、出場條件、對話時轉向主角、待機呼吸，以及引用它的對話；
//   - 選取互動區：指定「對話對象」NPC（多段對話可以共用同一個 NPC）。
public sealed partial class MainForm
{
    private readonly GroupBox _npcGroup = CreateGroup("NPC", 125);
    private readonly Label _npcSummaryLabel = new() { ForeColor = Color.FromArgb(129, 222, 211) };
    private readonly NumericUpDown _npcScaleInput = new() { Minimum = 10, Maximum = 500, DecimalPlaces = 1, Increment = 5, Value = 100 };
    private readonly Button _npcApplyScaleButton = CreateButton("套用大小", 121, 72, 103, 30);
    private readonly Button _npcEditButton = CreateButton("編輯 NPC…", 232, 72, 103, 30);
    private readonly Button _npcPresenceButton = CreateButton("出場條件…", 10, 110, 259, 30);
    private readonly Button _npcClearPresenceButton = CreateButton("清除", 275, 110, 60, 30);
    private readonly CheckBox _npcFacePlayerCheck = new() { Text = "對話時轉向主角", AutoSize = true };
    private readonly CheckBox _npcBreathingCheck = new() { Text = "待機呼吸", AutoSize = true };
    private readonly Label _npcReferencesLabel = new() { ForeColor = Color.FromArgb(184, 194, 205) };
    private readonly Label _npcBindLabel = new() { Text = "對話對象", ForeColor = Color.FromArgb(184, 194, 205) };
    private readonly ComboBox _npcBindCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        BackColor = Color.FromArgb(35, 39, 47),
        ForeColor = Color.FromArgb(226, 230, 234),
        FlatStyle = FlatStyle.Flat,
    };
    private bool _syncingNpcSidebar;

    private sealed record NpcBindChoice(string? Id, string Text)
    {
        public override string ToString() => Text;
    }

    private void AddNpcSidebar(Control sidebar)
    {
        _npcSummaryLabel.SetBounds(10, 25, SidebarContentWidth, 22);
        var percentLabel = new Label { Text = "大小 %", ForeColor = Color.FromArgb(184, 194, 205) };
        percentLabel.SetBounds(10, 49, 103, 20);
        _npcScaleInput.SetBounds(10, 73, 103, 28);
        _npcApplyScaleButton.Click += (_, _) => _canvas.SetSelectedNpcScale((float)_npcScaleInput.Value / 100);
        _npcEditButton.Click += (_, _) => _canvas.EditSelectedNpc();
        _npcPresenceButton.Click += (_, _) => EditSelectedNpcPresence();
        _npcClearPresenceButton.Click += (_, _) => _canvas.SetSelectedNpcPresence(null);
        _npcFacePlayerCheck.SetBounds(10, 148, 160, 24);
        _npcBreathingCheck.SetBounds(176, 148, 150, 24);
        _npcFacePlayerCheck.CheckedChanged += (_, _) => ApplyNpcOptions();
        _npcBreathingCheck.CheckedChanged += (_, _) => ApplyNpcOptions();
        _npcReferencesLabel.SetBounds(10, 176, SidebarContentWidth, 40);
        // 選取互動區時只顯示「對話對象」
        _npcBindLabel.SetBounds(10, 28, 80, 22);
        _npcBindCombo.SetBounds(92, 24, SidebarContentWidth - 82, 28);
        _npcBindCombo.SelectedIndexChanged += (_, _) =>
        {
            if (_syncingNpcSidebar || _canvas.SelectedInteractable is null ||
                _npcBindCombo.SelectedItem is not NpcBindChoice choice) return;
            _canvas.BindInteractionNpc(_canvas.Selection.Index, choice.Id);
            RefreshLayers();
            RefreshSelectionUi();
        };
        _npcGroup.Controls.AddRange(new Control[]
        {
            _npcSummaryLabel, percentLabel, _npcScaleInput, _npcApplyScaleButton, _npcEditButton,
            _npcPresenceButton, _npcClearPresenceButton, _npcFacePlayerCheck, _npcBreathingCheck, _npcReferencesLabel,
            _npcBindLabel, _npcBindCombo,
        });
        _npcGroup.Visible = false;
        sidebar.Controls.Add(_npcGroup);
        _canvas.NpcPresenceEditRequested += (_, _) => EditSelectedNpcPresence();
    }

    private void ApplyNpcOptions()
    {
        if (_syncingNpcSidebar || _canvas.SelectedNpc is null) return;
        _canvas.SetSelectedNpcOptions(_npcFacePlayerCheck.Checked, _npcBreathingCheck.Checked);
    }

    private void RefreshNpcSidebar()
    {
        var npc = _canvas.SelectedNpc;
        var interactable = _canvas.SelectedInteractable;
        _npcGroup.Visible = npc is not null || interactable is not null;
        if (!_npcGroup.Visible) return;
        _syncingNpcSidebar = true;
        try
        {
            foreach (var control in _npcGroup.Controls.Cast<Control>())
                control.Visible = npc is not null ? !(control == _npcBindLabel || control == _npcBindCombo)
                    : control == _npcBindLabel || control == _npcBindCombo;
            if (npc is not null)
            {
                _npcGroup.Text = "NPC";
                _npcGroup.Height = 222;
                _npcSummaryLabel.Text = $"{npc.Label} · {_canvas.NpcCharacterName(npc)} · {npc.Facing}";
                _npcScaleInput.Value = (decimal)Math.Clamp(npc.Scale * 100, 10, 500);
                _npcPresenceButton.Text = $"出場條件…（{EditorCanvas.DescribeNpcPresence(npc)}）";
                _npcClearPresenceButton.Enabled = npc.Presence is not null;
                _npcFacePlayerCheck.Checked = npc.FacePlayer;
                _npcBreathingCheck.Checked = npc.Breathing;
                var references = _canvas.InteractionsUsingNpc(npc);
                _npcReferencesLabel.Text = references.Count == 0
                    ? "還沒有對話以這個 NPC 為對象（在互動區的側欄或右鍵選單指定）。"
                    : "對話：" + string.Join("、", references.Select(item => $"{item.Label}（{item.Id}）"));
            }
            else
            {
                _npcGroup.Text = "NPC 對話對象";
                _npcGroup.Height = 64;
                _npcBindCombo.Items.Clear();
                _npcBindCombo.Items.Add(new NpcBindChoice(null, "（不指定）"));
                foreach (var candidate in _canvas.Document.NpcList)
                    _npcBindCombo.Items.Add(new NpcBindChoice(candidate.Id, $"{candidate.Label}（{_canvas.NpcCharacterName(candidate)}）"));
                var bound = _canvas.FindNpc(interactable!.NpcId);
                _npcBindCombo.SelectedIndex = bound is null ? 0
                    : _npcBindCombo.Items.Cast<NpcBindChoice>().ToList().FindIndex(choice => choice.Id == bound.Id);
            }
        }
        finally { _syncingNpcSidebar = false; }
    }

    private void EditSelectedNpcPresence()
    {
        if (_canvas.SelectedNpc is not { } npc) return;
        var requirement = npc.Presence?.Clone() ?? new InteractionUseRequirement { Kind = "questStage", StageMode = "UnlockFromStage" };
        using var editor = new QuestStageRequirementEditorForm(
            QuestCatalog.Load(_projectRoot), QuestCatalog.LoadObjectives(_projectRoot), requirement)
        {
            Text = $"NPC 出場條件 · {npc.Label}（關閉或移除條件成立時離場）",
        };
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        _canvas.SetSelectedNpcPresence(editor.Requirement);
        _statusLabel.Text = $"{npc.Label} 出場條件：{EditorCanvas.DescribeNpcPresence(npc)}";
        RefreshLayers();
        RefreshSelectionUi();
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
        var index = _canvas.CreateNpc("captain", "SE", new PointF(410, 390), new LayerSelection(SceneLayerKind.Interactable, 0), 1.5f);
        RefreshLayers(); RefreshSelectionUi();
        NpcSelfTest.Require(index == 0 && _npcGroup.Visible && _npcScaleInput.Value == 150 && _canvas.SelectedNpc is not null,
            "MainForm selection refresh lost NPC state.");
        NpcSelfTest.Require(_layersList.Items.Cast<LayerListItem>().Any(item => item.Selection.Kind == SceneLayerKind.Npc),
            "NPC missing from layer list.");
        _npcScaleInput.Value = 125;
        _npcApplyScaleButton.PerformClick();
        NpcSelfTest.Require(_canvas.SelectedNpc?.Scale == 1.25f && _npcScaleInput.Value == 125, "Sidebar precise percent failed.");
        _npcFacePlayerCheck.Checked = false;
        NpcSelfTest.Require(_canvas.SelectedNpc is { FacePlayer: false, Breathing: true }, "Sidebar face-player option failed.");
        _canvas.SetSelectedNpcPresence(new InteractionUseRequirement { Kind = "questStage", QuestId = "Q", StageId = "Q_STAGE_01", StageMode = "UnlockFromStage" });
        RefreshSelectionUi();
        NpcSelfTest.Require(_npcPresenceButton.Text.Contains("Q S01", StringComparison.Ordinal) && _npcClearPresenceButton.Enabled,
            "Presence summary not shown.");
        NpcSelfTest.Screenshot(this, System.IO.Path.Combine(output, "npc-main-form.png"));
        // 選取互動區：側欄顯示對話對象，可改成不指定再改回來
        _canvas.SelectLayer(new LayerSelection(SceneLayerKind.Interactable, 0)); RefreshSelectionUi();
        NpcSelfTest.Require(_npcGroup.Visible && _npcBindCombo.Visible && _npcBindCombo.SelectedIndex == 1, "Interaction sidebar lost talk target.");
        _npcBindCombo.SelectedIndex = 0;
        NpcSelfTest.Require(_canvas.Document.Interactables[0].NpcId is null, "Clearing talk target failed.");
        _npcBindCombo.SelectedIndex = 1;
        NpcSelfTest.Require(_canvas.Document.Interactables[0].NpcId == _canvas.Document.NpcList[0].Id, "Binding talk target failed.");
        NpcSelfTest.Screenshot(this, System.IO.Path.Combine(output, "npc-main-form-binding.png"));
        _canvas.SelectNpc(0);
        _canvas.DeleteSelectedNodeOrShape(); RefreshSelectionUi();
        NpcSelfTest.Require(_canvas.Document.Interactables.Count == 1 && _canvas.Document.NpcList.Count == 0 &&
            _canvas.Document.Interactables[0].NpcId is null && !_npcGroup.Visible,
            "NPC delete removed parent, kept dangling talk target or stale sidebar.");
        _canvas.Undo();
        NpcSelfTest.Require(_canvas.Document.NpcList.Count == 1 && _canvas.Document.Interactables[0].NpcId == _canvas.Document.NpcList[0].Id,
            "MainForm NPC delete undo failed.");
        RunVisibilitySelfTest();
        _visibilityChecks.Single(item => item.Kind == SceneLayerKind.Interactable).Check.Checked = false;
        NpcSelfTest.Screenshot(this, System.IO.Path.Combine(output, "visibility-bar.png"));
        _visibilityChecks.Single(item => item.Kind == SceneLayerKind.Interactable).Check.Checked = true;
    }
}
