namespace Echoes.MapEditor;

internal sealed class QuestStageRequirementEditorForm : Form
{
    private sealed record ModeChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private readonly QuestCatalogEntry[] _quests;
    private readonly ComboBox _mode = CreateCombo();
    private readonly ComboBox _quest = CreateCombo();
    private readonly ComboBox _stage = CreateCombo();
    private readonly ComboBox _disableQuest = CreateCombo();
    private readonly ComboBox _disableStage = CreateCombo();

    public InteractionUseRequirement Requirement { get; private set; }

    public QuestStageRequirementEditorForm(
        IEnumerable<QuestCatalogEntry> quests,
        InteractionUseRequirement requirement)
    {
        Requirement = requirement.Clone();
        _quests = BuildQuestChoices(quests, requirement);

        Text = "任務階段啟用條件";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(620, 350);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);

        AddLabel("啟用模式", 24, 25);
        _mode.SetBounds(180, 20, 410, 30);
        _mode.Items.AddRange(new object[]
        {
            new ModeChoice("CurrentStageOnly", "CurrentStageOnly｜只在指定階段啟用"),
            new ModeChoice("UnlockFromStage", "UnlockFromStage｜到達指定階段後永久啟用"),
            new ModeChoice("UnlockUntilCondition", "UnlockUntilCondition｜到達後啟用，直到關閉條件成立"),
        });
        _mode.SelectedIndex = Math.Max(0, _mode.Items.Cast<ModeChoice>()
            .Select((choice, index) => new { choice, index })
            .FirstOrDefault(entry => entry.choice.Id.Equals(
                requirement.StageMode,
                StringComparison.OrdinalIgnoreCase))?.index ?? 0);
        Controls.Add(_mode);

        AddLabel("啟用 Quest ID", 24, 77);
        _quest.SetBounds(180, 72, 410, 30);
        _quest.Items.AddRange(_quests.Cast<object>().ToArray());
        SelectQuest(_quest, requirement.QuestId);
        Controls.Add(_quest);

        AddLabel("允許互動的 Stage", 24, 129);
        _stage.SetBounds(180, 124, 410, 30);
        Controls.Add(_stage);
        PopulateStages(_quest, _stage, requirement.StageId);

        AddLabel("關閉 Quest ID", 24, 197);
        _disableQuest.SetBounds(180, 192, 410, 30);
        _disableQuest.Items.AddRange(_quests.Cast<object>().ToArray());
        SelectQuest(_disableQuest, requirement.DisableQuestId);
        Controls.Add(_disableQuest);

        AddLabel("關閉條件 Stage", 24, 249);
        _disableStage.SetBounds(180, 244, 410, 30);
        Controls.Add(_disableStage);
        PopulateStages(_disableQuest, _disableStage, requirement.DisableStageId);

        var cancel = CreateButton("取消", 390, 298, 94, 34);
        cancel.DialogResult = DialogResult.Cancel;
        Controls.Add(cancel);
        var save = CreateButton("套用", 496, 298, 94, 34);
        save.Click += (_, _) => SaveRequirement();
        Controls.Add(save);
        AcceptButton = save;
        CancelButton = cancel;

        _quest.SelectedIndexChanged += (_, _) => PopulateStages(_quest, _stage, "");
        _disableQuest.SelectedIndexChanged += (_, _) => PopulateStages(_disableQuest, _disableStage, "");
        _mode.SelectedIndexChanged += (_, _) => RefreshDisableControls();
        RefreshDisableControls();
    }

    private void SaveRequirement()
    {
        if (_quest.SelectedItem is not QuestCatalogEntry quest ||
            _stage.SelectedItem is not QuestStageCatalogEntry stage)
        {
            MessageBox.Show("請選擇啟用任務與階段。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var mode = (_mode.SelectedItem as ModeChoice)?.Id ?? "CurrentStageOnly";
        var disableQuest = _disableQuest.SelectedItem as QuestCatalogEntry;
        var disableStage = _disableStage.SelectedItem as QuestStageCatalogEntry;
        if (mode == "UnlockUntilCondition" && (disableQuest is null || disableStage is null))
        {
            MessageBox.Show("UnlockUntilCondition 必須指定關閉任務與階段。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        Requirement = new InteractionUseRequirement
        {
            Kind = "questStage",
            QuestId = quest.Id,
            StageId = stage.Id,
            StageMode = mode,
            DisableQuestId = mode == "UnlockUntilCondition" ? disableQuest!.Id : "",
            DisableStageId = mode == "UnlockUntilCondition" ? disableStage!.Id : "",
        };
        DialogResult = DialogResult.OK;
        Close();
    }

    private void RefreshDisableControls()
    {
        var enabled = (_mode.SelectedItem as ModeChoice)?.Id == "UnlockUntilCondition";
        _disableQuest.Enabled = enabled;
        _disableStage.Enabled = enabled;
    }

    private static QuestCatalogEntry[] BuildQuestChoices(
        IEnumerable<QuestCatalogEntry> source,
        InteractionUseRequirement current)
    {
        var values = source.ToList();
        AddFallback(current.QuestId, current.StageId);
        AddFallback(current.DisableQuestId, current.DisableStageId);
        return values
            .GroupBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        void AddFallback(string questId, string stageId)
        {
            if (string.IsNullOrWhiteSpace(questId) ||
                values.Any(quest => quest.Id.Equals(questId, StringComparison.OrdinalIgnoreCase))) return;
            values.Add(new QuestCatalogEntry(
                questId,
                "（目前場景使用中）",
                string.IsNullOrWhiteSpace(stageId)
                    ? Array.Empty<QuestStageCatalogEntry>()
                    : new[] { new QuestStageCatalogEntry(stageId, "（目前場景使用中）") }));
        }
    }

    private static void SelectQuest(ComboBox combo, string questId)
    {
        var index = combo.Items.Cast<QuestCatalogEntry>()
            .Select((quest, itemIndex) => new { quest, itemIndex })
            .FirstOrDefault(entry => entry.quest.Id.Equals(questId, StringComparison.OrdinalIgnoreCase))
            ?.itemIndex ?? (combo.Items.Count > 0 ? 0 : -1);
        combo.SelectedIndex = index;
    }

    private static void PopulateStages(ComboBox questCombo, ComboBox stageCombo, string selectedStageId)
    {
        stageCombo.BeginUpdate();
        stageCombo.Items.Clear();
        if (questCombo.SelectedItem is QuestCatalogEntry quest)
            stageCombo.Items.AddRange(quest.StageEntries.Cast<object>().ToArray());
        var index = stageCombo.Items.Cast<QuestStageCatalogEntry>()
            .Select((stage, itemIndex) => new { stage, itemIndex })
            .FirstOrDefault(entry => entry.stage.Id.Equals(selectedStageId, StringComparison.OrdinalIgnoreCase))
            ?.itemIndex ?? (stageCombo.Items.Count > 0 ? 0 : -1);
        stageCombo.SelectedIndex = index;
        stageCombo.EndUpdate();
    }

    private void AddLabel(string text, int x, int y)
    {
        Controls.Add(new Label
        {
            Text = text,
            Left = x,
            Top = y,
            Width = 146,
            Height = 26,
            ForeColor = Color.FromArgb(196, 209, 221),
            TextAlign = ContentAlignment.MiddleLeft,
        });
    }

    private static ComboBox CreateCombo() => new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        BackColor = Color.FromArgb(35, 39, 47),
        ForeColor = Color.FromArgb(226, 230, 234),
        FlatStyle = FlatStyle.Flat,
    };

    private static Button CreateButton(string text, int x, int y, int width, int height) => new()
    {
        Text = text,
        Left = x,
        Top = y,
        Width = width,
        Height = height,
        FlatStyle = FlatStyle.Flat,
        BackColor = Color.FromArgb(38, 43, 52),
        ForeColor = Color.FromArgb(226, 230, 234),
    };
}
