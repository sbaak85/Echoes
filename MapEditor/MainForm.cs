using System.Drawing;
using System.IO;
using Echoes.AudioEventTools;

namespace Echoes.MapEditor;

public sealed class MainForm : Form
{
    private readonly EditorCanvas _canvas = new() { Dock = DockStyle.Fill };
    private readonly Dictionary<EditorTool, ToolStripButton> _toolButtons = new();
    private readonly ListBox _layersList = new();
    private readonly TextBox _sceneIdText = new();
    private readonly TextBox _displayNameText = new();
    private readonly TextBox _selectionNameText = new();
    private readonly Label _documentInfoLabel = new();
    private readonly Label _selectionInfoLabel = new();
    private readonly Label _zoomLabel = new();
    private readonly ToolStripStatusLabel _statusLabel = new("準備就緒");
    private readonly ToolStripButton _undoButton = new("復原");
    private readonly ToolStripButton _redoButton = new("重做");
    private readonly ToolStripButton _gridButton = new("格線") { CheckOnClick = true };
    private readonly ToolStripButton _snapButton = new("吸附") { CheckOnClick = true };
    private readonly Button _insertNodeButton = CreateButton("插入 Node", 10, 354, 124, 30);
    private readonly Button _deleteNodeButton = CreateButton("刪除 Node", 141, 354, 124, 30);
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
    private readonly ComboBox _interactionTypeCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly TextBox _interactionVerbText = new();
    private readonly GroupBox _interactionGroup = CreateGroup("互動設定", 190);
    private readonly Label _dialogueSummaryLabel = new();
    private readonly GroupBox _movementGuideGroup = CreateGroup("強制引導線設定", 112);
    private readonly NumericUpDown _movementGuideWidthInput = new()
    {
        Minimum = 4,
        Maximum = 240,
        DecimalPlaces = 0,
        Value = 36,
    };

    private readonly string? _projectRoot;
    private string? _imagePath;
    private string? _scenePath;
    private bool _dirty;
    private bool _loading;
    private bool _syncingSelection;

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
            SplitterWidth = 5,
            BackColor = Color.FromArgb(48, 53, 62),
        };
        split.Panel1.Controls.Add(_canvas);
        split.Panel2.Controls.Add(BuildSidebar());
        split.SizeChanged += (_, _) =>
        {
            if (split.Width > 700) split.SplitterDistance = Math.Max(400, split.Width - 310);
        };

        Controls.Add(split);
        Controls.Add(status);
        Controls.Add(toolbar);
        Controls.Add(menu);
        MainMenuStrip = menu;

        _facingCombo.Items.AddRange(new object[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" });
        _facingCombo.SelectedItem = "S";
        _interactionTypeCombo.Items.Add(new InteractionTypeItem("dialogue", "對話"));
        _interactionTypeCombo.SelectedIndex = 0;

        _canvas.DocumentChanged += CanvasOnDocumentChanged;
        _canvas.SelectionChanged += (_, _) =>
        {
            RefreshSelectionUi();
            RefreshCommandState();
        };
        _canvas.ViewChanged += (_, _) => RefreshCommandState();
        _canvas.StatusChanged += (_, statusText) => _statusLabel.Text = statusText;
        _layersList.SelectedIndexChanged += LayersListOnSelectedIndexChanged;
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
                _canvas.SetPlayerFacing(facing);
            }
        };

        Shown += (_, _) => LoadDefaultTemplate();
        FormClosing += OnFormClosing;
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

        AddToolButton(toolbar, "選取", EditorTool.Select, "選取、拖曳圖形或頂點");
        AddToolButton(toolbar, "平移", EditorTool.Pan, "拖曳觀看場景；也可用滑鼠中鍵或 Space");
        AddToolButton(toolbar, "NavMesh", EditorTool.NavMeshPolygon, "逐點圈出可行走範圍，雙擊／右鍵／Enter 完成");
        AddToolButton(toolbar, "碰撞多邊形", EditorTool.CollisionPolygon, "逐點圈出不可通行範圍");
        AddToolButton(toolbar, "碰撞矩形", EditorTool.CollisionRectangle, "拖曳建立矩形 Collision");
        AddToolButton(toolbar, "碰撞圓形", EditorTool.CollisionCircle, "由圓心向外拖曳建立 Collision");
        AddToolButton(toolbar, "互動多邊形", EditorTool.InteractionPolygon, "逐點圈出亮黃色、非阻擋的互動範圍");
        AddToolButton(toolbar, "強制引導線", EditorTool.MovementGuide, "逐點鋪設雙向箭頭移動引導路徑");
        AddToolButton(toolbar, "出生點", EditorTool.PlayerSpawn, "點擊設定玩家出生位置");
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
        toolbar.Items.Add(new ToolStripLabel("出生朝向"));
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
        AddField(sceneGroup, "場景 ID", _sceneIdText, 28);
        AddField(sceneGroup, "顯示名稱", _displayNameText, 78);
        var applySceneButton = CreateButton("套用場景名稱", 10, 126, 255, 30);
        applySceneButton.Click += (_, _) =>
        {
            _canvas.UpdateSceneIdentity(_sceneIdText.Text, _displayNameText.Text);
        };
        sceneGroup.Controls.Add(applySceneButton);
        sidebar.Controls.Add(sceneGroup);

        var layersGroup = CreateGroup("向量圖層", 404);
        _documentInfoLabel.SetBounds(10, 26, 255, 32);
        _documentInfoLabel.ForeColor = Color.FromArgb(155, 166, 176);
        layersGroup.Controls.Add(_documentInfoLabel);
        _layersList.SetBounds(10, 62, 255, 160);
        _layersList.BackColor = Color.FromArgb(20, 23, 29);
        _layersList.ForeColor = Color.FromArgb(226, 230, 234);
        _layersList.BorderStyle = BorderStyle.FixedSingle;
        layersGroup.Controls.Add(_layersList);
        _selectionInfoLabel.SetBounds(10, 230, 255, 22);
        _selectionInfoLabel.ForeColor = Color.FromArgb(129, 222, 211);
        layersGroup.Controls.Add(_selectionInfoLabel);
        _selectionNameText.SetBounds(10, 255, 168, 27);
        layersGroup.Controls.Add(_selectionNameText);
        var renameButton = CreateButton("重新命名", 184, 254, 81, 29);
        renameButton.Click += (_, _) => _canvas.RenameSelection(_selectionNameText.Text);
        layersGroup.Controls.Add(renameButton);
        var shrinkButton = CreateButton("縮小", 10, 294, 78, 30);
        shrinkButton.Click += (_, _) => _canvas.ScaleSelection(0.9f);
        layersGroup.Controls.Add(shrinkButton);
        var enlargeButton = CreateButton("放大", 96, 294, 78, 30);
        enlargeButton.Click += (_, _) => _canvas.ScaleSelection(1.1f);
        layersGroup.Controls.Add(enlargeButton);
        var deleteButton = CreateButton("刪除圖形", 182, 294, 83, 30);
        deleteButton.Click += (_, _) => _canvas.DeleteSelection();
        layersGroup.Controls.Add(deleteButton);
        var nodeEditLabel = new Label
        {
            Text = "Node 編輯（先點選黃色節點）",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        nodeEditLabel.SetBounds(10, 330, 255, 20);
        layersGroup.Controls.Add(nodeEditLabel);
        _insertNodeButton.Enabled = false;
        _insertNodeButton.Click += (_, _) => _canvas.InsertNodeAfterSelection();
        layersGroup.Controls.Add(_insertNodeButton);
        _deleteNodeButton.Enabled = false;
        _deleteNodeButton.Click += (_, _) => _canvas.DeleteSelectedNode();
        layersGroup.Controls.Add(_deleteNodeButton);
        sidebar.Controls.Add(layersGroup);

        var typeLabel = new Label { Text = "互動類型", AutoSize = false, ForeColor = Color.FromArgb(152, 163, 174) };
        typeLabel.SetBounds(10, 30, 70, 24);
        _interactionTypeCombo.SetBounds(83, 27, 182, 27);
        _interactionGroup.Controls.Add(typeLabel);
        _interactionGroup.Controls.Add(_interactionTypeCombo);
        var verbLabel = new Label { Text = "提示動詞", AutoSize = false, ForeColor = Color.FromArgb(152, 163, 174) };
        verbLabel.SetBounds(10, 68, 70, 24);
        _interactionVerbText.SetBounds(83, 65, 182, 27);
        _interactionGroup.Controls.Add(verbLabel);
        _interactionGroup.Controls.Add(_interactionVerbText);
        _dialogueSummaryLabel.SetBounds(10, 100, 255, 22);
        _dialogueSummaryLabel.ForeColor = Color.FromArgb(155, 166, 176);
        _interactionGroup.Controls.Add(_dialogueSummaryLabel);
        var applyInteractionButton = CreateButton("套用設定", 10, 132, 124, 30);
        applyInteractionButton.Click += (_, _) => ApplyInteractionSettings();
        _interactionGroup.Controls.Add(applyInteractionButton);
        var moreButton = CreateButton("更多...", 141, 132, 124, 30);
        moreButton.Click += (_, _) => OpenDialogueEditor();
        _interactionGroup.Controls.Add(moreButton);
        _interactionGroup.Visible = false;
        sidebar.Controls.Add(_interactionGroup);

        var guideWidthLabel = new Label
        {
            Text = "生效寬度",
            AutoSize = false,
            ForeColor = Color.FromArgb(152, 163, 174),
        };
        guideWidthLabel.SetBounds(10, 32, 70, 24);
        _movementGuideWidthInput.SetBounds(83, 28, 182, 27);
        _movementGuideGroup.Controls.Add(guideWidthLabel);
        _movementGuideGroup.Controls.Add(_movementGuideWidthInput);
        var applyGuideButton = CreateButton("套用引導寬度", 10, 66, 255, 30);
        applyGuideButton.Click += (_, _) =>
            _canvas.UpdateSelectedMovementGuideWidth((float)_movementGuideWidthInput.Value);
        _movementGuideGroup.Controls.Add(applyGuideButton);
        _movementGuideGroup.Visible = false;
        sidebar.Controls.Add(_movementGuideGroup);

        var futureGroup = CreateGroup("場景連接（已預留）", 122);
        var futureLabel = new Label
        {
            AutoSize = false,
        };
        futureLabel.SetBounds(10, 27, 255, 78);
        futureLabel.Text = "JSON 已保留世界位置與 connections。\r\n下一版可加入：出口／入口範圍、目標場景、落點與朝向、多張圖片拼接預覽。";
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
                "選取：拖曳整個圖形；拖曳黃色節點可修正頂點或圓形半徑。\r\n\r\n" +
                "Node：點選後按 Del 刪除；在多邊形邊線按右鍵可新增 Node。\r\n\r\n" +
                "滾輪縮放，中鍵或 Space 拖曳平移。",
            ForeColor = Color.FromArgb(176, 184, 192),
        };
        helpLabel.SetBounds(10, 27, 255, 190);
        helpGroup.Controls.Add(helpLabel);
        sidebar.Controls.Add(helpGroup);

        ApplyDarkInputs(sidebar);
        return sidebar;
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
            SceneJson.Save(targetPath!, _canvas.Document);
            _scenePath = Path.GetFullPath(targetPath!);
            _dirty = false;
            _statusLabel.Text = $"已儲存 {Path.GetFileName(targetPath)}";
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
            var sceneTarget = Path.Combine(mapsDirectory, $"{Path.GetFileNameWithoutExtension(_imagePath)}.scene.json");
            SceneJson.Save(sceneTarget, _canvas.Document);
            _scenePath = sceneTarget;
            _dirty = false;
            _statusLabel.Text = $"已匯出到遊戲：public/maps/{Path.GetFileName(sceneTarget)}";
            UpdateTitle();
            return true;
        }
        catch (Exception exception)
        {
            ShowError("無法匯出到遊戲", exception);
            return false;
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
            $"NavMesh {_canvas.Document.NavMesh.Count} · Collision {_canvas.Document.Collisions.Count} · 互動 {_canvas.Document.Interactables.Count} · 引導 {_canvas.Document.MovementGuides.Count}";
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
            _facingCombo.SelectedItem = _canvas.Document.PlayerSpawn.Facing;
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
            _layersList.Items.Clear();
            for (var index = 0; index < _canvas.Document.NavMesh.Count; index++)
            {
                var region = _canvas.Document.NavMesh[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.NavMesh, index),
                    $"[NavMesh] {region.Label}  ({region.Points.Count}點)"));
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
                    $"[Collision/{shape}] {collision.Label}"));
            }

            for (var index = 0; index < _canvas.Document.Interactables.Count; index++)
            {
                var interactable = _canvas.Document.Interactables[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.Interactable, index),
                    $"[互動/{interactable.Verb}] {interactable.Label}  ({interactable.Points.Count}點)"));
            }

            for (var index = 0; index < _canvas.Document.MovementGuides.Count; index++)
            {
                var guide = _canvas.Document.MovementGuides[index];
                _layersList.Items.Add(new LayerListItem(
                    new LayerSelection(SceneLayerKind.MovementGuide, index),
                    $"[雙向引導/{Math.Round(guide.Width)}px] {guide.Label}  ({guide.Points.Count}點)"));
            }

            var selectedItem = _layersList.Items
                .Cast<LayerListItem>()
                .FirstOrDefault(item => item.Selection == _canvas.Selection);
            _layersList.SelectedItem = selectedItem;
            _layersList.EndUpdate();
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
                _selectionInfoLabel.Text = $"已選取互動區域 · {interactable.Id}{node}";
                _selectionNameText.Text = interactable.Label;
                _interactionVerbText.Text = interactable.Verb;
                _interactionTypeCombo.SelectedIndex = 0;
                _dialogueSummaryLabel.Text =
                    $"對話：{interactable.Dialogue.Lines.Count} 句 · {interactable.Dialogue.CharacterDelaySeconds:0.00} 秒/字";
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
            else
            {
                _selectionInfoLabel.Text = "尚未選取圖形";
                _selectionNameText.Text = "";
            }
            _interactionGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.Interactable;
            _movementGuideGroup.Visible = _canvas.Selection.Kind == SceneLayerKind.MovementGuide;
        }
        finally
        {
            _syncingSelection = false;
        }
    }

    private void LayersListOnSelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_syncingSelection) return;
        _canvas.SelectLayer(
            _layersList.SelectedItem is LayerListItem item
                ? item.Selection
                : LayerSelection.None);
    }

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
            interactable.Dialogue.Lines,
            interactable.Dialogue.Speakers,
            interactable.Dialogue.CharacterDelaySeconds);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        _canvas.UpdateSelectedDialogue(
            editor.Lines,
            editor.Speakers,
            editor.CharacterDelaySeconds);
        RefreshSelectionUi();
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
            EditorTool.Select => "選取工具：拖曳圖形或黃色頂點；右鍵邊線可新增 Node",
            EditorTool.Pan => "平移工具：拖曳畫布",
            EditorTool.NavMeshPolygon => "NavMesh：逐點圈出可行走範圍",
            EditorTool.CollisionPolygon => "Collision：逐點圈出不可通行範圍",
            EditorTool.CollisionRectangle => "矩形 Collision：按住滑鼠拖曳範圍",
            EditorTool.CollisionCircle => "圓形 Collision：從中心向外拖曳",
            EditorTool.InteractionPolygon => "互動區域：逐點圈出範圍；右鍵可設定互動 Point 與互動提示點",
            EditorTool.MovementGuide => "強制引導線：逐點鋪設，雙擊／右鍵／Enter 完成（至少 2 點）",
            EditorTool.PlayerSpawn => "出生點：在場景點擊位置",
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
        Text = $"{(_dirty ? "*" : "")} {sceneName} — Echoes Map Editor".TrimStart();
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
            Width = 278,
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
        textBox.SetBounds(83, top - 2, 182, 27);
        parent.Controls.Add(label);
        parent.Controls.Add(textBox);
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
        public LayerListItem(LayerSelection selection, string text)
        {
            Selection = selection;
            Text = text;
        }

        public LayerSelection Selection { get; }
        public string Text { get; }
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
