namespace Echoes.ChapterScriptEditor;

public sealed class SubtitleEventEditorForm : Form
{
    private const int MinimumFontSizePx = 8;
    private const int MaximumFontSizePx = 120;
    private const int DefaultFontSizePx = 34;

    private readonly TextBox _name = new();
    private readonly TextBox _id = new();
    private readonly ComboBox _triggerType = new();
    private readonly TextBox _triggerValue = new();
    private readonly NumericUpDown _triggerCount = CreateNumber(1, 999, 1);
    private readonly DataGridView _lineGrid = new();
    private readonly NumericUpDown _delayBefore = CreateSeconds(2m);
    private readonly NumericUpDown _fadeIn = CreateSeconds(1.5m);
    private readonly NumericUpDown _hold = CreateSeconds(8m);
    private readonly NumericUpDown _fadeOut = CreateSeconds(1.5m);
    private readonly NumericUpDown _delayAfter = CreateSeconds(2m);
    private readonly ComboBox _chapterStartTimeMode = new() { Name = "chapterStartTimeMode" };
    private readonly NumericUpDown _chapterStartElapsedHours = CreateHours();
    private readonly NumericUpDown _chapterStartClockHour = CreateNumber(0, 23, 6);
    private readonly NumericUpDown _chapterStartClockMinute = CreateNumber(0, 59, 0);
    private readonly Label _chapterStartElapsedLabel = new() { Text = "經過", AutoSize = true };
    private readonly Label _chapterStartElapsedUnit = new() { Text = "小時", AutoSize = true };
    private readonly Label _chapterStartClockLabel = new() { Text = "指定", AutoSize = true };
    private readonly Label _chapterStartClockSeparator = new() { Text = "：", AutoSize = true };
    private readonly CheckBox _keepBlack = new()
    {
        Text = "字幕淡出後仍維持全黑（不會自動點亮；僅供銜接下一段黑幕）",
        Checked = false,
        AutoSize = true,
    };
    private readonly CheckBox _lockInput = new() { Text = "播放期間鎖定玩家操作", Checked = true, AutoSize = true };

    public SubtitleEventDefinition Result { get; private set; }

    public SubtitleEventEditorForm(SubtitleEventDefinition source)
    {
        Result = Clone(source);
        Text = "黑畫面白色字幕事件";
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(860, 800);
        ClientSize = new Size(980, 880);
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        Font = new Font("Microsoft JhengHei UI", 10F);

        _triggerType.DropDownStyle = ComboBoxStyle.DropDownList;
        _triggerType.Items.AddRange(TriggerTypeItem.All.Cast<object>().ToArray());
        _chapterStartTimeMode.DropDownStyle = ComboBoxStyle.DropDownList;
        _chapterStartTimeMode.Items.AddRange(ChapterStartTimeModeItem.All.Cast<object>().ToArray());
        _chapterStartElapsedHours.Name = "chapterStartElapsedHours";
        _chapterStartClockHour.Name = "chapterStartClockHour";
        _chapterStartClockMinute.Name = "chapterStartClockMinute";
        _triggerType.SelectedIndexChanged += (_, _) => UpdateChapterStartTimeControls();
        _chapterStartTimeMode.SelectedIndexChanged += (_, _) => UpdateChapterStartTimeControls();
        ConfigureLineGrid();

        var fields = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18),
            ColumnCount = 2,
            RowCount = 13,
            AutoScroll = true,
        };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddRow(fields, 0, "事件名稱", _name, 38);
        AddRow(fields, 1, "事件 ID", _id, 38);
        AddRow(fields, 2, "觸發條件", _triggerType, 38);
        AddRow(fields, 3, "條件值／事件 ID", _triggerValue, 38);
        AddRow(fields, 4, "最多觸發次數", _triggerCount, 38);
        AddRow(fields, 5, "白色字幕內容", CreateLineEditor(), 250);

        var timing = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true };
        AddTiming(timing, "觸發前等待", _delayBefore);
        AddTiming(timing, "淡入", _fadeIn);
        AddTiming(timing, "停留", _hold);
        AddTiming(timing, "淡出", _fadeOut);
        AddTiming(timing, "結束後等待", _delayAfter);
        AddRow(fields, 6, "演出時間（秒）", timing, 92);

        AddRow(fields, 7, "章節起始時間", CreateChapterStartTimeEditor(), 84);

        var flags = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.TopDown };
        flags.Controls.Add(_keepBlack);
        flags.Controls.Add(_lockInput);
        AddRow(fields, 8, "流程控制", flags, 72);

        var hint = new Label
        {
            Text = "章節開始、指定對話結束、劇情事件、經過天數或手動觸發都可先記錄在這裡。\n" +
                   "選擇『章節開始時』可設定延續時間、經過時數或推進至指定時刻；時間會在黑幕中完成結算。",
            AutoSize = true,
            ForeColor = Theme.Muted,
            MaximumSize = new Size(590, 0),
        };
        AddRow(fields, 9, "說明", hint, 66);

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
        _lineGrid.Rows.Clear();
        var legacyTextLines = Result.Text.Replace("\r\n", "\n").Split('\n');
        var lines = Result.Lines.Count > 0
            ? Result.Lines
            : legacyTextLines
                .Select((text, index) => new SubtitleLineDefinition
                {
                    Text = text,
                    FontSizePx = index == legacyTextLines.Length - 1 ? 27 : DefaultFontSizePx,
                })
                .ToList();
        foreach (var line in lines)
        {
            AddLine(line.Text, line.FontSizePx);
        }
        if (_lineGrid.Rows.Count == 0) AddLine();
        _delayBefore.Value = MillisecondsToSeconds(Result.DelayBeforeMs);
        _fadeIn.Value = MillisecondsToSeconds(Result.FadeInMs);
        _hold.Value = MillisecondsToSeconds(Result.HoldMs);
        _fadeOut.Value = MillisecondsToSeconds(Result.FadeOutMs);
        _delayAfter.Value = MillisecondsToSeconds(Result.DelayAfterMs);
        _chapterStartTimeMode.SelectedItem = ChapterStartTimeModeItem.All.FirstOrDefault(
            item => item.Id == Result.ChapterStartTimeMode) ?? ChapterStartTimeModeItem.All[0];
        _chapterStartElapsedHours.Value = Math.Clamp(
            Result.ChapterStartElapsedMinutes / 60m,
            _chapterStartElapsedHours.Minimum,
            _chapterStartElapsedHours.Maximum);
        var minuteOfDay = Math.Clamp(Result.ChapterStartClockMinuteOfDay, 0, 24 * 60 - 1);
        _chapterStartClockHour.Value = minuteOfDay / 60;
        _chapterStartClockMinute.Value = minuteOfDay % 60;
        _keepBlack.Checked = Result.KeepBlack;
        _lockInput.Checked = Result.LockInput;
        UpdateChapterStartTimeControls();
    }

    private void SaveAndClose()
    {
        if (string.IsNullOrWhiteSpace(_name.Text) || string.IsNullOrWhiteSpace(_id.Text))
        {
            MessageBox.Show("事件名稱與 ID 不可留空。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (!TryReadLines(out var lines))
        {
            return;
        }
        if (lines.All(line => string.IsNullOrWhiteSpace(line.Text)))
        {
            MessageBox.Show("請輸入至少一行白色字幕。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (_keepBlack.Checked)
        {
            var confirmation = MessageBox.Show(
                "已勾選「維持全黑」。字幕的淡出時間只會淡出文字，黑幕不會自動點亮，" +
                "必須由下一個事件明確執行點亮。\n\n確定要讓此事件結束後繼續保持黑畫面嗎？",
                "確認保持黑畫面",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);
            if (confirmation != DialogResult.Yes) return;
        }

        Result.Name = _name.Text.Trim();
        Result.Id = _id.Text.Trim();
        Result.TriggerType = (_triggerType.SelectedItem as TriggerTypeItem)?.Id ?? "manual";
        Result.TriggerValue = _triggerValue.Text.Trim();
        Result.TriggerCount = (int)_triggerCount.Value;
        Result.Lines = lines;
        Result.Text = string.Join("\n", lines.Select(line => line.Text));
        Result.DelayBeforeMs = SecondsToMilliseconds(_delayBefore.Value);
        Result.FadeInMs = SecondsToMilliseconds(_fadeIn.Value);
        Result.HoldMs = SecondsToMilliseconds(_hold.Value);
        Result.FadeOutMs = SecondsToMilliseconds(_fadeOut.Value);
        Result.DelayAfterMs = SecondsToMilliseconds(_delayAfter.Value);
        Result.KeepBlack = _keepBlack.Checked;
        Result.LockInput = _lockInput.Checked;
        Result.ChapterStartTimeMode =
            (_chapterStartTimeMode.SelectedItem as ChapterStartTimeModeItem)?.Id ??
            ChapterStartTimeModeItem.Inherit;
        Result.ChapterStartElapsedMinutes = Decimal.ToInt32(
            decimal.Round(_chapterStartElapsedHours.Value * 60m, 0));
        Result.ChapterStartClockMinuteOfDay =
            (int)_chapterStartClockHour.Value * 60 + (int)_chapterStartClockMinute.Value;
        DialogResult = DialogResult.OK;
    }

    private Control CreateChapterStartTimeEditor()
    {
        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            FlowDirection = FlowDirection.LeftToRight,
        };
        _chapterStartTimeMode.Width = 210;
        _chapterStartElapsedHours.Width = 84;
        _chapterStartClockHour.Width = 58;
        _chapterStartClockMinute.Width = 58;
        Theme.StyleInput(_chapterStartTimeMode);
        Theme.StyleInput(_chapterStartElapsedHours);
        Theme.StyleInput(_chapterStartClockHour);
        Theme.StyleInput(_chapterStartClockMinute);
        foreach (var label in new[]
                 {
                     _chapterStartElapsedLabel,
                     _chapterStartElapsedUnit,
                     _chapterStartClockLabel,
                     _chapterStartClockSeparator,
                 })
        {
            label.Padding = new Padding(6, 7, 0, 0);
            label.ForeColor = Theme.Muted;
        }
        panel.Controls.Add(_chapterStartTimeMode);
        panel.Controls.Add(_chapterStartElapsedLabel);
        panel.Controls.Add(_chapterStartElapsedHours);
        panel.Controls.Add(_chapterStartElapsedUnit);
        panel.Controls.Add(_chapterStartClockLabel);
        panel.Controls.Add(_chapterStartClockHour);
        panel.Controls.Add(_chapterStartClockSeparator);
        panel.Controls.Add(_chapterStartClockMinute);
        return panel;
    }

    private void UpdateChapterStartTimeControls()
    {
        var isChapterStart =
            (_triggerType.SelectedItem as TriggerTypeItem)?.Id == "chapterStart";
        var mode =
            (_chapterStartTimeMode.SelectedItem as ChapterStartTimeModeItem)?.Id ??
            ChapterStartTimeModeItem.Inherit;
        _chapterStartTimeMode.Enabled = isChapterStart;

        var elapsedEnabled = isChapterStart && mode == ChapterStartTimeModeItem.Elapsed;
        _chapterStartElapsedLabel.Enabled = elapsedEnabled;
        _chapterStartElapsedHours.Enabled = elapsedEnabled;
        _chapterStartElapsedUnit.Enabled = elapsedEnabled;

        var clockEnabled = isChapterStart && mode == ChapterStartTimeModeItem.Clock;
        _chapterStartClockLabel.Enabled = clockEnabled;
        _chapterStartClockHour.Enabled = clockEnabled;
        _chapterStartClockSeparator.Enabled = clockEnabled;
        _chapterStartClockMinute.Enabled = clockEnabled;
    }

    private void ConfigureLineGrid()
    {
        Theme.StyleGrid(_lineGrid);
        _lineGrid.Dock = DockStyle.Fill;
        _lineGrid.ReadOnly = false;
        _lineGrid.AllowUserToAddRows = false;
        _lineGrid.AllowUserToDeleteRows = false;
        _lineGrid.MultiSelect = false;
        _lineGrid.SelectionMode = DataGridViewSelectionMode.CellSelect;
        _lineGrid.EditMode = DataGridViewEditMode.EditOnEnter;
        _lineGrid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCellsExceptHeaders;
        _lineGrid.RowTemplate.Height = 34;
        var textColumn = new DataGridViewTextBoxColumn
        {
            Name = "text",
            HeaderText = "字幕內容（每列一句）",
            ReadOnly = false,
            AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill,
            MinimumWidth = 320,
        };
        textColumn.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        _lineGrid.Columns.Add(textColumn);
        _lineGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "fontSizePx",
            HeaderText = "字級（px）",
            ReadOnly = false,
            AutoSizeMode = DataGridViewAutoSizeColumnMode.None,
            Width = 92,
        });
        _lineGrid.Columns.Add(CreateActionColumn("moveUp", "上移", 62));
        _lineGrid.Columns.Add(CreateActionColumn("moveDown", "下移", 62));
        _lineGrid.Columns.Add(CreateActionColumn("delete", "刪除", 62));
        _lineGrid.CellContentClick += LineGridCellContentClick;
        _lineGrid.EditingControlShowing += LineGridEditingControlShowing;
    }

    private Control CreateLineEditor()
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 42,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(0, 5, 0, 0),
        };
        var add = Theme.Button("＋ 新增一句", 112);
        add.Click += (_, _) =>
        {
            AddLine();
            var rowIndex = _lineGrid.Rows.Count - 1;
            _lineGrid.CurrentCell = _lineGrid.Rows[rowIndex].Cells["text"];
            _lineGrid.BeginEdit(true);
        };
        toolbar.Controls.Add(add);
        toolbar.Controls.Add(new Label
        {
            Text = $"每列可設定 {MinimumFontSizePx}～{MaximumFontSizePx}px；Shift+Enter 可在同一句中手動換行。",
            AutoSize = true,
            Padding = new Padding(10, 8, 0, 0),
            ForeColor = Theme.Muted,
        });
        panel.Controls.Add(_lineGrid);
        panel.Controls.Add(toolbar);
        return panel;
    }

    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        if (keyData == (Keys.Shift | Keys.Enter) &&
            _lineGrid.IsCurrentCellInEditMode &&
            _lineGrid.CurrentCell?.OwningColumn.Name == "text" &&
            _lineGrid.EditingControl is TextBoxBase editor)
        {
            InsertManualLineBreak(editor);
            _lineGrid.NotifyCurrentCellDirty(true);
            BeginInvoke(() =>
            {
                if (_lineGrid.CurrentCell is not null)
                {
                    _lineGrid.AutoResizeRow(
                        _lineGrid.CurrentCell.RowIndex,
                        DataGridViewAutoSizeRowMode.AllCellsExceptHeader);
                }
            });
            return true;
        }

        return base.ProcessCmdKey(ref message, keyData);
    }

    internal static void InsertManualLineBreak(TextBoxBase editor)
    {
        var insertionStart = editor.SelectionStart;
        editor.SelectedText = Environment.NewLine;
        editor.SelectionStart = insertionStart + Environment.NewLine.Length;
        editor.SelectionLength = 0;
    }

    private void LineGridEditingControlShowing(
        object? sender,
        DataGridViewEditingControlShowingEventArgs eventArgs)
    {
        if (eventArgs.Control is not TextBox textBox) return;

        var isSubtitleText = _lineGrid.CurrentCell?.OwningColumn.Name == "text";
        textBox.Multiline = isSubtitleText;
        textBox.AcceptsReturn = isSubtitleText;
        textBox.WordWrap = isSubtitleText;
    }

    private static DataGridViewButtonColumn CreateActionColumn(
        string name,
        string text,
        int width) => new()
    {
        Name = name,
        HeaderText = "",
        Text = text,
        UseColumnTextForButtonValue = true,
        ReadOnly = true,
        AutoSizeMode = DataGridViewAutoSizeColumnMode.None,
        Width = width,
        FlatStyle = FlatStyle.Flat,
    };

    private void AddLine(string text = "", int fontSizePx = DefaultFontSizePx)
    {
        _lineGrid.Rows.Add(
            text,
            Math.Clamp(fontSizePx, MinimumFontSizePx, MaximumFontSizePx));
    }

    private void LineGridCellContentClick(object? sender, DataGridViewCellEventArgs eventArgs)
    {
        if (eventArgs.RowIndex < 0 || eventArgs.ColumnIndex < 0) return;
        _lineGrid.EndEdit();
        var columnName = _lineGrid.Columns[eventArgs.ColumnIndex].Name;
        switch (columnName)
        {
            case "moveUp":
                MoveLine(eventArgs.RowIndex, -1);
                break;
            case "moveDown":
                MoveLine(eventArgs.RowIndex, 1);
                break;
            case "delete":
                if (_lineGrid.Rows.Count == 1)
                {
                    _lineGrid.Rows[0].Cells["text"].Value = "";
                    _lineGrid.Rows[0].Cells["fontSizePx"].Value = DefaultFontSizePx;
                    _lineGrid.CurrentCell = _lineGrid.Rows[0].Cells["text"];
                }
                else
                {
                    _lineGrid.Rows.RemoveAt(eventArgs.RowIndex);
                }
                break;
        }
    }

    private void MoveLine(int sourceIndex, int offset)
    {
        var targetIndex = sourceIndex + offset;
        if (targetIndex < 0 || targetIndex >= _lineGrid.Rows.Count) return;
        var sourceValues = _lineGrid.Rows[sourceIndex].Cells
            .Cast<DataGridViewCell>()
            .Take(2)
            .Select(cell => cell.Value)
            .ToArray();
        var targetValues = _lineGrid.Rows[targetIndex].Cells
            .Cast<DataGridViewCell>()
            .Take(2)
            .Select(cell => cell.Value)
            .ToArray();
        _lineGrid.Rows[sourceIndex].Cells["text"].Value = targetValues[0];
        _lineGrid.Rows[sourceIndex].Cells["fontSizePx"].Value = targetValues[1];
        _lineGrid.Rows[targetIndex].Cells["text"].Value = sourceValues[0];
        _lineGrid.Rows[targetIndex].Cells["fontSizePx"].Value = sourceValues[1];
        _lineGrid.CurrentCell = _lineGrid.Rows[targetIndex].Cells["text"];
    }

    private bool TryReadLines(out List<SubtitleLineDefinition> lines)
    {
        _lineGrid.EndEdit();
        lines = new List<SubtitleLineDefinition>();
        foreach (DataGridViewRow row in _lineGrid.Rows)
        {
            var text = Convert.ToString(row.Cells["text"].Value) ?? "";
            var fontSizeText = Convert.ToString(row.Cells["fontSizePx"].Value);
            if (!int.TryParse(fontSizeText, out var fontSizePx) ||
                fontSizePx is < MinimumFontSizePx or > MaximumFontSizePx)
            {
                MessageBox.Show(
                    $"第 {row.Index + 1} 句的字級必須是 {MinimumFontSizePx}～{MaximumFontSizePx} 之間的整數。",
                    Text,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                _lineGrid.CurrentCell = row.Cells["fontSizePx"];
                _lineGrid.BeginEdit(true);
                return false;
            }
            lines.Add(new SubtitleLineDefinition
            {
                Text = text.Trim(),
                FontSizePx = fontSizePx,
            });
        }
        return true;
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

    private static NumericUpDown CreateHours() => new()
    {
        Minimum = 0,
        Maximum = 720,
        DecimalPlaces = 2,
        Increment = 0.25m,
        Value = 0,
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
        Lines = (source.Lines ?? new List<SubtitleLineDefinition>()).Select(line => new SubtitleLineDefinition
        {
            Text = line.Text,
            FontSizePx = line.FontSizePx,
        }).ToList(),
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
        ChapterStartTimeMode = source.ChapterStartTimeMode,
        ChapterStartElapsedMinutes = source.ChapterStartElapsedMinutes,
        ChapterStartClockMinuteOfDay = source.ChapterStartClockMinuteOfDay,
    };
}
