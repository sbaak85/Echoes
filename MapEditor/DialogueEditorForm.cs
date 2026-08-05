namespace Echoes.MapEditor;

public sealed class DialogueEditorForm : Form
{
    private const string AddSpeakerOption = "＋ 新增發話者…";
    private const int SpeakerColumnIndex = 0;
    private const int TextColumnIndex = 1;
    private const int GroupColumnIndex = 2;
    private const int WeightColumnIndex = 3;
    private readonly TabControl _tabs = new();
    private readonly DataGridView _successGrid = new();
    private readonly DataGridView _failureGrid = new();
    private readonly DataGridView _completionGrid = new();
    private readonly DataGridViewComboBoxColumn _successSpeakerColumn = new();
    private readonly DataGridViewComboBoxColumn _failureSpeakerColumn = new();
    private readonly DataGridViewComboBoxColumn _completionSpeakerColumn = new();
    private readonly NumericUpDown _successDelayInput = CreateDelayInput();
    private readonly NumericUpDown _failureDelayInput = CreateDelayInput();
    private readonly NumericUpDown _completionDelayInput = CreateDelayInput();
    private readonly List<string> _speakers;
    private readonly Dictionary<DataGridView, HashSet<int>> _selectedRows = new();
    private bool _handlingSpeakerChoice;

    public DialogueScript SuccessDialogue { get; private set; }
    public DialogueScript FailureDialogue { get; private set; }
    public DialogueScript? CompletionDialogue { get; private set; }

    private DataGridView ActiveGrid => _tabs.SelectedIndex switch
    {
        1 => _failureGrid,
        2 => _completionGrid,
        _ => _successGrid,
    };

    public DialogueEditorForm(
        DialogueScript successDialogue,
        DialogueScript failureDialogue,
        DialogueScript? completionDialogue)
    {
        Text = "對話腳本編輯器";
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(820, 460);
        ClientSize = new Size(980, 590);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);

        SuccessDialogue = successDialogue.Clone();
        FailureDialogue = failureDialogue.Clone();
        CompletionDialogue = completionDialogue?.Clone();
        var editableCompletionDialogue = CompletionDialogue ?? new DialogueScript();
        _speakers = SuccessDialogue.Speakers
            .Concat(FailureDialogue.Speakers)
            .Concat(editableCompletionDialogue.Speakers)
            .Concat(SuccessDialogue.Lines.Select(line => line.Speaker))
            .Concat(FailureDialogue.Lines.Select(line => line.Speaker))
            .Concat(editableCompletionDialogue.Lines.Select(line => line.Speaker))
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
        _completionDelayInput.Value = (decimal)Math.Clamp(
            editableCompletionDialogue.CharacterDelaySeconds,
            0,
            2);

        ConfigureGrid(_successGrid, _successSpeakerColumn, SuccessDialogue.Lines);
        ConfigureGrid(_failureGrid, _failureSpeakerColumn, FailureDialogue.Lines);
        ConfigureGrid(
            _completionGrid,
            _completionSpeakerColumn,
            editableCompletionDialogue.Lines);

        _tabs.Dock = DockStyle.Fill;
        _tabs.Padding = new Point(18, 7);
        var successPage = CreateDialoguePage(
            "可互動時的對話",
            "條件成立並開始互動時播放；對話結束後才會執行互動。",
            _successGrid,
            _successDelayInput);
        var failurePage = CreateDialoguePage(
            "不可互動時的對話",
            "門檻不足、每日次數用完或缺少必要道具時播放；不會結算互動。",
            _failureGrid,
            _failureDelayInput);
        var completionPage = CreateDialoguePage(
            "互動成功完成後的對話",
            "互動效果、次數與獎勵結算完成後播放；可留空以直接結束。",
            _completionGrid,
            _completionDelayInput);
        _tabs.TabPages.Add(successPage);
        _tabs.TabPages.Add(failurePage);
        _tabs.TabPages.Add(completionPage);
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
        buttons.Controls.Add(CreateButton("綁定為抽選群組", (_, _) => BindRandomGroup()));
        buttons.Controls.Add(CreateButton("解除抽選群組", (_, _) => UnbindRandomGroup()));
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

    public DialogueEditorForm(
        DialogueScript dialogue,
        string sectionName,
        string hintText)
        : this(dialogue, DialogueScript.CreateFailureDefault(), null)
    {
        Text = $"章節對話腳本編輯器 · {sectionName}";
        while (_tabs.TabPages.Count > 1)
        {
            _tabs.TabPages.RemoveAt(_tabs.TabPages.Count - 1);
        }
        _tabs.TabPages[0].Text = sectionName;
        var hint = _tabs.TabPages[0]
            .Controls
            .Cast<Control>()
            .SelectMany(EnumerateControls)
            .OfType<Label>()
            .FirstOrDefault();
        if (hint is not null) hint.Text = hintText;
    }

    private static IEnumerable<Control> EnumerateControls(Control control)
    {
        foreach (Control child in control.Controls)
        {
            yield return child;
            foreach (var descendant in EnumerateControls(child)) yield return descendant;
        }
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
        grid.MultiSelect = true;
        grid.EditMode = DataGridViewEditMode.EditOnEnter;
        grid.DefaultCellStyle.BackColor = Color.FromArgb(27, 30, 37);
        grid.DefaultCellStyle.ForeColor = Color.WhiteSmoke;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(43, 94, 91);
        grid.DefaultCellStyle.SelectionForeColor = Color.White;
        grid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(37, 41, 49);
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.WhiteSmoke;
        grid.EnableHeadersVisualStyles = false;
        grid.RowTemplate.Height = 58;

        speakerColumn.HeaderText = "發話者（首句空白＝無；其餘空白＝延續上一位）";
        speakerColumn.Width = 215;
        speakerColumn.SortMode = DataGridViewColumnSortMode.NotSortable;
        speakerColumn.FlatStyle = FlatStyle.Flat;
        speakerColumn.DisplayStyle = DataGridViewComboBoxDisplayStyle.ComboBox;
        grid.Columns.Add(speakerColumn);
        grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "文案內容",
            AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        });
        grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "抽選群組",
            Width = 112,
            ReadOnly = true,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        });
        grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "權重",
            Width = 68,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        });

        foreach (var line in lines)
        {
            var rowIndex = grid.Rows.Add(
                string.IsNullOrWhiteSpace(line.Speaker) ? null : line.Speaker,
                line.Text,
                GetGroupDisplayName(line.RandomGroupId),
                line.RandomGroupId is null ? null : Math.Clamp(line.Weight ?? 1, 1, 999));
            grid.Rows[rowIndex].Tag = string.IsNullOrWhiteSpace(line.RandomGroupId)
                ? null
                : line.RandomGroupId.Trim();
        }
        _selectedRows[grid] = new HashSet<int>();
        grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (grid.IsCurrentCellDirty && grid.CurrentCell is DataGridViewComboBoxCell)
            {
                grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
            }
        };
        grid.CellValueChanged += GridOnCellValueChanged;
        grid.CellMouseDown += GridOnCellMouseDown;
        grid.CellBeginEdit += GridOnCellBeginEdit;
        grid.CellParsing += GridOnCellParsing;
        grid.CellValidating += GridOnCellValidating;
        grid.CellEndEdit += GridOnCellEndEdit;
        grid.CellDoubleClick += GridOnCellDoubleClick;
        grid.EditingControlShowing += GridOnEditingControlShowing;
        grid.DataError += (_, eventArgs) => eventArgs.ThrowException = false;
        RefreshGroupPresentation(grid);
        if (grid.Rows.Count > 0) ApplyGridSelection(grid, new[] { 0 });
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
            Height = 98,
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
        var groupHint = new Label
        {
            Text = "Shift＋點擊可複選句子；綁定後每組只依權重隨機播放一句（預設權重 1）。",
            AutoSize = false,
            ForeColor = Color.FromArgb(205, 180, 112),
        };
        groupHint.SetBounds(12, 69, 820, 22);
        settings.Controls.Add(hint);
        settings.Controls.Add(delayLabel);
        settings.Controls.Add(delayInput);
        settings.Controls.Add(unitLabel);
        settings.Controls.Add(groupHint);
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
        var index = grid.Rows.Add(null, "...", null, null);
        grid.Rows[index].Tag = null;
        ApplyGridSelection(grid, new[] { index });
        grid.CurrentCell = grid.Rows[index].Cells[TextColumnIndex];
        grid.BeginEdit(true);
    }

    private void DeleteLine()
    {
        var grid = ActiveGrid;
        var selectedIndexes = GetSelectedRowIndexes(grid);
        if (selectedIndexes.Count == 0 && grid.CurrentRow is not null)
        {
            selectedIndexes.Add(grid.CurrentRow.Index);
        }
        if (selectedIndexes.Count == 0) return;
        if (ReferenceEquals(grid, _completionGrid))
        {
            foreach (var index in selectedIndexes.OrderByDescending(index => index))
            {
                grid.Rows.RemoveAt(index);
            }
        }
        else if (grid.Rows.Count == 1)
        {
            grid.Rows[0].Cells[SpeakerColumnIndex].Value = "";
            grid.Rows[0].Cells[TextColumnIndex].Value =
                ReferenceEquals(grid, _failureGrid)
                    ? "目前無法使用。"
                    : "...";
            grid.Rows[0].Tag = null;
        }
        else
        {
            foreach (var index in selectedIndexes.OrderByDescending(index => index))
            {
                if (grid.Rows.Count <= 1) break;
                grid.Rows.RemoveAt(index);
            }
        }
        RefreshGroupPresentation(grid);
        if (grid.Rows.Count > 0)
        {
            ApplyGridSelection(
                grid,
                new[] { Math.Min(selectedIndexes[0], grid.Rows.Count - 1) });
        }
        else
        {
            ApplyGridSelection(grid, Array.Empty<int>());
        }
    }

    private void MoveLine(int offset)
    {
        var grid = ActiveGrid;
        if (grid.CurrentRow is null) return;
        var source = grid.CurrentRow.Index;
        var target = source + offset;
        if (target < 0 || target >= grid.Rows.Count) return;

        var speaker = grid.Rows[source].Cells[SpeakerColumnIndex].Value;
        var text = grid.Rows[source].Cells[TextColumnIndex].Value;
        var groupId = grid.Rows[source].Tag as string;
        var weight = grid.Rows[source].Cells[WeightColumnIndex].Value;
        grid.Rows.RemoveAt(source);
        grid.Rows.Insert(
            target,
            speaker,
            text,
            GetGroupDisplayName(groupId),
            weight);
        grid.Rows[target].Tag = groupId;
        RefreshGroupPresentation(grid);
        ApplyGridSelection(grid, new[] { target });
        grid.CurrentCell = grid.Rows[target].Cells[SpeakerColumnIndex];
    }

    private void BindRandomGroup()
    {
        var grid = ActiveGrid;
        grid.EndEdit();
        var selectedIndexes = GetSelectedRowIndexes(grid);
        if (selectedIndexes.Count < 2)
        {
            MessageBox.Show(
                this,
                "請先按住 Shift 點選至少兩句，再建立抽選群組。",
                "抽選群組",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var selectedSet = selectedIndexes.ToHashSet();
        var rows = grid.Rows
            .Cast<DataGridViewRow>()
            .Select(ReadRowData)
            .ToList();
        var insertionIndex = Enumerable.Range(0, selectedIndexes[0])
            .Count(index => !selectedSet.Contains(index));
        var groupId = CreateRandomGroupId(grid);
        var groupedRows = selectedIndexes
            .Select(index => rows[index] with
            {
                RandomGroupId = groupId,
                Weight = 1,
            })
            .ToList();
        var remainingRows = rows
            .Where((_, index) => !selectedSet.Contains(index))
            .ToList();
        remainingRows.InsertRange(insertionIndex, groupedRows);
        ReplaceGridRows(grid, remainingRows);
        ApplyGridSelection(
            grid,
            Enumerable.Range(insertionIndex, groupedRows.Count));
    }

    private void UnbindRandomGroup()
    {
        var grid = ActiveGrid;
        var selectedGroupIds = GetSelectedRowIndexes(grid)
            .Select(index => grid.Rows[index].Tag as string)
            .Where(groupId => !string.IsNullOrWhiteSpace(groupId))
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (selectedGroupIds.Count == 0)
        {
            MessageBox.Show(
                this,
                "請先選取抽選群組中的任一句。",
                "抽選群組",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var affectedRows = new List<int>();
        foreach (DataGridViewRow row in grid.Rows)
        {
            if (
                row.Tag is not string groupId ||
                !selectedGroupIds.Contains(groupId)
            )
            {
                continue;
            }
            row.Tag = null;
            row.Cells[GroupColumnIndex].Value = null;
            row.Cells[WeightColumnIndex].Value = null;
            affectedRows.Add(row.Index);
        }
        RefreshGroupPresentation(grid);
        ApplyGridSelection(grid, affectedRows);
    }

    private static DialogueRowData ReadRowData(DataGridViewRow row)
    {
        var groupId = string.IsNullOrWhiteSpace(row.Tag as string)
            ? null
            : ((string)row.Tag).Trim();
        return new DialogueRowData(
            row.Cells[SpeakerColumnIndex].Value,
            Convert.ToString(row.Cells[TextColumnIndex].Value) ?? "...",
            groupId,
            groupId is null ? null : ReadWeight(row));
    }

    private static int ReadWeight(DataGridViewRow row)
    {
        return int.TryParse(
            Convert.ToString(row.Cells[WeightColumnIndex].Value),
            out var weight)
                ? Math.Clamp(weight, 1, 999)
                : 1;
    }

    private void ReplaceGridRows(
        DataGridView grid,
        IEnumerable<DialogueRowData> rows)
    {
        grid.Rows.Clear();
        foreach (var row in rows)
        {
            var index = grid.Rows.Add(
                row.Speaker,
                row.Text,
                GetGroupDisplayName(row.RandomGroupId),
                row.RandomGroupId is null ? null : row.Weight ?? 1);
            grid.Rows[index].Tag = row.RandomGroupId;
        }
        RefreshGroupPresentation(grid);
    }

    private static string CreateRandomGroupId(DataGridView grid)
    {
        var nextNumber = grid.Rows
            .Cast<DataGridViewRow>()
            .Select(row => row.Tag as string)
            .Where(groupId => groupId?.StartsWith(
                "random-group-",
                StringComparison.OrdinalIgnoreCase) == true)
            .Select(groupId => int.TryParse(
                groupId!["random-group-".Length..],
                out var number)
                    ? number
                    : 0)
            .DefaultIfEmpty(0)
            .Max() + 1;
        return $"random-group-{nextNumber}";
    }

    private static string? GetGroupDisplayName(string? groupId)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return null;
        const string prefix = "random-group-";
        return groupId.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? $"抽選群組 {groupId[prefix.Length..]}"
            : "抽選群組";
    }

    private void RefreshGroupPresentation(DataGridView grid)
    {
        var validGroups = grid.Rows
            .Cast<DataGridViewRow>()
            .Where(row => row.Tag is string groupId && !string.IsNullOrWhiteSpace(groupId))
            .GroupBy(row => (string)row.Tag!, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() >= 2)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (DataGridViewRow row in grid.Rows)
        {
            var groupId = row.Tag as string;
            var grouped = !string.IsNullOrWhiteSpace(groupId) &&
                          validGroups.Contains(groupId);
            if (!grouped)
            {
                row.Tag = null;
                row.Cells[GroupColumnIndex].Value = null;
                row.Cells[WeightColumnIndex].Value = null;
                row.Cells[WeightColumnIndex].ReadOnly = true;
                row.DefaultCellStyle.BackColor = Color.FromArgb(27, 30, 37);
                continue;
            }

            row.Cells[GroupColumnIndex].Value = GetGroupDisplayName(groupId);
            row.Cells[WeightColumnIndex].Value = ReadWeight(row);
            row.Cells[WeightColumnIndex].ReadOnly = false;
            row.DefaultCellStyle.BackColor = Color.FromArgb(34, 45, 51);
            row.Cells[GroupColumnIndex].Style.ForeColor = Color.FromArgb(247, 202, 102);
            row.Cells[WeightColumnIndex].Style.ForeColor = Color.FromArgb(145, 235, 221);
        }
    }

    private List<int> GetSelectedRowIndexes(DataGridView grid)
    {
        return grid.SelectedRows
            .Cast<DataGridViewRow>()
            .Select(row => row.Index)
            .OrderBy(index => index)
            .ToList();
    }

    private void ApplyGridSelection(
        DataGridView grid,
        IEnumerable<int> indexes)
    {
        var validIndexes = indexes
            .Where(index => index >= 0 && index < grid.Rows.Count)
            .Distinct()
            .OrderBy(index => index)
            .ToHashSet();
        _selectedRows[grid] = validIndexes;
        grid.ClearSelection();
        foreach (var index in validIndexes)
        {
            grid.Rows[index].Selected = true;
        }
        if (validIndexes.Count > 0)
        {
            var currentIndex = validIndexes.Max();
            grid.CurrentCell = grid.Rows[currentIndex].Cells[TextColumnIndex];
        }
    }

    private sealed record DialogueRowData(
        object? Speaker,
        string Text,
        string? RandomGroupId,
        int? Weight);

    internal void RunCellEditingUiSelfTest()
    {
        var grid = _successGrid;
        if (grid.Rows.Count < 2 || grid.Rows[0].Tag is not string)
        {
            throw new InvalidOperationException(
                "Dialogue cell editing UI self-test requires a weighted group.");
        }

        grid.CurrentCell = grid.Rows[0].Cells[SpeakerColumnIndex];
        GridOnCellMouseDown(
            grid,
            new DataGridViewCellMouseEventArgs(
                SpeakerColumnIndex,
                0,
                4,
                4,
                new MouseEventArgs(MouseButtons.Left, 1, 4, 4, 0)));
        System.Windows.Forms.Application.DoEvents();
        if (
            grid.CurrentCell?.ColumnIndex != SpeakerColumnIndex ||
            !grid.BeginEdit(true) ||
            grid.EditingControl is not DataGridViewComboBoxEditingControl speakerEditor
        )
        {
            throw new InvalidOperationException(
                "Speaker dropdown cannot enter edit mode after a normal click.");
        }
        speakerEditor.DroppedDown = true;
        System.Windows.Forms.Application.DoEvents();
        speakerEditor.DroppedDown = false;
        if (speakerEditor.DropDownStyle != ComboBoxStyle.DropDown)
        {
            throw new InvalidOperationException(
                "Speaker dropdown did not remain directly editable.");
        }
        const string customSpeaker = "自訂測試發話者";
        speakerEditor.Text = customSpeaker;
        grid.NotifyCurrentCellDirty(true);
        if (
            !grid.EndEdit() ||
            !string.Equals(
                Convert.ToString(grid.Rows[0].Cells[SpeakerColumnIndex].Value),
                customSpeaker,
                StringComparison.Ordinal)
        )
        {
            throw new InvalidOperationException(
                "Speaker dropdown did not preserve a directly typed name.");
        }

        grid.CurrentCell = grid.Rows[0].Cells[SpeakerColumnIndex];
        if (
            !grid.BeginEdit(true) ||
            grid.EditingControl is not DataGridViewComboBoxEditingControl blankSpeakerEditor
        )
        {
            throw new InvalidOperationException(
                "Speaker dropdown cannot re-enter edit mode for clearing.");
        }
        blankSpeakerEditor.Text = "";
        grid.NotifyCurrentCellDirty(true);
        var enterArgs = new KeyEventArgs(Keys.Enter);
        SpeakerEditorOnKeyDown(blankSpeakerEditor, enterArgs);
        if (
            !enterArgs.Handled ||
            !enterArgs.SuppressKeyPress ||
            !string.IsNullOrEmpty(
                Convert.ToString(grid.Rows[0].Cells[SpeakerColumnIndex].Value)
            )
        )
        {
            throw new InvalidOperationException(
                "Speaker dropdown did not accept an explicitly cleared speaker.");
        }

        const string menuSpeaker = "新增選單測試發話者";
        ApplySpeakerChoice(grid, 0, menuSpeaker);
        if (
            !string.Equals(
                Convert.ToString(grid.Rows[0].Cells[SpeakerColumnIndex].Value),
                menuSpeaker,
                StringComparison.Ordinal
            ) ||
            !_speakers.Contains(menuSpeaker) ||
            !_successSpeakerColumn.Items.Contains(menuSpeaker) ||
            !_failureSpeakerColumn.Items.Contains(menuSpeaker) ||
            !_completionSpeakerColumn.Items.Contains(menuSpeaker)
        )
        {
            throw new InvalidOperationException(
                "The add-speaker option did not register and assign the new name.");
        }
        grid.CurrentCell = grid.Rows[0].Cells[SpeakerColumnIndex];
        if (
            !grid.BeginEdit(true) ||
            grid.EditingControl is not DataGridViewComboBoxEditingControl menuSpeakerEditor ||
            !menuSpeakerEditor.Items.Contains(menuSpeaker)
        )
        {
            throw new InvalidOperationException(
                "Speaker dropdown became invalid after adding a new speaker.");
        }
        grid.EndEdit();
        var menuSpeakerLines = ReadLines(grid)
            ?? throw new InvalidOperationException("Added speaker dialogue could not be read for saving.");
        if (!string.Equals(menuSpeakerLines[0].Speaker, menuSpeaker, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "The newly added speaker name was not preserved by the save path.");
        }

        grid.CurrentCell = grid.Rows[0].Cells[WeightColumnIndex];
        GridOnCellMouseDown(
            grid,
            new DataGridViewCellMouseEventArgs(
                WeightColumnIndex,
                0,
                4,
                4,
                new MouseEventArgs(MouseButtons.Left, 1, 4, 4, 0)));
        System.Windows.Forms.Application.DoEvents();
        if (
            grid.CurrentCell?.ColumnIndex != WeightColumnIndex ||
            !grid.BeginEdit(true) ||
            grid.EditingControl is not DataGridViewTextBoxEditingControl weightEditor
        )
        {
            throw new InvalidOperationException(
                "Weighted dialogue cell cannot enter edit mode after a normal click.");
        }
        weightEditor.Text = "7";
        if (!grid.EndEdit() || ReadWeight(grid.Rows[0]) != 7)
        {
            throw new InvalidOperationException(
                "Weighted dialogue cell did not preserve the edited value.");
        }
    }

    private void SaveDialogues()
    {
        var successLines = ReadLines(_successGrid);
        if (successLines is null) return;
        var failureLines = ReadLines(_failureGrid);
        if (failureLines is null) return;
        var completionLines = ReadLines(_completionGrid, allowEmpty: true)!;

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
        CompletionDialogue = completionLines.Count == 0
            ? null
            : new DialogueScript
            {
                CharacterDelaySeconds = (float)_completionDelayInput.Value,
                Speakers = speakers.ToList(),
                Lines = completionLines,
            };
        DialogResult = DialogResult.OK;
    }

    private List<DialogueLine>? ReadLines(
        DataGridView grid,
        bool allowEmpty = false)
    {
        grid.EndEdit();
        RefreshGroupPresentation(grid);
        var result = new List<DialogueLine>();
        foreach (DataGridViewRow row in grid.Rows)
        {
            var speaker = Convert.ToString(row.Cells[SpeakerColumnIndex].Value)?.Trim() ?? "";
            var text = Convert.ToString(row.Cells[TextColumnIndex].Value)?.Trim() ?? "";
            if (text.Length == 0) continue;
            var groupId = string.IsNullOrWhiteSpace(row.Tag as string)
                ? null
                : ((string)row.Tag).Trim();
            result.Add(new DialogueLine
            {
                Speaker = speaker,
                Text = text,
                RandomGroupId = groupId,
                Weight = groupId is null ? null : ReadWeight(row),
            });
        }
        if (result.Count == 0)
        {
            if (allowEmpty) return result;
            MessageBox.Show(
                this,
                "「可互動時」與「不可互動時」頁籤都必須至少保留一句非空白的對話。",
                "對話腳本",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return null;
        }
        return result;
    }

    private void RefreshSpeakerOptions()
    {
        foreach (var column in new[]
        {
            _successSpeakerColumn,
            _failureSpeakerColumn,
            _completionSpeakerColumn,
        })
        {
            column.Items.Clear();
            // 空白是合法值：首句代表無發話者，其餘句代表延續上一位。
            column.Items.Add("");
            foreach (var speaker in _speakers) column.Items.Add(speaker);
            column.Items.Add(AddSpeakerOption);
        }
    }

    private string RegisterSpeakerOption(
        string speaker,
        DataGridViewComboBoxCell? activeCell = null)
    {
        var normalized = speaker.Trim();
        var existing = _speakers.FirstOrDefault(item =>
            item.Equals(normalized, StringComparison.OrdinalIgnoreCase));
        if (existing is not null) return existing;

        _speakers.Add(normalized);
        foreach (var column in new[]
        {
            _successSpeakerColumn,
            _failureSpeakerColumn,
            _completionSpeakerColumn,
        })
        {
            if (column.Items.Contains(normalized)) continue;
            var addOptionIndex = column.Items.IndexOf(AddSpeakerOption);
            column.Items.Insert(
                addOptionIndex >= 0 ? addOptionIndex : column.Items.Count,
                normalized);
        }
        if (activeCell is not null && !activeCell.Items.Contains(normalized))
        {
            var addOptionIndex = activeCell.Items.IndexOf(AddSpeakerOption);
            activeCell.Items.Insert(
                addOptionIndex >= 0 ? addOptionIndex : activeCell.Items.Count,
                normalized);
        }
        return normalized;
    }

    private void GridOnCellMouseDown(
        object? sender,
        DataGridViewCellMouseEventArgs eventArgs)
    {
        if (
            sender is not DataGridView grid ||
            eventArgs.Button != MouseButtons.Left ||
            eventArgs.RowIndex < 0
        )
        {
            return;
        }

        var selected = _selectedRows.TryGetValue(grid, out var remembered)
            ? remembered.ToHashSet()
            : new HashSet<int>();
        if ((ModifierKeys & Keys.Shift) != Keys.Shift)
        {
            _selectedRows[grid] = new HashSet<int> { eventArgs.RowIndex };
            return;
        }

        if (!selected.Add(eventArgs.RowIndex))
        {
            selected.Remove(eventArgs.RowIndex);
        }
        _selectedRows[grid] = selected;

        BeginInvoke(new Action(() =>
        {
            if (!IsDisposed && !grid.IsDisposed)
            {
                ApplyGridSelection(grid, selected);
            }
        }));
    }

    private static void GridOnCellBeginEdit(
        object? sender,
        DataGridViewCellCancelEventArgs eventArgs)
    {
        if (
            sender is DataGridView grid &&
            eventArgs.ColumnIndex == WeightColumnIndex &&
            grid.Rows[eventArgs.RowIndex].Tag is not string
        )
        {
            eventArgs.Cancel = true;
        }
    }

    private static void GridOnCellParsing(
        object? sender,
        DataGridViewCellParsingEventArgs eventArgs)
    {
        if (
            sender is not DataGridView ||
            eventArgs.RowIndex < 0 ||
            eventArgs.ColumnIndex != SpeakerColumnIndex ||
            !string.IsNullOrWhiteSpace(Convert.ToString(eventArgs.Value))
        )
        {
            return;
        }

        // ComboBox 儲存格原本會拒絕不在清單內的空字串，造成 Enter 無法結束編輯。
        eventArgs.Value = "";
        eventArgs.ParsingApplied = true;
    }

    private void GridOnCellValidating(
        object? sender,
        DataGridViewCellValidatingEventArgs eventArgs)
    {
        if (
            sender is DataGridView speakerGrid &&
            eventArgs.RowIndex >= 0 &&
            eventArgs.ColumnIndex == SpeakerColumnIndex
        )
        {
            var speaker = Convert.ToString(eventArgs.FormattedValue)?.Trim() ?? "";
            var cell = (DataGridViewComboBoxCell)speakerGrid
                .Rows[eventArgs.RowIndex]
                .Cells[SpeakerColumnIndex];
            if (speaker.Length == 0)
            {
                cell.Value = "";
                if (speakerGrid.EditingControl is DataGridViewComboBoxEditingControl blankEditor)
                {
                    blankEditor.Text = "";
                }
                return;
            }
            if (
                !speaker.Equals(AddSpeakerOption, StringComparison.Ordinal)
            )
            {
                var registered = RegisterSpeakerOption(speaker, cell);
                cell.Value = registered;
                if (speakerGrid.EditingControl is DataGridViewComboBoxEditingControl editor)
                {
                    editor.Text = registered;
                }
            }
            return;
        }

        if (
            sender is not DataGridView grid ||
            eventArgs.RowIndex < 0 ||
            eventArgs.ColumnIndex != WeightColumnIndex ||
            grid.Rows[eventArgs.RowIndex].Tag is not string
        )
        {
            return;
        }
        if (
            !int.TryParse(Convert.ToString(eventArgs.FormattedValue), out var weight) ||
            weight is < 1 or > 999
        )
        {
            grid.Rows[eventArgs.RowIndex].ErrorText = "權重必須是 1～999 的整數。";
            eventArgs.Cancel = true;
        }
        else
        {
            grid.Rows[eventArgs.RowIndex].ErrorText = "";
        }
    }

    private static void GridOnEditingControlShowing(
        object? sender,
        DataGridViewEditingControlShowingEventArgs eventArgs)
    {
        if (
            sender is not DataGridView grid ||
            grid.CurrentCell?.ColumnIndex != SpeakerColumnIndex ||
            eventArgs.Control is not DataGridViewComboBoxEditingControl editor
        )
        {
            return;
        }

        editor.DropDownStyle = ComboBoxStyle.DropDown;
        editor.AutoCompleteMode = AutoCompleteMode.None;
        editor.AutoCompleteSource = AutoCompleteSource.None;
        editor.KeyDown -= SpeakerEditorOnKeyDown;
        editor.KeyDown += SpeakerEditorOnKeyDown;
    }

    private static void SpeakerEditorOnKeyDown(object? sender, KeyEventArgs eventArgs)
    {
        if (
            eventArgs.KeyCode != Keys.Enter ||
            sender is not DataGridViewComboBoxEditingControl editor ||
            editor.DroppedDown ||
            editor.EditingControlDataGridView is not { } grid
        )
        {
            return;
        }

        grid.NotifyCurrentCellDirty(true);
        if (!grid.EndEdit()) return;
        eventArgs.Handled = true;
        eventArgs.SuppressKeyPress = true;
        grid.Focus();
    }

    private static void GridOnCellDoubleClick(
        object? sender,
        DataGridViewCellEventArgs eventArgs)
    {
        if (
            sender is not DataGridView grid ||
            eventArgs.RowIndex < 0 ||
            eventArgs.ColumnIndex != SpeakerColumnIndex
        )
        {
            return;
        }

        grid.CurrentCell = grid.Rows[eventArgs.RowIndex].Cells[SpeakerColumnIndex];
        if (!grid.BeginEdit(true) ||
            grid.EditingControl is not DataGridViewComboBoxEditingControl editor)
        {
            return;
        }
        editor.DroppedDown = false;
        editor.Focus();
        editor.SelectAll();
    }

    private static void GridOnCellEndEdit(
        object? sender,
        DataGridViewCellEventArgs eventArgs)
    {
        if (
            sender is not DataGridView grid ||
            eventArgs.RowIndex < 0 ||
            eventArgs.ColumnIndex != WeightColumnIndex
        )
        {
            return;
        }
        var row = grid.Rows[eventArgs.RowIndex];
        row.ErrorText = "";
        if (row.Tag is string)
        {
            row.Cells[WeightColumnIndex].Value = ReadWeight(row);
        }
    }

    private void GridOnCellValueChanged(object? sender, DataGridViewCellEventArgs eventArgs)
    {
        if (_handlingSpeakerChoice) return;
        if (sender is not DataGridView grid) return;
        if (eventArgs.RowIndex < 0 || eventArgs.ColumnIndex != SpeakerColumnIndex) return;
        var cell = grid.Rows[eventArgs.RowIndex].Cells[eventArgs.ColumnIndex];
        if (!string.Equals(Convert.ToString(cell.Value), AddSpeakerOption, StringComparison.Ordinal)) return;

        _handlingSpeakerChoice = true;
        try
        {
            var newSpeaker = PromptForSpeakerName();
            ApplySpeakerChoice(grid, eventArgs.RowIndex, newSpeaker);
        }
        finally
        {
            _handlingSpeakerChoice = false;
        }
    }

    private void ApplySpeakerChoice(DataGridView grid, int rowIndex, string? speaker)
    {
        var cell = (DataGridViewComboBoxCell)grid.Rows[rowIndex].Cells[SpeakerColumnIndex];
        var value = string.IsNullOrWhiteSpace(speaker)
            ? ""
            : RegisterSpeakerOption(speaker, cell);

        // 不要在 ComboBox 尚在編輯時呼叫 RefreshSpeakerOptions 清空整個清單；
        // 只增量加入新名字，才能保留目前的編輯控制項與選取值。
        if (grid.EditingControl is DataGridViewComboBoxEditingControl editor)
        {
            if (!editor.Items.Contains(value))
            {
                var addOptionIndex = editor.Items.IndexOf(AddSpeakerOption);
                editor.Items.Insert(
                    addOptionIndex >= 0 ? addOptionIndex : editor.Items.Count,
                    value);
            }
            editor.SelectedItem = value;
            editor.Text = value;
        }
        cell.Value = value;
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
