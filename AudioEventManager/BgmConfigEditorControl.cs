namespace Echoes.AudioEventTools;

internal sealed class BgmConfigEditorControl : UserControl
{
    private readonly AudioEventConfigDocument _document;
    private readonly Action _markDirty;
    private readonly DataGridView _trackGrid = CreateGrid();
    private readonly DataGridView _ruleGrid = CreateGrid();

    public BgmConfigEditorControl(
        AudioEventConfigDocument document,
        Action markDirty)
    {
        _document = document;
        _markDirty = markDirty;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Controls.Add(BuildTabs());
        ConfigureTrackGrid();
        ConfigureRuleGrid();
        LoadRows();
        AttachDirtyHandlers(_trackGrid);
        AttachDirtyHandlers(_ruleGrid);
    }

    public void Commit()
    {
        _trackGrid.EndEdit();
        _ruleGrid.EndEdit();

        var tracks = new Dictionary<string, BgmTrackEditableDefinition>(
            StringComparer.OrdinalIgnoreCase);
        foreach (DataGridViewRow row in _trackGrid.Rows)
        {
            if (row.IsNewRow) continue;
            var id = CellText(row, "TrackId").Trim();
            if (id.Length == 0) continue;
            tracks[id] = new BgmTrackEditableDefinition
            {
                Label = CellText(row, "TrackLabel").Trim(),
                SourceAssetPaths = SplitPaths(CellText(row, "TrackOriginalPaths")),
                Sources = SplitPaths(CellText(row, "TrackSources")),
                Volume = ParsePercentage(CellText(row, "TrackVolume")),
                Loop = CellBool(row, "TrackLoop"),
                RememberPosition = CellBool(row, "TrackRemember"),
            };
        }

        var rules = new List<BgmControlRuleEditableDefinition>();
        foreach (DataGridViewRow row in _ruleGrid.Rows)
        {
            if (row.IsNewRow) continue;
            var id = CellText(row, "RuleId").Trim();
            if (id.Length == 0) continue;
            rules.Add(new BgmControlRuleEditableDefinition
            {
                Enabled = CellBool(row, "RuleEnabled"),
                Id = id,
                Label = CellText(row, "RuleLabel").Trim(),
                TriggerType = CellText(row, "RuleTriggerType").Trim(),
                TargetId = CellText(row, "RuleTargetId").Trim(),
                State = CellText(row, "RuleState").Trim(),
                Action = CellText(row, "RuleAction").Trim(),
                TrackId = NullIfEmpty(CellText(row, "RuleTrackId")),
                TargetVolume = ParsePercentage(CellText(row, "RuleVolume")),
                FadeOutSeconds = ParseDouble(CellText(row, "RuleFadeOut")),
                FadeInSeconds = ParseDouble(CellText(row, "RuleFadeIn")),
                Priority = ParseInt(CellText(row, "RulePriority")),
                DurationSeconds = ParseDouble(CellText(row, "RuleDuration")),
                RestoreMode = CellText(row, "RuleRestoreMode").Trim(),
            });
        }

        _document.BgmTracks.Clear();
        foreach (var pair in tracks) _document.BgmTracks[pair.Key] = pair.Value;
        _document.BgmRules.Clear();
        _document.BgmRules.AddRange(rules);
    }

    private Control BuildTabs()
    {
        var tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(18, 6),
        };
        var tracksPage = new TabPage("BGM 素材庫")
        {
            BackColor = Color.FromArgb(25, 28, 34),
            ForeColor = ForeColor,
            Padding = new Padding(8),
        };
        var rulesPage = new TabPage("BGM 控制規則")
        {
            BackColor = Color.FromArgb(25, 28, 34),
            ForeColor = ForeColor,
            Padding = new Padding(8),
        };
        tracksPage.Controls.Add(BuildTrackPage());
        rulesPage.Controls.Add(BuildRulePage());
        tabs.TabPages.Add(tracksPage);
        tabs.TabPages.Add(rulesPage);
        return tabs;
    }

    private Control BuildTrackPage()
    {
        return BuildGridPage(
            "每列是一組可被規則指定的 BGM Track。多個路徑請以分號分隔；default 是一般場景預設播放清單。",
            _trackGrid,
            "新增 Track",
            AddTrack,
            "刪除 Track",
            DeleteTrack);
    }

    private Control BuildRulePage()
    {
        return BuildGridPage(
            "規則只在任務、Stage、OBJ、小遊戲、章節、場景或事件狀態改變時重算。優先權數字愈大愈優先；狀態可填 active、completed、playing、success，以 | 分隔多個狀態，或用 * 接受任何有效狀態。",
            _ruleGrid,
            "新增規則",
            AddRule,
            "刪除規則",
            DeleteRule);
    }

    private static Control BuildGridPage(
        string introduction,
        DataGridView grid,
        string addText,
        EventHandler addHandler,
        string deleteText,
        EventHandler deleteHandler)
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(930, 0),
            Text = introduction,
            ForeColor = Color.FromArgb(194, 201, 209),
            Margin = new Padding(0, 0, 0, 10),
        }, 0, 0);
        root.Controls.Add(grid, 0, 1);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight,
            Margin = new Padding(0, 10, 0, 0),
        };
        var addButton = CreateButton(addText, 110);
        addButton.Click += addHandler;
        buttons.Controls.Add(addButton);
        var deleteButton = CreateButton(deleteText, 110);
        deleteButton.Click += deleteHandler;
        buttons.Controls.Add(deleteButton);
        root.Controls.Add(buttons, 0, 2);
        return root;
    }

    private void ConfigureTrackGrid()
    {
        _trackGrid.Columns.Add(TextColumn("TrackId", "Track ID", 130));
        _trackGrid.Columns.Add(TextColumn("TrackLabel", "顯示名稱", 170));
        _trackGrid.Columns.Add(TextColumn("TrackOriginalPaths", "原始素材路徑（; 分隔）", 260));
        _trackGrid.Columns.Add(TextColumn("TrackSources", "遊戲 MP3 路徑（; 分隔）", 260));
        _trackGrid.Columns.Add(TextColumn("TrackVolume", "基礎音量 %", 90));
        _trackGrid.Columns.Add(CheckColumn("TrackLoop", "Loop", 58));
        _trackGrid.Columns.Add(CheckColumn("TrackRemember", "記住位置", 82));
    }

    private void ConfigureRuleGrid()
    {
        _ruleGrid.Columns.Add(CheckColumn("RuleEnabled", "啟用", 55));
        _ruleGrid.Columns.Add(TextColumn("RuleId", "規則 ID", 130));
        _ruleGrid.Columns.Add(TextColumn("RuleLabel", "顯示名稱", 160));
        _ruleGrid.Columns.Add(ComboColumn(
            "RuleTriggerType",
            "觸發類型",
            BgmControlRuleEditableDefinition.TriggerTypes,
            105));
        _ruleGrid.Columns.Add(TextColumn("RuleTargetId", "指定 ID", 190));
        _ruleGrid.Columns.Add(TextColumn("RuleState", "狀態", 90));
        _ruleGrid.Columns.Add(ComboColumn(
            "RuleAction",
            "操作",
            BgmControlRuleEditableDefinition.Actions,
            78));
        _ruleGrid.Columns.Add(TextColumn("RuleTrackId", "Track ID", 110));
        _ruleGrid.Columns.Add(TextColumn("RuleVolume", "目標音量 %", 90));
        _ruleGrid.Columns.Add(TextColumn("RuleFadeOut", "FadeOut 秒", 82));
        _ruleGrid.Columns.Add(TextColumn("RuleFadeIn", "FadeIn 秒", 82));
        _ruleGrid.Columns.Add(TextColumn("RulePriority", "優先權", 70));
        _ruleGrid.Columns.Add(TextColumn("RuleDuration", "持續秒數", 82));
        _ruleGrid.Columns.Add(ComboColumn(
            "RuleRestoreMode",
            "結束恢復",
            BgmControlRuleEditableDefinition.RestoreModes,
            90));
    }

    private void LoadRows()
    {
        foreach (var pair in _document.BgmTracks)
        {
            _trackGrid.Rows.Add(
                pair.Key,
                pair.Value.Label,
                JoinPaths(pair.Value.SourceAssetPaths),
                JoinPaths(pair.Value.Sources),
                Math.Round(pair.Value.Volume * 100),
                pair.Value.Loop,
                pair.Value.RememberPosition);
        }

        foreach (var rule in _document.BgmRules)
        {
            _ruleGrid.Rows.Add(
                rule.Enabled,
                rule.Id,
                rule.Label,
                rule.TriggerType,
                rule.TargetId,
                rule.State,
                rule.Action,
                rule.TrackId ?? "",
                Math.Round(rule.TargetVolume * 100),
                rule.FadeOutSeconds,
                rule.FadeInSeconds,
                rule.Priority,
                rule.DurationSeconds,
                rule.RestoreMode);
        }
    }

    private void AddTrack(object? sender, EventArgs eventArgs)
    {
        var sequence = 1;
        string id;
        do id = $"track-{sequence++:000}";
        while (_trackGrid.Rows.Cast<DataGridViewRow>().Any(
            row => CellText(row, "TrackId").Equals(id, StringComparison.OrdinalIgnoreCase)));
        var rowIndex = _trackGrid.Rows.Add(
            id,
            "新 BGM",
            "",
            "./audio/new-bgm.mp3",
            100,
            true,
            true);
        _trackGrid.CurrentCell = _trackGrid.Rows[rowIndex].Cells["TrackLabel"];
        _trackGrid.BeginEdit(true);
        _markDirty();
    }

    private void DeleteTrack(object? sender, EventArgs eventArgs)
    {
        if (_trackGrid.CurrentRow is not { IsNewRow: false } row) return;
        if (CellText(row, "TrackId").Equals("default", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(
                this,
                "default 是一般場景的預設 BGM，不可刪除。",
                "無法刪除 default",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }
        _trackGrid.Rows.Remove(row);
        _markDirty();
    }

    private void AddRule(object? sender, EventArgs eventArgs)
    {
        var sequence = 1;
        string id;
        do id = $"bgm-rule-{sequence++:000}";
        while (_ruleGrid.Rows.Cast<DataGridViewRow>().Any(
            row => CellText(row, "RuleId").Equals(id, StringComparison.OrdinalIgnoreCase)));
        var rowIndex = _ruleGrid.Rows.Add(
            true,
            id,
            "新 BGM 規則",
            "event",
            "event-id",
            "active",
            "volume",
            "",
            50,
            1,
            1,
            0,
            0,
            "resume");
        _ruleGrid.CurrentCell = _ruleGrid.Rows[rowIndex].Cells["RuleLabel"];
        _ruleGrid.BeginEdit(true);
        _markDirty();
    }

    private void DeleteRule(object? sender, EventArgs eventArgs)
    {
        if (_ruleGrid.CurrentRow is not { IsNewRow: false } row) return;
        _ruleGrid.Rows.Remove(row);
        _markDirty();
    }

    private void AttachDirtyHandlers(DataGridView grid)
    {
        grid.CellValueChanged += (_, _) => _markDirty();
        grid.UserDeletedRow += (_, _) => _markDirty();
        grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (grid.IsCurrentCellDirty) grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };
        grid.DataError += (_, eventArgs) => eventArgs.ThrowException = false;
    }

    private static DataGridView CreateGrid()
    {
        return new DataGridView
        {
            Dock = DockStyle.Fill,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            AllowUserToResizeRows = false,
            AutoGenerateColumns = false,
            BackgroundColor = Color.FromArgb(25, 28, 34),
            BorderStyle = BorderStyle.FixedSingle,
            GridColor = Color.FromArgb(62, 68, 79),
            ForeColor = Color.FromArgb(226, 230, 234),
            RowHeadersVisible = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect = false,
            AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None,
            RowTemplate = { Height = 30 },
            ColumnHeadersHeight = 34,
            EnableHeadersVisualStyles = false,
            ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
            {
                BackColor = Color.FromArgb(45, 50, 59),
                ForeColor = Color.FromArgb(234, 237, 240),
                SelectionBackColor = Color.FromArgb(45, 50, 59),
            },
            DefaultCellStyle = new DataGridViewCellStyle
            {
                BackColor = Color.FromArgb(34, 38, 46),
                ForeColor = Color.FromArgb(226, 230, 234),
                SelectionBackColor = Color.FromArgb(49, 100, 108),
                SelectionForeColor = Color.White,
            },
        };
    }

    private static DataGridViewTextBoxColumn TextColumn(
        string name,
        string header,
        int width) => new()
    {
        Name = name,
        HeaderText = header,
        Width = width,
        SortMode = DataGridViewColumnSortMode.NotSortable,
    };

    private static DataGridViewCheckBoxColumn CheckColumn(
        string name,
        string header,
        int width) => new()
    {
        Name = name,
        HeaderText = header,
        Width = width,
        SortMode = DataGridViewColumnSortMode.NotSortable,
    };

    private static DataGridViewComboBoxColumn ComboColumn(
        string name,
        string header,
        IEnumerable<string> values,
        int width)
    {
        var column = new DataGridViewComboBoxColumn
        {
            Name = name,
            HeaderText = header,
            Width = width,
            FlatStyle = FlatStyle.Flat,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        };
        column.Items.AddRange(values.Cast<object>().ToArray());
        return column;
    }

    private static Button CreateButton(string text, int width)
    {
        var button = new Button
        {
            AutoSize = false,
            Width = width,
            Height = 34,
            Text = text,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 50, 59),
            ForeColor = Color.FromArgb(230, 234, 238),
            Margin = new Padding(0, 0, 8, 0),
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(85, 94, 108);
        return button;
    }

    private static string CellText(DataGridViewRow row, string columnName) =>
        Convert.ToString(row.Cells[columnName].Value)?.Trim() ?? "";

    private static bool CellBool(DataGridViewRow row, string columnName) =>
        row.Cells[columnName].Value is true;

    private static string? NullIfEmpty(string value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static double ParsePercentage(string value) =>
        Math.Clamp(ParseDouble(value), 0, 100) / 100;

    private static double ParseDouble(string value) =>
        double.TryParse(value, out var parsed) ? parsed : 0;

    private static int ParseInt(string value) =>
        int.TryParse(value, out var parsed) ? parsed : 0;

    private static List<string> SplitPaths(string value) => value
        .Replace("\r", "", StringComparison.Ordinal)
        .Split(new[] { '\n', ';' }, StringSplitOptions.RemoveEmptyEntries)
        .Select(path => path.Trim())
        .Where(path => path.Length > 0)
        .ToList();

    private static string JoinPaths(IEnumerable<string> paths) =>
        string.Join("; ", paths);
}
