using System.ComponentModel;

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
    private readonly BindingSource _objectiveBinding = new();
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
    private QuestObjectiveDefinition? SelectedObjective
    {
        get
        {
            // CurrencyManager briefly has Position == -1 while switching stages.
            // Resolve the selection through the stage list instead of requesting
            // DataBoundItem during that incomplete binding state.
            var rowIndex = _objectiveGrid.CurrentCell?.RowIndex ?? -1;
            var stage = SelectedStage;
            return stage is not null && rowIndex >= 0 && rowIndex < stage.Objectives.Count
                ? stage.Objectives[rowIndex]
                : null;
        }
    }

    public MainForm(string projectRoot, string dataPath)
    {
        _projectRoot = projectRoot;
        _dataPath = dataPath;
        _document = QuestDataStore.Load(dataPath);
        _references = QuestReferenceProvider.Load(projectRoot);
        PrerequisiteQuestIdsEditor.SetQuestProvider(() => _document.Quests);
        InitializeWindow();
        BuildUi();
        RebuildTree();
        MarkValidationPending();
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
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Id", HeaderText = "目標 ID", FillWeight = 24 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "DisplayText", HeaderText = "顯示文字", FillWeight = 35 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Type", HeaderText = "類型", FillWeight = 24 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "TargetId", HeaderText = "判定目標 ID", FillWeight = 27 });
        _objectiveGrid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "RequiredAmount", HeaderText = "數量", FillWeight = 12 });
        _objectiveGrid.SelectionChanged += (_, _) => OnObjectiveSelectionChanged();
        _objectiveGrid.CellEnter += (_, _) => OnObjectiveSelectionChanged();
        _objectiveGrid.CellEndEdit += (_, _) => OnObjectiveGridEditCommitted();
        _objectiveGrid.DataSource = _objectiveBinding;
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
        _propertyGrid.SelectedGridItemChanged += (_, _) => UpdateReferenceList();
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
        var selected = _questTree.SelectedNode?.Tag;

        _rebuilding = true;
        try
        {
            _stageList.DataSource = null;
            _objectiveBinding.DataSource = null;
            _objectiveGrid.ClearSelection();
            _objectiveGrid.CurrentCell = null;

            if (selected is QuestDefinition quest)
            {
                _stageList.DataSource = quest.Stages;
                // 顯示任務的階段，但不要自動把右側屬性切換到第一個階段。
                _stageList.SelectedIndex = -1;
            }
        }
        finally
        {
            _rebuilding = false;
        }

        _propertyGrid.SelectedObject = selected;
        UpdateReferenceList();
    }

    private void OnStageSelectionChanged()
    {
        if (_rebuilding) return;
        if (SelectedStage is not { } stage) return;

        _rebuilding = true;
        try
        {
            _objectiveBinding.DataSource = null;
            _objectiveBinding.DataSource = stage.Objectives;
            _objectiveBinding.Position = -1;
            // 顯示階段的目標，但保留右側為階段屬性，直到使用者真的點選目標。
            _objectiveGrid.ClearSelection();
            _objectiveGrid.CurrentCell = null;
        }
        finally
        {
            _rebuilding = false;
        }

        _propertyGrid.SelectedObject = stage;
        UpdateReferenceList();
    }

    private void OnObjectiveSelectionChanged()
    {
        if (_rebuilding) return;
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
        MarkValidationPending();
    }

    private void UpdateReferenceList()
    {
        _updatingReferenceList = true;
        try
        {
            _referenceCombo.DataSource = null;
            var objective = _propertyGrid.SelectedObject as QuestObjectiveDefinition;
            var quest = _propertyGrid.SelectedObject as QuestDefinition;
            var property = _propertyGrid.SelectedGridItem?.PropertyDescriptor;
            var isActivationEventProperty = property?.Name ==
                nameof(QuestObjectiveDefinition.ActivationEventId);
            var isTeleportProperty = property?.Name is
                nameof(QuestDefinition.StartTeleportPointId) or
                nameof(QuestDefinition.CompletionTeleportPointId);
            var kind = isActivationEventProperty
                ? "StoryTrigger"
                : isTeleportProperty
                ? "TeleportPoint"
                : objective is not null
                    ? QuestValidator.ReferenceKind(objective.Type)
                    : quest?.CompletionTriggerType switch
                    {
                        QuestCompletionTriggerType.Dialogue => "Dialogue",
                        QuestCompletionTriggerType.EventFlow => "EventFlow",
                        _ => null,
                    };
            var currentId = (isActivationEventProperty || isTeleportProperty) &&
                _propertyGrid.SelectedObject is { } selectedObject
                ? property?.GetValue(selectedObject)?.ToString() ?? ""
                : objective?.TargetId ?? quest?.CompletionTriggerId ?? "";
            _referenceLabel.Text = kind is null
                ? "目前選取項目不使用外部 ID 清單"
                : $"外部{ReferenceKindDisplayName(kind)} ID 清單";
            _referenceCombo.Enabled = kind is not null;
            if (kind is null) return;

            var values = _references.Get(kind).ToList();
            if (!string.IsNullOrWhiteSpace(currentId) &&
                values.All(value => !value.Id.Equals(currentId, StringComparison.OrdinalIgnoreCase)))
            {
                values.Insert(0, new QuestReference(currentId, "目前值（外部清單找不到）"));
            }

            _referenceCombo.DataSource = values;
            var selected = values.FirstOrDefault(value =>
                value.Id.Equals(currentId, StringComparison.OrdinalIgnoreCase));
            _referenceCombo.SelectedItem = selected;
            if (selected is null) _referenceCombo.SelectedIndex = -1;
        }
        finally
        {
            _updatingReferenceList = false;
        }
    }

    private static string ReferenceKindDisplayName(string kind) => kind switch
    {
        "StoryTrigger" => "劇情觸發區",
        "Item" => "道具",
        "Interface" => "介面",
        "Interaction" => "互動區",
        "Area" => "區域",
        "Puzzle" => "解謎",
        "Dialogue" => "對話",
        "EventFlow" => "事件流程",
        "WorldObject" => "場景物件",
        "TeleportPoint" => "傳送 Point",
        "Flag" => "旗標",
        _ => kind,
    };

    private void ApplySelectedReference()
    {
        if (_rebuilding || _updatingReferenceList ||
            _referenceCombo.SelectedItem is not QuestReference reference) return;
        var property = _propertyGrid.SelectedGridItem?.PropertyDescriptor;
        if (property?.Name == nameof(QuestObjectiveDefinition.ActivationEventId))
        {
            if (_propertyGrid.SelectedObject is not QuestObjectiveDefinition objective ||
                Equals(property.GetValue(objective), reference.Id)) return;
            property.SetValue(objective, reference.Id);
            objective.ActivationMode = ObjectiveActivationMode.Event;
        }
        else if (property?.Name is nameof(QuestDefinition.StartTeleportPointId) or
            nameof(QuestDefinition.CompletionTeleportPointId))
        {
            if (_propertyGrid.SelectedObject is not { } selectedObject ||
                Equals(property.GetValue(selectedObject), reference.Id)) return;
            property.SetValue(selectedObject, reference.Id);
        }
        else if (_propertyGrid.SelectedObject is QuestObjectiveDefinition objective)
        {
            if (objective.TargetId == reference.Id) return;
            objective.TargetId = reference.Id;
        }
        else if (_propertyGrid.SelectedObject is QuestDefinition quest)
        {
            if (quest.CompletionTriggerId == reference.Id) return;
            quest.CompletionTriggerId = reference.Id;
        }
        else return;
        _propertyGrid.Refresh();
        _objectiveGrid.Refresh();
        MarkDirty();
        MarkValidationPending();
    }

    private void OnObjectiveGridEditCommitted()
    {
        if (_rebuilding) return;
        MarkDirty();
        _propertyGrid.Refresh();
        UpdateReferenceList();
        MarkValidationPending();
    }

    private void CommitPendingObjectiveEdit()
    {
        _objectiveGrid.EndEdit();
        if (_objectiveBinding.Position >= 0 && _objectiveBinding.Position < _objectiveBinding.Count)
            _objectiveBinding.EndEdit();
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
        MarkValidationPending();
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
        MarkValidationPending();
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

        _rebuilding = true;
        try
        {
            _objectiveBinding.DataSource = null;
            _objectiveBinding.DataSource = stage.Objectives;
            _objectiveBinding.Position = -1;
            _objectiveGrid.ClearSelection();
            _objectiveGrid.CurrentCell = null;

            if (selection is not null)
            {
                var index = stage.Objectives.IndexOf(selection);
                if (index >= 0)
                {
                    _objectiveBinding.Position = index;
                    _objectiveGrid.CurrentCell = _objectiveGrid.Rows[index].Cells[0];
                }
            }
        }
        finally
        {
            _rebuilding = false;
        }

        if (selection is not null)
        {
            _propertyGrid.SelectedObject = selection;
            UpdateReferenceList();
        }
        MarkDirty();
        MarkValidationPending();
    }

    private void ReloadReferences()
    {
        _references = QuestReferenceProvider.Load(_projectRoot);
        UpdateReferenceList();
        MarkValidationPending();
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

    private void MarkValidationPending()
    {
        _validationList.DataSource = null;
        _validationList.Items.Clear();
        _validationList.ForeColor = Theme.Muted;
        _statusText.Text = "資料尚未驗證；可繼續編輯，儲存、按【驗證資料】或關閉前才會檢查。";
    }

    private void ValidateDocument()
    {
        var issues = QuestValidator.Validate(_document, _references);
        DisplayValidationIssues(issues);
    }

    private void DisplayValidationIssues(IReadOnlyCollection<QuestValidationIssue> issues)
    {
        _validationList.DataSource = null;
        _validationList.DataSource = issues.ToList();
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
        DisplayValidationIssues(issues);
        QuestDataStore.Save(_dataPath, _document);
        _dirty = false;
        UpdateTitle();
        var errorCount = issues.Count(issue => issue.Severity == ValidationSeverity.Error);
        _statusText.Text = errorCount == 0
            ? $"已儲存：{_dataPath}"
            : $"已儲存草稿：{_dataPath}（仍有 {errorCount} 個錯誤，關閉前會再提醒）";
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
        MarkValidationPending();
        UpdateTitle();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        CommitPendingObjectiveEdit();
        var issues = QuestValidator.Validate(_document, _references);
        DisplayValidationIssues(issues);
        var errorCount = issues.Count(issue => issue.Severity == ValidationSeverity.Error);
        if (errorCount > 0)
        {
            var unsavedNote = _dirty ? "\n\n目前還有未儲存的變更，關閉後會一併放棄。" : "";
            if (MessageBox.Show(
                    $"任務資料仍有 {errorCount} 個錯誤。{unsavedNote}\n\n仍要關閉任務編輯器嗎？",
                    "關閉前檢查",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning) != DialogResult.Yes)
            {
                eventArgs.Cancel = true;
            }
            return;
        }

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
            if (!ReferenceEquals(_propertyGrid.SelectedObject, regressionQuest) || _stageList.SelectedIndex != -1)
                throw new InvalidOperationException("選取任務後，屬性面板被自動切換到任務階段。");

            _stageList.SelectedItem = regressionStage;
            if (!ReferenceEquals(_propertyGrid.SelectedObject, regressionStage) ||
                _objectiveGrid.CurrentCell is not null || _objectiveGrid.SelectedRows.Count != 0)
            {
                throw new InvalidOperationException("選取任務階段後，屬性面板被自動切換到第一個任務目標。");
            }

            _objectiveGrid.CurrentCell = _objectiveGrid.Rows[1].Cells[0];
            if (!ReferenceEquals(_propertyGrid.SelectedObject, regressionStage.Objectives[1]))
                throw new InvalidOperationException("點選任務目標後，屬性面板沒有切換到該目標。");

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
        var newQuest = _document.Quests[^1];
        _stageList.SelectedItem = newQuest.Stages[0];
        AddObjective();
        if (newQuest.Stages[0].Objectives.Count != 1 ||
            !ReferenceEquals(_propertyGrid.SelectedObject, newQuest.Stages[0].Objectives[0]))
        {
            throw new InvalidOperationException("新建任務選取 Stage 後直接新增 Objective 失敗。");
        }
        var incompleteObjective = newQuest.Stages[0].Objectives[0];
        var otherQuest = _document.Quests.First(quest => !ReferenceEquals(quest, newQuest));
        RebuildTree(otherQuest);
        RebuildTree(newQuest);
        _stageList.SelectedItem = newQuest.Stages[0];
        _objectiveGrid.CurrentCell = _objectiveGrid.Rows[0].Cells[0];
        Application.DoEvents();
        if (!ReferenceEquals(_propertyGrid.SelectedObject, incompleteObjective))
            throw new InvalidOperationException("切換任務後無法重新選取尚未設定完成的 Objective。");
        SaveDocument();
        if (_dirty)
            throw new InvalidOperationException("尚未設定完成的 Objective 無法儲存為草稿。");
        RebuildTree(newQuest);
        if (_questTree.Nodes.Cast<TreeNode>().SelectMany(node => node.Nodes.Cast<TreeNode>()).Count() != _document.Quests.Count)
            throw new InvalidOperationException("任務樹重新整理失敗。");
        ValidateDocument();
        if (_validationList.DataSource is null) throw new InvalidOperationException("驗證面板沒有初始化。");

        var localizedObjectiveType = TypeDescriptor.GetConverter(typeof(ObjectiveType))
            .ConvertToString(ObjectiveType.InteractionSucceeded);
        if (localizedObjectiveType != "互動成功")
            throw new InvalidOperationException("屬性選單的中文顯示轉換失敗。");
        var prerequisiteProperty = TypeDescriptor.GetProperties(typeof(QuestDefinition))[
            nameof(QuestDefinition.PrerequisiteQuestIds)];
        if (prerequisiteProperty?.GetEditor(typeof(System.Drawing.Design.UITypeEditor))
            is not PrerequisiteQuestIdsEditor)
        {
            throw new InvalidOperationException("前置任務 ID 沒有綁定專用任務選擇器。");
        }
        var localizedInterfaceType = TypeDescriptor.GetConverter(typeof(ObjectiveType))
            .ConvertToString(ObjectiveType.InterfaceOpened);
        var localizedItemUsedType = TypeDescriptor.GetConverter(typeof(ObjectiveType))
            .ConvertToString(ObjectiveType.ItemUsed);
        if (localizedInterfaceType != "開啟介面" || localizedItemUsedType != "使用道具")
            throw new InvalidOperationException("新增任務目標類型的中文顯示轉換失敗。");
        var localizedCompletionTrigger = TypeDescriptor.GetConverter(typeof(QuestCompletionTriggerType))
            .ConvertToString(QuestCompletionTriggerType.Dialogue);
        if (localizedCompletionTrigger != "播放對話")
            throw new InvalidOperationException("任務完成後觸發類型的中文顯示轉換失敗。");
        if (QuestValidator.ReferenceKind(ObjectiveType.InterfaceOpened) != "Interface" ||
            QuestValidator.ReferenceKind(ObjectiveType.ItemUsed) != "Item")
        {
            throw new InvalidOperationException("新增任務目標類型的外部 ID 清單對應失敗。");
        }
        var localizedCompletionAction = TypeDescriptor.GetConverter(typeof(CompletionInterfaceAction))
            .ConvertToString(CompletionInterfaceAction.Close);
        var registeredInterfaces = new RegisteredInterfaceIdConverter()
            .GetStandardValues()
            ?.Cast<string>()
            .ToArray() ?? Array.Empty<string>();
        if (localizedCompletionAction != "關閉" ||
            !registeredInterfaces.Contains("Inventory") ||
            !registeredInterfaces.Contains("Options"))
        {
            throw new InvalidOperationException("完成後介面操作選單初始化失敗。");
        }
    }
}
