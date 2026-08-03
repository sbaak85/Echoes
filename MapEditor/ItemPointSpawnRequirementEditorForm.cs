namespace Echoes.MapEditor;

internal sealed class ItemPointSpawnRequirementEditorForm : Form
{
    private sealed record ModeChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private readonly QuestCatalogEntry[] _quests;
    private readonly CheckBox _enabled = new()
    {
        Text = "啟用任務階段 Spawn 限制",
        AutoSize = true,
    };
    private readonly ComboBox _mode = CreateCombo();
    private readonly ComboBox _quest = CreateCombo();
    private readonly ComboBox _stage = CreateCombo();

    public ItemPointSpawnRequirement? Requirement { get; private set; }

    public ItemPointSpawnRequirementEditorForm(
        IEnumerable<QuestCatalogEntry> quests,
        ItemPointSpawnRequirement? requirement)
    {
        Requirement = requirement?.Clone();
        _quests = BuildQuestChoices(quests, requirement);

        Text = "ItemPoint Spawn 需求設定";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(640, 300);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);

        _enabled.Checked = requirement is not null;
        _enabled.SetBounds(24, 20, 250, 28);
        Controls.Add(_enabled);

        Controls.Add(new Label
        {
            Text = "未啟用時，ItemPoint 會依原有生成規則從一開始便可生成。",
            Left = 24,
            Top = 52,
            Width = 590,
            Height = 24,
            ForeColor = Color.FromArgb(126, 214, 207),
        });

        AddLabel("Spawn 模式", 24, 92);
        _mode.SetBounds(180, 87, 430, 30);
        _mode.Items.AddRange(new object[]
        {
            new ModeChoice("CurrentStageOnly", "CurrentStageOnly｜只在指定階段生成"),
            new ModeChoice("UnlockFromStage", "UnlockFromStage｜到達指定階段後持續生成"),
        });
        _mode.SelectedIndex = Math.Max(0, _mode.Items.Cast<ModeChoice>()
            .Select((choice, index) => new { choice, index })
            .FirstOrDefault(entry => entry.choice.Id.Equals(
                requirement?.StageMode,
                StringComparison.OrdinalIgnoreCase))?.index ?? 0);
        Controls.Add(_mode);

        AddLabel("Quest ID", 24, 139);
        _quest.SetBounds(180, 134, 430, 30);
        _quest.Items.AddRange(_quests.Cast<object>().ToArray());
        SelectQuest(_quest, requirement?.QuestId ?? "");
        Controls.Add(_quest);

        AddLabel("Stage ID", 24, 186);
        _stage.SetBounds(180, 181, 430, 30);
        Controls.Add(_stage);
        PopulateStages(_quest, _stage, requirement?.StageId ?? "");

        var cancel = CreateButton("取消", 410, 244, 94, 36);
        cancel.DialogResult = DialogResult.Cancel;
        Controls.Add(cancel);
        var save = CreateButton("套用", 516, 244, 94, 36);
        save.Click += (_, _) => SaveRequirement();
        Controls.Add(save);
        AcceptButton = save;
        CancelButton = cancel;

        _enabled.CheckedChanged += (_, _) => RefreshEnabledState();
        _quest.SelectedIndexChanged += (_, _) => PopulateStages(_quest, _stage, "");
        RefreshEnabledState();
    }

    private void SaveRequirement()
    {
        if (!_enabled.Checked)
        {
            Requirement = null;
            DialogResult = DialogResult.OK;
            Close();
            return;
        }
        if (_quest.SelectedItem is not QuestCatalogEntry quest ||
            _stage.SelectedItem is not QuestStageCatalogEntry stage)
        {
            MessageBox.Show(
                "請先在 QuestEditor 建立並儲存任務階段，再選擇 Quest 與 Stage。",
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }
        Requirement = new ItemPointSpawnRequirement
        {
            QuestId = quest.Id,
            StageId = stage.Id,
            StageMode = (_mode.SelectedItem as ModeChoice)?.Id ?? "CurrentStageOnly",
        };
        DialogResult = DialogResult.OK;
        Close();
    }

    private void RefreshEnabledState()
    {
        _mode.Enabled = _enabled.Checked;
        _quest.Enabled = _enabled.Checked;
        _stage.Enabled = _enabled.Checked;
    }

    private static QuestCatalogEntry[] BuildQuestChoices(
        IEnumerable<QuestCatalogEntry> source,
        ItemPointSpawnRequirement? current)
    {
        var values = source.ToList();
        if (current is not null &&
            !string.IsNullOrWhiteSpace(current.QuestId) &&
            values.All(quest => !quest.Id.Equals(
                current.QuestId,
                StringComparison.OrdinalIgnoreCase)))
        {
            values.Add(new QuestCatalogEntry(
                current.QuestId,
                "（目前場景使用中）",
                string.IsNullOrWhiteSpace(current.StageId)
                    ? Array.Empty<QuestStageCatalogEntry>()
                    : new[]
                    {
                        new QuestStageCatalogEntry(
                            current.StageId,
                            "（目前場景使用中）"),
                    }));
        }
        return values
            .GroupBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static void SelectQuest(ComboBox combo, string questId)
    {
        var index = combo.Items.Cast<QuestCatalogEntry>()
            .Select((quest, itemIndex) => new { quest, itemIndex })
            .FirstOrDefault(entry => entry.quest.Id.Equals(
                questId,
                StringComparison.OrdinalIgnoreCase))?.itemIndex
            ?? (combo.Items.Count > 0 ? 0 : -1);
        combo.SelectedIndex = index;
    }

    private static void PopulateStages(
        ComboBox questCombo,
        ComboBox stageCombo,
        string selectedStageId)
    {
        stageCombo.BeginUpdate();
        stageCombo.Items.Clear();
        if (questCombo.SelectedItem is QuestCatalogEntry quest)
            stageCombo.Items.AddRange(quest.StageEntries.Cast<object>().ToArray());
        var index = stageCombo.Items.Cast<QuestStageCatalogEntry>()
            .Select((stage, itemIndex) => new { stage, itemIndex })
            .FirstOrDefault(entry => entry.stage.Id.Equals(
                selectedStageId,
                StringComparison.OrdinalIgnoreCase))?.itemIndex
            ?? (stageCombo.Items.Count > 0 ? 0 : -1);
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
