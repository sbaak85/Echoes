namespace Echoes.QuestEditor;

internal sealed class MainForm : Form
{
    private readonly string _projectRoot;
    private string _dataPath;
    private QuestDocument _document;
    private QuestReferenceCatalog _references;
    private bool _dirty;
    private bool _rebuilding;
    private bool _updatingReferenceList;

    private readonly TreeView _questTree = new();
    private readonly ListBox _stageList = new();
    private readonly DataGridView _objectiveGrid = new();
    private readonly PropertyGrid _propertyGrid = new();
    private readonly ComboBox _referenceCombo = new();
    private readonly Label _referenceLabel = new();
    private readonly ListBox _validationList = new();
    private readonly ToolStripStatusLabel _statusText = new();
    private readonly SplitContainer _rootSplit = new();
    private readonly SplitContainer _leftSplit = new();
    private readonly SplitContainer _middleSplit = new();

    private QuestDefinition? SelectedQuest => _questTree.SelectedNode?.Tag as QuestDefinition;
    private QuestStageDefinition? SelectedStage => _stageList.SelectedItem as QuestStageDefinition;
    private QuestObjectiveDefinition? SelectedObjective =>
        _objectiveGrid.CurrentRow?.DataBoundItem as QuestObjectiveDefinition;

    public MainForm(string projectRoot, string dataPath)
    {
        _projectRoot = projectRoot;
        _dataPath = dataPath;
        _document = QuestDataStore.Load(dataPath);
        _references = QuestReferenceProvider.Load(projectRoot);
        InitializeWindow();
        BuildUi();
        RebuildTree();
        ValidateDocument();
        UpdateTitle();
    }

    private void InitializeWindow()
    {
        Text = "Echoes 任務編輯器";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1180, 720);
        ClientSize = new Size(1500, 900);
        Font = new Font("Microsoft JhengHei UI", 10F);
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        KeyPreview = true;
        FormClosing += OnFormClosing;
        Shown += (_, _) => LayoutSplitPanels();
        SizeChanged += (_, _) => LayoutSplitPanels();
        KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.Control && eventArgs.KeyCode == Keys.S)
            {
                SaveDocument();
                eventArgs.SuppressKeyPress = true;
            }
        };
    }

    private void BuildUi()
    {
        var toolStrip = new ToolStrip
        {
            GripStyle = ToolStripGripStyle.Hidden,
            BackColor = Theme.PanelAlt,
            ForeColor = Theme.Text,
            Padding = new Padding(8, 5, 8, 5),
        };
        toolStrip.Items.Add(ActionButton("開啟", (_, _) => OpenDocument()));
        toolStrip.Items.Add(ActionButton("儲存", (_, _) => SaveDocument()));
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(ActionButton("重新讀取外部 ID", (_, _) => ReloadReferences()));
        toolStrip.Items.Add(ActionButton("驗證資料", (_, _) => ValidateDocument()));
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(ActionButton("使用教學", (_, _) => ShowQuickTutorial()));
        toolStrip.Dock = DockStyle.Fill;

        var status = new StatusStrip { BackColor = Theme.PanelAlt, ForeColor = Theme.Muted };
        status.Items.Add(_statusText);
        status.Dock = DockStyle.Fill;

        _rootSplit.Dock = DockStyle.Fill;
        _rootSplit.Orientation = Orientation.Horizontal;
        _rootSplit.BackColor = Theme.Border;

        var shell = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 39));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 27));
        shell.Controls.Add(toolStrip, 0, 0);
        shell.Controls.Add(_rootSplit, 0, 1);
        shell.Controls.Add(status, 0, 2);
        Controls.Add(shell);

        _leftSplit.Dock = DockStyle.Fill;
        _leftSplit.BackColor = Theme.Border;
        _rootSplit.Panel1.Controls.Add(_leftSplit);
        _leftSplit.Panel1.Controls.Add(BuildQuestTreePanel());

        _middleSplit.Dock = DockStyle.Fill;
        _middleSplit.BackColor = Theme.Border;
        _leftSplit.Panel2.Controls.Add(_middleSplit);
        _middleSplit.Panel1.Controls.Add(BuildStageObjectivePanel());
        _middleSplit.Panel2.Controls.Add(BuildPropertyPanel());
        _rootSplit.Panel2.Controls.Add(BuildValidationPanel());
    }

    private void LayoutSplitPanels()
    {
        if (_rootSplit.Height > 260)
            _rootSplit.SplitterDistance = Math.Clamp((int)(_rootSplit.Height * 0.76), 360, _rootSplit.Height - 130);
        if (_leftSplit.Width > 700)
            _leftSplit.SplitterDistance = Math.Clamp((int)(_leftSplit.Width * 0.22), 270, _leftSplit.Width - 700);
        if (_middleSplit.Width > 650)
            _middleSplit.SplitterDistance = Math.Clamp((int)(_middleSplit.Width * 0.62), 470, _middleSplit.Width - 350);
    }

    private Control BuildQuestTreePanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Panel,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(8),
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 78));
        _questTree.Dock = DockStyle.Fill;
        _questTree.BackColor = Theme.Panel;
        _questTree.ForeColor = Theme.Text;
        _questTree.BorderStyle = BorderStyle.None;
        _questTree.HideSelection = false;
        _questTree.AfterSelect += (_, _) => OnTreeSelectionChanged();
        panel.Controls.Add(Header("章節與任務"), 0, 0);
        panel.Controls.Add(_questTree, 0, 1);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Panel,
            Padding = new Padding(5),
        };
        buttons.Controls.Add(Theme.Button("＋章節", 92));
        buttons.Controls[^1].Click += (_, _) => AddChapter();
        buttons.Controls.Add(Theme.Button("＋任務", 92));
        buttons.Controls[^1].Click += (_, _) => AddQuest();
        buttons.Controls.Add(Theme.Button("複製任務", 100));
        buttons.Controls[^1].Click += (_, _) => DuplicateQuest();
        buttons.Controls.Add(Theme.Button("刪除", 92));
        buttons.Controls[^1].Click += (_, _) => DeleteTreeItem();
        panel.Controls.Add(buttons, 0, 2);
        return panel;
    }

    private Control BuildStageObjectivePanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Panel,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(8),
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 176));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        panel.Controls.Add(Header("任務階段"), 0, 0);

        _stageList.Dock = DockStyle.Fill;
        _stageList.BackColor = Theme.Background;
        _stageList.ForeColor = Theme.Text;
        _stageList.BorderStyle = BorderStyle.FixedSingle;
        _stageList.SelectedIndexChanged += (_, _) => OnStageSelectionChanged();
        panel.Controls.Add(_stageList, 0, 1);

        var stageButtons = ButtonRow();
        stageButtons.Dock = DockStyle.Fill;
        stageButtons.Controls.Add(Theme.Button("＋階段", 90));
        stageButtons.Controls[^1].Click += (_, _) => AddStage();
        stageButtons.Controls.Add(Theme.Button("刪除階段", 100));
        stageButtons.Controls[^1].Click += (_, _) => DeleteStage();
        stageButtons.Controls.Add(Theme.Button("上移", 70));
        stageButtons.Controls[^1].Click += (_, _) => MoveStage(-1);
        stageButtons.Controls.Add(Theme.Button("下移", 70));
        stageButtons.Controls[^1].Click += (_, _) => MoveStage(1);
        panel.Controls.Add(stageButtons, 0, 2);

        panel.Controls.Add(Header("目前階段的任務目標"), 0, 3);

        _objectiveGrid.Dock = DockStyle.Fill;
        Theme.StyleGrid(_objectiveGrid);
        _objectiveGrid.AutoGenerateColumns = false;
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Id", HeaderText = "Objective ID", FillWeight = 24 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "DisplayText", HeaderText = "顯示文字", FillWeight = 35 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Type", HeaderText = "類型", FillWeight = 24 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "TargetId", HeaderText = "Target ID", FillWeight = 27 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "RequiredAmount", HeaderText = "數量", FillWeight = 12 });
        _objectiveGrid.SelectionChanged += (_, _) => OnObjectiveSelectionChanged();
        _objectiveGrid.CellEndEdit += (_, _) => OnObjectiveGridEditCommitted();
        panel.Controls.Add(_objectiveGrid, 0, 4);

        var objectiveButtons = ButtonRow();
        objectiveButtons.Dock = DockStyle.Fill;
        objectiveButtons.Controls.Add(Theme.Button("＋目標", 90));
        objectiveButtons.Controls[^1].Click += (_, _) => AddObjective();
        objectiveButtons.Controls.Add(Theme.Button("刪除目標", 100));
        objectiveButtons.Controls[^1].Click += (_, _) => DeleteObjective();
        objectiveButtons.Controls.Add(Theme.Button("上移", 70));
        objectiveButtons.Controls[^1].Click += (_, _) => MoveObjective(-1);
        objectiveButtons.Controls.Add(Theme.Button("下移", 70));
        objectiveButtons.Controls[^1].Click += (_, _) => MoveObjective(1);
        panel.Controls.Add(objectiveButtons, 0, 5);
        return panel;
    }

    private Control BuildPropertyPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Panel,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(8),
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        panel.Controls.Add(Header("屬性設定"), 0, 0);
        _propertyGrid.Dock = DockStyle.Fill;
        _propertyGrid.BackColor = Theme.Panel;
        _propertyGrid.ViewBackColor = Theme.Panel;
        _propertyGrid.ViewForeColor = Theme.Text;
        _propertyGrid.HelpBackColor = Theme.PanelAlt;
        _propertyGrid.HelpForeColor = Theme.Muted;
        _propertyGrid.CategoryForeColor = Theme.Gold;
        _propertyGrid.LineColor = Theme.Border;
        _propertyGrid.ToolbarVisible = false;
        _propertyGrid.PropertySort = PropertySort.Categorized;
        _propertyGrid.PropertyValueChanged += (_, _) => OnPropertyChanged();
        panel.Controls.Add(_propertyGrid, 0, 1);

        var referencePanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(8),
            BackColor = Theme.PanelAlt,
        };
        _referenceLabel.Text = "外部 Target ID 清單";
        _referenceLabel.ForeColor = Theme.Cyan;
        _referenceLabel.Dock = DockStyle.Fill;
        _referenceCombo.Dock = DockStyle.Fill;
        _referenceCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _referenceCombo.BackColor = Theme.Background;
        _referenceCombo.ForeColor = Theme.Text;
        _referenceCombo.SelectedIndexChanged += (_, _) => ApplySelectedReference();
        referencePanel.Controls.Add(_referenceLabel, 0, 0);
        referencePanel.Controls.Add(_referenceCombo, 0, 1);
        panel.Controls.Add(referencePanel, 0, 2);
        return panel;
    }

    private Control BuildValidationPanel()
    {
        var panel = SectionPanel("驗證結果（雙擊可跳到項目）");
        _validationList.Dock = DockStyle.Fill;
        _validationList.BackColor = Theme.Background;
        _validationList.ForeColor = Theme.Text;
        _validationList.BorderStyle = BorderStyle.None;
        _validationList.DoubleClick += (_, _) => NavigateToIssue();
        panel.Controls.Add(_validationList);
        _validationList.BringToFront();
        return panel;
    }

    private static ToolStripButton ActionButton(string text, EventHandler handler)
    {
        var button = new ToolStripButton(text) { ForeColor = Theme.Text, Margin = new Padding(3) };
        button.Click += handler;
        return button;
    }

    private static Panel SectionPanel(string title)
    {
        var panel = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Panel, Padding = new Padding(8) };
        panel.Controls.Add(Header(title));
        return panel;
    }

    private static Label Header(string text) => new()
    {
        Text = text,
        Dock = DockStyle.Top,
        Height = 40,
        Padding = new Padding(4, 8, 4, 4),
        ForeColor = Theme.Gold,
        Font = new Font("Microsoft JhengHei UI", 11F, FontStyle.Bold),
        BackColor = Theme.Panel,
    };

    private static FlowLayoutPanel ButtonRow() => new()
    {
        Height = 44,
        FlowDirection = FlowDirection.LeftToRight,
        WrapContents = false,
        BackColor = Theme.Panel,
        Padding = new Padding(4),
    };

    private void RebuildTree(object? select = null)
    {
        _rebuilding = true;
        _questTree.BeginUpdate();
        _questTree.Nodes.Clear();
        TreeNode? selection = null;
        foreach (var chapter in _document.Chapters)
        {
            var chapterNode = new TreeNode(chapter.ToString()) { Tag = chapter, ForeColor = Theme.Gold };
            foreach (var quest in _document.Quests.Where(quest => quest.ChapterId.Equals(chapter.Id, StringComparison.OrdinalIgnoreCase)))
            {
                var questNode = new TreeNode(quest.ToString()) { Tag = quest, ForeColor = Theme.Text };
                chapterNode.Nodes.Add(questNode);
                if (ReferenceEquals(select, quest)) selection = questNode;
            }
            _questTree.Nodes.Add(chapterNode);
            chapterNode.Expand();
            if (ReferenceEquals(select, chapter)) selection = chapterNode;
        }
        _questTree.EndUpdate();
        _rebuilding = false;
        _questTree.SelectedNode = selection ?? _questTree.Nodes.Cast<TreeNode>().FirstOrDefault();
    }

    private void OnTreeSelectionChanged()
    {
        if (_rebuilding) return;
        _stageList.DataSource = null;
        _objectiveGrid.DataSource = null;
        var selected = _questTree.SelectedNode?.Tag;
        _propertyGrid.SelectedObject = selected;
        if (selected is QuestDefinition quest)
        {
            _stageList.DataSource = quest.Stages;
            if (quest.Stages.Count > 0) _stageList.SelectedIndex = 0;
        }
        UpdateReferenceList();
    }

    private void OnStageSelectionChanged()
    {
        _objectiveGrid.DataSource = null;
        if (SelectedStage is not { } stage) return;
        _propertyGrid.SelectedObject = stage;
        _objectiveGrid.DataSource = stage.Objectives;
        if (stage.Objectives.Count > 0) _objectiveGrid.Rows[0].Selected = true;
        UpdateReferenceList();
    }

    private void OnObjectiveSelectionChanged()
    {
        if (SelectedObjective is not { } objective) return;
        _propertyGrid.SelectedObject = objective;
        UpdateReferenceList();
    }

    private void OnPropertyChanged()
    {
        MarkDirty();
        var selected = _propertyGrid.SelectedObject;
        if (selected is ChapterDefinition or QuestDefinition) RebuildTree(selected);
        else
        {
            _stageList.Refresh();
            _objectiveGrid.Refresh();
            UpdateReferenceList();
        }
        ValidateDocument();
    }

    private void UpdateReferenceList()
    {
        _updatingReferenceList = true;
        try
        {
            _referenceCombo.DataSource = null;
            var objective = _propertyGrid.SelectedObject as QuestObjectiveDefinition;
            var kind = objective is null ? null : QuestValidator.ReferenceKind(objective.Type);
            _referenceLabel.Text = kind is null ? "這個目標類型不使用外部 ID 清單" : $"外部 {kind} ID 清單";
            _referenceCombo.Enabled = kind is not null;
            if (kind is null) return;

            var values = _references.Get(kind).ToList();
            if (!string.IsNullOrWhiteSpace(objective!.TargetId) &&
                values.All(value => !value.Id.Equals(objective.TargetId, StringComparison.OrdinalIgnoreCase)))
            {
                values.Insert(0, new QuestReference(objective.TargetId, "目前值（外部清單找不到）"));
            }

            _referenceCombo.DataSource = values;
            var selected = values.FirstOrDefault(value =>
                value.Id.Equals(objective.TargetId, StringComparison.OrdinalIgnoreCase));
            _referenceCombo.SelectedItem = selected;
            if (selected is null) _referenceCombo.SelectedIndex = -1;
        }
        finally
        {
            _updatingReferenceList = false;
        }
    }

    private void ApplySelectedReference()
    {
        if (_rebuilding || _updatingReferenceList ||
            _propertyGrid.SelectedObject is not QuestObjectiveDefinition objective ||
            _referenceCombo.SelectedItem is not QuestReference reference || objective.TargetId == reference.Id) return;
        objective.TargetId = reference.Id;
        _propertyGrid.Refresh();
        _objectiveGrid.Refresh();
        MarkDirty();
        ValidateDocument();
    }

    private void OnObjectiveGridEditCommitted()
    {
        if (_rebuilding) return;
        MarkDirty();
        _propertyGrid.Refresh();
        UpdateReferenceList();
        ValidateDocument();
    }

    private void CommitPendingObjectiveEdit()
    {
        _objectiveGrid.EndEdit();
        if (_objectiveGrid.DataSource is not null && BindingContext[_objectiveGrid.DataSource] is CurrencyManager manager)
            manager.EndCurrentEdit();
    }

    private void AddChapter()
    {
        var chapter = new ChapterDefinition { Id = NextId("CH", _document.Chapters.Select(item => item.Id)), Name = "新章節" };
        _document.Chapters.Add(chapter);
        MarkDirty();
        RebuildTree(chapter);
    }

    private void AddQuest()
    {
        var chapter = _questTree.SelectedNode?.Tag as ChapterDefinition ??
                      (_questTree.SelectedNode?.Parent?.Tag as ChapterDefinition) ?? _document.Chapters.FirstOrDefault();
        if (chapter is null) { AddChapter(); chapter = _document.Chapters.Last(); }
        var quest = new QuestDefinition
        {
            Id = NextId($"QUEST_{chapter.Id}_MAIN_", _document.Quests.Select(item => item.Id), 3),
            Name = "新任務",
            ChapterId = chapter.Id,
        };
        quest.Stages.Add(new QuestStageDefinition
        {
            Id = $"{quest.Id}_STAGE_01",
            Name = "第一階段",
        });
        _document.Quests.Add(quest);
        MarkDirty();
        RebuildTree(quest);
    }

    private void DuplicateQuest()
    {
        if (SelectedQuest is not { } source) return;
        var holder = new QuestDocument { Quests = new() { source } };
        var copy = QuestDataStore.Clone(holder).Quests[0];
        copy.Id = source.Id + "_COPY";
        copy.Name = source.Name + "（複製）";
        RebuildChildIds(copy);
        _document.Quests.Add(copy);
        MarkDirty();
        RebuildTree(copy);
    }

    private void DeleteTreeItem()
    {
        var selected = _questTree.SelectedNode?.Tag;
        if (selected is QuestDefinition quest)
        {
            if (!Confirm($"確定刪除任務 {quest.Id}？")) return;
            _document.Quests.Remove(quest);
        }
        else if (selected is ChapterDefinition chapter)
        {
            if (_document.Quests.Any(quest => quest.ChapterId.Equals(chapter.Id, StringComparison.OrdinalIgnoreCase)))
            {
                MessageBox.Show("請先刪除或移動這個章節內的任務。", "無法刪除", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (!Confirm($"確定刪除章節 {chapter.Id}？")) return;
            _document.Chapters.Remove(chapter);
        }
        else return;
        MarkDirty();
        RebuildTree();
        ValidateDocument();
    }

    private void AddStage()
    {
        if (SelectedQuest is not { } quest) return;
        var stage = new QuestStageDefinition
        {
            Id = NextId(
                $"{quest.Id}_STAGE_",
                _document.Quests.SelectMany(item => item.Stages).Select(item => item.Id),
                2),
            Name = "新階段",
        };
        if (quest.Stages.LastOrDefault() is { } previous && string.IsNullOrWhiteSpace(previous.NextStageId)) previous.NextStageId = stage.Id;
        quest.Stages.Add(stage);
        RefreshStages(stage);
    }

    private void DeleteStage()
    {
        if (SelectedQuest is not { } quest || SelectedStage is not { } stage || !Confirm($"確定刪除階段 {stage.Id}？")) return;
        quest.Stages.Remove(stage);
        RefreshStages();
    }

    private void MoveStage(int offset)
    {
        if (SelectedQuest is not { } quest || SelectedStage is not { } stage) return;
        MoveListItem(quest.Stages, stage, offset);
        RefreshStages(stage);
    }

    private void RefreshStages(QuestStageDefinition? selection = null)
    {
        var quest = SelectedQuest;
        if (quest is null) return;
        _stageList.DataSource = null;
        _stageList.DataSource = quest.Stages;
        _stageList.SelectedItem = selection ?? quest.Stages.FirstOrDefault();
        MarkDirty();
        ValidateDocument();
    }

    private void AddObjective()
    {
        if (SelectedStage is not { } stage) return;
        var objective = new QuestObjectiveDefinition
        {
            Id = NextId(
                $"{SelectedQuest!.Id}_OBJ_",
                SelectedQuest.Stages.SelectMany(item => item.Objectives).Select(item => item.Id),
                2),
            DisplayText = "新目標",
        };
        stage.Objectives.Add(objective);
        RefreshObjectives(objective);
    }

    private void DeleteObjective()
    {
        if (SelectedStage is not { } stage || SelectedObjective is not { } objective || !Confirm($"確定刪除目標 {objective.Id}？")) return;
        stage.Objectives.Remove(objective);
        RefreshObjectives();
    }

    private void MoveObjective(int offset)
    {
        CommitPendingObjectiveEdit();
        if (SelectedStage is not { } stage || SelectedObjective is not { } objective) return;
        MoveListItem(stage.Objectives, objective, offset);
        RefreshObjectives(objective);
    }

    private void RefreshObjectives(QuestObjectiveDefinition? selection = null)
    {
        var stage = SelectedStage;
        if (stage is null) return;
        _objectiveGrid.DataSource = null;
        _objectiveGrid.DataSource = stage.Objectives;
        if (selection is not null)
        {
            var index = stage.Objectives.IndexOf(selection);
            if (index >= 0) _objectiveGrid.CurrentCell = _objectiveGrid.Rows[index].Cells[0];
        }
        MarkDirty();
        ValidateDocument();
    }

    private void ReloadReferences()
    {
        _references = QuestReferenceProvider.Load(_projectRoot);
        UpdateReferenceList();
        ValidateDocument();
        _statusText.Text = "已重新讀取 Item、場景、對話與事件流程 ID。";
    }

    private void ShowQuickTutorial()
    {
        const string tutorial =
            "任務編輯器快速教學\n\n" +
            "1. 左側按【＋章節】，建立章節並設定 Chapter ID。\n" +
            "2. 選取章節後按【＋任務】，在右側設定任務名稱、類型與派發方式。\n" +
            "3. 選取任務後按【＋階段】，每個任務可以依序建立多個 Stage。\n" +
            "4. 選取階段後按【＋目標】，設定目標類型、Target ID 與需求數量。\n" +
            "5. 外部 Target ID 請從右下方清單選取，避免手動輸入錯誤。\n" +
            "6. 查看下方【驗證結果】；雙擊錯誤可跳到有問題的項目。\n" +
            "7. 完成後按【儲存】或 Ctrl+S，資料會寫入 quest-data.json。\n\n" +
            "基本順序：章節 → 任務 → 階段 → 目標 → 驗證 → 儲存";

        MessageBox.Show(tutorial, "任務編輯器使用教學", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void ValidateDocument()
    {
        var issues = QuestValidator.Validate(_document, _references);
        _validationList.DataSource = null;
        _validationList.DataSource = issues;
        _validationList.ForeColor = issues.Any(issue => issue.Severity == ValidationSeverity.Error)
            ? Color.FromArgb(244, 153, 143)
            : Theme.Text;
        _statusText.Text = issues.Count == 0
            ? "驗證完成：沒有發現問題。"
            : $"驗證完成：{issues.Count(issue => issue.Severity == ValidationSeverity.Error)} 個錯誤，{issues.Count(issue => issue.Severity == ValidationSeverity.Warning)} 個警告。";
    }

    private void NavigateToIssue()
    {
        if (_validationList.SelectedItem is not QuestValidationIssue issue || issue.Target is null) return;
        var quest = issue.Target as QuestDefinition ??
                    _document.Quests.FirstOrDefault(candidate => candidate.Stages.Contains(issue.Target) || candidate.Stages.Any(stage => stage.Objectives.Contains(issue.Target)));
        if (issue.Target is ChapterDefinition chapter) RebuildTree(chapter);
        else if (quest is not null)
        {
            RebuildTree(quest);
            if (issue.Target is QuestStageDefinition stage) _stageList.SelectedItem = stage;
            else if (issue.Target is QuestObjectiveDefinition objective)
            {
                var owner = quest.Stages.First(stage => stage.Objectives.Contains(objective));
                _stageList.SelectedItem = owner;
                var index = owner.Objectives.IndexOf(objective);
                if (index >= 0) _objectiveGrid.CurrentCell = _objectiveGrid.Rows[index].Cells[0];
            }
        }
        _propertyGrid.SelectedObject = issue.Target;
    }

    private void SaveDocument()
    {
        CommitPendingObjectiveEdit();
        _propertyGrid.Refresh();
        var issues = QuestValidator.Validate(_document, _references);
        if (issues.Any(issue => issue.Severity == ValidationSeverity.Error) &&
            MessageBox.Show("資料仍有錯誤。要保留草稿並繼續儲存嗎？", "任務資料驗證", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            return;
        QuestDataStore.Save(_dataPath, _document);
        _dirty = false;
        UpdateTitle();
        ValidateDocument();
        _statusText.Text = $"已儲存：{_dataPath}";
    }

    private void OpenDocument()
    {
        if (!ConfirmDiscardChanges()) return;
        using var dialog = new OpenFileDialog
        {
            Filter = "任務資料 (*.json)|*.json|所有檔案 (*.*)|*.*",
            InitialDirectory = Path.GetDirectoryName(_dataPath),
            FileName = Path.GetFileName(_dataPath),
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        _dataPath = dialog.FileName;
        _document = QuestDataStore.Load(_dataPath);
        _dirty = false;
        RebuildTree();
        ValidateDocument();
        UpdateTitle();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        if (!ConfirmDiscardChanges()) eventArgs.Cancel = true;
    }

    private bool ConfirmDiscardChanges() => !_dirty ||
        MessageBox.Show("尚有未儲存的變更，確定要放棄嗎？", "任務編輯器", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes;

    private static bool Confirm(string message) =>
        MessageBox.Show(message, "任務編輯器", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;

    private static void RebuildChildIds(QuestDefinition quest)
    {
        var stageIdMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var objectiveIndex = 1;
        for (var stageIndex = 0; stageIndex < quest.Stages.Count; stageIndex++)
        {
            var stage = quest.Stages[stageIndex];
            var nextStageId = $"{quest.Id}_STAGE_{stageIndex + 1:00}";
            stageIdMap[stage.Id] = nextStageId;
            stage.Id = nextStageId;
            foreach (var objective in stage.Objectives)
                objective.Id = $"{quest.Id}_OBJ_{objectiveIndex++:00}";
        }
        foreach (var stage in quest.Stages)
        {
            if (!string.IsNullOrWhiteSpace(stage.NextStageId) &&
                stageIdMap.TryGetValue(stage.NextStageId, out var remappedNextStageId))
            {
                stage.NextStageId = remappedNextStageId;
            }
        }
    }

    private void MarkDirty()
    {
        _dirty = true;
        UpdateTitle();
    }

    private void UpdateTitle() => Text = $"Echoes 任務編輯器{(_dirty ? " *" : "")} — {Path.GetFileName(_dataPath)}";

    private static string NextId(string prefix, IEnumerable<string> existing, int digits = 2)
    {
        var used = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);
        for (var index = 1; index < 10000; index++)
        {
            var candidate = prefix + index.ToString($"D{digits}");
            if (!used.Contains(candidate)) return candidate;
        }
        return prefix + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    }

    private static void MoveListItem<T>(List<T> values, T value, int offset)
    {
        var current = values.IndexOf(value);
        var target = Math.Clamp(current + offset, 0, values.Count - 1);
        if (current < 0 || current == target) return;
        values.RemoveAt(current);
        values.Insert(target, value);
    }

    internal void RunSmokeTest()
    {
        if (_questTree.Nodes.Count == 0) throw new InvalidOperationException("章節樹沒有載入資料。");

        var interactionReferences = _references.Get("Interaction").Take(3).ToArray();
        if (interactionReferences.Length == 3)
        {
            var regressionQuest = new QuestDefinition
            {
                Id = "QUEST_UI_TARGET_REGRESSION",
                Name = "Target ID 重建測試",
                ChapterId = _document.Chapters.First().Id,
            };
            var regressionStage = new QuestStageDefinition
            {
                Id = "QUEST_UI_TARGET_REGRESSION_STAGE_01",
                Name = "Target ID 重建測試階段",
            };
            for (var index = 0; index < interactionReferences.Length; index++)
            {
                regressionStage.Objectives.Add(new QuestObjectiveDefinition
                {
                    Id = $"QUEST_UI_TARGET_REGRESSION_OBJ_{index + 1:00}",
                    DisplayText = $"互動目標 {index + 1}",
                    Type = ObjectiveType.InteractionSucceeded,
                    TargetId = interactionReferences[index].Id,
                    ShowProgress = false,
                });
            }
            regressionQuest.Stages.Add(regressionStage);
            _document.Quests.Add(regressionQuest);
            var expectedTargets = regressionStage.Objectives.ToDictionary(
                objective => objective.Id,
                objective => objective.TargetId,
                StringComparer.OrdinalIgnoreCase);

            RebuildTree(regressionQuest);
            _stageList.SelectedItem = regressionStage;
            _objectiveGrid.CurrentCell = _objectiveGrid.Rows[1].Cells[0];
            UpdateReferenceList();
            MoveObjective(1);

            foreach (var objective in regressionStage.Objectives)
            {
                if (objective.TargetId != expectedTargets[objective.Id])
                    throw new InvalidOperationException($"重新排列 Objective 後 Target ID 被改寫：{objective.Id}");
            }

            CommitPendingObjectiveEdit();
            QuestDataStore.Save(_dataPath, _document);
            var savedQuest = QuestDataStore.Load(_dataPath).Quests.First(quest => quest.Id == regressionQuest.Id);
            foreach (var objective in savedQuest.Stages[0].Objectives)
            {
                if (objective.TargetId != expectedTargets[objective.Id])
                    throw new InvalidOperationException($"儲存後 Target ID 不一致：{objective.Id}");
            }
        }

        var originalCount = _document.Quests.Count;
        AddQuest();
        if (_document.Quests.Count != originalCount + 1 || _document.Quests[^1].Stages.Count != 1)
            throw new InvalidOperationException("新增任務或預設階段失敗。");
        _document.Quests[^1].Stages[0].Objectives.Add(new QuestObjectiveDefinition { Id = "OBJ_SMOKE" });
        RebuildTree(_document.Quests[^1]);
        if (_questTree.Nodes.Cast<TreeNode>().SelectMany(node => node.Nodes.Cast<TreeNode>()).Count() != _document.Quests.Count)
            throw new InvalidOperationException("任務樹重新整理失敗。");
        ValidateDocument();
        if (_validationList.DataSource is null) throw new InvalidOperationException("驗證面板沒有初始化。");
    }
}
