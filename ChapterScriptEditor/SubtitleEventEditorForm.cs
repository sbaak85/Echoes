namespace Echoes.ChapterScriptEditor;

public sealed class SubtitleEventEditorForm : Form
{
    private readonly TextBox _name = new();
    private readonly TextBox _id = new();
    private readonly ComboBox _triggerType = new();
    private readonly TextBox _triggerValue = new();
    private readonly NumericUpDown _triggerCount = CreateNumber(1, 999, 1);
    private readonly TextBox _text = new();
    private readonly NumericUpDown _delayBefore = CreateSeconds(2m);
    private readonly NumericUpDown _fadeIn = CreateSeconds(1.5m);
    private readonly NumericUpDown _hold = CreateSeconds(8m);
    private readonly NumericUpDown _fadeOut = CreateSeconds(1.5m);
    private readonly NumericUpDown _delayAfter = CreateSeconds(2m);
    private readonly CheckBox _keepBlack = new() { Text = "字幕結束後保持黑畫面", Checked = true, AutoSize = true };
    private readonly CheckBox _lockInput = new() { Text = "播放期間鎖定玩家操作", Checked = true, AutoSize = true };

    public SubtitleEventDefinition Result { get; private set; }

    public SubtitleEventEditorForm(SubtitleEventDefinition source)
    {
        Result = Clone(source);
        Text = "黑畫面白色字幕事件";
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(760, 660);
        ClientSize = new Size(860, 720);
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        Font = new Font("Microsoft JhengHei UI", 10F);

        _triggerType.DropDownStyle = ComboBoxStyle.DropDownList;
        _triggerType.Items.AddRange(TriggerTypeItem.All.Cast<object>().ToArray());
        _text.Multiline = true;
        _text.ScrollBars = ScrollBars.Vertical;
        _text.AcceptsReturn = true;

        var fields = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18),
            ColumnCount = 2,
            RowCount = 12,
            AutoScroll = true,
        };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddRow(fields, 0, "事件名稱", _name, 38);
        AddRow(fields, 1, "事件 ID", _id, 38);
        AddRow(fields, 2, "觸發條件", _triggerType, 38);
        AddRow(fields, 3, "條件值／事件 ID", _triggerValue, 38);
        AddRow(fields, 4, "最多觸發次數", _triggerCount, 38);
        AddRow(fields, 5, "白色字幕內容", _text, 190);

        var timing = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true };
        AddTiming(timing, "觸發前等待", _delayBefore);
        AddTiming(timing, "淡入", _fadeIn);
        AddTiming(timing, "停留", _hold);
        AddTiming(timing, "淡出", _fadeOut);
        AddTiming(timing, "結束後等待", _delayAfter);
        AddRow(fields, 6, "演出時間（秒）", timing, 92);

        var flags = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.TopDown };
        flags.Controls.Add(_keepBlack);
        flags.Controls.Add(_lockInput);
        AddRow(fields, 7, "流程控制", flags, 72);

        var hint = new Label
        {
            Text = "章節開始、指定對話結束、劇情事件、經過天數或手動觸發都可先記錄在這裡。\n" +
                   "目前第三章開場流程會直接使用『章節開始時』的字幕事件。",
            AutoSize = true,
            ForeColor = Theme.Muted,
            MaximumSize = new Size(590, 0),
        };
        AddRow(fields, 8, "說明", hint, 66);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 62,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(12),
            BackColor = Theme.Panel,
        };
        var save = Theme.Button("儲存事件", 120);
        var cancel = Theme.Button("取消", 90);
        save.Click += (_, _) => SaveAndClose();
        cancel.Click += (_, _) => DialogResult = DialogResult.Cancel;
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);

        Controls.Add(fields);
        Controls.Add(buttons);
        LoadValues();
    }

    private void LoadValues()
    {
        _name.Text = Result.Name;
        _id.Text = Result.Id;
        _triggerType.SelectedItem = TriggerTypeItem.All.FirstOrDefault(item => item.Id == Result.TriggerType)
            ?? TriggerTypeItem.All[0];
        _triggerValue.Text = Result.TriggerValue;
        _triggerCount.Value = Math.Clamp(Result.TriggerCount, 1, 999);
        _text.Text = Result.Text;
        _delayBefore.Value = MillisecondsToSeconds(Result.DelayBeforeMs);
        _fadeIn.Value = MillisecondsToSeconds(Result.FadeInMs);
        _hold.Value = MillisecondsToSeconds(Result.HoldMs);
        _fadeOut.Value = MillisecondsToSeconds(Result.FadeOutMs);
        _delayAfter.Value = MillisecondsToSeconds(Result.DelayAfterMs);
        _keepBlack.Checked = Result.KeepBlack;
        _lockInput.Checked = Result.LockInput;
    }

    private void SaveAndClose()
    {
        if (string.IsNullOrWhiteSpace(_name.Text) || string.IsNullOrWhiteSpace(_id.Text))
        {
            MessageBox.Show("事件名稱與 ID 不可留空。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (string.IsNullOrWhiteSpace(_text.Text))
        {
            MessageBox.Show("請輸入至少一行白色字幕。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        Result.Name = _name.Text.Trim();
        Result.Id = _id.Text.Trim();
        Result.TriggerType = (_triggerType.SelectedItem as TriggerTypeItem)?.Id ?? "manual";
        Result.TriggerValue = _triggerValue.Text.Trim();
        Result.TriggerCount = (int)_triggerCount.Value;
        Result.Text = _text.Text.Trim();
        Result.DelayBeforeMs = SecondsToMilliseconds(_delayBefore.Value);
        Result.FadeInMs = SecondsToMilliseconds(_fadeIn.Value);
        Result.HoldMs = SecondsToMilliseconds(_hold.Value);
        Result.FadeOutMs = SecondsToMilliseconds(_fadeOut.Value);
        Result.DelayAfterMs = SecondsToMilliseconds(_delayAfter.Value);
        Result.KeepBlack = _keepBlack.Checked;
        Result.LockInput = _lockInput.Checked;
        DialogResult = DialogResult.OK;
    }

    private static void AddRow(TableLayoutPanel table, int row, string label, Control control, int height)
    {
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        var caption = new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, ForeColor = Theme.Gold };
        control.Dock = DockStyle.Fill;
        Theme.StyleInput(control);
        table.Controls.Add(caption, 0, row);
        table.Controls.Add(control, 1, row);
    }

    private static void AddTiming(FlowLayoutPanel panel, string label, NumericUpDown input)
    {
        var block = new FlowLayoutPanel { Width = 175, Height = 38, FlowDirection = FlowDirection.LeftToRight };
        block.Controls.Add(new Label { Text = label, Width = 86, Padding = new Padding(0, 7, 0, 0), ForeColor = Theme.Muted });
        input.Width = 76;
        block.Controls.Add(input);
        panel.Controls.Add(block);
    }

    private static NumericUpDown CreateSeconds(decimal value) => new()
    {
        Minimum = 0,
        Maximum = 600,
        DecimalPlaces = 2,
        Increment = 0.1m,
        Value = value,
    };

    private static NumericUpDown CreateNumber(int minimum, int maximum, int value) => new()
    {
        Minimum = minimum,
        Maximum = maximum,
        Value = value,
    };

    private static decimal MillisecondsToSeconds(int value) => Math.Clamp(value / 1000m, 0m, 600m);
    private static int SecondsToMilliseconds(decimal value) => Decimal.ToInt32(value * 1000m);

    private static SubtitleEventDefinition Clone(SubtitleEventDefinition source) => new()
    {
        Id = source.Id,
        Name = source.Name,
        Text = source.Text,
        TriggerType = source.TriggerType,
        TriggerValue = source.TriggerValue,
        TriggerCount = source.TriggerCount,
        DelayBeforeMs = source.DelayBeforeMs,
        FadeInMs = source.FadeInMs,
        HoldMs = source.HoldMs,
        FadeOutMs = source.FadeOutMs,
        DelayAfterMs = source.DelayAfterMs,
        KeepBlack = source.KeepBlack,
        LockInput = source.LockInput,
    };
}
