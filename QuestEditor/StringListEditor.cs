using System.ComponentModel;
using System.Drawing.Design;
using System.Globalization;

namespace Echoes.QuestEditor;

/// <summary>
/// Edits a List&lt;string&gt; as one ID per line. Replaces the default WinForms
/// CollectionEditor, which cannot create string items ("Constructor on type
/// 'System.String' not found").
/// </summary>
internal sealed class StringListEditor : UITypeEditor
{
    public override UITypeEditorEditStyle GetEditStyle(ITypeDescriptorContext? context) =>
        UITypeEditorEditStyle.Modal;

    public override object? EditValue(ITypeDescriptorContext? context, IServiceProvider? provider, object? value)
    {
        var current = value as IEnumerable<string> ?? Array.Empty<string>();
        using var dialog = new StringListDialog(context?.PropertyDescriptor?.DisplayName ?? "編輯清單", current);
        var result = Form.ActiveForm is { } owner ? dialog.ShowDialog(owner) : dialog.ShowDialog();
        return result == DialogResult.OK ? dialog.Values.ToList() : value;
    }
}

/// <summary>Shows a string list in the property grid as "3 項：a, b, c" instead of "(Collection)".</summary>
internal sealed class StringListConverter : TypeConverter
{
    public override object? ConvertTo(ITypeDescriptorContext? context, CultureInfo? culture, object? value, Type destinationType)
    {
        if (destinationType == typeof(string) && value is IEnumerable<string> values)
        {
            var list = values.Where(item => !string.IsNullOrWhiteSpace(item)).ToList();
            return list.Count == 0 ? "（未設定）" : $"{list.Count} 項：{string.Join(", ", list)}";
        }
        return base.ConvertTo(context, culture, value, destinationType);
    }
}

internal sealed class StringListDialog : Form
{
    private readonly TextBox _text = new();

    public IReadOnlyList<string> Values => _text.Lines
        .Select(line => line.Trim())
        .Where(line => line.Length > 0)
        .ToArray();

    public StringListDialog(string title, IEnumerable<string> values)
    {
        Text = title;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.SizableToolWindow;
        ShowInTaskbar = false;
        MinimumSize = new Size(420, 300);
        ClientSize = new Size(560, 420);
        Font = Theme.BodyFont;
        BackColor = Theme.Background;
        ForeColor = Theme.Text;

        var instruction = new Label
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(12, 12, 12, 4),
            Text = "每行輸入一個 ID；空白行會自動略過。",
            ForeColor = Theme.Cyan,
        };
        _text.Multiline = true;
        _text.AcceptsReturn = true;
        _text.ScrollBars = ScrollBars.Vertical;
        _text.Dock = DockStyle.Fill;
        _text.BackColor = Theme.Panel;
        _text.ForeColor = Theme.Text;
        _text.BorderStyle = BorderStyle.FixedSingle;
        _text.Font = new Font("Consolas", 10.5F);
        _text.Lines = values.ToArray();

        var cancel = Theme.Button("取消", 100);
        cancel.DialogResult = DialogResult.Cancel;
        var confirm = Theme.Button("確定", 100);
        confirm.DialogResult = DialogResult.OK;
        confirm.BackColor = Theme.Selection;
        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 54,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(8),
            BackColor = Theme.PanelAlt,
        };
        buttons.Controls.Add(confirm);
        buttons.Controls.Add(cancel);
        var body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12, 0, 12, 12) };
        body.Controls.Add(_text);

        Controls.Add(body);
        Controls.Add(instruction);
        Controls.Add(buttons);
        CancelButton = cancel;
        // Enter inserts a new line in the text box; Ctrl+Enter confirms.
        KeyPreview = true;
        KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.Control && eventArgs.KeyCode == Keys.Enter)
            {
                DialogResult = DialogResult.OK;
                eventArgs.SuppressKeyPress = true;
            }
        };
    }
}
