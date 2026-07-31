namespace Echoes.MapEditor;

public sealed class DialogueEditorForm : Form
{
    private const string AddSpeakerOption = "＋ 新增發話者…";
    private readonly TabControl _tabs = new();
    private readonly DataGridView _successGrid = new();
    private readonly DataGridView _failureGrid = new();
    private readonly DataGridViewComboBoxColumn _successSpeakerColumn = new();
    private readonly DataGridViewComboBoxColumn _failureSpeakerColumn = new();
    private readonly NumericUpDown _successDelayInput = CreateDelayInput();
    private readonly NumericUpDown _failureDelayInput = CreateDelayInput();
    private readonly List<string> _speakers;

    public DialogueScript SuccessDialogue { get; private set; }
    public DialogueScript FailureDialogue { get; private set; }

    private DataGridView ActiveGrid => _tabs.SelectedIndex == 1
        ? _failureGrid
        : _successGrid;

    public DialogueEditorForm(
        DialogueScript successDialogue,
        DialogueScript failureDialogue)
    {
        Text = "對話腳本編輯器";
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(680, 460);
        ClientSize = new Size(840, 590);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);

        SuccessDialogue = successDialogue.Clone();
        FailureDialogue = failureDialogue.Clone();
        _speakers = SuccessDialogue.Speakers
            .Concat(FailureDialogue.Speakers)
            .Concat(SuccessDialogue.Lines.Select(line => line.Speaker))
            .Concat(FailureDialogue.Lines.Select(line => line.Speaker))
            .Where(speaker => !string.IsNullOrWhiteSpace(speaker))
            .Select(speaker => speaker.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (!_speakers.Contains("Sbaak", StringComparer.OrdinalIgnoreCase))
        {
            _speakers.Insert(0, "Sbaak");
        }
        if (!_speakers.Contains("Echo", StringComparer.OrdinalIgnoreCase))
        {
            _speakers.Insert(Math.Min(1, _speakers.Count), "Echo");
        }

        EnsureDialogueHasLine(SuccessDialogue, "...");
        EnsureDialogueHasLine(FailureDialogue, "目前無法使用。");
        _successDelayInput.Value = (decimal)Math.Clamp(
            SuccessDialogue.CharacterDelaySeconds,
            0,
            2);
        _failureDelayInput.Value = (decimal)Math.Clamp(
            FailureDialogue.CharacterDelaySeconds,
            0,
            2);

        ConfigureGrid(_successGrid, _successSpeakerColumn, SuccessDialogue.Lines);
        ConfigureGrid(_failureGrid, _failureSpeakerColumn, FailureDialogue.Lines);

        _tabs.Dock = DockStyle.Fill;
        _tabs.Padding = new Point(18, 7);
        var successPage = CreateDialoguePage(
            "使用成功",
            "互動成功後播放；現有對話已保留在此頁。",
            _successGrid,
            _successDelayInput);
        var failurePage = CreateDialoguePage(
            "使用失敗",
            "門檻不足、每日次數用完或缺少必要道具時播放；不會結算互動。",
            _failureGrid,
            _failureDelayInput);
        _tabs.TabPages.Add(successPage);
        _tabs.TabPages.Add(failurePage);
        _tabs.SelectedIndex = 0;

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 52,
            Padding = new Padding(8),
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.FromArgb(31, 35, 42),
        };
        buttons.Controls.Add(CreateButton("新增一句", (_, _) => AddLine()));
        buttons.Controls.Add(CreateButton("刪除", (_, _) => DeleteLine()));
        buttons.Controls.Add(CreateButton("上移", (_, _) => MoveLine(-1)));
        buttons.Controls.Add(CreateButton("下移", (_, _) => MoveLine(1)));

        var cancel = CreateButton("取消", (_, _) => DialogResult = DialogResult.Cancel);
        var save = CreateButton("儲存腳本", (_, _) => SaveDialogues());
        cancel.Margin = new Padding(26, 0, 4, 0);
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(save);

        Controls.Add(_tabs);
        Controls.Add(buttons);
        AcceptButton = save;
        CancelButton = cancel;
    }

    private static NumericUpDown CreateDelayInput() => new()
    {
        Minimum = 0,
        Maximum = 2,
        DecimalPlaces = 2,
        Increment = 0.01M,
        Width = 76,
        BackColor = Color.FromArgb(18, 21, 27),
        ForeColor = Color.WhiteSmoke,
    };

    private void ConfigureGrid(
        DataGridView grid,
        DataGridViewComboBoxColumn speakerColumn,
        IEnumerable<DialogueLine> lines)
    {
        grid.Dock = DockStyle.Fill;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.AllowUserToResizeRows = true;
        grid.AutoGenerateColumns = false;
        grid.BackgroundColor = Color.FromArgb(18, 21, 27);
        grid.BorderStyle = BorderStyle.None;
        grid.GridColor = Color.FromArgb(58, 64, 73);
        grid.RowHeadersVisible = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.MultiSelect = false;
        grid.DefaultCellStyle.BackColor = Color.FromArgb(27, 30, 37);
        grid.DefaultCellStyle.ForeColor = Color.WhiteSmoke;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(43, 94, 91);
        grid.DefaultCellStyle.SelectionForeColor = Color.White;
        grid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(37, 41, 49);
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.WhiteSmoke;
        grid.EnableHeadersVisualStyles = false;
        grid.RowTemplate.Height = 58;

        speakerColumn.HeaderText = "發話者（空白＝延續上一位）";
        speakerColumn.Width = 215;
        speakerColumn.SortMode = DataGridViewColumnSortMode.NotSortable;
        speakerColumn.FlatStyle = FlatStyle.Flat;
        grid.Columns.Add(speakerColumn);
        grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "文案內容",
            AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        });

        foreach (var line in lines)
        {
            grid.Rows.Add(
                string.IsNullOrWhiteSpace(line.Speaker) ? null : line.Speaker,
                line.Text);
        }
        grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (grid.IsCurrentCellDirty && grid.CurrentCell is DataGridViewComboBoxCell)
            {
                grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
            }
        };
        grid.CellValueChanged += GridOnCellValueChanged;
        grid.DataError += (_, eventArgs) => eventArgs.ThrowException = false;
        RefreshSpeakerOptions();
    }

    private static TabPage CreateDialoguePage(
        string title,
        string hintText,
        DataGridView grid,
        NumericUpDown delayInput)
    {
        var page = new TabPage(title)
        {
            BackColor = Color.FromArgb(25, 28, 34),
            ForeColor = Color.FromArgb(226, 230, 234),
            Padding = new Padding(0),
        };
        var settings = new Panel
        {
            Dock = DockStyle.Top,
            Height = 76,
            Padding = new Padding(12, 9, 12, 7),
            BackColor = Color.FromArgb(31, 35, 42),
        };
        var hint = new Label
        {
            Text = hintText,
            AutoSize = false,
            ForeColor = Color.FromArgb(170, 181, 190),
        };
        hint.SetBounds(12, 9, 760, 23);
        var delayLabel = new Label
        {
            Text = "文字刷出速度",
            AutoSize = false,
            ForeColor = Color.FromArgb(210, 218, 224),
        };
        delayLabel.SetBounds(12, 42, 96, 24);
        delayInput.SetBounds(112, 39, 76, 27);
        var unitLabel = new Label
        {
            Text = "秒／每字（0 = 瞬間顯示）",
            AutoSize = false,
            ForeColor = Color.FromArgb(155, 166, 176),
        };
        unitLabel.SetBounds(196, 42, 230, 24);
        settings.Controls.Add(hint);
        settings.Controls.Add(delayLabel);
        settings.Controls.Add(delayInput);
        settings.Controls.Add(unitLabel);
        page.Controls.Add(grid);
        page.Controls.Add(settings);
        return page;
    }

    private static void EnsureDialogueHasLine(DialogueScript dialogue, string defaultText)
    {
        if (dialogue.Lines.Count == 0)
        {
            dialogue.Lines.Add(new DialogueLine { Text = defaultText });
        }
    }

    private static Button CreateButton(string text, EventHandler click)
    {
        var button = new Button
        {
            Text = text,
            AutoSize = true,
            Height = 32,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 50, 59),
            ForeColor = Color.WhiteSmoke,
            Margin = new Padding(4, 0, 4, 0),
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(79, 88, 99);
        button.Click += click;
        return button;
    }

    private void AddLine()
    {
        var grid = ActiveGrid;
        var index = grid.Rows.Add(null, "...");
        grid.CurrentCell = grid.Rows[index].Cells[1];
        grid.BeginEdit(true);
    }

    private void DeleteLine()
    {
        var grid = ActiveGrid;
        if (grid.CurrentRow is null) return;
        if (grid.Rows.Count == 1)
        {
            grid.Rows[0].Cells[0].Value = "";
            grid.Rows[0].Cells[1].Value =
                ReferenceEquals(grid, _failureGrid)
                    ? "目前無法使用。"
                    : "...";
            return;
        }
        grid.Rows.RemoveAt(grid.CurrentRow.Index);
    }

    private void MoveLine(int offset)
    {
        var grid = ActiveGrid;
        if (grid.CurrentRow is null) return;
        var source = grid.CurrentRow.Index;
        var target = source + offset;
        if (target < 0 || target >= grid.Rows.Count) return;

        var speaker = grid.Rows[source].Cells[0].Value;
        var text = grid.Rows[source].Cells[1].Value;
        grid.Rows.RemoveAt(source);
        grid.Rows.Insert(target, speaker, text);
        grid.CurrentCell = grid.Rows[target].Cells[0];
    }

    private void SaveDialogues()
    {
        var successLines = ReadLines(_successGrid);
        if (successLines is null) return;
        var failureLines = ReadLines(_failureGrid);
        if (failureLines is null) return;

        var speakers = _speakers.ToList();
        SuccessDialogue = new DialogueScript
        {
            CharacterDelaySeconds = (float)_successDelayInput.Value,
            Speakers = speakers.ToList(),
            Lines = successLines,
        };
        FailureDialogue = new DialogueScript
        {
            CharacterDelaySeconds = (float)_failureDelayInput.Value,
            Speakers = speakers.ToList(),
            Lines = failureLines,
        };
        DialogResult = DialogResult.OK;
    }

    private List<DialogueLine>? ReadLines(DataGridView grid)
    {
        grid.EndEdit();
        var result = new List<DialogueLine>();
        foreach (DataGridViewRow row in grid.Rows)
        {
            var speaker = Convert.ToString(row.Cells[0].Value)?.Trim() ?? "";
            var text = Convert.ToString(row.Cells[1].Value)?.Trim() ?? "";
            if (text.Length == 0) continue;
            result.Add(new DialogueLine { Speaker = speaker, Text = text });
        }
        if (result.Count == 0)
        {
            MessageBox.Show(
                this,
                "成功與失敗頁籤都必須至少保留一句非空白的對話。",
                "對話腳本",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return null;
        }
        if (string.IsNullOrWhiteSpace(result[0].Speaker))
        {
            result[0].Speaker = _speakers[0];
        }
        return result;
    }

    private void RefreshSpeakerOptions()
    {
        foreach (var column in new[] { _successSpeakerColumn, _failureSpeakerColumn })
        {
            column.Items.Clear();
            foreach (var speaker in _speakers) column.Items.Add(speaker);
            column.Items.Add(AddSpeakerOption);
        }
    }

    private void GridOnCellValueChanged(object? sender, DataGridViewCellEventArgs eventArgs)
    {
        if (sender is not DataGridView grid) return;
        if (eventArgs.RowIndex < 0 || eventArgs.ColumnIndex != 0) return;
        var cell = grid.Rows[eventArgs.RowIndex].Cells[eventArgs.ColumnIndex];
        if (!string.Equals(Convert.ToString(cell.Value), AddSpeakerOption, StringComparison.Ordinal)) return;

        var newSpeaker = PromptForSpeakerName();
        if (string.IsNullOrWhiteSpace(newSpeaker))
        {
            cell.Value = null;
            return;
        }
        var existing = _speakers.FirstOrDefault(speaker =>
            speaker.Equals(newSpeaker, StringComparison.OrdinalIgnoreCase));
        if (existing is null)
        {
            _speakers.Add(newSpeaker);
            RefreshSpeakerOptions();
            existing = newSpeaker;
        }
        cell.Value = existing;
    }

    private string? PromptForSpeakerName()
    {
        using var prompt = new Form
        {
            Text = "新增發話者",
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MinimizeBox = false,
            MaximizeBox = false,
            ClientSize = new Size(390, 142),
            BackColor = Color.FromArgb(25, 28, 34),
            ForeColor = Color.WhiteSmoke,
        };
        var label = new Label
        {
            Text = "輸入新的發話者名稱：",
            AutoSize = false,
            ForeColor = Color.FromArgb(190, 200, 208),
        };
        label.SetBounds(14, 14, 350, 24);
        var input = new TextBox
        {
            BackColor = Color.FromArgb(18, 21, 27),
            ForeColor = Color.WhiteSmoke,
        };
        input.SetBounds(14, 42, 360, 27);
        var cancel = CreateButton("取消", (_, _) => prompt.DialogResult = DialogResult.Cancel);
        cancel.SetBounds(206, 91, 80, 32);
        var confirm = CreateButton("新增", (_, _) => prompt.DialogResult = DialogResult.OK);
        confirm.SetBounds(294, 91, 80, 32);
        prompt.Controls.Add(label);
        prompt.Controls.Add(input);
        prompt.Controls.Add(cancel);
        prompt.Controls.Add(confirm);
        prompt.AcceptButton = confirm;
        prompt.CancelButton = cancel;
        prompt.Shown += (_, _) => input.Focus();
        return prompt.ShowDialog(this) == DialogResult.OK
            ? input.Text.Trim()
            : null;
    }
}
