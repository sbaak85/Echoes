namespace Echoes.MapEditor;

internal sealed class QuestStateRequirementEditorForm : Form
{
    private sealed record StateChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private static readonly StateChoice[] States =
    {
        new("completed", "已完成"),
        new("active", "進行中"),
        new("available", "可啟動／等待啟動"),
        new("locked", "尚未解鎖"),
        new("failed", "已失敗"),
        new("abandoned", "已放棄"),
    };

    private readonly ComboBox _quest = CreateCombo();
    private readonly ComboBox _state = CreateCombo();

    public InteractionUseRequirement Requirement { get; private set; }

    public QuestStateRequirementEditorForm(
        IEnumerable<QuestCatalogEntry> quests,
        InteractionUseRequirement requirement)
    {
        Requirement = requirement.Clone();
        var choices = quests.ToList();
        if (!string.IsNullOrWhiteSpace(requirement.QuestId) &&
            choices.All(quest => !quest.Id.Equals(
                requirement.QuestId,
                StringComparison.OrdinalIgnoreCase)))
        {
            choices.Add(new QuestCatalogEntry(requirement.QuestId, "（資料庫中未找到）"));
        }

        Text = "任務狀態需求";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(620, 205);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);

        AddLabel("任務", 24, 27);
        _quest.SetBounds(150, 22, 440, 30);
        _quest.Items.AddRange(choices
            .OrderBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .Cast<object>()
            .ToArray());
        SelectById(_quest, requirement.QuestId);
        Controls.Add(_quest);

        AddLabel("必須處於狀態", 24, 79);
        _state.SetBounds(150, 74, 440, 30);
        _state.Items.AddRange(States.Cast<object>().ToArray());
        _state.SelectedIndex = Math.Max(0, States
            .Select((state, index) => new { state, index })
            .FirstOrDefault(entry => entry.state.Id.Equals(
                requirement.QuestState ?? "completed",
                StringComparison.OrdinalIgnoreCase))?.index ?? 0);
        Controls.Add(_state);

        var cancel = CreateButton("取消", 390, 148, 94, 34);
        cancel.DialogResult = DialogResult.Cancel;
        Controls.Add(cancel);
        var save = CreateButton("儲存", 496, 148, 94, 34);
        save.Click += (_, _) => SaveRequirement();
        Controls.Add(save);
        AcceptButton = save;
        CancelButton = cancel;
    }

    private void SaveRequirement()
    {
        if (_quest.SelectedItem is not QuestCatalogEntry quest)
        {
            MessageBox.Show("請選擇任務。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        Requirement = new InteractionUseRequirement
        {
            Kind = "questState",
            QuestId = quest.Id,
            QuestState = (_state.SelectedItem as StateChoice)?.Id ?? "completed",
        };
        DialogResult = DialogResult.OK;
        Close();
    }

    private static void SelectById(ComboBox combo, string questId)
    {
        combo.SelectedIndex = combo.Items.Cast<QuestCatalogEntry>()
            .Select((quest, index) => new { quest, index })
            .FirstOrDefault(entry => entry.quest.Id.Equals(
                questId,
                StringComparison.OrdinalIgnoreCase))?.index
            ?? (combo.Items.Count > 0 ? 0 : -1);
    }

    private void AddLabel(string text, int x, int y)
    {
        Controls.Add(new Label
        {
            Text = text,
            Left = x,
            Top = y,
            Width = 116,
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
