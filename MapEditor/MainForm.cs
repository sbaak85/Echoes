using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using Echoes.AudioEventTools;

namespace Echoes.MapEditor;

public sealed class MainForm : Form
{
    private const int WmSetRedraw = 0x000B;
    private const int SidebarPanelWidth = 390;
    private const int SidebarGroupWidth = 348;
    private const int SidebarContentWidth = 325;
    private const int SidebarFieldWidth = 252;

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(
        IntPtr windowHandle,
        int message,
        IntPtr wordParameter,
        IntPtr longParameter);

    private readonly EditorCanvas _canvas = new() { Dock = DockStyle.Fill };
    private readonly Dictionary<EditorTool, ToolStripButton> _toolButtons = new();
    private readonly ListBox _layersList = new();
    private readonly TextBox _layerRenameEditor = new()
    {
        Visible = false,
        BorderStyle = BorderStyle.FixedSingle,
    };
    private readonly TextBox _sceneIdText = new();
    private readonly TextBox _displayNameText = new();
    private readonly TextBox _selectionNameText = new();
    private readonly Label _documentInfoLabel = new();
    private readonly Label _selectionInfoLabel = new();
    private readonly Button _copyLayerIdButton =
        CreateButton("", 311, 228, 24, 24);
    private readonly ToolTip _copyLayerIdToolTip = new();
    private readonly Label _zoomLabel = new();
    private readonly ToolStripStatusLabel _statusLabel = new("準備就緒");
    private readonly Dictionary<MapPageDirection, Button> _mapPageButtons = new();
    private readonly Dictionary<MapPageDirection, MapPageRecord?> _mapPageNeighbors = new();
    private readonly ToolTip _mapPageToolTip = new();
    private readonly ToolStripButton _undoButton = new("復原");
    private readonly ToolStripButton _redoButton = new("重做");
    private readonly ToolStripButton _gridButton = new("格線") { CheckOnClick = true };
    private readonly ToolStripButton _snapButton = new("吸附") { CheckOnClick = true };
    private readonly Button _insertNodeButton = CreateButton("插入 Node", 10, 354, 159, 30);
    private readonly Button _deleteNodeButton = CreateButton("刪除 Node", 176, 354, 159, 30);
    private readonly NumericUpDown _gridSizeInput = new()
    {
        Minimum = 2,
        Maximum = 256,
        Value = 18,
        Width = 55,
    };
    private readonly ComboBox _facingCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Width = 72,
    };
    private readonly ToolStripLabel _facingLabel = new("出生朝向");
    private readonly ComboBox _interactionTypeCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly TextBox _interactionVerbText = new();
    private readonly GroupBox _interactionGroup = CreateGroup("互動設定", 270);
    private readonly Label _dialogueSummaryLabel = new();
    private readonly Label _survivalSummaryLabel = new();
    private readonly Button _dialogueMoreButton = CreateButton("更多...", 176, 152, 159, 30);
    private readonly GroupBox _movementGuideGroup = CreateGroup("強制引導線設定", 112);
    private readonly NumericUpDown _movementGuideWidthInput = new()
    {
        Minimum = 4,
        Maximum = 240,
        DecimalPlaces = 0,
        Value = 36,
    };
    private readonly GroupBox _storyTriggerGroup = CreateGroup("劇情觸發區設定", 220);
    private readonly TextBox _storyTriggerDialogueIdText = new();
    private readonly NumericUpDown _storyTriggerDelayInput = new()
    {
        Minimum = 0,
        Maximum = 3600,
        DecimalPlaces = 1,
        Increment = 0.5m,
        TextAlign = HorizontalAlignment.Right,
    };
    private readonly CheckBox _storyTriggerOnceCheck = new()
    {
        Text = "只能觸發一次",
        Checked = true,
        AutoSize = true,
    };
    private readonly GroupBox _itemPointGroup = CreateGroup("ItemPoint 圖層", 378);
    private readonly ListBox _itemPointList = new();
    private readonly TextBox _itemPointNameText = new();
    private readonly ComboBox _itemPointItemCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly NumericUpDown _itemPointQuantityInput = new()
    {
        Minimum = 1,
        Maximum = 99,
        Value = 1,
    };
    private readonly ComboBox _itemPointSpawnPolicyCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly NumericUpDown _itemPointXInput = new()
    {
        Minimum = 0,
        Maximum = 100000,
        DecimalPlaces = 1,
    };
    private readonly NumericUpDown _itemPointYInput = new()
    {
        Minimum = 0,
        Maximum = 100000,
        DecimalPlaces = 1,
    };
    private readonly CheckBox _itemPointShowOnMinimapCheck = new()
    {
        Text = "在小地圖標記（僅此 ItemPoint 生成物）",
        AutoSize = true,
    };
    private readonly Button _itemPointSpawnRequirementButton =
        CreateButton("Spawn 需求設定…", 10, 283, SidebarContentWidth, 30);
    private readonly GroupBox _entryPointGroup = CreateGroup("地圖 Entry Point", 112);
    private readonly TextBox _entryPointIdText = new();
    private readonly GroupBox _teleportPointGroup = CreateGroup("傳送 Point 設定", 160);
    private readonly CheckBox _teleportBlackoutCheck = new()
    {
        Text = "使用黑幕轉場",
        AutoSize = true,
    };
    private readonly NumericUpDown _teleportBlackoutFadeInput = new()
    {
        Minimum = 0,
        Maximum = 30,
        DecimalPlaces = 1,
        Increment = 0.1m,
        Value = 0.3m,
        TextAlign = HorizontalAlignment.Right,
    };
    private readonly NumericUpDown _teleportBlackoutHoldInput = new()
    {
        Minimum = 0,
        Maximum = 3600,
        DecimalPlaces = 1,
        Increment = 0.1m,
        TextAlign = HorizontalAlignment.Right,
    };
    private readonly GroupBox _sceneConnectionGroup = CreateGroup("地圖出入口設定", 358);
    private readonly TextBox _sceneConnectionIdText = new();
    private readonly ComboBox _targetSceneCombo = new() { DropDownStyle = ComboBoxStyle.DropDown };
    private readonly ComboBox _targetEntryPointCombo = new() { DropDownStyle = ComboBoxStyle.DropDown };
    private readonly ComboBox _connectionTriggerModeCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _connectionTransitionModeCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _connectionTransferModeCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _connectionCameraFocusCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };

    private readonly string? _projectRoot;
    private string? _imagePath;
    private string? _scenePath;
    private bool _dirty;
    private bool _loading;
    private bool _syncingSelection;
    private bool _finishingLayerRename;
    private LayerSelection _layerRenameSelection = LayerSelection.None;

    internal bool SuppressUnsavedPrompt { get; init; }

    public MainForm()
    {
        _projectRoot = ProjectPaths.FindProjectRoot(AppContext.BaseDirectory);
        Text = "Echoes Map Editor";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1080, 720);
        ClientSize = new Size(1500, 920);
        KeyPreview = true;
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);

        var menu = BuildMenu();
        var toolbar = BuildToolbar();
        var status = BuildStatusBar();
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            FixedPanel = FixedPanel.Panel2,
            Panel1MinSize = 400,
            SplitterWidth = 5,
            BackColor = Color.FromArgb(48, 53, 62),
        };
        split.Panel1.Controls.Add(BuildMapWorkspace());
        split.Panel2.Controls.Add(BuildSidebar());
        var splitLayoutReady = false;
        Load += (_, _) =>
        {
            var desiredDistance = split.Width - SidebarPanelWidth - split.SplitterWidth;
            if (desiredDistance >= split.Panel1MinSize)
            {
                split.SplitterDistance = desiredDistance;
                split.Panel2MinSize = SidebarPanelWidth;
            }

            splitLayoutReady = true;
        };
        split.SizeChanged += (_, _) =>
        {
            if (!splitLayoutReady) return;
            var desiredDistance = split.Width - SidebarPanelWidth - split.SplitterWidth;
            if (desiredDistance >= split.Panel1MinSize) split.SplitterDistance = desiredDistance;
        };

        Controls.Add(split);
        Controls.Add(status);
        Controls.Add(toolbar);
        Controls.Add(menu);
        MainMenuStrip = menu;

        _facingCombo.Items.AddRange(new object[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" });
        _facingCombo.SelectedItem = "S";
        foreach (var defaults in InteractionTypeDefaults.All)
        {
            _interactionTypeCombo.Items.Add(new InteractionTypeItem(defaults.Id, defaults.Label));
        }
        _interactionTypeCombo.SelectedIndex = 0;
        _interactionTypeCombo.SelectedIndexChanged += (_, _) =>
        {
            if (_syncingSelection || _interactionTypeCombo.SelectedItem is not InteractionTypeItem item) return;
            _interactionVerbText.Text = InteractionTypeDefaults.Get(item.Id).Verb;
            _dialogueMoreButton.Enabled = true;
        };

        foreach (var item in ItemCatalog.All)
        {
            _itemPointItemCombo.Items.Add(item);
        }
        if (_itemPointItemCombo.Items.Count > 0) _itemPointItemCombo.SelectedIndex = 0;
        _itemPointSpawnPolicyCombo.Items.AddRange(new object[]
        {
            new ItemPointSpawnPolicyItem("once", "唯一生成一次"),
            new ItemPointSpawnPolicyItem("daily", "每日 06:00 重新生成"),
            new ItemPointSpawnPolicyItem("sceneEntry", "進入地圖時重新生成"),
        });
        _itemPointSpawnPolicyCombo.SelectedIndex = 0;
        _connectionTriggerModeCombo.Items.AddRange(new object[]
        {
            new ConnectionOptionItem("auto", "自動（角色進入）"),
            new ConnectionOptionItem("manual", "手動操作"),
            new ConnectionOptionItem("choice", "跳出選項確認"),
        });
        _connectionTransitionModeCombo.Items.AddRange(new object[]
        {
            new ConnectionOptionItem("seamless", "無縫滑動"),
            new ConnectionOptionItem("blackout", "黑幕轉場"),
        });
        _connectionTransferModeCombo.Items.AddRange(new object[]
        {
            new ConnectionOptionItem("teleport", "瞬移到 Entry Point"),
            new ConnectionOptionItem("pathfind", "自動尋路到 Entry Point"),
        });
        _connectionCameraFocusCombo.Items.AddRange(new object[]
        {
            new ConnectionOptionItem("player", "鏡頭對準角色"),
            new ConnectionOptionItem("sceneRoot", "鏡頭對準地圖 Root"),
        });
        _connectionTriggerModeCombo.SelectedIndex = 0;
        _connectionTransitionModeCombo.SelectedIndex = 0;
        _connectionTransferModeCombo.SelectedIndex = 0;
        _connectionCameraFocusCombo.SelectedIndex = 0;
        _targetSceneCombo.SelectedIndexChanged += (_, _) =>
        {
            if (!_syncingSelection) RefreshTargetEntryPointChoices(_targetSceneCombo.Text);
        };
        _targetSceneCombo.TextChanged += (_, _) =>
        {
            if (!_syncingSelection) RefreshTargetEntryPointChoices(_targetSceneCombo.Text);
        };

        _canvas.DocumentChanged += CanvasOnDocumentChanged;
        _canvas.SelectionChanged += (_, _) =>
        {
            RefreshSelectionUi();
            RefreshCommandState();
        };
        _canvas.ViewChanged += (_, _) => RefreshCommandState();
        _canvas.StatusChanged += (_, statusText) => _statusLabel.Text = statusText;
        _layersList.SelectedIndexChanged += LayersListOnSelectedIndexChanged;
        _layersList.MouseDoubleClick += LayersListOnMouseDoubleClick;
        _itemPointList.SelectedIndexChanged += ItemPointListOnSelectedIndexChanged;
        _itemPointList.MouseDoubleClick += (_, _) =>
        {
            _itemPointNameText.Focus();
            _itemPointNameText.SelectAll();
            _statusLabel.Text = "輸入 ItemPoint 新名稱後按套用。";
        };
        _layerRenameEditor.KeyDown += LayerRenameEditorOnKeyDown;
        _layerRenameEditor.LostFocus += (_, _) => CommitLayerRename();
        _gridButton.CheckedChanged += (_, _) =>
        {
            if (!_loading) _canvas.SetGridVisible(_gridButton.Checked);
        };
        _snapButton.CheckedChanged += (_, _) =>
        {
            if (!_loading) _canvas.SetSnap(_snapButton.Checked);
        };
        _gridSizeInput.ValueChanged += (_, _) =>
        {
            if (!_loading) _canvas.SetGridSize((int)_gridSizeInput.Value);
        };
        _facingCombo.SelectedIndexChanged += (_, _) =>
        {
            if (!_loading && _facingCombo.SelectedItem is string facing)
            {
                if (_canvas.SelectedTeleportPoint is not null)
                    _canvas.SetSelectedTeleportPointFacing(facing);
                else if (_canvas.SelectedEntryPoint is not null)
                    _canvas.SetSelectedEntryPointFacing(facing);
                else
                    _canvas.SetPlayerFacing(facing);
            }
        };

        Shown += (_, _) => LoadDefaultTemplate();
        FormClosing += OnFormClosing;
        FormClosed += (_, _) => _mapPageToolTip.Dispose();
        UpdateTitle();
    }

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip
        {
            Dock = DockStyle.Top,
            BackColor = Color.FromArgb(31, 35, 42),
            ForeColor = Color.WhiteSmoke,
            Renderer = new ToolStripProfessionalRenderer(new DarkColorTable()),
        };

        var fileMenu = new ToolStripMenuItem("檔案(&F)");
        fileMenu.DropDownItems.Add(CreateMenuItem("開啟圖片…", Keys.Control | Keys.O, (_, _) => OpenImage()));
        fileMenu.DropDownItems.Add(CreateMenuItem("開啟場景 JSON…", Keys.Control | Keys.Shift | Keys.O, (_, _) => OpenScene()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(CreateMenuItem("儲存", Keys.Control | Keys.S, (_, _) => SaveDocument()));
        fileMenu.DropDownItems.Add(CreateMenuItem("另存場景 JSON…", Keys.Control | Keys.Shift | Keys.S, (_, _) => SaveDocument(saveAs: true)));
        fileMenu.DropDownItems.Add(CreateMenuItem("匯出到遊戲", Keys.Control | Keys.E, (_, _) => ExportToGame()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(CreateMenuItem("離開", Keys.Alt | Keys.F4, (_, _) => Close()));

        var editMenu = new ToolStripMenuItem("編輯(&E)");
        editMenu.DropDownItems.Add(CreateMenuItem("復原", Keys.Control | Keys.Z, (_, _) => _canvas.Undo()));
        editMenu.DropDownItems.Add(CreateMenuItem("重做", Keys.Control | Keys.Y, (_, _) => _canvas.Redo()));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(CreateMenuItem("刪除選取項目", Keys.None, (_, _) => _canvas.DeleteSelectedNodeOrShape()));

        var viewMenu = new ToolStripMenuItem("檢視(&V)");
        viewMenu.DropDownItems.Add(CreateMenuItem("符合視窗", Keys.Control | Keys.D0, (_, _) => _canvas.FitToView()));
        viewMenu.DropDownItems.Add(CreateMenuItem("放大", Keys.Control | Keys.Add, (_, _) => _canvas.ZoomBy(1.2f)));
        viewMenu.DropDownItems.Add(CreateMenuItem("縮小", Keys.Control | Keys.Subtract, (_, _) => _canvas.ZoomBy(1f / 1.2f)));

        var toolsMenu = new ToolStripMenuItem("工具(&T)");
        toolsMenu.DropDownItems.Add(CreateMenuItem(
            "Audio Event 音效管理…",
            Keys.None,
            (_, _) => OpenAudioEventEditor()));

        menu.Items.AddRange(new ToolStripItem[] { fileMenu, editMenu, viewMenu, toolsMenu });
        return menu;
    }

    private ToolStrip BuildToolbar()
    {
        var toolbar = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            AutoSize = false,
            Height = 42,
            Padding = new Padding(6, 5, 6, 5),
            BackColor = Color.FromArgb(37, 41, 49),
            ForeColor = Color.WhiteSmoke,
            Renderer = new ToolStripProfessionalRenderer(new DarkColorTable()),
        };

        toolbar.Items.Add(CreateToolbarButton("開啟圖片", "從 Windows 選擇 PNG、JPG、WebP 等場景圖片", (_, _) => OpenImage()));
        toolbar.Items.Add(CreateToolbarButton("儲存", "儲存目前場景 JSON", (_, _) => SaveDocument()));
        toolbar.Items.Add(CreateToolbarButton("匯出遊戲", "複製圖片並輸出到 public/maps，遊戲會讀取同一份資料", (_, _) => ExportToGame()));
        toolbar.Items.Add(CreateToolbarButton(
            "Audio 音效",
            "開啟 Audio Event 音效設定管理視窗",
            (_, _) => OpenAudioEventEditor()));
        toolbar.Items.Add(new ToolStripSeparator());

        AddToolButton(toolbar, "選取", EditorTool.Select, "選取、拖曳圖形、頂點或互動 Point");
        AddToolButton(toolbar, "平移", EditorTool.Pan, "拖曳觀看場景；也可用滑鼠中鍵或 Space");
        AddToolButton(toolbar, "NavMesh", EditorTool.NavMeshPolygon, "逐點圈出可行走範圍，雙擊／右鍵／Enter 完成");
        AddToolButton(toolbar, "碰撞多邊形", EditorTool.CollisionPolygon, "逐點圈出不可通行範圍");
        AddToolButton(toolbar, "碰撞矩形", EditorTool.CollisionRectangle, "拖曳建立矩形 Collision");
        AddToolButton(toolbar, "碰撞圓形", EditorTool.CollisionCircle, "由圓心向外拖曳建立 Collision");
        AddToolButton(toolbar, "互動多邊形", EditorTool.InteractionPolygon, "逐點圈出亮黃色、非阻擋的互動範圍");
        AddToolButton(toolbar, "劇情觸發區", EditorTool.StoryTriggerPolygon, "逐點圈出紫色、踏入後自動觸發的劇情範圍");
        AddToolButton(toolbar, "強制引導線", EditorTool.MovementGuide, "逐點鋪設雙向箭頭移動引導路徑");
        AddToolButton(toolbar, "出生點", EditorTool.PlayerSpawn, "點擊設定玩家出生位置");
        AddToolButton(toolbar, "傳送點", EditorTool.TeleportPoint, "點擊新增可由任務指定的傳送 Point");
        AddToolButton(toolbar, "Entry Point", EditorTool.EntryPoint, "在 NavMesh 內新增可複數使用的地圖進入落點");
        AddToolButton(toolbar, "出入口多邊形", EditorTool.SceneExitPolygon, "圈出切換地圖的觸發範圍，完成後設定目標地圖與 Entry Point");
        toolbar.Items.Add(new ToolStripSeparator());

        _undoButton.ToolTipText = "復原 Ctrl+Z";
        _undoButton.Click += (_, _) => _canvas.Undo();
        _redoButton.ToolTipText = "重做 Ctrl+Y";
        _redoButton.Click += (_, _) => _canvas.Redo();
        toolbar.Items.Add(_undoButton);
        toolbar.Items.Add(_redoButton);
        toolbar.Items.Add(CreateToolbarButton("刪除", "刪除選取 Node；未選 Node 時刪除整個圖形", (_, _) => _canvas.DeleteSelectedNodeOrShape()));
        toolbar.Items.Add(CreateToolbarButton("圖形－", "縮小選取的預設圖形", (_, _) => _canvas.ScaleSelection(0.9f)));
        toolbar.Items.Add(CreateToolbarButton("圖形＋", "放大選取的預設圖形", (_, _) => _canvas.ScaleSelection(1.1f)));
        toolbar.Items.Add(new ToolStripSeparator());

        toolbar.Items.Add(CreateToolbarButton("－", "縮小視圖", (_, _) => _canvas.ZoomBy(1f / 1.2f)));
        toolbar.Items.Add(CreateToolbarButton("符合", "讓整張地圖符合視窗 Ctrl+0", (_, _) => _canvas.FitToView()));
        toolbar.Items.Add(CreateToolbarButton("＋", "放大視圖", (_, _) => _canvas.ZoomBy(1.2f)));
        _zoomLabel.AutoSize = false;
        _zoomLabel.Width = 48;
        _zoomLabel.TextAlign = ContentAlignment.MiddleCenter;
        toolbar.Items.Add(new ToolStripControlHost(_zoomLabel));
        toolbar.Items.Add(new ToolStripSeparator());

        _gridButton.ToolTipText = "顯示／隱藏細格線";
        _snapButton.ToolTipText = "讓頂點吸附到格線";
        toolbar.Items.Add(_gridButton);
        toolbar.Items.Add(_snapButton);
        toolbar.Items.Add(new ToolStripLabel("格距"));
        toolbar.Items.Add(new ToolStripControlHost(_gridSizeInput));
        toolbar.Items.Add(_facingLabel);
        toolbar.Items.Add(new ToolStripControlHost(_facingCombo));

        SetActiveTool(EditorTool.Select);
        return toolbar;
    }

    private StatusStrip BuildStatusBar()
    {
        var status = new StatusStrip
        {
            Dock = DockStyle.Bottom,
            BackColor = Color.FromArgb(31, 35, 42),
            ForeColor = Color.FromArgb(205, 212, 218),
            SizingGrip = false,
        };
        _statusLabel.Spring = true;
        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        status.Items.Add(_statusLabel);
        status.Items.Add(new ToolStripStatusLabel("雙擊／右鍵／Enter 完成多邊形 · Esc 取消 · 滾輪縮放 · 中鍵平移"));
        return status;
    }

    private Control BuildMapWorkspace()
    {
        var workspace = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(14, 17, 22),
        };
        workspace.Controls.Add(_canvas);

        AddMapPageArrow(workspace, MapPageDirection.Up, "▲", "上方");
        AddMapPageArrow(workspace, MapPageDirection.Right, "▶", "右方");
        AddMapPageArrow(workspace, MapPageDirection.Down, "▼", "下方");
        AddMapPageArrow(workspace, MapPageDirection.Left, "◀", "左方");
        workspace.SizeChanged += (_, _) => PositionMapPageArrows(workspace);
        PositionMapPageArrows(workspace);
        return workspace;
    }

    private void AddMapPageArrow(
        Control workspace,
        MapPageDirection direction,
        string glyph,
        string directionLabel)
    {
        var button = new Button
        {
            Text = glyph,
            AccessibleName = $"{directionLabel}地圖頁",
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(14, 17, 22),
            ForeColor = Color.FromArgb(82, 88, 98),
            Font = new Font("Segoe UI Symbol", 28, FontStyle.Bold, GraphicsUnit.Pixel),
            Cursor = Cursors.Hand,
            TabStop = false,
            UseVisualStyleBackColor = false,
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(37, 42, 50);
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(28, 32, 39);
        button.SetBounds(0, 0, 58, 58);
        button.Click += (_, _) => NavigateMapPage(direction);
        _mapPageButtons[direction] = button;
        _mapPageNeighbors[direction] = null;
        workspace.Controls.Add(button);
        button.BringToFront();
    }

    private void PositionMapPageArrows(Control workspace)
    {
        if (_mapPageButtons.Count != 4) return;
        const int edge = 8;
        var horizontalCenter = Math.Max(edge, (workspace.ClientSize.Width - 58) / 2);
        var verticalCenter = Math.Max(edge, (workspace.ClientSize.Height - 58) / 2);
        _mapPageButtons[MapPageDirection.Up].Location = new Point(horizontalCenter, edge);
        _mapPageButtons[MapPageDirection.Right].Location = new Point(
            Math.Max(edge, workspace.ClientSize.Width - 58 - edge),
            verticalCenter);
        _mapPageButtons[MapPageDirection.Down].Location = new Point(
            horizontalCenter,
            Math.Max(edge, workspace.ClientSize.Height - 58 - edge));
        _mapPageButtons[MapPageDirection.Left].Location = new Point(edge, verticalCenter);
        foreach (var button in _mapPageButtons.Values) button.BringToFront();
    }

    private Control BuildSidebar()
    {
        var sidebar = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            Padding = new Padding(10),
            BackColor = Color.FromArgb(27, 30, 37),
        };

        var sceneGroup = CreateGroup("場景資料", 178);
        AddField(sceneGroup, "地圖 ID", _sceneIdText, 28);
        AddField(sceneGroup, "顯示名稱", _displayNameText, 78);
        var applySceneButton = CreateButton("套用地圖資料", 10, 126, SidebarContentWidth, 30);
        applySceneButton.Click += (_, _) =>
        {
            _canvas.UpdateSceneIdentity(_sceneIdText.Text, _displayNameText.Text);
            RefreshMapPageNavigation();
        };
        sceneGroup.Controls.Add(applySceneButton);
        sidebar.Controls.Add(sceneGroup);

        var layersGroup = CreateGroup("向量圖層", 404);
        _documentInfoLabel.SetBounds(10, 26, SidebarContentWidth, 32);
        _documentInfoLabel.ForeColor = Color.FromArgb(155, 166, 176);
        layersGroup.Controls.Add(_documentInfoLabel);
        _layersList.SetBounds(10, 62, SidebarContentWidth, 160);
        _layersList.BackColor = Color.FromArgb(20, 23, 29);
        _layersList.ForeColor = Color.FromArgb(226, 230, 234);
        _layersList.BorderStyle = BorderStyle.FixedSingle;
        layersGroup.Controls.Add(_layersList);
        _layerRenameEditor.BackColor = Color.FromArgb(37, 42, 50);
        _layerRenameEditor.ForeColor = Color.WhiteSmoke;
        layersGroup.Controls.Add(_layerRenameEditor);
        _layerRenameEditor.BringToFront();
        _selectionInfoLabel.SetBounds(10, 230, SidebarContentWidth - 30, 22);
        _selectionInfoLabel.ForeColor = Color.FromArgb(129, 222, 211);
        layersGroup.Controls.Add(_selectionInfoLabel);
        _copyLayerIdButton.Visible = false;
        _copyLayerIdButton.AccessibleName = "複製圖層 ID";
        _copyLayerIdButton.Paint += DrawCopyLayerIdIcon;
        _copyLayerIdButton.Click += (_, _) => CopySelectedLayerId();
        _copyLayerIdToolTip.SetToolTip(_copyLayerIdButton, "複製 ID");
        layersGroup.Controls.Add(_copyLayerIdButton);
        _selectionNameText.SetBounds(10, 255, 238, 27);
        layersGroup.Controls.Add(_selectionNameText);
        var renameButton = CreateButton("重新命名", 254, 254, 81, 29);
        renameButton.Click += (_, _) => _canvas.RenameSelection(_selectionNameText.Text);
        layersGroup.Controls.Add(renameButton);
        var shrinkButton = CreateButton("縮小", 10, 294, 103, 30);
        shrinkButton.Click += (_, _) => _canvas.ScaleSelection(0.9f);
        layersGroup.Controls.Add(shrinkButton);
        var enlargeButton = CreateButton("放大", 121, 294, 103, 30);
        enlargeButton.Click += (_, _) => _canvas.ScaleSelection(1.1f);
        layersGroup.Controls.Add(enlargeButton);
        var deleteButton = CreateButton("刪除圖形", 232, 294, 103, 30);
        deleteButton.Click += (_, _) => _canvas.DeleteSelection();
        layersGroup.Controls.Add(deleteButton);
        var nodeEditLabel = new Label
        {
            Text = "Node 編輯（先點選黃色節點）",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        nodeEditLabel.SetBounds(10, 330, SidebarContentWidth, 20);
        layersGroup.Controls.Add(nodeEditLabel);
        _insertNodeButton.Enabled = false;
        _insertNodeButton.Click += (_, _) => _canvas.InsertNodeAfterSelection();
        layersGroup.Controls.Add(_insertNodeButton);
        _deleteNodeButton.Enabled = false;
        _deleteNodeButton.Click += (_, _) => _canvas.DeleteSelectedNode();
        layersGroup.Controls.Add(_deleteNodeButton);
        sidebar.Controls.Add(layersGroup);

        _teleportBlackoutCheck.SetBounds(10, 25, SidebarContentWidth, 24);
        _teleportBlackoutCheck.CheckedChanged += (_, _) =>
        {
            if (_syncingSelection) return;
            _teleportBlackoutFadeInput.Enabled = _teleportBlackoutCheck.Checked;
            _teleportBlackoutHoldInput.Enabled = _teleportBlackoutCheck.Checked;
        };
        _teleportPointGroup.Controls.Add(_teleportBlackoutCheck);
        _teleportPointGroup.Controls.Add(CreateFieldLabel("Fade IN 秒數", 10, 53, 159));
        _teleportPointGroup.Controls.Add(CreateFieldLabel("全黑停留秒數", 176, 53, 159));
        _teleportBlackoutFadeInput.SetBounds(10, 75, 159, 27);
        _teleportBlackoutHoldInput.SetBounds(176, 75, 159, 27);
        _teleportPointGroup.Controls.Add(_teleportBlackoutFadeInput);
        _teleportPointGroup.Controls.Add(_teleportBlackoutHoldInput);
        var applyTeleportBlackoutButton = CreateButton("套用傳送黑幕設定", 10, 114, SidebarContentWidth, 30);
        applyTeleportBlackoutButton.Click += (_, _) =>
        {
            _canvas.UpdateSelectedTeleportPointBlackout(
                _teleportBlackoutCheck.Checked,
                (float)_teleportBlackoutFadeInput.Value,
                (float)_teleportBlackoutHoldInput.Value);
            RefreshSelectionUi();
        };
        _teleportPointGroup.Controls.Add(applyTeleportBlackoutButton);
        _teleportPointGroup.Visible = false;
        sidebar.Controls.Add(_teleportPointGroup);

        var entryPointIdLabel = CreateFieldLabel("Point ID", 10, 31, 68);
        _entryPointIdText.SetBounds(83, 27, SidebarFieldWidth, 27);
        var applyEntryPointButton = CreateButton("套用 Entry Point ID", 10, 66, SidebarContentWidth, 30);
        applyEntryPointButton.Click += (_, _) =>
        {
            _canvas.UpdateSelectedEntryPoint(_entryPointIdText.Text);
            RefreshLayers();
            RefreshSelectionUi();
        };
        _entryPointGroup.Controls.Add(entryPointIdLabel);
        _entryPointGroup.Controls.Add(_entryPointIdText);
        _entryPointGroup.Controls.Add(applyEntryPointButton);
        _entryPointGroup.Visible = false;
        sidebar.Controls.Add(_entryPointGroup);

        AddConnectionField(_sceneConnectionGroup, "出口 ID", _sceneConnectionIdText, 28);
        AddConnectionField(_sceneConnectionGroup, "目標地圖", _targetSceneCombo, 64);
        AddConnectionField(_sceneConnectionGroup, "目標 Entry", _targetEntryPointCombo, 100);
        AddConnectionField(_sceneConnectionGroup, "啟動方式", _connectionTriggerModeCombo, 136);
        AddConnectionField(_sceneConnectionGroup, "轉場方式", _connectionTransitionModeCombo, 172);
        AddConnectionField(_sceneConnectionGroup, "角色移動", _connectionTransferModeCombo, 208);
        AddConnectionField(_sceneConnectionGroup, "鏡頭定位", _connectionCameraFocusCombo, 244);
        var connectionRequirementsButton = CreateButton("需求條件...", 10, 280, SidebarContentWidth, 30);
        connectionRequirementsButton.Click += (_, _) => OpenSceneConnectionRequirementEditor();
        _sceneConnectionGroup.Controls.Add(connectionRequirementsButton);
        var applyConnectionButton = CreateButton("套用出入口設定", 10, 318, SidebarContentWidth, 30);
        applyConnectionButton.Click += (_, _) => ApplySceneConnectionSettings();
        _sceneConnectionGroup.Controls.Add(applyConnectionButton);
        _sceneConnectionGroup.Visible = false;
        sidebar.Controls.Add(_sceneConnectionGroup);

        var typeLabel = new Label { Text = "互動類型", AutoSize = false, ForeColor = Color.FromArgb(152, 163, 174) };
        typeLabel.SetBounds(10, 30, 70, 24);
        _interactionTypeCombo.SetBounds(83, 27, SidebarFieldWidth, 27);
        _interactionGroup.Controls.Add(typeLabel);
        _interactionGroup.Controls.Add(_interactionTypeCombo);
        var verbLabel = new Label { Text = "提示動詞", AutoSize = false, ForeColor = Color.FromArgb(152, 163, 174) };
        verbLabel.SetBounds(10, 68, 70, 24);
        _interactionVerbText.SetBounds(83, 65, SidebarFieldWidth, 27);
        _interactionGroup.Controls.Add(verbLabel);
        _interactionGroup.Controls.Add(_interactionVerbText);
        _dialogueSummaryLabel.SetBounds(10, 100, SidebarContentWidth, 22);
        _dialogueSummaryLabel.ForeColor = Color.FromArgb(155, 166, 176);
        _interactionGroup.Controls.Add(_dialogueSummaryLabel);
        _survivalSummaryLabel.SetBounds(10, 124, SidebarContentWidth, 38);
        _survivalSummaryLabel.ForeColor = Color.FromArgb(129, 222, 211);
        _interactionGroup.Controls.Add(_survivalSummaryLabel);
        var applyInteractionButton = CreateButton("套用設定", 10, 164, 159, 30);
        applyInteractionButton.Click += (_, _) => ApplyInteractionSettings();
        _interactionGroup.Controls.Add(applyInteractionButton);
        _dialogueMoreButton.SetBounds(176, 164, 159, 30);
        _dialogueMoreButton.Click += (_, _) => OpenDialogueEditor();
        _interactionGroup.Controls.Add(_dialogueMoreButton);
        var survivalButton = CreateButton("需求與完成效果...", 10, 202, SidebarContentWidth, 30);
        survivalButton.Click += (_, _) => OpenSurvivalEffectEditor();
        _interactionGroup.Controls.Add(survivalButton);
        var resetLabel = new Label
        {
            Text = "需求、完成效果與複數道具獎勵請由上方按鈕設定",
            AutoSize = false,
            ForeColor = Color.FromArgb(130, 140, 150),
        };
        resetLabel.SetBounds(10, 240, SidebarContentWidth, 22);
        _interactionGroup.Controls.Add(resetLabel);
        _interactionGroup.Visible = false;
        sidebar.Controls.Add(_interactionGroup);

        var guideWidthLabel = new Label
        {
            Text = "生效寬度",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        guideWidthLabel.SetBounds(10, 32, 70, 24);
        _movementGuideWidthInput.SetBounds(83, 28, SidebarFieldWidth, 27);
        _movementGuideGroup.Controls.Add(guideWidthLabel);
        _movementGuideGroup.Controls.Add(_movementGuideWidthInput);
        var applyGuideButton = CreateButton("套用引導寬度", 10, 66, SidebarContentWidth, 30);
        applyGuideButton.Click += (_, _) =>
            _canvas.UpdateSelectedMovementGuideWidth((float)_movementGuideWidthInput.Value);
        _movementGuideGroup.Controls.Add(applyGuideButton);
        _movementGuideGroup.Visible = false;
        sidebar.Controls.Add(_movementGuideGroup);

        var storyDialogueLabel = new Label
        {
            Text = "對話 ID",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        storyDialogueLabel.SetBounds(10, 30, 70, 24);
        _storyTriggerDialogueIdText.SetBounds(83, 27, SidebarFieldWidth, 27);
        var storyDelayLabel = new Label
        {
            Text = "觸發延遲（秒）",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        storyDelayLabel.SetBounds(10, 65, 105, 24);
        _storyTriggerDelayInput.SetBounds(118, 62, 217, 27);
        _storyTriggerOnceCheck.SetBounds(83, 96, 150, 24);
        var applyStoryTriggerButton = CreateButton("套用劇情觸發設定", 10, 130, SidebarContentWidth, 30);
        applyStoryTriggerButton.Click += (_, _) =>
        {
            _canvas.UpdateSelectedStoryTrigger(
                _storyTriggerDialogueIdText.Text,
                _storyTriggerOnceCheck.Checked,
                (float)_storyTriggerDelayInput.Value);
            RefreshLayers();
            RefreshSelectionUi();
        };
        _storyTriggerGroup.Controls.Add(storyDialogueLabel);
        _storyTriggerGroup.Controls.Add(_storyTriggerDialogueIdText);
        _storyTriggerGroup.Controls.Add(storyDelayLabel);
        _storyTriggerGroup.Controls.Add(_storyTriggerDelayInput);
        _storyTriggerGroup.Controls.Add(_storyTriggerOnceCheck);
        _storyTriggerGroup.Controls.Add(applyStoryTriggerButton);
        var storyTriggerEffectsButton = CreateButton("需求與完成效果...", 10, 166, SidebarContentWidth, 30);
        storyTriggerEffectsButton.Click += (_, _) => OpenStoryTriggerEffectEditor();
        _storyTriggerGroup.Controls.Add(storyTriggerEffectsButton);
        _storyTriggerGroup.Visible = false;
        sidebar.Controls.Add(_storyTriggerGroup);

        _itemPointList.SetBounds(10, 28, SidebarContentWidth, 82);
        _itemPointList.BackColor = Color.FromArgb(20, 23, 29);
        _itemPointList.ForeColor = Color.FromArgb(226, 230, 234);
        _itemPointList.BorderStyle = BorderStyle.FixedSingle;
        _itemPointGroup.Controls.Add(_itemPointList);
        var itemPointNameLabel = new Label
        {
            Text = "名稱",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        itemPointNameLabel.SetBounds(10, 120, 52, 24);
        _itemPointNameText.SetBounds(62, 117, 273, 27);
        _itemPointGroup.Controls.Add(itemPointNameLabel);
        _itemPointGroup.Controls.Add(_itemPointNameText);
        var itemPointItemLabel = new Label
        {
            Text = "道具",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        itemPointItemLabel.SetBounds(10, 154, 52, 24);
        _itemPointItemCombo.SetBounds(62, 151, 273, 27);
        _itemPointGroup.Controls.Add(itemPointItemLabel);
        _itemPointGroup.Controls.Add(_itemPointItemCombo);
        var itemPointQuantityLabel = new Label
        {
            Text = "數量",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        itemPointQuantityLabel.SetBounds(10, 188, 52, 24);
        _itemPointQuantityInput.SetBounds(62, 185, 58, 27);
        _itemPointSpawnPolicyCombo.SetBounds(126, 185, 209, 27);
        _itemPointGroup.Controls.Add(itemPointQuantityLabel);
        _itemPointGroup.Controls.Add(_itemPointQuantityInput);
        _itemPointGroup.Controls.Add(_itemPointSpawnPolicyCombo);
        var itemPointPositionLabel = new Label
        {
            Text = "座標",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        itemPointPositionLabel.SetBounds(10, 222, 52, 24);
        _itemPointXInput.SetBounds(62, 219, 130, 27);
        _itemPointYInput.SetBounds(205, 219, 130, 27);
        _itemPointGroup.Controls.Add(itemPointPositionLabel);
        _itemPointGroup.Controls.Add(_itemPointXInput);
        _itemPointGroup.Controls.Add(_itemPointYInput);
        _itemPointShowOnMinimapCheck.SetBounds(10, 253, SidebarContentWidth, 24);
        _itemPointGroup.Controls.Add(_itemPointShowOnMinimapCheck);
        _itemPointSpawnRequirementButton.Click += (_, _) => EditItemPointSpawnRequirement();
        _itemPointGroup.Controls.Add(_itemPointSpawnRequirementButton);
        var applyItemPointButton = CreateButton("套用 ItemPoint", 10, 323, 215, 30);
        applyItemPointButton.Click += (_, _) => ApplyItemPointSettings();
        var deleteItemPointButton = CreateButton("刪除", 232, 323, 103, 30);
        deleteItemPointButton.Click += (_, _) =>
        {
            if (_canvas.Selection.Kind != SceneLayerKind.ItemPoint) return;
            _canvas.DeleteSelection();
        };
        _itemPointGroup.Controls.Add(applyItemPointButton);
        _itemPointGroup.Controls.Add(deleteItemPointButton);
        sidebar.Controls.Add(_itemPointGroup);

        var futureGroup = CreateGroup("地圖頁切換", 142);
        var futureLabel = new Label
        {
            AutoSize = false,
        };
        futureLabel.SetBounds(10, 27, SidebarContentWidth, 98);
        futureLabel.Text = "畫布四周箭頭可切換上下左右地圖頁。\r\n亮白：已有地圖；暗灰：按下後可確認新增。\r\nEntry Point 與出入口多邊形已可設定；\r\n遊戲端切圖與鏡頭轉場留待下一版。";
        futureLabel.ForeColor = Color.FromArgb(130, 140, 150);
        futureGroup.Controls.Add(futureLabel);
        sidebar.Controls.Add(futureGroup);

        var helpGroup = CreateGroup("快速操作", 236);
        var helpLabel = new Label
        {
            AutoSize = false,
            Text =
                "NavMesh／多邊形：逐點點擊，雙擊、右鍵或 Enter 完成。\r\n\r\n" +
                "矩形／圓形：按住滑鼠拖曳。\r\n\r\n" +
                "選取：拖曳整個圖形；拖曳黃色節點可修正頂點或圓形半徑；互動 Point 可直接點住搬移。\r\n\r\n" +
                "Node：點選後按 Del 刪除；在多邊形邊線按右鍵可新增 Node。\r\n\r\n" +
                "滾輪縮放，中鍵或 Space 拖曳平移。",
            ForeColor = Color.FromArgb(176, 184, 192),
        };
        helpLabel.SetBounds(10, 27, SidebarContentWidth, 190);
        helpGroup.Controls.Add(helpLabel);
        sidebar.Controls.Add(helpGroup);

        ApplyDarkInputs(sidebar);
        return sidebar;
    }

    private void RefreshMapPageNavigation()
    {
        var catalog = _projectRoot is null
            ? Array.Empty<MapPageRecord>()
            : MapPageNavigation.LoadCatalog(
                Path.Combine(_projectRoot, "public", "maps"));

        foreach (var direction in Enum.GetValues<MapPageDirection>())
        {
            var neighbor = _imagePath is null
                ? null
                : MapPageNavigation.FindNeighbor(
                    _canvas.Document,
                    _scenePath,
                    direction,
                    catalog);
            _mapPageNeighbors[direction] = neighbor;

            if (!_mapPageButtons.TryGetValue(direction, out var button)) continue;
            var hasNeighbor = neighbor is not null;
            button.ForeColor = hasNeighbor
                ? Color.WhiteSmoke
                : Color.FromArgb(82, 88, 98);
            button.AccessibleDescription = hasNeighbor
                ? $"切換到 {neighbor!.Document.SceneId}"
                : $"{MapPageNavigation.GetChineseDirection(direction)}目前沒有地圖，按一下可新增";
            _mapPageToolTip.SetToolTip(
                button,
                hasNeighbor
                    ? $"{MapPageNavigation.GetChineseDirection(direction)}：{neighbor!.Document.SceneId}"
                    : $"{MapPageNavigation.GetChineseDirection(direction)}尚無地圖資料，按一下新增");
        }
    }

    internal void RunMapPageNavigationUiSelfTest()
    {
        RefreshMapPageNavigation();
        foreach (var direction in Enum.GetValues<MapPageDirection>())
        {
            var hasNeighbor = _mapPageNeighbors[direction] is not null;
            var expectedColor = hasNeighbor
                ? Color.WhiteSmoke
                : Color.FromArgb(82, 88, 98);
            if (!_mapPageButtons.TryGetValue(direction, out var button) ||
                button.ForeColor != expectedColor ||
                !button.Enabled)
            {
                throw new InvalidOperationException(
                    $"地圖頁 {direction} 箭頭沒有呈現正確的可切換／可新增狀態。");
            }
        }
    }

    private void NavigateMapPage(MapPageDirection direction)
    {
        if (_imagePath is null)
        {
            MessageBox.Show(
                this,
                "請先開啟一張場景圖片。",
                "尚未載入地圖",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        RefreshMapPageNavigation();
        if (_mapPageNeighbors[direction] is { } neighbor)
        {
            if (!ConfirmDiscardChanges()) return;
            LoadSceneFile(neighbor.ScenePath);
            return;
        }

        CreateAdjacentMapPage(direction);
    }

    private void CreateAdjacentMapPage(MapPageDirection direction)
    {
        if (_projectRoot is null || _imagePath is null) return;
        var directionLabel = MapPageNavigation.GetChineseDirection(direction);
        var confirmation = MessageBox.Show(
            this,
            $"{directionLabel}目前沒有地圖資料。\r\n\r\n是否選擇一張圖片並建立新的地圖頁？",
            "建立相鄰地圖頁",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (confirmation != DialogResult.Yes || !ConfirmDiscardChanges()) return;

        using var dialog = new OpenFileDialog
        {
            Title = $"選擇{directionLabel}新地圖的底圖",
            Filter = ImageLoader.FileDialogFilter,
            CheckFileExists = true,
            Multiselect = false,
            InitialDirectory = Path.Combine(_projectRoot, "Assets", "map"),
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        Bitmap? image = null;
        try
        {
            image = ImageLoader.Load(dialog.FileName);
            var mapsDirectory = Path.Combine(_projectRoot, "public", "maps");
            Directory.CreateDirectory(mapsDirectory);
            var imageTarget = Path.Combine(
                mapsDirectory,
                Path.GetFileName(dialog.FileName));
            var sceneTarget = Path.Combine(
                mapsDirectory,
                $"{Path.GetFileNameWithoutExtension(dialog.FileName)}.scene.json");
            if (File.Exists(sceneTarget))
            {
                MessageBox.Show(
                    this,
                    $"{Path.GetFileName(sceneTarget)} 已經存在，但不在目前地圖的{directionLabel}。\r\n\r\n請改選其他圖片，或先調整既有地圖頁的位置。",
                    "地圖資料已存在",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            if (!PathsEqual(dialog.FileName, imageTarget))
            {
                if (File.Exists(imageTarget) && !FilesMatch(dialog.FileName, imageTarget))
                {
                    var overwrite = MessageBox.Show(
                        this,
                        $"遊戲資料夾已有同名圖片 {Path.GetFileName(imageTarget)}，要覆蓋嗎？",
                        "確認覆蓋圖片",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Warning);
                    if (overwrite != DialogResult.Yes) return;
                }
                File.Copy(dialog.FileName, imageTarget, overwrite: true);
            }

            var document = SceneDocument.CreateForImage(
                imageTarget,
                image.Width,
                image.Height);
            document.SceneId = CreateUniqueMapId(
                Path.GetFileNameWithoutExtension(dialog.FileName));
            document.DisplayName = document.SceneId;
            document.WorldLayout = MapPageNavigation.CreateAdjacentLayout(
                _canvas.Document,
                image.Width,
                image.Height,
                direction);
            SceneJson.Save(sceneTarget, document);

            ApplyLoadedScene(document, image, imageTarget, sceneTarget);
            image = null; // EditorCanvas owns the bitmap after a successful load.
            _statusLabel.Text =
                $"已建立 {directionLabel}地圖頁 {document.SceneId}；可在右側隨時修改地圖 ID。";
        }
        catch (Exception exception)
        {
            ShowError("無法建立相鄰地圖頁", exception);
        }
        finally
        {
            image?.Dispose();
        }
    }

    private string CreateUniqueMapId(string requestedId)
    {
        if (_projectRoot is null) return requestedId;
        var catalog = MapPageNavigation.LoadCatalog(
            Path.Combine(_projectRoot, "public", "maps"));
        var usedIds = catalog
            .Select(record => record.Document.SceneId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!usedIds.Contains(requestedId)) return requestedId;
        for (var suffix = 2; suffix < 10000; suffix++)
        {
            var candidate = $"{requestedId}_{suffix}";
            if (!usedIds.Contains(candidate)) return candidate;
        }
        return $"{requestedId}_{Guid.NewGuid():N}";
    }

    private void LoadDefaultTemplate()
    {
        if (_projectRoot is null || _imagePath is not null) return;
        var template = Path.Combine(_projectRoot, "Assets", "map", "map_test01.png");
        if (File.Exists(template)) LoadImageFile(template, promptForUnsavedChanges: false);
    }

    private void OpenImage()
    {
        if (!ConfirmDiscardChanges()) return;
        using var dialog = new OpenFileDialog
        {
            Title = "開啟場景圖片",
            Filter = ImageLoader.FileDialogFilter,
            CheckFileExists = true,
            Multiselect = false,
            InitialDirectory = _projectRoot is null
                ? Environment.GetFolderPath(Environment.SpecialFolder.MyPictures)
                : Path.Combine(_projectRoot, "Assets", "map"),
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            LoadImageFile(dialog.FileName, promptForUnsavedChanges: false);
        }
    }

    private void OpenScene()
    {
        if (!ConfirmDiscardChanges()) return;
        using var dialog = new OpenFileDialog
        {
            Title = "開啟 Echoes 場景 JSON",
            Filter = "Echoes 場景|*.scene.json|JSON 檔案|*.json|所有檔案|*.*",
            CheckFileExists = true,
            InitialDirectory = _projectRoot is null
                ? Environment.CurrentDirectory
                : Path.Combine(_projectRoot, "public", "maps"),
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            LoadSceneFile(dialog.FileName);
        }
    }

    private void LoadImageFile(string imagePath, bool promptForUnsavedChanges)
    {
        if (promptForUnsavedChanges && !ConfirmDiscardChanges()) return;

        try
        {
            var image = ImageLoader.Load(imagePath);
            var scenePath = FindSceneForImage(imagePath);
            SceneDocument document;

            if (scenePath is not null)
            {
                document = SceneJson.Load(scenePath);
                SceneJson.Validate(document);
            }
            else
            {
                document = SceneDocument.CreateForImage(imagePath, image.Width, image.Height);
            }

            document.Image.File = Path.GetFileName(imagePath);
            document.Image.Width = image.Width;
            document.Image.Height = image.Height;
            if (document.World.Width <= 0 || document.World.Height <= 0)
            {
                document.World.Width = image.Width;
                document.World.Height = image.Height;
            }

            ApplyLoadedScene(document, image, imagePath, scenePath);
            _statusLabel.Text = scenePath is null
                ? "已建立新場景，請開始鋪設 NavMesh 與 Collision"
                : $"已載入 {Path.GetFileName(scenePath)}";
        }
        catch (Exception exception)
        {
            ShowError("無法開啟圖片", exception);
        }
    }

    private void LoadSceneFile(string scenePath)
    {
        try
        {
            var document = SceneJson.Load(scenePath);
            SceneJson.Validate(document);
            var imagePath = FindImageForScene(scenePath, document.Image.File);
            if (imagePath is null)
            {
                MessageBox.Show(
                    this,
                    $"找不到場景圖片 {document.Image.File}。請先用「開啟圖片」載入原圖。",
                    "找不到圖片",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            var image = ImageLoader.Load(imagePath);
            ApplyLoadedScene(document, image, imagePath, scenePath);
            _statusLabel.Text = $"已載入 {Path.GetFileName(scenePath)}";
        }
        catch (Exception exception)
        {
            ShowError("無法開啟場景 JSON", exception);
        }
    }

    private void ApplyLoadedScene(
        SceneDocument document,
        Bitmap image,
        string imagePath,
        string? scenePath)
    {
        _loading = true;
        try
        {
            _imagePath = Path.GetFullPath(imagePath);
            _scenePath = scenePath is null ? null : Path.GetFullPath(scenePath);
            _canvas.SetScene(document, image);
            _gridButton.Checked = document.Grid.Visible;
            _snapButton.Checked = document.Grid.Snap;
            _gridSizeInput.Value = Math.Clamp(document.Grid.Size, (int)_gridSizeInput.Minimum, (int)_gridSizeInput.Maximum);
            _facingCombo.SelectedItem = document.PlayerSpawn.Facing;
            _sceneIdText.Text = document.SceneId;
            _displayNameText.Text = document.DisplayName;
            _dirty = false;
            RefreshLayers();
            RefreshSelectionUi();
            RefreshCommandState();
            RefreshMapPageNavigation();
            UpdateTitle();
        }
        finally
        {
            _loading = false;
        }
    }

    private bool SaveDocument(bool saveAs = false)
    {
        if (_imagePath is null)
        {
            MessageBox.Show(this, "請先開啟場景圖片。", "尚未載入圖片", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }

        if (!saveAs && _scenePath is null && _projectRoot is not null)
        {
            return ExportToGame();
        }

        var targetPath = _scenePath;
        if (saveAs || targetPath is null)
        {
            using var dialog = new SaveFileDialog
            {
                Title = "儲存 Echoes 場景 JSON",
                Filter = "Echoes 場景|*.scene.json|JSON 檔案|*.json",
                FileName = $"{Path.GetFileNameWithoutExtension(_imagePath)}.scene.json",
                InitialDirectory = _scenePath is not null
                    ? Path.GetDirectoryName(_scenePath)
                    : Path.GetDirectoryName(_imagePath),
                AddExtension = true,
                DefaultExt = "scene.json",
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return false;
            targetPath = dialog.FileName;
        }

        try
        {
            PrepareDocumentForSave(_imagePath);
            ValidateConnectionTargets();
            SceneJson.Save(targetPath!, _canvas.Document);
            _scenePath = Path.GetFullPath(targetPath!);
            _dirty = false;
            _statusLabel.Text = $"已儲存 {Path.GetFileName(targetPath)}";
            RefreshMapPageNavigation();
            UpdateTitle();
            return true;
        }
        catch (Exception exception)
        {
            ShowError("無法儲存場景", exception);
            return false;
        }
    }

    private bool ExportToGame()
    {
        if (_imagePath is null)
        {
            MessageBox.Show(this, "請先開啟場景圖片。", "尚未載入圖片", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }

        if (_projectRoot is null)
        {
            MessageBox.Show(
                this,
                "找不到 Echoes 專案的 public/maps 資料夾，請改用「另存場景 JSON」。",
                "找不到遊戲專案",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return false;
        }

        try
        {
            var mapsDirectory = Path.Combine(_projectRoot, "public", "maps");
            Directory.CreateDirectory(mapsDirectory);
            var imageTarget = Path.Combine(mapsDirectory, Path.GetFileName(_imagePath));
            if (!PathsEqual(_imagePath, imageTarget))
            {
                if (File.Exists(imageTarget) && !FilesMatch(_imagePath, imageTarget))
                {
                    var overwrite = MessageBox.Show(
                        this,
                        $"遊戲資料夾已有同名圖片 {Path.GetFileName(imageTarget)}，要覆蓋嗎？",
                        "確認覆蓋圖片",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Warning);
                    if (overwrite != DialogResult.Yes) return false;
                }

                File.Copy(_imagePath, imageTarget, overwrite: true);
            }

            PrepareDocumentForSave(imageTarget);
            ValidateConnectionTargets();
            var sceneTarget = Path.Combine(mapsDirectory, $"{Path.GetFileNameWithoutExtension(_imagePath)}.scene.json");
            SceneJson.Save(sceneTarget, _canvas.Document);
            _scenePath = sceneTarget;
            _dirty = false;
            _statusLabel.Text = $"已匯出到遊戲：public/maps/{Path.GetFileName(sceneTarget)}";
            RefreshMapPageNavigation();
            UpdateTitle();
            return true;
        }
        catch (Exception exception)
        {
            ShowError("無法匯出到遊戲", exception);
            return false;
        }
    }

    private void ValidateConnectionTargets()
    {
        SceneJson.Validate(_canvas.Document);
        if (_canvas.Document.Connections.Count == 0) return;
        if (_projectRoot is null)
        {
            throw new InvalidDataException("包含地圖出入口時，必須從 Echoes 專案內儲存以驗證目標地圖。");
        }
        var catalog = MapPageNavigation.LoadCatalog(
            Path.Combine(_projectRoot, "public", "maps"));
        foreach (var connection in _canvas.Document.Connections)
        {
            var target = catalog.FirstOrDefault(page => page.Document.SceneId.Equals(
                connection.TargetSceneId,
                StringComparison.OrdinalIgnoreCase));
            if (target is null)
            {
                throw new InvalidDataException(
                    $"出入口 {connection.Id} 找不到目標地圖 {connection.TargetSceneId}。");
            }
            if (!target.Document.EntryPoints.Any(point => point.Id.Equals(
                    connection.TargetEntryPointId,
                    StringComparison.OrdinalIgnoreCase)))
            {
                throw new InvalidDataException(
                    $"出入口 {connection.Id} 找不到目標 Entry Point {connection.TargetEntryPointId}。");
            }
        }
    }

    private void PrepareDocumentForSave(string imagePath)
    {
        _canvas.UpdateSceneIdentity(_sceneIdText.Text, _displayNameText.Text);
        _canvas.Document.Image.File = Path.GetFileName(imagePath);
        if (_canvas.Document.Image.Width <= 0 || _canvas.Document.Image.Height <= 0)
        {
            using var image = ImageLoader.Load(imagePath);
            _canvas.Document.Image.Width = image.Width;
            _canvas.Document.Image.Height = image.Height;
        }
    }

    private string? FindSceneForImage(string imagePath)
    {
        var baseName = Path.GetFileNameWithoutExtension(imagePath);
        var adjacent = Path.Combine(Path.GetDirectoryName(imagePath)!, $"{baseName}.scene.json");
        if (File.Exists(adjacent)) return adjacent;

        if (_projectRoot is not null)
        {
            var gameScene = Path.Combine(_projectRoot, "public", "maps", $"{baseName}.scene.json");
            if (File.Exists(gameScene)) return gameScene;
        }

        return null;
    }

    private string? FindImageForScene(string scenePath, string imageFile)
    {
        var candidates = new List<string>
        {
            Path.Combine(Path.GetDirectoryName(scenePath)!, imageFile),
        };
        if (_projectRoot is not null)
        {
            candidates.Add(Path.Combine(_projectRoot, "public", "maps", imageFile));
            candidates.Add(Path.Combine(_projectRoot, "Assets", "map", imageFile));
        }

        return candidates.FirstOrDefault(File.Exists);
    }

    private void CanvasOnDocumentChanged(object? sender, EventArgs e)
    {
        if (!_loading) _dirty = true;
        RefreshLayers();
        RefreshDocumentUi();
        RefreshCommandState();
        UpdateTitle();
    }

    private void RefreshDocumentUi()
    {
        _sceneIdText.Text = _canvas.Document.SceneId;
        _displayNameText.Text = _canvas.Document.DisplayName;
        _documentInfoLabel.Text =
            $"NavMesh {_canvas.Document.NavMesh.Count} · Collision {_canvas.Document.Collisions.Count} · 互動 {_canvas.Document.Interactables.Count} · Entry {_canvas.Document.EntryPoints.Count} · 出入口 {_canvas.Document.Connections.Count}";
        var previousLoadingState = _loading;
        _loading = true;
        try
        {
            _gridButton.Checked = _canvas.Document.Grid.Visible;
            _snapButton.Checked = _canvas.Document.Grid.Snap;
            _gridSizeInput.Value = Math.Clamp(
                _canvas.Document.Grid.Size,
                (int)_gridSizeInput.Minimum,
                (int)_gridSizeInput.Maximum);
            _facingCombo.SelectedItem = _canvas.SelectedTeleportPoint?.Facing
                ?? _canvas.SelectedEntryPoint?.Facing
                ?? _canvas.Document.PlayerSpawn.Facing;
        }
        finally
        {
            _loading = previousLoadingState;
        }
    }

    private void RefreshLayers()
    {
        _syncingSelection = true;
        try
        {
            _layersList.BeginUpdate();
            _itemPointList.BeginUpdate();
            _layersList.Items.Clear();
            _itemPointList.Items.Clear();
            for (var index = 0; index < _canvas.Document.NavMesh.Count; index++)
            {
                var region = _canvas.Document.NavMesh[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.NavMesh, index),
                    $"[NavMesh] {region.Label}  ({region.Points.Count}點)",
                    region.Label));
            }

            for (var index = 0; index < _canvas.Document.Collisions.Count; index++)
            {
                var collision = _canvas.Document.Collisions[index];
                var shape = collision.Shape switch
                {
                    "circle" => "圓形",
                    "rectangle" => "矩形",
                    _ => "多邊形",
                };
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.Collision, index),
                    $"[Collision/{shape}] {collision.Label}",
                    collision.Label));
            }

            for (var index = 0; index < _canvas.Document.Interactables.Count; index++)
            {
                var interactable = _canvas.Document.Interactables[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.Interactable, index),
                    $"[互動/{interactable.Verb}] {interactable.Label} · ID {interactable.Id}  ({interactable.Points.Count}點)",
                    interactable.Label));
            }

            for (var index = 0; index < _canvas.Document.StoryTriggers.Count; index++)
            {
                var trigger = _canvas.Document.StoryTriggers[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.StoryTrigger, index),
                    $"[劇情觸發區/{(trigger.Once ? "一次" : "重複")}] {trigger.Label}  ({trigger.Points.Count}點)",
                    trigger.Label));
            }

            for (var index = 0; index < _canvas.Document.MovementGuides.Count; index++)
            {
                var guide = _canvas.Document.MovementGuides[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.MovementGuide, index),
                    $"[雙向引導/{Math.Round(guide.Width)}px] {guide.Label}  ({guide.Points.Count}點)",
                    guide.Label));
            }

            for (var index = 0; index < _canvas.Document.TeleportPoints.Count; index++)
            {
                var point = _canvas.Document.TeleportPoints[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.TeleportPoint, index),
                    $"[傳送 Point/{point.Facing}] {point.Label} · {point.Id}",
                    point.Label));
            }

            for (var index = 0; index < _canvas.Document.EntryPoints.Count; index++)
            {
                var point = _canvas.Document.EntryPoints[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.EntryPoint, index),
                    $"[Entry/{point.Facing}] {point.Label} · {point.Id}",
                    point.Label));
            }

            for (var index = 0; index < _canvas.Document.Connections.Count; index++)
            {
                var connection = _canvas.Document.Connections[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.SceneConnection, index),
                    $"[出入口/{connection.TriggerMode}] {connection.Label} → {connection.TargetSceneId} / {connection.TargetEntryPointId}",
                    connection.Label));
            }

            for (var index = 0; index < _canvas.Document.ItemPoints.Count; index++)
            {
                var itemPoint = _canvas.Document.ItemPoints[index];
                var selection = new LayerSelection(SceneLayerKind.ItemPoint, index);
                var item = ItemCatalog.Find(itemPoint.ItemId);
                var policy = FormatItemPointSpawnPolicy(itemPoint.SpawnPolicy);
                var listItem = new LayerListItem(
                    selection,
                    $"[ItemPoint/{policy}] ID {itemPoint.Id} · {itemPoint.Label} · {itemPoint.ItemId} ×{itemPoint.Quantity}",
                    itemPoint.Label);
                _layersList.Items.Add(listItem);
                _itemPointList.Items.Add(new LayerListItem(
                    selection,
                    $"{itemPoint.Label} · {item?.Name ?? itemPoint.ItemId} ×{itemPoint.Quantity}",
                    itemPoint.Label));
            }

            var selectedItem = _layersList.Items
                .Cast<LayerListItem>()
                .FirstOrDefault(item => item.Selection == _canvas.Selection);
            _layersList.SelectedItem = selectedItem;
            _itemPointList.SelectedItem = _itemPointList.Items
                .Cast<LayerListItem>()
                .FirstOrDefault(item => item.Selection == _canvas.Selection);
            _itemPointList.SelectedItem = _itemPointList.Items
                .Cast<LayerListItem>()
                .FirstOrDefault(item => item.Selection == _canvas.Selection);
            _layersList.EndUpdate();
            _itemPointList.EndUpdate();
            RefreshDocumentUi();
        }
        finally
        {
            _syncingSelection = false;
        }
    }

    private void RefreshSelectionUi()
    {
        _syncingSelection = true;
        try
        {
            _copyLayerIdButton.Visible = false;
            _selectionInfoLabel.Width = SidebarContentWidth;
            var selectedItem = _layersList.Items
                .Cast<LayerListItem>()
                .FirstOrDefault(item => item.Selection == _canvas.Selection);
            _layersList.SelectedItem = selectedItem;

            if (_canvas.Selection.Kind == SceneLayerKind.NavMesh && _canvas.Selection.Index >= 0)
            {
                var region = _canvas.Document.NavMesh[_canvas.Selection.Index];
                var node = _canvas.SelectedVertexIndex >= 0
                    ? $" · Node {_canvas.SelectedVertexIndex + 1}"
                    : "";
                _selectionInfoLabel.Text = $"已選取 NavMesh · {region.Id}{node}";
                _selectionNameText.Text = region.Label;
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.Collision && _canvas.Selection.Index >= 0)
            {
                var collision = _canvas.Document.Collisions[_canvas.Selection.Index];
                var node = _canvas.SelectedVertexIndex >= 0
                    ? $" · Node {_canvas.SelectedVertexIndex + 1}"
                    : "";
                _selectionInfoLabel.Text = $"已選取 Collision · {collision.Id}{node}";
                _selectionNameText.Text = collision.Label;
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.Interactable && _canvas.Selection.Index >= 0)
            {
                var interactable = _canvas.Document.Interactables[_canvas.Selection.Index];
                var node = _canvas.SelectedVertexIndex >= 0
                    ? $" · Node {_canvas.SelectedVertexIndex + 1}"
                    : "";
                _selectionInfoLabel.Text = $"互動 ID：{interactable.Id}{node}";
                _selectionNameText.Text = interactable.Label;
                _interactionVerbText.Text = interactable.Verb;
                _interactionTypeCombo.SelectedIndex = Math.Max(
                    0,
                    InteractionTypeDefaults.All
                        .Select((item, index) => new { item.Id, Index = index })
                        .FirstOrDefault(item => item.Id.Equals(interactable.Type, StringComparison.OrdinalIgnoreCase))
                        ?.Index ?? 0);
                _dialogueSummaryLabel.Text =
                    $"可互動 {(interactable.SkipSuccessDialogue ? "直接結算" : $"{interactable.Dialogue.Lines.Count} 句")} · 不可互動 {interactable.FailureDialogue.Lines.Count} · 生存不足 {interactable.SurvivalFailureDialogue?.Lines.Count ?? 0} · 完成後 {interactable.CompletionDialogue?.Lines.Count ?? 0} 句";
                var effects = interactable.SurvivalEffects;
                var limit = interactable.InteractionLimitMode == "once"
                    ? "唯一一次"
                    : interactable.DailyInteractionLimit is int dailyLimitValue
                        ? $"每日 {dailyLimitValue} 次"
                        : "無限";
                var timeEffect = effects.JumpToTimeMinutes is int targetTimeMinutes
                    ? $"跳到 {effects.JumpDayOffset} 天後 " +
                      $"{targetTimeMinutes / 60:00}:{targetTimeMinutes % 60:00}"
                    : $"時{effects.TimeMinutes / 60:0.#}h";
                _survivalSummaryLabel.Text =
                    $"需求 {FormatRequirements(interactable.SurvivalRequirements)} · 物/章/任務 {interactable.UseRequirements?.Count ?? 0}" +
                    $" · 未達可嘗試 {(interactable.AllowAttemptWhenRequirementsUnmet ? "是" : "否")}\r\n" +
                    $"效果 體{effects.Stamina:+0.#;-0.#;0} 餓{effects.Hunger:+0.#;-0.#;0} 渴{effects.Thirst:+0.#;-0.#;0} 精{effects.Spirit:+0.#;-0.#;0} {timeEffect} · {limit} · 獎勵 {interactable.ItemRewards?.Count ?? (interactable.ItemReward is null ? 0 : 1)} 種";
                _dialogueMoreButton.Enabled = true;
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.StoryTrigger && _canvas.Selection.Index >= 0)
            {
                var trigger = _canvas.Document.StoryTriggers[_canvas.Selection.Index];
                var node = _canvas.SelectedVertexIndex >= 0
                    ? $" · Node {_canvas.SelectedVertexIndex + 1}"
                    : "";
                _selectionInfoLabel.Text = $"目前選取：劇情觸發區 · {trigger.Id}{node} · 對話 {trigger.DialogueId}";
                _selectionNameText.Text = trigger.Label;
                _storyTriggerDialogueIdText.Text = trigger.DialogueId;
                _storyTriggerDelayInput.Value = Math.Clamp(
                    (decimal)trigger.TriggerDelaySeconds,
                    _storyTriggerDelayInput.Minimum,
                    _storyTriggerDelayInput.Maximum);
                _storyTriggerOnceCheck.Checked = trigger.Once;
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.MovementGuide && _canvas.Selection.Index >= 0)
            {
                var guide = _canvas.Document.MovementGuides[_canvas.Selection.Index];
                var node = _canvas.SelectedVertexIndex >= 0
                    ? $" · Node {_canvas.SelectedVertexIndex + 1}"
                    : "";
                _selectionInfoLabel.Text = $"已選取強制引導線 · {guide.Id}{node}";
                _selectionNameText.Text = guide.Label;
                _movementGuideWidthInput.Value = Math.Clamp(
                    (decimal)guide.Width,
                    _movementGuideWidthInput.Minimum,
                    _movementGuideWidthInput.Maximum);
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.ItemPoint && _canvas.Selection.Index >= 0)
            {
                var itemPoint = _canvas.Document.ItemPoints[_canvas.Selection.Index];
                _selectionInfoLabel.Text = $"ItemPoint ID：{itemPoint.Id}";
                _selectionNameText.Text = itemPoint.Label;
                _itemPointNameText.Text = itemPoint.Label;
                _itemPointItemCombo.SelectedIndex = Math.Max(
                    0,
                    _itemPointItemCombo.Items
                        .Cast<ItemCatalogEntry>()
                        .Select((item, index) => new { item.Id, Index = index })
                        .FirstOrDefault(item => item.Id.Equals(
                            itemPoint.ItemId,
                            StringComparison.OrdinalIgnoreCase))
                        ?.Index ?? 0);
                _itemPointQuantityInput.Value = Math.Clamp(
                    itemPoint.Quantity,
                    (int)_itemPointQuantityInput.Minimum,
                    (int)_itemPointQuantityInput.Maximum);
                _itemPointSpawnPolicyCombo.SelectedIndex = Math.Max(
                    0,
                    _itemPointSpawnPolicyCombo.Items
                        .Cast<ItemPointSpawnPolicyItem>()
                        .Select((item, index) => new { item.Id, Index = index })
                        .FirstOrDefault(item => item.Id.Equals(
                            itemPoint.SpawnPolicy,
                            StringComparison.OrdinalIgnoreCase))
                        ?.Index ?? 0);
                _itemPointXInput.Value = Math.Clamp(
                    (decimal)itemPoint.X,
                    _itemPointXInput.Minimum,
                    _itemPointXInput.Maximum);
                _itemPointYInput.Value = Math.Clamp(
                    (decimal)itemPoint.Y,
                    _itemPointYInput.Minimum,
                    _itemPointYInput.Maximum);
                _itemPointShowOnMinimapCheck.Checked = itemPoint.ShowOnMinimap;
                _itemPointSpawnRequirementButton.Text =
                    FormatItemPointSpawnRequirement(itemPoint.SpawnRequirement);
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.TeleportPoint && _canvas.Selection.Index >= 0)
            {
                var point = _canvas.Document.TeleportPoints[_canvas.Selection.Index];
                _selectionInfoLabel.Text = $"已選取傳送 Point · {point.Id} · 面向 {point.Facing}";
                _selectionNameText.Text = point.Label;
                _facingCombo.SelectedItem = point.Facing;
                _teleportBlackoutCheck.Checked = point.BlackoutEnabled;
                _teleportBlackoutFadeInput.Value = Math.Clamp(
                    (decimal)point.BlackoutFadeSeconds,
                    _teleportBlackoutFadeInput.Minimum,
                    _teleportBlackoutFadeInput.Maximum);
                _teleportBlackoutHoldInput.Value = Math.Clamp(
                    (decimal)point.BlackoutHoldSeconds,
                    _teleportBlackoutHoldInput.Minimum,
                    _teleportBlackoutHoldInput.Maximum);
                _teleportBlackoutFadeInput.Enabled = point.BlackoutEnabled;
                _teleportBlackoutHoldInput.Enabled = point.BlackoutEnabled;
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.EntryPoint && _canvas.Selection.Index >= 0)
            {
                var point = _canvas.Document.EntryPoints[_canvas.Selection.Index];
                _selectionInfoLabel.Text = $"已選取地圖 Entry Point · {point.Id} · 面向 {point.Facing}";
                _selectionNameText.Text = point.Label;
                _entryPointIdText.Text = point.Id;
                _facingCombo.SelectedItem = point.Facing;
            }
            else if (_canvas.Selection.Kind == SceneLayerKind.SceneConnection && _canvas.Selection.Index >= 0)
            {
                var connection = _canvas.Document.Connections[_canvas.Selection.Index];
                var node = _canvas.SelectedVertexIndex >= 0
                    ? $" · Node {_canvas.SelectedVertexIndex + 1}"
                    : "";
                _selectionInfoLabel.Text = $"已選取地圖出入口 · {connection.Id}{node}";
                _selectionNameText.Text = connection.Label;
                _sceneConnectionIdText.Text = connection.Id;
                RefreshTargetSceneChoices(connection.TargetSceneId);
                RefreshTargetEntryPointChoices(
                    connection.TargetSceneId,
                    connection.TargetEntryPointId);
                SelectConnectionOption(_connectionTriggerModeCombo, connection.TriggerMode);
                SelectConnectionOption(_connectionTransitionModeCombo, connection.TransitionMode);
                SelectConnectionOption(_connectionTransferModeCombo, connection.TransferMode);
                SelectConnectionOption(_connectionCameraFocusCombo, connection.CameraFocus);
            }
            else
            {
                _selectionInfoLabel.Text = "尚未選取圖形";
                _selectionNameText.Text = "";
            }
            RefreshLayerIdCopyButton();
            _mapPageToolTip.SetToolTip(_selectionInfoLabel, _selectionInfoLabel.Text);
            _interactionGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.Interactable;
            _movementGuideGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.MovementGuide;
            _storyTriggerGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.StoryTrigger;
            _teleportPointGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.TeleportPoint;
            _entryPointGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.EntryPoint;
            _sceneConnectionGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.SceneConnection;
            _facingLabel.Text = _canvas.Selection.Kind switch
            {
                SceneLayerKind.TeleportPoint => "傳送朝向",
                SceneLayerKind.EntryPoint => "Entry 朝向",
                _ => "出生朝向",
            };
        }
        finally
        {
            _syncingSelection = false;
        }
    }

    private void RefreshLayerIdCopyButton()
    {
        var layerId = GetSelectedCopyableLayerId();
        var canCopy = !string.IsNullOrWhiteSpace(layerId);
        _copyLayerIdButton.Visible = canCopy;
        _copyLayerIdButton.Enabled = canCopy;
        _selectionInfoLabel.Width = canCopy
            ? SidebarContentWidth - 30
            : SidebarContentWidth;
    }

    private string GetSelectedCopyableLayerId()
    {
        var selection = _canvas.Selection;
        if (selection.Index < 0) return "";

        return selection.Kind switch
        {
            SceneLayerKind.Interactable when selection.Index < _canvas.Document.Interactables.Count =>
                _canvas.Document.Interactables[selection.Index].Id?.Trim() ?? "",
            SceneLayerKind.StoryTrigger when selection.Index < _canvas.Document.StoryTriggers.Count =>
                _canvas.Document.StoryTriggers[selection.Index].Id?.Trim() ?? "",
            SceneLayerKind.SceneConnection when selection.Index < _canvas.Document.Connections.Count =>
                _canvas.Document.Connections[selection.Index].Id?.Trim() ?? "",
            SceneLayerKind.ItemPoint when selection.Index < _canvas.Document.ItemPoints.Count =>
                _canvas.Document.ItemPoints[selection.Index].Id?.Trim() ?? "",
            _ => "",
        };
    }

    private void CopySelectedLayerId()
    {
        var layerId = GetSelectedCopyableLayerId();
        if (string.IsNullOrWhiteSpace(layerId))
        {
            _statusLabel.Text = "目前選取的圖層沒有可複製的 ID。";
            return;
        }

        try
        {
            Clipboard.SetText(layerId);
            _statusLabel.Text = $"已複製圖層 ID：{layerId}";
        }
        catch (ExternalException)
        {
            _statusLabel.Text = "剪貼簿目前忙碌，請稍後再試。";
        }
    }

    private static void DrawCopyLayerIdIcon(object? sender, PaintEventArgs e)
    {
        if (sender is not Button button) return;
        using var pen = new Pen(
            button.Enabled ? Color.FromArgb(192, 235, 230) : Color.FromArgb(105, 116, 122),
            1.5f);
        e.Graphics.DrawRectangle(pen, 8, 5, 9, 11);
        e.Graphics.DrawRectangle(pen, 5, 8, 9, 11);
    }

    private void LayersListOnSelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_syncingSelection) return;
        _canvas.SelectLayer(
            _layersList.SelectedItem is LayerListItem item
                ? item.Selection
                : LayerSelection.None);
    }

    private void ItemPointListOnSelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_syncingSelection) return;
        if (_itemPointList.SelectedItem is not LayerListItem item) return;
        _canvas.SelectLayer(item.Selection);
    }

    private void ApplySceneConnectionSettings()
    {
        if (_canvas.SelectedSceneConnection is null)
        {
            _statusLabel.Text = "請先選取地圖出入口多邊形。";
            return;
        }
        _canvas.UpdateSelectedSceneConnection(
            _sceneConnectionIdText.Text,
            _targetSceneCombo.Text,
            _targetEntryPointCombo.Text,
            SelectedConnectionOption(_connectionTriggerModeCombo, "auto"),
            SelectedConnectionOption(_connectionTransitionModeCombo, "seamless"),
            SelectedConnectionOption(_connectionTransferModeCombo, "teleport"),
            SelectedConnectionOption(_connectionCameraFocusCombo, "player"));
        RefreshLayers();
        RefreshSelectionUi();
    }

    private void OpenSceneConnectionRequirementEditor()
    {
        var connection = _canvas.SelectedSceneConnection;
        if (connection is null)
        {
            _statusLabel.Text = "請先選取地圖出入口多邊形。";
            return;
        }

        var requirements = connection.SurvivalRequirements?.Clone()
            ?? new SurvivalRequirements();
        var useRequirements = connection.UseRequirements?
            .Select(requirement => requirement.Clone())
            .ToArray() ?? Array.Empty<InteractionUseRequirement>();
        var quests = QuestCatalog.Load(_projectRoot);
        SetCanvasRedraw(false);
        try
        {
            using var editor = new SurvivalEffectEditorForm(
                "interaction",
                requirements,
                new SurvivalEffects(),
                null,
                "unlimited",
                useRequirements,
                Array.Empty<InteractionItemReward>(),
                quests,
                showAllowAttemptOption: false,
                showEffectsPage: false);
            if (editor.ShowDialog(this) != DialogResult.OK) return;
            _canvas.UpdateSelectedSceneConnectionRequirements(
                editor.Requirements,
                editor.UseRequirements);
        }
        finally
        {
            SetCanvasRedraw(true);
        }
        RefreshSelectionUi();
    }

    private void RefreshTargetSceneChoices(string selectedSceneId)
    {
        _targetSceneCombo.Items.Clear();
        if (_projectRoot is not null)
        {
            foreach (var page in MapPageNavigation.LoadCatalog(
                         Path.Combine(_projectRoot, "public", "maps")))
            {
                if (page.Document.SceneId.Equals(
                        _canvas.Document.SceneId,
                        StringComparison.OrdinalIgnoreCase)) continue;
                _targetSceneCombo.Items.Add(page.Document.SceneId);
            }
        }
        _targetSceneCombo.Text = selectedSceneId;
    }

    private void RefreshTargetEntryPointChoices(string targetSceneId, string? selectedEntryPointId = null)
    {
        selectedEntryPointId ??= _targetEntryPointCombo.Text;
        _targetEntryPointCombo.Items.Clear();
        if (_projectRoot is not null)
        {
            var page = MapPageNavigation.LoadCatalog(
                    Path.Combine(_projectRoot, "public", "maps"))
                .FirstOrDefault(candidate => candidate.Document.SceneId.Equals(
                    targetSceneId.Trim(),
                    StringComparison.OrdinalIgnoreCase));
            if (page is not null)
            {
                foreach (var entryPoint in page.Document.EntryPoints)
                {
                    _targetEntryPointCombo.Items.Add(entryPoint.Id);
                }
            }
        }
        _targetEntryPointCombo.Text = selectedEntryPointId;
    }

    private static string SelectedConnectionOption(ComboBox comboBox, string fallback) =>
        comboBox.SelectedItem is ConnectionOptionItem option ? option.Id : fallback;

    private static void SelectConnectionOption(ComboBox comboBox, string id)
    {
        comboBox.SelectedIndex = Math.Max(
            0,
            comboBox.Items
                .Cast<ConnectionOptionItem>()
                .Select((item, index) => new { item.Id, Index = index })
                .FirstOrDefault(item => item.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
                ?.Index ?? 0);
    }

    private void ApplyItemPointSettings()
    {
        var itemPoint = _canvas.SelectedItemPoint;
        if (
            itemPoint is null ||
            _itemPointItemCombo.SelectedItem is not ItemCatalogEntry item ||
            _itemPointSpawnPolicyCombo.SelectedItem is not ItemPointSpawnPolicyItem policy)
        {
            _statusLabel.Text = "請先在 ItemPoint 圖層清單選取一個項目。";
            return;
        }
        var label = _itemPointNameText.Text.Trim();
        if (label.Length == 0) label = itemPoint.Label;
        _canvas.RenameSelection(label);
        _canvas.UpdateSelectedItemPoint(
            (float)_itemPointXInput.Value,
            (float)_itemPointYInput.Value,
            item.Id,
            (int)_itemPointQuantityInput.Value,
            policy.Id,
            _itemPointShowOnMinimapCheck.Checked);
        _statusLabel.Text =
            $"已套用 {label}：{item.Id} ×{_itemPointQuantityInput.Value} · {policy.Label}";
        RefreshLayers();
        RefreshSelectionUi();
    }

    private void EditItemPointSpawnRequirement()
    {
        var itemPoint = _canvas.SelectedItemPoint;
        if (itemPoint is null)
        {
            _statusLabel.Text = "請先在 ItemPoint 圖層清單選取一個項目。";
            return;
        }
        using var editor = new ItemPointSpawnRequirementEditorForm(
            QuestCatalog.Load(_projectRoot),
            itemPoint.SpawnRequirement);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        _canvas.UpdateSelectedItemPointSpawnRequirement(editor.Requirement);
        _statusLabel.Text = editor.Requirement is null
            ? $"{itemPoint.Label} 已取消任務階段 Spawn 限制。"
            : $"{itemPoint.Label} 已設定 {editor.Requirement.StageMode}：{editor.Requirement.StageId}";
        RefreshLayers();
        RefreshSelectionUi();
    }

    private static string FormatItemPointSpawnRequirement(
        ItemPointSpawnRequirement? requirement)
    {
        if (requirement is null) return "Spawn 需求設定…（未限制）";
        var mode = requirement.StageMode == "UnlockFromStage"
            ? "到達後持續"
            : "僅指定階段";
        return $"Spawn 需求…（{mode}）";
    }

    private static string FormatItemPointSpawnPolicy(string policy) => policy switch
    {
        "daily" => "每日",
        "sceneEntry" => "進圖",
        _ => "一次",
    };

    private void LayersListOnMouseDoubleClick(object? sender, MouseEventArgs e)
    {
        var itemIndex = _layersList.IndexFromPoint(e.Location);
        BeginLayerRename(itemIndex);
    }

    private bool BeginLayerRename(int itemIndex)
    {
        if (
            itemIndex < 0 ||
            itemIndex >= _layersList.Items.Count ||
            _layersList.Items[itemIndex] is not LayerListItem item
        )
        {
            return false;
        }

        _layersList.SelectedIndex = itemIndex;
        var itemBounds = _layersList.GetItemRectangle(itemIndex);
        _layerRenameSelection = item.Selection;
        _layerRenameEditor.Text = item.Label;
        _layerRenameEditor.SetBounds(
            _layersList.Left + itemBounds.Left + 1,
            _layersList.Top + itemBounds.Top,
            Math.Max(80, itemBounds.Width - 2),
            Math.Max(22, itemBounds.Height));
        _layerRenameEditor.Visible = true;
        _layerRenameEditor.BringToFront();
        _layerRenameEditor.Focus();
        _layerRenameEditor.SelectAll();
        _statusLabel.Text = "輸入新名稱後按 Enter；按 Esc 可取消。";
        return true;
    }

    private void LayerRenameEditorOnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            e.Handled = true;
            e.SuppressKeyPress = true;
            CommitLayerRename();
        }
        else if (e.KeyCode == Keys.Escape)
        {
            e.Handled = true;
            e.SuppressKeyPress = true;
            CancelLayerRename();
        }
    }

    private void CommitLayerRename()
    {
        if (!_layerRenameEditor.Visible || _finishingLayerRename) return;

        var selection = _layerRenameSelection;
        var label = _layerRenameEditor.Text.Trim();
        FinishLayerRenameEditor();
        if (label.Length == 0)
        {
            _statusLabel.Text = "名稱不能空白，已保留原名稱。";
            return;
        }

        _canvas.SelectLayer(selection);
        _canvas.RenameSelection(label);
        _statusLabel.Text = $"已重新命名為「{label}」。";
    }

    private void CancelLayerRename()
    {
        if (!_layerRenameEditor.Visible || _finishingLayerRename) return;
        FinishLayerRenameEditor();
        _statusLabel.Text = "已取消重新命名。";
    }

    private void FinishLayerRenameEditor()
    {
        _finishingLayerRename = true;
        try
        {
            _layerRenameEditor.Visible = false;
            _layerRenameSelection = LayerSelection.None;
            _layersList.Focus();
        }
        finally
        {
            _finishingLayerRename = false;
        }
    }

    internal void RunLayerRenameUiSelfTest()
    {
        var layerKinds = new[]
        {
            SceneLayerKind.NavMesh,
            SceneLayerKind.Collision,
            SceneLayerKind.Interactable,
            SceneLayerKind.StoryTrigger,
            SceneLayerKind.MovementGuide,
            SceneLayerKind.EntryPoint,
            SceneLayerKind.SceneConnection,
        };

        foreach (var kind in layerKinds)
        {
            var item = _layersList.Items
                .Cast<LayerListItem>()
                .FirstOrDefault(candidate => candidate.Selection.Kind == kind)
                ?? throw new InvalidDataException($"Layer rename UI self-test is missing {kind}.");
            var itemIndex = _layersList.Items.IndexOf(item);
            var originalLabel = item.Label;
            var testLabel = $"{originalLabel} rename test";
            if (!BeginLayerRename(itemIndex))
            {
                throw new InvalidOperationException($"Could not begin renaming {kind}.");
            }

            _layerRenameEditor.Text = testLabel;
            CommitLayerRename();
            if (!GetLayerLabel(item.Selection).Equals(testLabel, StringComparison.Ordinal))
            {
                throw new InvalidDataException($"Double-click rename failed for {kind}.");
            }

            _canvas.SelectLayer(item.Selection);
            _canvas.RenameSelection(originalLabel);
        }

        var copyableLayerKinds = new[]
        {
            SceneLayerKind.Interactable,
            SceneLayerKind.StoryTrigger,
            SceneLayerKind.SceneConnection,
            SceneLayerKind.ItemPoint,
        };
        foreach (var kind in copyableLayerKinds)
        {
            var item = _layersList.Items
                .Cast<LayerListItem>()
                .First(candidate => candidate.Selection.Kind == kind);
            _canvas.SelectLayer(item.Selection);
            RefreshSelectionUi();
            var selectedLayerId = GetSelectedCopyableLayerId();
            if (!_copyLayerIdButton.Visible ||
                !_copyLayerIdButton.Enabled ||
                _copyLayerIdButton.Size != new Size(24, 24) ||
                !_selectionInfoLabel.Text.Contains(selectedLayerId, StringComparison.Ordinal) ||
                _selectionInfoLabel.Width < SidebarContentWidth - 30 ||
                !_copyLayerIdButton.AccessibleName.Equals("複製圖層 ID", StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"{kind} 圖層選取時沒有同時顯示完整 ID 與複製按鈕。");
            }
            if (kind == SceneLayerKind.ItemPoint &&
                TextRenderer.MeasureText(
                    _selectionInfoLabel.Text,
                    _selectionInfoLabel.Font).Width > _selectionInfoLabel.ClientSize.Width)
            {
                throw new InvalidOperationException("ItemPoint Scene 唯一 ID 超出選取資訊欄位寬度。");
            }
        }

        var itemPointSelection = _layersList.Items
            .Cast<LayerListItem>()
            .First(candidate => candidate.Selection.Kind == SceneLayerKind.ItemPoint)
            .Selection;
        var itemPoint = _canvas.Document.ItemPoints[itemPointSelection.Index];
        var originalItemPointId = itemPoint.Id;
        try
        {
            itemPoint.Id = " ";
            _canvas.SelectLayer(itemPointSelection);
            RefreshSelectionUi();
            if (_copyLayerIdButton.Visible || _copyLayerIdButton.Enabled)
            {
                throw new InvalidOperationException("沒有 ID 的 ItemPoint 不應顯示複製按鈕。");
            }
        }
        finally
        {
            itemPoint.Id = originalItemPointId;
            RefreshSelectionUi();
        }
    }

    private string GetLayerLabel(LayerSelection selection) => selection.Kind switch
    {
        SceneLayerKind.NavMesh => _canvas.Document.NavMesh[selection.Index].Label,
        SceneLayerKind.Collision => _canvas.Document.Collisions[selection.Index].Label,
        SceneLayerKind.Interactable => _canvas.Document.Interactables[selection.Index].Label,
        SceneLayerKind.StoryTrigger => _canvas.Document.StoryTriggers[selection.Index].Label,
        SceneLayerKind.MovementGuide => _canvas.Document.MovementGuides[selection.Index].Label,
        SceneLayerKind.TeleportPoint => _canvas.Document.TeleportPoints[selection.Index].Label,
        SceneLayerKind.EntryPoint => _canvas.Document.EntryPoints[selection.Index].Label,
        SceneLayerKind.SceneConnection => _canvas.Document.Connections[selection.Index].Label,
        SceneLayerKind.ItemPoint => _canvas.Document.ItemPoints[selection.Index].Label,
        _ => "",
    };

    private void ApplyInteractionSettings()
    {
        if (_canvas.SelectedInteractable is null) return;
        var type = (_interactionTypeCombo.SelectedItem as InteractionTypeItem)?.Id ?? "dialogue";
        _canvas.UpdateSelectedInteractable(type, _interactionVerbText.Text);
        RefreshLayers();
        RefreshSelectionUi();
    }

    private void OpenDialogueEditor()
    {
        var interactable = _canvas.SelectedInteractable;
        if (interactable is null) return;
        using var editor = new DialogueEditorForm(
            interactable.Dialogue,
            interactable.FailureDialogue,
            interactable.SurvivalFailureDialogue,
            interactable.CompletionDialogue,
            interactable.SkipSuccessDialogue);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        _canvas.UpdateSelectedDialogues(
            editor.SuccessDialogue,
            editor.FailureDialogue,
            editor.SurvivalFailureDialogue,
            editor.CompletionDialogue,
            editor.SkipSuccessDialogue);
        RefreshSelectionUi();
    }

    private void OpenSurvivalEffectEditor()
    {
        var selectedInteractable = _canvas.SelectedInteractable;
        if (selectedInteractable is null) return;
        var selectedType = (_interactionTypeCombo.SelectedItem as InteractionTypeItem)?.Id ?? selectedInteractable.Type;
        var requirements = selectedInteractable.SurvivalRequirements.Clone();
        var effects = selectedInteractable.SurvivalEffects.Clone();
        var dailyLimit = selectedInteractable.DailyInteractionLimit;
        var interactionLimitMode = selectedInteractable.InteractionLimitMode;
        var useRequirements = selectedInteractable.UseRequirements?
            .Select(requirement => requirement.Clone())
            .ToArray() ?? Array.Empty<InteractionUseRequirement>();
        var itemRewards = selectedInteractable.ItemRewards?
            .Select(reward => reward.Clone())
            .ToArray() ?? (selectedInteractable.ItemReward is null
                ? Array.Empty<InteractionItemReward>()
                : new[] { selectedInteractable.ItemReward.Clone() });
        var quests = QuestCatalog.Load(_projectRoot);
        SetCanvasRedraw(false);
        try
        {
            using var editor = new SurvivalEffectEditorForm(
                selectedType,
                requirements,
                effects,
                dailyLimit,
                interactionLimitMode,
                useRequirements,
                itemRewards,
                quests,
                allowAttemptWhenRequirementsUnmet:
                    selectedInteractable.AllowAttemptWhenRequirementsUnmet,
                teleportPoints: _canvas.Document.TeleportPoints,
                completionTeleportPointId:
                    selectedInteractable.CompletionTeleportPointId,
                completionTeleportDelaySeconds:
                    selectedInteractable.CompletionTeleportDelaySeconds,
                showCompletionTeleportOption: true);
            if (editor.ShowDialog(this) != DialogResult.OK) return;
            _canvas.UpdateSelectedInteractionConfiguration(
                selectedType,
                _interactionVerbText.Text,
                editor.Requirements,
                editor.Effects,
                editor.DailyLimit,
                editor.InteractionLimitMode,
                editor.UseRequirements,
                editor.ItemRewards,
                editor.AllowAttemptWhenRequirementsUnmet,
                editor.CompletionTeleportPointId,
                editor.CompletionTeleportDelaySeconds);
        }
        finally
        {
            SetCanvasRedraw(true);
        }
        RefreshSelectionUi();
    }

    private void OpenStoryTriggerEffectEditor()
    {
        var trigger = _canvas.SelectedStoryTrigger;
        if (trigger is null) return;
        var useRequirements = trigger.UseRequirements?
            .Select(requirement => requirement.Clone())
            .ToArray() ?? Array.Empty<InteractionUseRequirement>();
        var itemRewards = trigger.ItemRewards?
            .Select(reward => reward.Clone())
            .ToArray() ?? (trigger.ItemReward is null
                ? Array.Empty<InteractionItemReward>()
                : new[] { trigger.ItemReward.Clone() });
        var quests = QuestCatalog.Load(_projectRoot);
        var objectives = QuestCatalog.LoadObjectives(_projectRoot);
        SetCanvasRedraw(false);
        try
        {
            using var editor = new SurvivalEffectEditorForm(
                "dialogue",
                trigger.SurvivalRequirements.Clone(),
                trigger.SurvivalEffects.Clone(),
                trigger.DailyInteractionLimit,
                trigger.Once ? "once" : trigger.InteractionLimitMode,
                useRequirements,
                itemRewards,
                quests,
                trigger.StartQuestIds,
                showQuestStartOptions: true,
                showAllowAttemptOption: false,
                objectives: objectives,
                activateObjectiveIds: trigger.ActivateObjectiveIds);
            editor.Text = "劇情觸發需求與完成效果";
            if (editor.ShowDialog(this) != DialogResult.OK) return;
            _canvas.UpdateSelectedStoryTriggerConfiguration(
                editor.Requirements,
                editor.Effects,
                editor.DailyLimit,
                editor.InteractionLimitMode,
                editor.UseRequirements,
                editor.ItemRewards,
                editor.StartQuestIds,
                editor.ActivateObjectiveIds);
        }
        finally
        {
            SetCanvasRedraw(true);
        }
        RefreshLayers();
        RefreshSelectionUi();
    }

    private void SetCanvasRedraw(bool enabled)
    {
        if (_canvas.IsDisposed || !_canvas.IsHandleCreated) return;
        SendMessage(
            _canvas.Handle,
            WmSetRedraw,
            enabled ? new IntPtr(1) : IntPtr.Zero,
            IntPtr.Zero);
        if (enabled) _canvas.RequestFastRender();
    }

    private static string FormatRequirements(SurvivalRequirements requirements)
    {
        var values = new List<string>();
        AddRequirement(values, "體", requirements.Stamina);
        AddRequirement(values, "餓", requirements.Hunger);
        AddRequirement(values, "渴", requirements.Thirst);
        AddRequirement(values, "精", requirements.Spirit);
        if (values.Count == 0) return "無";
        var mode = "any".Equals(requirements.Mode, StringComparison.OrdinalIgnoreCase)
            ? "任一"
            : "全部";
        return $"{mode}｜{string.Join(" ", values)}";
    }

    private static void AddRequirement(
        ICollection<string> values,
        string label,
        SurvivalRequirementRule? requirement)
    {
        if (requirement is null) return;
        var comparison = requirement.Comparison.Equals(
            "below",
            StringComparison.OrdinalIgnoreCase)
            ? "<"
            : requirement.Comparison.Equals("atMost", StringComparison.OrdinalIgnoreCase)
                ? "≤"
                : "≥";
        values.Add($"{label}{comparison}{requirement.Value:0.#}");
    }

    private void OpenAudioEventEditor()
    {
        if (_projectRoot is null)
        {
            MessageBox.Show(
                this,
                "找不到 Echoes 專案根目錄，無法定位 app/audio-event-manager.ts。",
                "無法開啟 Audio Event",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        try
        {
            using var editor = new AudioEventEditorForm(_projectRoot);
            editor.ShowDialog(this);
        }
        catch (Exception exception)
        {
            ShowError("無法開啟 Audio Event", exception);
        }
    }

    private void RefreshCommandState()
    {
        _undoButton.Enabled = _canvas.CanUndo;
        _redoButton.Enabled = _canvas.CanRedo;
        _insertNodeButton.Enabled = _canvas.CanInsertNode;
        _deleteNodeButton.Enabled = _canvas.CanDeleteNode;
        _zoomLabel.Text = $"{Math.Round(_canvas.Zoom * 100)}%";
    }

    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        if (keyData == Keys.Delete && _canvas.ContainsFocus)
        {
            _canvas.DeleteSelectedNodeOrShape();
            return true;
        }

        return base.ProcessCmdKey(ref message, keyData);
    }

    private void SetActiveTool(EditorTool tool)
    {
        _canvas.Tool = tool;
        foreach (var pair in _toolButtons)
        {
            pair.Value.Checked = pair.Key == tool;
        }

        _statusLabel.Text = tool switch
        {
            EditorTool.Select => "選取工具：拖曳圖形、黃色頂點或互動 Point；Alt＋左鍵循環重疊圖形；右鍵可直接指定圖層",
            EditorTool.Pan => "平移工具：拖曳畫布",
            EditorTool.NavMeshPolygon => "NavMesh：逐點圈出可行走範圍",
            EditorTool.CollisionPolygon => "Collision：逐點圈出不可通行範圍",
            EditorTool.CollisionRectangle => "矩形 Collision：按住滑鼠拖曳範圍",
            EditorTool.CollisionCircle => "圓形 Collision：從中心向外拖曳",
            EditorTool.InteractionPolygon => "互動區域：逐點圈出範圍；右鍵可設定互動 Point 與互動提示點",
            EditorTool.StoryTriggerPolygon => "劇情觸發區：逐點圈出踏入後自動啟動劇情的範圍",
            EditorTool.MovementGuide => "強制引導線：逐點鋪設，雙擊／右鍵／Enter 完成（至少 2 點）",
            EditorTool.PlayerSpawn => "出生點：在場景點擊位置",
            EditorTool.TeleportPoint => "傳送點：在 NavMesh 內點擊新增；選取後可設定面向與名稱",
            EditorTool.EntryPoint => "Entry Point：在 NavMesh 內新增地圖進入落點；可設定 Point ID 與朝向",
            EditorTool.SceneExitPolygon => "出入口多邊形：圈出切換觸發範圍；完成後在右側指定目標地圖與 Entry Point",
            _ => "準備就緒",
        };
    }

    private void AddToolButton(ToolStrip toolbar, string text, EditorTool tool, string toolTip)
    {
        var button = CreateToolbarButton(text, toolTip, (_, _) => SetActiveTool(tool));
        button.CheckOnClick = true;
        _toolButtons[tool] = button;
        toolbar.Items.Add(button);
    }

    private bool ConfirmDiscardChanges()
    {
        if (SuppressUnsavedPrompt) return true;
        if (!_dirty) return true;
        var result = MessageBox.Show(
            this,
            "目前場景有尚未儲存的修改，要先儲存嗎？",
            "尚未儲存",
            MessageBoxButtons.YesNoCancel,
            MessageBoxIcon.Question);
        return result switch
        {
            DialogResult.Yes => SaveDocument(),
            DialogResult.No => true,
            _ => false,
        };
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!ConfirmDiscardChanges()) e.Cancel = true;
    }

    private void UpdateTitle()
    {
        var sceneName = _imagePath is null ? "未開啟場景" : Path.GetFileName(_imagePath);
        var mapId = _imagePath is null ? "" : $"{_canvas.Document.SceneId} · ";
        Text = $"{(_dirty ? "*" : "")} {mapId}{sceneName} — Echoes Map Editor".TrimStart();
    }

    private static ToolStripMenuItem CreateMenuItem(string text, Keys shortcut, EventHandler handler)
    {
        var item = new ToolStripMenuItem(text)
        {
            ShortcutKeys = shortcut,
            ShowShortcutKeys = true,
        };
        item.Click += handler;
        return item;
    }

    private static ToolStripButton CreateToolbarButton(string text, string toolTip, EventHandler handler)
    {
        var button = new ToolStripButton(text)
        {
            DisplayStyle = ToolStripItemDisplayStyle.Text,
            ToolTipText = toolTip,
            AutoSize = true,
        };
        button.Click += handler;
        return button;
    }

    private static GroupBox CreateGroup(string title, int height)
    {
        return new GroupBox
        {
            Text = title,
            Width = SidebarGroupWidth,
            Height = height,
            ForeColor = Color.FromArgb(220, 225, 230),
            BackColor = Color.FromArgb(31, 35, 42),
            Margin = new Padding(0, 0, 0, 10),
        };
    }

    private static void AddField(Control parent, string labelText, TextBox textBox, int top)
    {
        var label = new Label
        {
            Text = labelText,
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        label.SetBounds(10, top, 70, 24);
        textBox.SetBounds(83, top - 2, SidebarFieldWidth, 27);
        parent.Controls.Add(label);
        parent.Controls.Add(textBox);
    }

    private static Label CreateFieldLabel(string text, int left, int top, int width) => new()
    {
        Text = text,
        Left = left,
        Top = top,
        Width = width,
        Height = 24,
        AutoSize = false,
        ForeColor = Color.FromArgb(152, 163, 174),
    };

    private static void AddConnectionField(Control parent, string labelText, Control input, int top)
    {
        parent.Controls.Add(CreateFieldLabel(labelText, 10, top + 3, 70));
        input.SetBounds(83, top, SidebarFieldWidth, 27);
        parent.Controls.Add(input);
    }

    private static Button CreateButton(string text, int left, int top, int width, int height)
    {
        var button = new Button
        {
            Text = text,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(48, 54, 64),
            ForeColor = Color.FromArgb(226, 230, 234),
            Cursor = Cursors.Hand,
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(73, 82, 94);
        button.SetBounds(left, top, width, height);
        return button;
    }

    private static void ApplyDarkInputs(Control root)
    {
        foreach (Control control in root.Controls)
        {
            if (control is TextBox or ComboBox or NumericUpDown)
            {
                control.BackColor = Color.FromArgb(19, 22, 27);
                control.ForeColor = Color.FromArgb(228, 232, 236);
            }

            if (control.HasChildren) ApplyDarkInputs(control);
        }
    }

    private static bool PathsEqual(string first, string second)
    {
        return string.Equals(Path.GetFullPath(first), Path.GetFullPath(second), StringComparison.OrdinalIgnoreCase);
    }

    private static bool FilesMatch(string first, string second)
    {
        var firstInfo = new FileInfo(first);
        var secondInfo = new FileInfo(second);
        return firstInfo.Length == secondInfo.Length && firstInfo.LastWriteTimeUtc == secondInfo.LastWriteTimeUtc;
    }

    private void ShowError(string title, Exception exception)
    {
        MessageBox.Show(this, exception.Message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    private sealed class LayerListItem
    {
        public LayerListItem(LayerSelection selection, string text, string label)
        {
            Selection = selection;
            Text = text;
            Label = label;
        }

        public LayerSelection Selection { get; }
        public string Text { get; }
        public string Label { get; }
        public override string ToString() => Text;
    }

    private sealed class InteractionTypeItem
    {
        public InteractionTypeItem(string id, string label)
        {
            Id = id;
            Label = label;
        }

        public string Id { get; }
        public string Label { get; }
        public override string ToString() => Label;
    }

    private sealed class ItemPointSpawnPolicyItem
    {
        public ItemPointSpawnPolicyItem(string id, string label)
        {
            Id = id;
            Label = label;
        }

        public string Id { get; }
        public string Label { get; }
        public override string ToString() => Label;
    }

    private sealed class ConnectionOptionItem
    {
        public ConnectionOptionItem(string id, string label)
        {
            Id = id;
            Label = label;
        }

        public string Id { get; }
        public string Label { get; }
        public override string ToString() => Label;
    }

    private sealed class DarkColorTable : ProfessionalColorTable
    {
        public override Color MenuItemSelected => Color.FromArgb(55, 62, 73);
        public override Color MenuItemBorder => Color.FromArgb(80, 90, 104);
        public override Color MenuBorder => Color.FromArgb(69, 77, 89);
        public override Color ToolStripDropDownBackground => Color.FromArgb(35, 39, 47);
        public override Color ImageMarginGradientBegin => Color.FromArgb(35, 39, 47);
        public override Color ImageMarginGradientMiddle => Color.FromArgb(35, 39, 47);
        public override Color ImageMarginGradientEnd => Color.FromArgb(35, 39, 47);
        public override Color ButtonSelectedHighlight => Color.FromArgb(62, 70, 82);
        public override Color ButtonSelectedBorder => Color.FromArgb(86, 98, 113);
        public override Color ButtonPressedHighlight => Color.FromArgb(45, 129, 119);
        public override Color ButtonPressedBorder => Color.FromArgb(83, 218, 199);
        public override Color SeparatorDark => Color.FromArgb(67, 74, 84);
        public override Color SeparatorLight => Color.FromArgb(40, 44, 52);
    }
}
