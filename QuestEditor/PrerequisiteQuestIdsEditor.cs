using System.ComponentModel;
using System.Drawing.Design;

namespace Echoes.QuestEditor;

internal sealed class PrerequisiteQuestIdsEditor : UITypeEditor
{
    private static Func<IReadOnlyList<QuestDefinition>> _questProvider =
        static () => Array.Empty<QuestDefinition>();

    public static void SetQuestProvider(Func<IReadOnlyList<QuestDefinition>> questProvider)
    {
        _questProvider = questProvider ?? throw new ArgumentNullException(nameof(questProvider));
    }

    public override UITypeEditorEditStyle GetEditStyle(ITypeDescriptorContext? context) =>
        UITypeEditorEditStyle.Modal;

    public override object? EditValue(
        ITypeDescriptorContext? context,
        IServiceProvider? provider,
        object? value)
    {
        var currentQuest = context?.Instance as QuestDefinition;
        var selectedIds = value as IEnumerable<string> ?? Array.Empty<string>();
        using var dialog = new PrerequisiteQuestSelectionDialog(
            _questProvider(),
            currentQuest?.Id,
            selectedIds);
        var result = Form.ActiveForm is { } owner
            ? dialog.ShowDialog(owner)
            : dialog.ShowDialog();
        return result == DialogResult.OK
            ? dialog.SelectedQuestIds.ToList()
            : value;
    }
}

internal sealed class PrerequisiteQuestSelectionDialog : Form
{
    private readonly CheckedListBox _questList = new();

    public IReadOnlyList<string> SelectedQuestIds => _questList.CheckedItems
        .Cast<PrerequisiteQuestChoice>()
        .Select(choice => choice.Id)
        .ToArray();

    public PrerequisiteQuestSelectionDialog(
        IReadOnlyList<QuestDefinition> quests,
        string? currentQuestId,
        IEnumerable<string> selectedIds)
    {
        Text = "選擇前置任務";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(700, 500);
        Font = new Font("Microsoft JhengHei UI", 10F);
        BackColor = Theme.Background;
        ForeColor = Theme.Text;

        var selected = selectedIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var choices = quests
            .Where(quest => !quest.Id.Equals(currentQuestId, StringComparison.OrdinalIgnoreCase))
            .Select(quest => new PrerequisiteQuestChoice(quest.Id, quest.Name))
            .ToList();
        foreach (var missingId in selected.Where(id => choices.All(
                     choice => !choice.Id.Equals(id, StringComparison.OrdinalIgnoreCase))))
        {
            choices.Add(new PrerequisiteQuestChoice(missingId, "找不到此任務"));
        }

        var instruction = new Label
        {
            Dock = DockStyle.Top,
            Height = 62,
            Padding = new Padding(16, 14, 16, 8),
            Text = "勾選必須先完成的任務。可複選；複數項目採全部成立（AND）。",
            ForeColor = Theme.Cyan,
        };

        _questList.Dock = DockStyle.Fill;
        _questList.CheckOnClick = true;
        _questList.IntegralHeight = false;
        _questList.BackColor = Theme.Panel;
        _questList.ForeColor = Theme.Text;
        _questList.BorderStyle = BorderStyle.FixedSingle;
        _questList.ItemHeight = 30;
        _questList.HorizontalScrollbar = true;
        for (var index = 0; index < choices.Count; index++)
        {
            var choice = choices[index];
            _questList.Items.Add(choice, selected.Contains(choice.Id));
        }

        var clearButton = Theme.Button("清除全部", 110);
        clearButton.Click += (_, _) =>
        {
            for (var index = 0; index < _questList.Items.Count; index++)
                _questList.SetItemChecked(index, false);
        };
        var cancelButton = Theme.Button("取消", 100);
        cancelButton.DialogResult = DialogResult.Cancel;
        var confirmButton = Theme.Button("確定", 100);
        confirmButton.DialogResult = DialogResult.OK;
        confirmButton.BackColor = Color.FromArgb(37, 82, 83);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 58,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(10),
            BackColor = Theme.PanelAlt,
        };
        buttons.Controls.Add(confirmButton);
        buttons.Controls.Add(cancelButton);
        buttons.Controls.Add(clearButton);

        Controls.Add(_questList);
        Controls.Add(instruction);
        Controls.Add(buttons);
        AcceptButton = confirmButton;
        CancelButton = cancelButton;
    }

    private sealed record PrerequisiteQuestChoice(string Id, string Name)
    {
        public override string ToString() => $"{Id}  ｜  {Name}";
    }
}
