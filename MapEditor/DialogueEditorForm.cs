namespace Echoes.MapEditor;

public sealed class DialogueEditorForm : Form
{
    private const string AddSpeakerOption = "＋ 新增發話者…";
    private readonly DataGridView _grid = new();
    private readonly DataGridViewComboBoxColumn _speakerColumn = new();
    private readonly List<string> _speakers;
    private readonly NumericUpDown _characterDelayInput = new()
    {
        Minimum = 0,
        Maximum = 2,
        DecimalPlaces = 2,
        Increment = 0.01M,
        Width = 76,
    };

    public List<DialogueLine> Lines { get; private set; }
    public List<string> Speakers { get; private set; }
    public float CharacterDelaySeconds { get; private set; }

    public DialogueEditorForm(
        IEnumerable<DialogueLine> source,
        IEnumerable<string> speakers,
        float characterDelaySeconds)
    {
        Text = "對話腳本編輯器";
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(680, 460);
        ClientSize = new Size(840, 560);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);

        Lines = source.Select(CloneLine).ToList();
        if (Lines.Count == 0) Lines.Add(new DialogueLine { Text = "..." });
        _speakers = speakers
            .Where(speaker => !string.IsNullOrWhiteSpace(speaker))
            .Select(speaker => speaker.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        foreach (var line in Lines)
        {
            if (
                !string.IsNullOrWhiteSpace(line.Speaker) &&
                !_speakers.Contains(line.Speaker, StringComparer.OrdinalIgnoreCase))
            {
                _speakers.Add(line.Speaker);
            }
        }
        if (!_speakers.Contains("Sbaak", StringComparer.OrdinalIgnoreCase)) _speakers.Insert(0, "Sbaak");
        if (!_speakers.Contains("Echo", StringComparer.OrdinalIgnoreCase)) _speakers.Insert(Math.Min(1, _speakers.Count), "Echo");
        Speakers = _speakers.ToList();
        if (string.IsNullOrWhiteSpace(Lines[0].Speaker)) Lines[0].Speaker = _speakers[0];
        CharacterDelaySeconds = Math.Clamp(characterDelaySeconds, 0, 2);
        _characterDelayInput.Value = (decimal)CharacterDelaySeconds;

        _grid.Dock = DockStyle.Fill;
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.AllowUserToResizeRows = true;
        _grid.AutoGenerateColumns = false;
        _grid.BackgroundColor = Color.FromArgb(18, 21, 27);
        _grid.BorderStyle = BorderStyle.None;
        _grid.GridColor = Color.FromArgb(58, 64, 73);
        _grid.RowHeadersVisible = false;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.MultiSelect = false;
        _grid.DefaultCellStyle.BackColor = Color.FromArgb(27, 30, 37);
        _grid.DefaultCellStyle.ForeColor = Color.WhiteSmoke;
        _grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(43, 94, 91);
        _grid.DefaultCellStyle.SelectionForeColor = Color.White;
        _grid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        _grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(37, 41, 49);
        _grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.WhiteSmoke;
        _grid.EnableHeadersVisualStyles = false;
        _grid.RowTemplate.Height = 58;

        _speakerColumn.HeaderText = "發話者（空白＝延續上一位）";
        _speakerColumn.Width = 215;
        _speakerColumn.SortMode = DataGridViewColumnSortMode.NotSortable;
        _speakerColumn.FlatStyle = FlatStyle.Flat;
        RefreshSpeakerOptions();
        _grid.Columns.Add(_speakerColumn);
        _grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "文案內容",
            AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        });

        foreach (var line in Lines)
        {
            _grid.Rows.Add(
                string.IsNullOrWhiteSpace(line.Speaker) ? null : line.Speaker,
                line.Text);
        }
        _grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (_grid.IsCurrentCellDirty && _grid.CurrentCell is DataGridViewComboBoxCell)
            {
                _grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
            }
        };
        _grid.CellValueChanged += GridOnCellValueChanged;
        _grid.DataError += (_, eventArgs) => eventArgs.ThrowException = false;

        var settings = new Panel
        {
            Dock = DockStyle.Top,
            Height = 76,
            Padding = new Padding(12, 9, 12, 7),
            BackColor = Color.FromArgb(31, 35, 42),
        };
        var hint = new Label
        {
            Text = "每列是一句完整發話；長內容分頁時不會改變句子邊界。",
            AutoSize = false,
            ForeColor = Color.FromArgb(170, 181, 190),
        };
        hint.SetBounds(12, 9, 650, 23);
        var delayLabel = new Label
        {
            Text = "文字刷出速度",
            AutoSize = false,
            ForeColor = Color.FromArgb(210, 218, 224),
        };
        delayLabel.SetBounds(12, 42, 96, 24);
        _characterDelayInput.SetBounds(112, 39, 76, 27);
        var unitLabel = new Label
        {
            Text = "秒／每字（0 = 瞬間顯示）",
            AutoSize = false,
            ForeColor = Color.FromArgb(155, 166, 176),
        };
        unitLabel.SetBounds(196, 42, 230, 24);
        settings.Controls.Add(hint);
        settings.Controls.Add(delayLabel);
        settings.Controls.Add(_characterDelayInput);
        settings.Controls.Add(unitLabel);

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
        var save = CreateButton("儲存腳本", (_, _) => SaveLines());
        cancel.Margin = new Padding(26, 0, 4, 0);
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(save);

        Controls.Add(_grid);
        Controls.Add(settings);
        Controls.Add(buttons);
        AcceptButton = save;
        CancelButton = cancel;
    }

    private static DialogueLine CloneLine(DialogueLine line) => new()
    {
        Speaker = line.Speaker,
        Text = line.Text,
    };

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
        var index = _grid.Rows.Add(null, "...");
        _grid.CurrentCell = _grid.Rows[index].Cells[1];
        _grid.BeginEdit(true);
    }

    private void DeleteLine()
    {
        if (_grid.CurrentRow is null) return;
        if (_grid.Rows.Count == 1)
        {
            _grid.Rows[0].Cells[0].Value = "";
            _grid.Rows[0].Cells[1].Value = "...";
            return;
        }
        _grid.Rows.RemoveAt(_grid.CurrentRow.Index);
    }

    private void MoveLine(int offset)
    {
        if (_grid.CurrentRow is null) return;
        var source = _grid.CurrentRow.Index;
        var target = source + offset;
        if (target < 0 || target >= _grid.Rows.Count) return;

        var speaker = _grid.Rows[source].Cells[0].Value;
        var text = _grid.Rows[source].Cells[1].Value;
        _grid.Rows.RemoveAt(source);
        _grid.Rows.Insert(target, speaker, text);
        _grid.CurrentCell = _grid.Rows[target].Cells[0];
    }

    private void SaveLines()
    {
        _grid.EndEdit();
        var result = new List<DialogueLine>();
        foreach (DataGridViewRow row in _grid.Rows)
        {
            var speaker = Convert.ToString(row.Cells[0].Value)?.Trim() ?? "";
            var text = Convert.ToString(row.Cells[1].Value)?.Trim() ?? "";
            if (text.Length == 0) continue;
            result.Add(new DialogueLine { Speaker = speaker, Text = text });
        }

        if (result.Count == 0)
        {
            MessageBox.Show(this, "請至少保留一句非空白的對話。", "對話腳本", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (string.IsNullOrWhiteSpace(result[0].Speaker))
        {
            result[0].Speaker = _speakers[0];
        }

        Lines = result;
        Speakers = _speakers.ToList();
        CharacterDelaySeconds = (float)_characterDelayInput.Value;
        DialogResult = DialogResult.OK;
    }

    private void RefreshSpeakerOptions()
    {
        _speakerColumn.Items.Clear();
        foreach (var speaker in _speakers) _speakerColumn.Items.Add(speaker);
        _speakerColumn.Items.Add(AddSpeakerOption);
    }

    private void GridOnCellValueChanged(object? sender, DataGridViewCellEventArgs eventArgs)
    {
        if (eventArgs.RowIndex < 0 || eventArgs.ColumnIndex != 0) return;
        var cell = _grid.Rows[eventArgs.RowIndex].Cells[eventArgs.ColumnIndex];
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
