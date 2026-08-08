using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Echoes.MapEditor;

public enum EditorTool
{
    Select,
    Pan,
    NavMeshPolygon,
    CollisionPolygon,
    CollisionRectangle,
    CollisionCircle,
    InteractionPolygon,
    StoryTriggerPolygon,
    MovementGuide,
    PlayerSpawn,
    TeleportPoint,
}

public enum SceneLayerKind
{
    None,
    NavMesh,
    Collision,
    Interactable,
    StoryTrigger,
    MovementGuide,
    TeleportPoint,
    ItemPoint,
}

public readonly record struct LayerSelection(SceneLayerKind Kind, int Index)
{
    public static readonly LayerSelection None = new(SceneLayerKind.None, -1);
}

internal enum DragMode
{
    None,
    MoveShape,
    Vertex,
    CircleRadius,
}

public sealed class EditorCanvas : Control
{
    private const int RulerSize = 28;
    private const float MinimumZoom = 0.08f;
    private const float MaximumZoom = 8f;

    private readonly Stack<string> _undo = new();
    private readonly Stack<string> _redo = new();
    private readonly List<ScenePoint> _draftPoints = new();
    private readonly System.Windows.Forms.Timer _renderTimer;
    private readonly Stopwatch _statusUpdateStopwatch = Stopwatch.StartNew();
    private readonly ContextMenuStrip _nodeContextMenu = new();
    private readonly ToolStripMenuItem _insertNodeContextItem = new("新增 Node");
    private readonly ToolStripMenuItem _deleteNodeContextItem = new("刪除 Node");
    private readonly ToolStripMenuItem _overlapSelectionContextItem = new("選取重疊圖形");
    private readonly ToolStripMenuItem _interactionTypeContextItem = new("互動類型");
    private readonly Dictionary<string, ToolStripMenuItem> _interactionTypeContextItems = new();
    private readonly ToolStripMenuItem _interactionPointContextItem = new("新增互動 Point");
    private readonly ToolStripMenuItem _deleteInteractionPointContextItem = new("刪除互動 Point");
    private readonly ToolStripMenuItem _interactionHintPointContextItem = new("新增互動提示點");
    private readonly ToolStripMenuItem _deleteInteractionHintPointContextItem = new("刪除互動提示點");
    private readonly ContextMenuStrip _worldPointContextMenu = new();
    private readonly ToolStripMenuItem _moveSpawnContextItem = new("移動出生點至此");
    private readonly ToolStripMenuItem _addItemPointContextItem = new("在此處加入 ItemPoint");
    private readonly ToolStripMenuItem _assignItemPointItemContextItem = new("指定此 Item 生成");
    private readonly ToolStripTextBox _itemPointQuantityContextTextBox = new()
    {
        Text = "1",
        ToolTipText = "輸入 1～99 後按 Enter",
    };
    private readonly ToolStripMenuItem _deleteItemPointContextItem = new("刪除此 ItemPoint");

    private Bitmap? _sceneImage;
    private SceneDocument _document = new();
    private EditorTool _tool = EditorTool.Select;
    private LayerSelection _selection = LayerSelection.None;
    private float _zoom = 1f;
    private PointF _pan = new(20, 20);
    private PointF _lastMouseScreen;
    private PointF _lastDragWorld;
    private PointF _draftCursor;
    private PointF? _shapeStart;
    private PointF? _shapeEnd;
    private DragMode _dragMode;
    private int _activeHandle = -1;
    private int _selectedVertex = -1;
    private LayerSelection _contextSelection = LayerSelection.None;
    private int _contextEdgeIndex = -1;
    private int _contextInteractionPointIndex = -1;
    private PointF _contextInsertPoint;
    private PointF _contextInteractionPoint;
    private PointF _contextInteractionHintPoint;
    private PointF _contextWorldPoint;
    private int _contextItemPointIndex = -1;
    private bool _panning;
    private bool _spacePressed;
    private bool _endingCapture;
    private bool _paintFailureReported;
    private bool _fastRenderOnce;
    private string? _mutationBefore;

    public EditorCanvas()
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.UserPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        BackColor = Color.FromArgb(18, 21, 27);
        ForeColor = Color.Gainsboro;
        TabStop = true;
        _renderTimer = new System.Windows.Forms.Timer { Interval = 16 };
        _renderTimer.Tick += (_, _) =>
        {
            _renderTimer.Stop();
            if (!IsDisposed && !Disposing && IsHandleCreated) Invalidate();
        };
        _insertNodeContextItem.Click += (_, _) => InsertNodeAtContextLocation();
        _deleteNodeContextItem.Click += (_, _) => DeleteSelectedNode();
        foreach (var defaults in InteractionTypeDefaults.All)
        {
            var item = new ToolStripMenuItem(defaults.Label) { Tag = defaults };
            item.Click += (_, _) =>
            {
                var selectedDefaults = (InteractionTypeDefaults)item.Tag!;
                SetSelectedInteractionType(selectedDefaults.Id, selectedDefaults.Verb);
            };
            _interactionTypeContextItems.Add(defaults.Id, item);
            _interactionTypeContextItem.DropDownItems.Add(item);
        }
        foreach (var direction in new[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" })
        {
            var symbol = direction switch
            {
                "N" => "↑", "NE" => "↗", "E" => "→", "SE" => "↘",
                "S" => "↓", "SW" => "↙", "W" => "←", _ => "↖",
            };
            var item = new ToolStripMenuItem($"{symbol} {direction}") { Tag = direction };
            item.Click += (_, _) => SetInteractionPointAtContext((string)item.Tag!);
            _interactionPointContextItem.DropDownItems.Add(item);
        }
        _deleteInteractionPointContextItem.Click += (_, _) => DeleteSelectedInteractionPoint();
        _interactionHintPointContextItem.Click += (_, _) => SetInteractionHintPointAtContext();
        _deleteInteractionHintPointContextItem.Click += (_, _) => DeleteSelectedInteractionHintPoint();
        _nodeContextMenu.Items.AddRange(new ToolStripItem[]
        {
            _overlapSelectionContextItem,
            new ToolStripSeparator(),
            _insertNodeContextItem,
            _deleteNodeContextItem,
            new ToolStripSeparator(),
            _interactionTypeContextItem,
            _interactionPointContextItem,
            _deleteInteractionPointContextItem,
            new ToolStripSeparator(),
            _interactionHintPointContextItem,
            _deleteInteractionHintPointContextItem,
        });
        _nodeContextMenu.BackColor = Color.FromArgb(35, 39, 47);
        _nodeContextMenu.ForeColor = Color.WhiteSmoke;
        _moveSpawnContextItem.Click += (_, _) => SetPlayerSpawnAtContext();
        _addItemPointContextItem.Click += (_, _) => AddItemPointAtContext();
        _deleteItemPointContextItem.Click += (_, _) => DeleteItemPointAtContext();
        _itemPointQuantityContextTextBox.KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.KeyCode != Keys.Enter) return;
            eventArgs.Handled = true;
            eventArgs.SuppressKeyPress = true;
            SetItemPointQuantityAtContext(_itemPointQuantityContextTextBox.Text);
        };
        _worldPointContextMenu.Items.AddRange(new ToolStripItem[]
        {
            _moveSpawnContextItem,
            _addItemPointContextItem,
            _assignItemPointItemContextItem,
            _deleteItemPointContextItem,
        });
        _worldPointContextMenu.BackColor = Color.FromArgb(35, 39, 47);
        _worldPointContextMenu.ForeColor = Color.WhiteSmoke;
        UpdateCursor();
    }

    public event EventHandler? DocumentChanged;
    public event EventHandler? SelectionChanged;
    public event EventHandler? ViewChanged;
    public event EventHandler<string>? StatusChanged;

    public SceneDocument Document => _document;
    public LayerSelection Selection => _selection;
    public float Zoom => _zoom;
    public bool CanUndo => _undo.Count > 0;
    public bool CanRedo => _redo.Count > 0;
    public int SelectedVertexIndex => _selectedVertex;
    public SceneInteractable? SelectedInteractable =>
        _selection.Kind == SceneLayerKind.Interactable && IsValidSelection(_selection)
            ? _document.Interactables[_selection.Index]
            : null;
    public MovementGuide? SelectedMovementGuide =>
        _selection.Kind == SceneLayerKind.MovementGuide && IsValidSelection(_selection)
            ? _document.MovementGuides[_selection.Index]
            : null;
    public StoryTriggerZone? SelectedStoryTrigger =>
        _selection.Kind == SceneLayerKind.StoryTrigger && IsValidSelection(_selection)
            ? _document.StoryTriggers[_selection.Index]
            : null;
    public SceneItemPoint? SelectedItemPoint =>
        _selection.Kind == SceneLayerKind.ItemPoint && IsValidSelection(_selection)
            ? _document.ItemPoints[_selection.Index]
            : null;
    public SceneTeleportPoint? SelectedTeleportPoint =>
        _selection.Kind == SceneLayerKind.TeleportPoint && IsValidSelection(_selection)
            ? _document.TeleportPoints[_selection.Index]
            : null;
    public bool CanInsertNode => CanEditSelectedVertex(requireMoreThanThreePoints: false);
    public bool CanDeleteNode => CanEditSelectedVertex(requireMoreThanThreePoints: true);

    public EditorTool Tool
    {
        get => _tool;
        set
        {
            if (_tool == value) return;
            CancelDraft();
            _tool = value;
            UpdateCursor();
            Invalidate();
        }
    }

    public void SetScene(SceneDocument document, Bitmap image)
    {
        _renderTimer.Stop();
        _panning = false;
        _dragMode = DragMode.None;
        _activeHandle = -1;
        _shapeStart = null;
        _shapeEnd = null;
        ReleaseMouseCapture();
        _sceneImage?.Dispose();
        _sceneImage = image;
        _document = document;
        _selection = LayerSelection.None;
        _selectedVertex = -1;
        _draftPoints.Clear();
        _undo.Clear();
        _redo.Clear();
        _mutationBefore = null;
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        DocumentChanged?.Invoke(this, EventArgs.Empty);
        BeginInvoke(FitToView);
    }

    public void FitToView()
    {
        if (_sceneImage is null || ClientSize.Width <= RulerSize || ClientSize.Height <= RulerSize)
        {
            return;
        }

        var contentWidth = Math.Max(1, ClientSize.Width - RulerSize);
        var contentHeight = Math.Max(1, ClientSize.Height - RulerSize);
        _zoom = Math.Clamp(
            Math.Min(contentWidth / _document.World.Width, contentHeight / _document.World.Height) * 0.94f,
            MinimumZoom,
            MaximumZoom);
        _pan = new PointF(
            (contentWidth - _document.World.Width * _zoom) / 2f,
            (contentHeight - _document.World.Height * _zoom) / 2f);
        OnViewChanged();
    }

    public void ZoomBy(float factor)
    {
        var content = ContentRectangle;
        SetZoomAt(_zoom * factor, new Point(content.Left + content.Width / 2, content.Top + content.Height / 2));
    }

    public void SetGridVisible(bool visible)
    {
        if (_document.Grid.Visible == visible) return;
        PerformMutation(() => _document.Grid.Visible = visible);
    }

    public void SetSnap(bool snap)
    {
        if (_document.Grid.Snap == snap) return;
        PerformMutation(() => _document.Grid.Snap = snap);
    }

    public void SetGridSize(int size)
    {
        size = Math.Clamp(size, 2, 256);
        if (_document.Grid.Size == size) return;
        PerformMutation(() => _document.Grid.Size = size);
    }

    public void SetPlayerFacing(string facing)
    {
        if (_document.PlayerSpawn.Facing == facing) return;
        PerformMutation(() => _document.PlayerSpawn.Facing = facing);
    }

    public void SetSelectedTeleportPointFacing(string facing)
    {
        var point = SelectedTeleportPoint;
        if (point is null || point.Facing == facing) return;
        PerformMutation(() => point.Facing = facing);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSceneIdentity(string sceneId, string displayName)
    {
        sceneId = sceneId.Trim();
        displayName = displayName.Trim();
        if (sceneId.Length == 0 || displayName.Length == 0) return;
        if (_document.SceneId == sceneId && _document.DisplayName == displayName) return;
        PerformMutation(() =>
        {
            _document.SceneId = sceneId;
            _document.DisplayName = displayName;
        });
    }

    public void RenameSelection(string label)
    {
        label = label.Trim();
        if (label.Length == 0 || !IsValidSelection(_selection)) return;

        PerformMutation(() =>
        {
            if (_selection.Kind == SceneLayerKind.NavMesh)
            {
                _document.NavMesh[_selection.Index].Label = label;
            }
            else
            {
                if (_selection.Kind == SceneLayerKind.Collision)
                    _document.Collisions[_selection.Index].Label = label;
                else if (_selection.Kind == SceneLayerKind.Interactable)
                    _document.Interactables[_selection.Index].Label = label;
                else if (_selection.Kind == SceneLayerKind.StoryTrigger)
                    _document.StoryTriggers[_selection.Index].Label = label;
                else if (_selection.Kind == SceneLayerKind.MovementGuide)
                    _document.MovementGuides[_selection.Index].Label = label;
                else if (_selection.Kind == SceneLayerKind.TeleportPoint)
                    _document.TeleportPoints[_selection.Index].Label = label;
                else
                    _document.ItemPoints[_selection.Index].Label = label;
            }
        });
    }

    public void SelectLayer(LayerSelection selection)
    {
        if (!IsValidSelection(selection)) selection = LayerSelection.None;
        if (_selection == selection) return;
        _selection = selection;
        _selectedVertex = -1;
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public void DeleteSelection()
    {
        if (!IsValidSelection(_selection)) return;

        PerformMutation(() =>
        {
            if (_selection.Kind == SceneLayerKind.NavMesh)
            {
                _document.NavMesh.RemoveAt(_selection.Index);
            }
            else if (_selection.Kind == SceneLayerKind.Collision)
            {
                _document.Collisions.RemoveAt(_selection.Index);
            }
            else if (_selection.Kind == SceneLayerKind.Interactable)
            {
                _document.Interactables.RemoveAt(_selection.Index);
            }
            else if (_selection.Kind == SceneLayerKind.StoryTrigger)
            {
                _document.StoryTriggers.RemoveAt(_selection.Index);
            }
            else if (_selection.Kind == SceneLayerKind.MovementGuide)
            {
                _document.MovementGuides.RemoveAt(_selection.Index);
            }
            else if (_selection.Kind == SceneLayerKind.ItemPoint)
            {
                _document.ItemPoints.RemoveAt(_selection.Index);
            }
            else if (_selection.Kind == SceneLayerKind.TeleportPoint)
            {
                _document.TeleportPoints.RemoveAt(_selection.Index);
            }

            _selection = LayerSelection.None;
            _selectedVertex = -1;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void DeleteSelectedNodeOrShape()
    {
        if (_selectedVertex >= 0 && SelectedEditablePolygonPoints() is not null)
        {
            DeleteSelectedNode();
            return;
        }

        DeleteSelection();
    }

    public void UpdateSelectedItemPoint(
        float x,
        float y,
        string itemId,
        int quantity,
        string spawnPolicy,
        bool showOnMinimap)
    {
        var itemPoint = SelectedItemPoint;
        var item = ItemCatalog.Find(itemId);
        if (itemPoint is null || item is null) return;
        var position = ClampToWorld(new PointF(x, y));
        if (!IsPointInsideNavMesh(position))
        {
            StatusChanged?.Invoke(this, "ItemPoint 必須位於 NavMesh 範圍內，位置未變更。");
            return;
        }
        PerformMutation(() =>
        {
            itemPoint.X = position.X;
            itemPoint.Y = position.Y;
            itemPoint.ItemId = item.Id;
            itemPoint.Quantity = Math.Clamp(quantity, 1, 99);
            itemPoint.SpawnPolicy = spawnPolicy switch
            {
                "daily" => "daily",
                "sceneEntry" => "sceneEntry",
                _ => "once",
            };
            itemPoint.ShowOnMinimap = showOnMinimap;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedItemPointSpawnRequirement(
        ItemPointSpawnRequirement? requirement)
    {
        var itemPoint = SelectedItemPoint;
        if (itemPoint is null) return;
        PerformMutation(() =>
        {
            itemPoint.SpawnRequirement = requirement?.Clone();
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void InsertNodeAfterSelection()
    {
        var points = SelectedEditablePolygonPoints();
        if (points is null || _selectedVertex < 0 || _selectedVertex >= points.Count)
        {
            StatusChanged?.Invoke(this, "請先選取多邊形中的一個 Node，再按插入 Node。");
            return;
        }

        var edgeIndex = _selectedVertex;
        if (_selection.Kind == SceneLayerKind.MovementGuide && edgeIndex == points.Count - 1)
        {
            edgeIndex -= 1;
        }
        var nextIndex = edgeIndex + 1;
        var midpoint = new PointF(
            (points[edgeIndex].X + points[nextIndex].X) / 2f,
            (points[edgeIndex].Y + points[nextIndex].Y) / 2f);
        InsertNodeOnEdge(edgeIndex, midpoint);
    }

    public void DeleteSelectedNode()
    {
        var points = SelectedEditablePolygonPoints();
        if (points is null || _selectedVertex < 0 || _selectedVertex >= points.Count)
        {
            StatusChanged?.Invoke(this, "請先選取要刪除的 Node。");
            return;
        }

        var minimumPoints = MinimumSelectedPointCount();
        if (points.Count <= minimumPoints)
        {
            StatusChanged?.Invoke(this, $"目前圖形至少需要保留 {minimumPoints} 個 Node，無法繼續刪除。");
            return;
        }

        var deletedIndex = _selectedVertex;
        PerformMutation(() =>
        {
            points.RemoveAt(deletedIndex);
            _selectedVertex = Math.Min(deletedIndex, points.Count - 1);
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, $"已刪除 Node；目前多邊形共有 {points.Count} 個 Node。");
    }

    public void ScaleSelection(float factor)
    {
        if (!IsValidSelection(_selection)) return;

        PerformMutation(() =>
        {
            if (_selection.Kind == SceneLayerKind.Collision)
            {
                var collision = _document.Collisions[_selection.Index];
                if (collision.Shape == "circle" && collision.Center is not null)
                {
                    collision.Radius = Math.Max(2, collision.Radius * factor);
                    return;
                }

                ScalePoints(collision.Points, factor);
            }
            else if (_selection.Kind == SceneLayerKind.NavMesh)
            {
                ScalePoints(_document.NavMesh[_selection.Index].Points, factor);
            }
            else if (_selection.Kind == SceneLayerKind.Interactable)
            {
                var interactable = _document.Interactables[_selection.Index];
                if (interactable.Points.Count == 0) return;
                var center = new PointF(
                    interactable.Points.Average(point => point.X),
                    interactable.Points.Average(point => point.Y));
                ScalePoints(interactable.Points, factor);
                foreach (var interactionPoint in interactable.EffectiveInteractionPoints)
                {
                    ScalePointAround(interactionPoint, center, factor);
                }
                if (interactable.InteractionHintPoint is { } interactionHintPoint)
                {
                    ScalePointAround(interactionHintPoint, center, factor);
                }
            }
            else if (_selection.Kind == SceneLayerKind.StoryTrigger)
            {
                ScalePoints(_document.StoryTriggers[_selection.Index].Points, factor);
            }
            else if (_selection.Kind == SceneLayerKind.MovementGuide)
            {
                ScalePoints(_document.MovementGuides[_selection.Index].Points, factor);
            }
        });
    }

    public void UpdateSelectedMovementGuideWidth(float width)
    {
        var guide = SelectedMovementGuide;
        if (guide is null) return;
        width = Math.Clamp(width, 4, 240);
        PerformMutation(() => guide.Width = width);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedInteractable(string type, string verb)
    {
        var interactable = SelectedInteractable;
        if (interactable is null) return;
        type = string.IsNullOrWhiteSpace(type) ? "dialogue" : type.Trim();
        var defaults = InteractionTypeDefaults.Get(type);
        verb = string.IsNullOrWhiteSpace(verb) ? defaults.Verb : verb.Trim();
        PerformMutation(() =>
        {
            interactable.Type = type;
            interactable.Verb = verb;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedStoryTrigger(
        string dialogueId,
        bool once,
        float triggerDelaySeconds)
    {
        if (SelectedStoryTrigger is null) return;
        dialogueId = dialogueId.Trim();
        PerformMutation(() =>
        {
            SelectedStoryTrigger.DialogueId = dialogueId;
            SelectedStoryTrigger.Once = once;
            SelectedStoryTrigger.TriggerDelaySeconds = Math.Clamp(
                triggerDelaySeconds,
                0,
                3600);
            SelectedStoryTrigger.InteractionLimitMode = once ? "once" : null;
            if (once)
            {
                SelectedStoryTrigger.DailyInteractionLimit = null;
            }
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedStoryTriggerConfiguration(
        SurvivalRequirements requirements,
        SurvivalEffects effects,
        int? dailyLimit,
        string? interactionLimitMode,
        IEnumerable<InteractionUseRequirement> useRequirements,
        IEnumerable<InteractionItemReward> itemRewards,
        IEnumerable<string> startQuestIds)
    {
        var trigger = SelectedStoryTrigger;
        if (trigger is null) return;
        interactionLimitMode = "once".Equals(
            interactionLimitMode,
            StringComparison.OrdinalIgnoreCase)
            ? "once"
            : null;
        dailyLimit = interactionLimitMode == "once" || dailyLimit is null
            ? null
            : Math.Clamp(dailyLimit.Value, 1, 10);
        var requirementList = useRequirements
            .Select(requirement => requirement.Clone())
            .ToList();
        var rewardList = itemRewards
            .Select(reward => reward.Clone())
            .ToList();
        var questIdList = startQuestIds
            .Select(questId => questId.Trim())
            .Where(questId => questId.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        PerformMutation(() =>
        {
            trigger.SurvivalRequirements = requirements.Clone();
            trigger.SurvivalEffects = effects.Clone();
            trigger.DailyInteractionLimit = dailyLimit;
            trigger.InteractionLimitMode = interactionLimitMode;
            trigger.Once = interactionLimitMode == "once";
            trigger.UseRequirements = requirementList.Count == 0
                ? null
                : requirementList;
            trigger.ItemRewards = rewardList.Count == 0
                ? null
                : rewardList;
            trigger.ItemReward = null;
            trigger.StartQuestIds = questIdList.Count == 0
                ? null
                : questIdList;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedSurvivalSettings(
        SurvivalRequirements requirements,
        SurvivalEffects effects,
        int? dailyLimit,
        string? interactionLimitMode,
        IEnumerable<InteractionUseRequirement> useRequirements)
    {
        var interactable = SelectedInteractable;
        if (interactable is null) return;
        interactionLimitMode = "once".Equals(
            interactionLimitMode,
            StringComparison.OrdinalIgnoreCase)
            ? "once"
            : null;
        dailyLimit = interactionLimitMode == "once" || dailyLimit is null
            ? null
            : Math.Clamp(dailyLimit.Value, 1, 10);
        PerformMutation(() =>
        {
            interactable.SurvivalRequirements = requirements.Clone();
            interactable.SurvivalEffects = effects.Clone();
            interactable.DailyInteractionLimit = dailyLimit;
            interactable.InteractionLimitMode = interactionLimitMode;
            var requirementList = useRequirements
                .Select(requirement => requirement.Clone())
                .ToList();
            interactable.UseRequirements = requirementList.Count == 0
                ? null
                : requirementList;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedInteractionConfiguration(
        string type,
        string verb,
        SurvivalRequirements requirements,
        SurvivalEffects effects,
        int? dailyLimit,
        string? interactionLimitMode,
        IEnumerable<InteractionUseRequirement> useRequirements,
        IEnumerable<InteractionItemReward> itemRewards)
    {
        var interactable = SelectedInteractable;
        if (interactable is null) return;
        type = string.IsNullOrWhiteSpace(type) ? "dialogue" : type.Trim();
        var defaults = InteractionTypeDefaults.Get(type);
        verb = string.IsNullOrWhiteSpace(verb) ? defaults.Verb : verb.Trim();
        interactionLimitMode = "once".Equals(
            interactionLimitMode,
            StringComparison.OrdinalIgnoreCase)
            ? "once"
            : null;
        dailyLimit = interactionLimitMode == "once" || dailyLimit is null
            ? null
            : Math.Clamp(dailyLimit.Value, 1, 10);
        var requirementList = useRequirements
            .Select(requirement => requirement.Clone())
            .ToList();
        var rewardList = itemRewards
            .Select(reward => reward.Clone())
            .ToList();
        PerformMutation(() =>
        {
            interactable.Type = type;
            interactable.Verb = verb;
            interactable.SurvivalRequirements = requirements.Clone();
            interactable.SurvivalEffects = effects.Clone();
            interactable.DailyInteractionLimit = dailyLimit;
            interactable.InteractionLimitMode = interactionLimitMode;
            interactable.UseRequirements = requirementList.Count == 0
                ? null
                : requirementList;
            interactable.ItemRewards = rewardList.Count == 0
                ? null
                : rewardList;
            interactable.ItemReward = null;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedDialogues(
        DialogueScript successDialogue,
        DialogueScript failureDialogue,
        DialogueScript? completionDialogue)
    {
        var interactable = SelectedInteractable;
        if (interactable is null) return;
        PerformMutation(() =>
        {
            interactable.Dialogue = successDialogue.Clone();
            interactable.FailureDialogue = failureDialogue.Clone();
            interactable.CompletionDialogue = completionDialogue?.Clone();
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Undo()
    {
        if (_undo.Count == 0) return;
        _redo.Push(SceneJson.Serialize(_document));
        _document = SceneJson.Deserialize(_undo.Pop());
        _selection = LayerSelection.None;
        _selectedVertex = -1;
        NotifyDocumentReplaced();
    }

    public void Redo()
    {
        if (_redo.Count == 0) return;
        _undo.Push(SceneJson.Serialize(_document));
        _document = SceneJson.Deserialize(_redo.Pop());
        _selection = LayerSelection.None;
        _selectedVertex = -1;
        NotifyDocumentReplaced();
    }

    internal void RecoverAfterException()
    {
        _renderTimer.Stop();
        _panning = false;
        _shapeStart = null;
        _shapeEnd = null;
        _dragMode = DragMode.None;
        _activeHandle = -1;
        _spacePressed = false;

        var restoredDocument = false;
        if (_mutationBefore is not null)
        {
            try
            {
                _document = SceneJson.Deserialize(_mutationBefore);
                _selection = LayerSelection.None;
                _selectedVertex = -1;
                restoredDocument = true;
            }
            catch (Exception exception)
            {
                EditorDiagnostics.Log("Failed to restore an interrupted edit", exception);
            }
        }

        _mutationBefore = null;
        ReleaseMouseCapture();
        UpdateCursor();

        if (restoredDocument) NotifyDocumentReplaced();
        else Invalidate();
    }

    internal void RunNodeDragStressTest(int iterations)
    {
        if (_document.NavMesh.Count == 0 || _document.NavMesh[0].Points.Count == 0)
        {
            throw new InvalidOperationException("Drag stress test requires at least one NavMesh node.");
        }

        var originalDocument = SceneJson.Serialize(_document);
        var originalSelection = _selection;
        var originalSelectedVertex = _selectedVertex;
        using var renderTarget = new Bitmap(
            Math.Max(1, ClientSize.Width),
            Math.Max(1, ClientSize.Height));

        try
        {
            _selection = new LayerSelection(SceneLayerKind.NavMesh, 0);
            _selectedVertex = 0;
            _activeHandle = 0;
            _dragMode = DragMode.Vertex;
            var origin = ToPointF(_document.NavMesh[0].Points[0]);

            for (var index = 0; index < iterations; index++)
            {
                var angle = index * 0.071f;
                var world = SnapAndClamp(new PointF(
                    origin.X + MathF.Cos(angle) * 160f,
                    origin.Y + MathF.Sin(angle * 0.83f) * 120f));
                UpdateSelectionDrag(world);
                PublishPointerStatus(world);
                RequestRender();

                if (index % 100 == 0)
                {
                    DrawToBitmap(renderTarget, ClientRectangle);
                }
            }

            SceneJson.Validate(_document);
        }
        finally
        {
            _renderTimer.Stop();
            _document = SceneJson.Deserialize(originalDocument);
            _selection = originalSelection;
            _selectedVertex = originalSelectedVertex;
            _dragMode = DragMode.None;
            _activeHandle = -1;
            _mutationBefore = null;
            Invalidate();
        }
    }

    internal void RunNodeEditingSelfTest(SceneDocument sourceDocument)
    {
        var originalDocument = _document;
        var originalSelection = _selection;
        var originalSelectedVertex = _selectedVertex;
        var originalMutationBefore = _mutationBefore;

        try
        {
            _document = SceneJson.Deserialize(SceneJson.Serialize(sourceDocument));
            var collisionIndex = _document.Collisions.FindIndex(collision =>
                collision.Shape.Equals("polygon", StringComparison.OrdinalIgnoreCase) &&
                collision.Points is { Count: >= 3 });
            if (collisionIndex < 0)
            {
                throw new InvalidOperationException("Node editing self-test requires a polygon collision.");
            }

            _selection = new LayerSelection(SceneLayerKind.Collision, collisionIndex);
            _selectedVertex = 0;
            var points = SelectedEditablePolygonPoints()
                ?? throw new InvalidOperationException("Polygon collision was not editable.");
            var originalCount = points.Count;
            var midpoint = new PointF(
                (points[0].X + points[1].X) / 2f,
                (points[0].Y + points[1].Y) / 2f);

            if (!TryFindNearestSelectedEdge(midpoint, out var edgeIndex, out var insertionPoint))
            {
                throw new InvalidOperationException("Finding the nearest polygon edge failed.");
            }

            InsertNodeOnEdge(edgeIndex, insertionPoint);
            if (points.Count != originalCount + 1 || _selectedVertex != edgeIndex + 1)
            {
                throw new InvalidOperationException("Inserting a polygon node failed.");
            }

            DeleteSelectedNode();
            if (points.Count != originalCount)
            {
                throw new InvalidOperationException("Deleting a polygon node failed.");
            }

            var triangle = points.Take(3).Select(point => point.Clone()).ToList();
            points.Clear();
            points.AddRange(triangle);
            _selectedVertex = 0;
            DeleteSelectedNode();
            if (points.Count != 3)
            {
                throw new InvalidOperationException("A polygon was allowed to drop below three nodes.");
            }

            var overlapPoints = new List<ScenePoint>
            {
                new(2, 2),
                new(22, 2),
                new(22, 22),
                new(2, 22),
            };
            var overlapCollisionIndex = _document.Collisions.Count;
            _document.Collisions.Add(new CollisionShape
            {
                Id = "self-test-overlap-collision",
                Label = "Overlap collision",
                Shape = "polygon",
                Points = overlapPoints.Select(point => point.Clone()).ToList(),
            });
            var overlapInteractableIndex = _document.Interactables.Count;
            _document.Interactables.Add(new SceneInteractable
            {
                Id = "self-test-overlap-interaction",
                Label = "Overlap interaction",
                Points = overlapPoints.Select(point => point.Clone()).ToList(),
                Type = "operation",
                Verb = "操作",
                SurvivalRequirements = new SurvivalRequirements
                {
                    Stamina = new SurvivalRequirementRule { Comparison = "atLeast", Value = 37 },
                },
                SurvivalEffects = new SurvivalEffects { Stamina = -9, TimeMinutes = 60 },
                DailyInteractionLimit = 2,
                UseRequirements = new List<InteractionUseRequirement>
                {
                    new() { Kind = "item", ItemId = ItemCatalog.All[0].Id, Quantity = 2 },
                },
                ItemRewards = new List<InteractionItemReward>
                {
                    new() { ItemId = ItemCatalog.All[0].Id, Quantity = 3, Delivery = "inventory" },
                },
            });
            _selection = new LayerSelection(SceneLayerKind.Interactable, overlapInteractableIndex);
            UpdateSelectedInteractable("check", "檢查");
            var preservedInteraction = _document.Interactables[overlapInteractableIndex];
            if (
                preservedInteraction.Type != "check" ||
                preservedInteraction.Verb != "檢查" ||
                preservedInteraction.SurvivalRequirements.Stamina?.Value != 37 ||
                preservedInteraction.SurvivalEffects.Stamina != -9 ||
                preservedInteraction.SurvivalEffects.TimeMinutes != 60 ||
                preservedInteraction.DailyInteractionLimit != 2 ||
                preservedInteraction.UseRequirements?.Single().Quantity != 2 ||
                preservedInteraction.ItemRewards?.Single().Quantity != 3)
            {
                throw new InvalidOperationException(
                    "Changing an interaction type did not preserve its requirements and completion effects.");
            }
            var overlapNavMeshIndex = _document.NavMesh.Count;
            _document.NavMesh.Add(new NavMeshRegion
            {
                Id = "self-test-overlap-navmesh",
                Label = "Overlap NavMesh",
                Points = overlapPoints.Select(point => point.Clone()).ToList(),
            });
            var overlapCandidates = GetHitTestCandidates(new PointF(12, 12));
            if (
                !overlapCandidates.Contains(
                    new LayerSelection(SceneLayerKind.Collision, overlapCollisionIndex)) ||
                !overlapCandidates.Contains(
                    new LayerSelection(SceneLayerKind.Interactable, overlapInteractableIndex))
            )
            {
                throw new InvalidOperationException(
                    "Overlapping interaction and collision shapes were not both selectable.");
            }

            var interactionOrder = overlapCandidates.IndexOf(
                new LayerSelection(SceneLayerKind.Interactable, overlapInteractableIndex));
            var collisionOrder = overlapCandidates.IndexOf(
                new LayerSelection(SceneLayerKind.Collision, overlapCollisionIndex));
            var navMeshOrder = overlapCandidates.IndexOf(
                new LayerSelection(SceneLayerKind.NavMesh, overlapNavMeshIndex));
            if (!(interactionOrder >= 0 && interactionOrder < collisionOrder && collisionOrder < navMeshOrder))
            {
                throw new InvalidOperationException(
                    "Overlapping shapes did not follow the visual layer order: interaction, collision, NavMesh.");
            }

            _document.MovementGuides.Clear();
            var itemPointIndex = _document.ItemPoints.Count;
            _document.ItemPoints.Add(new SceneItemPoint
            {
                Id = "self-test-selected-item-point",
                Label = "Selected ItemPoint",
                X = _document.PlayerSpawn.X,
                Y = _document.PlayerSpawn.Y,
                ItemId = "R0001",
                Quantity = 1,
            });
            _selection = new LayerSelection(SceneLayerKind.ItemPoint, itemPointIndex);
            using (var selectionBitmap = new Bitmap(64, 64))
            using (var selectionGraphics = Graphics.FromImage(selectionBitmap))
            {
                DrawSelectionHandles(selectionGraphics);
            }

            SceneJson.Validate(_document);
        }
        finally
        {
            _document = originalDocument;
            _selection = originalSelection;
            _selectedVertex = originalSelectedVertex;
            _mutationBefore = originalMutationBefore;
            _undo.Clear();
            _redo.Clear();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        try
        {
            var graphics = e.Graphics;
            graphics.Clear(BackColor);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;

            DrawScene(graphics);
            DrawRulers(graphics);
            _paintFailureReported = false;
        }
        catch (Exception exception) when (
            exception is ExternalException or ArgumentException or OutOfMemoryException)
        {
            if (!_paintFailureReported)
            {
                _paintFailureReported = true;
                EditorDiagnostics.Log("Canvas rendering failure", exception);
            }

            try
            {
                e.Graphics.ResetTransform();
                e.Graphics.ResetClip();
                var noticeBounds = new Rectangle(
                    Math.Max(12, ClientRectangle.Width / 2 - 210),
                    Math.Max(12, ClientRectangle.Height - 58),
                    420,
                    38);
                using var noticeBackground = new SolidBrush(Color.FromArgb(220, 34, 38, 45));
                e.Graphics.FillRectangle(noticeBackground, noticeBounds);
                TextRenderer.DrawText(
                    e.Graphics,
                    "本次重繪已略過；場景內容仍保留。",
                    Font,
                    noticeBounds,
                    Color.FromArgb(255, 205, 110),
                    TextFormatFlags.HorizontalCenter |
                    TextFormatFlags.VerticalCenter |
                    TextFormatFlags.SingleLine);
            }
            catch
            {
                // If the native drawing surface itself is unavailable, allow the
                // next scheduled paint to recreate it instead of closing the app.
            }
        }
        finally
        {
            _fastRenderOnce = false;
        }
    }

    internal void RequestFastRender()
    {
        if (IsDisposed || Disposing) return;
        _fastRenderOnce = true;
        Invalidate();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _renderTimer.Stop();
            _renderTimer.Dispose();
            _nodeContextMenu.Dispose();
            _worldPointContextMenu.Dispose();
            _sceneImage?.Dispose();
            _sceneImage = null;
        }

        base.Dispose(disposing);
    }

    private void DrawScene(Graphics graphics)
    {
        var content = ContentRectangle;
        var state = graphics.Save();
        graphics.SetClip(content);
        using (var contentBackground = new SolidBrush(Color.FromArgb(13, 16, 21)))
        {
            graphics.FillRectangle(contentBackground, content);
        }
        graphics.TranslateTransform(RulerSize + _pan.X, RulerSize + _pan.Y);
        graphics.ScaleTransform(_zoom, _zoom);

        if (_sceneImage is null)
        {
            graphics.Restore(state);
            DrawEmptyState(graphics, content);
            return;
        }

        var interactionActive =
            _fastRenderOnce || _panning || _dragMode != DragMode.None || _shapeStart.HasValue;
        graphics.InterpolationMode = interactionActive
            ? InterpolationMode.Bilinear
            : _zoom >= 1.5f
                ? InterpolationMode.NearestNeighbor
                : InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = interactionActive
            ? PixelOffsetMode.HighSpeed
            : PixelOffsetMode.HighQuality;
        graphics.CompositingQuality = interactionActive
            ? CompositingQuality.HighSpeed
            : CompositingQuality.HighQuality;
        graphics.DrawImage(
            _sceneImage,
            new RectangleF(0, 0, _document.World.Width, _document.World.Height));
        DrawGrid(graphics);
        DrawNavMesh(graphics);
        DrawCollisions(graphics);
        DrawInteractables(graphics);
        DrawStoryTriggers(graphics);
        DrawMovementGuides(graphics);
        DrawTeleportPoints(graphics);
        DrawItemPoints(graphics);
        DrawSpawn(graphics);
        DrawDraft(graphics);
        DrawSelectionHandles(graphics);
        graphics.Restore(state);
    }

    private void DrawEmptyState(Graphics graphics, Rectangle content)
    {
        using var titleFont = new Font("Segoe UI", 17, FontStyle.Bold);
        using var hintFont = new Font("Segoe UI", 10);
        using var titleBrush = new SolidBrush(Color.FromArgb(225, 230, 235));
        using var hintBrush = new SolidBrush(Color.FromArgb(140, 150, 160));
        const string title = "請開啟一張場景圖片";
        const string hint = "支援 PNG、JPG、JPEG、WebP、BMP、GIF、TIFF";
        var titleSize = graphics.MeasureString(title, titleFont);
        var hintSize = graphics.MeasureString(hint, hintFont);
        var centerX = content.Left + content.Width / 2f;
        var centerY = content.Top + content.Height / 2f;
        graphics.DrawString(title, titleFont, titleBrush, centerX - titleSize.Width / 2f, centerY - 28);
        graphics.DrawString(hint, hintFont, hintBrush, centerX - hintSize.Width / 2f, centerY + 10);
    }

    private void DrawGrid(Graphics graphics)
    {
        if (!_document.Grid.Visible || _document.Grid.Size <= 0) return;

        var step = _document.Grid.Size;
        var displayStep = step;
        while (displayStep * _zoom < 7) displayStep *= 2;
        using var minorPen = new Pen(Color.FromArgb(54, 222, 230, 235), 1f / _zoom);
        using var majorPen = new Pen(Color.FromArgb(96, 104, 226, 218), 1.2f / _zoom);

        for (var x = 0f; x <= _document.World.Width; x += displayStep)
        {
            var index = (int)Math.Round(x / step);
            graphics.DrawLine(index % 5 == 0 ? majorPen : minorPen, x, 0, x, _document.World.Height);
        }

        for (var y = 0f; y <= _document.World.Height; y += displayStep)
        {
            var index = (int)Math.Round(y / step);
            graphics.DrawLine(index % 5 == 0 ? majorPen : minorPen, 0, y, _document.World.Width, y);
        }
    }

    private void DrawNavMesh(Graphics graphics)
    {
        using var fill = new SolidBrush(Color.FromArgb(62, 78, 236, 139));
        using var outline = new Pen(Color.FromArgb(230, 82, 242, 143), 2f / _zoom);

        for (var index = 0; index < _document.NavMesh.Count; index++)
        {
            var points = ToPointFArray(_document.NavMesh[index].Points);
            if (points.Length < 3) continue;
            graphics.FillPolygon(fill, points);
            graphics.DrawPolygon(outline, points);

            if (_selection == new LayerSelection(SceneLayerKind.NavMesh, index))
            {
                DrawSelectedOutline(graphics, points);
            }
        }
    }

    private void DrawCollisions(Graphics graphics)
    {
        using var fill = new SolidBrush(Color.FromArgb(72, 246, 80, 93));
        using var outline = new Pen(Color.FromArgb(235, 255, 96, 105), 2f / _zoom);

        for (var index = 0; index < _document.Collisions.Count; index++)
        {
            var collision = _document.Collisions[index];
            var selected = _selection == new LayerSelection(SceneLayerKind.Collision, index);

            if (collision.Shape == "circle" && collision.Center is not null)
            {
                var bounds = new RectangleF(
                    collision.Center.X - collision.Radius,
                    collision.Center.Y - collision.Radius,
                    collision.Radius * 2,
                    collision.Radius * 2);
                graphics.FillEllipse(fill, bounds);
                graphics.DrawEllipse(outline, bounds);
                if (selected)
                {
                    using var selectedPen = CreateSelectionPen();
                    graphics.DrawEllipse(selectedPen, bounds);
                }
            }
            else
            {
                var points = ToPointFArray(collision.Points);
                if (points.Length < 3) continue;
                graphics.FillPolygon(fill, points);
                graphics.DrawPolygon(outline, points);
                if (selected) DrawSelectedOutline(graphics, points);
            }
        }
    }

    private void DrawInteractables(Graphics graphics)
    {
        using var fill = new SolidBrush(Color.FromArgb(70, 255, 225, 50));
        using var outline = new Pen(Color.FromArgb(245, 255, 229, 71), 2.5f / _zoom)
        {
            DashStyle = DashStyle.Dash,
        };

        for (var index = 0; index < _document.Interactables.Count; index++)
        {
            var interactable = _document.Interactables[index];
            var points = ToPointFArray(interactable.Points);
            if (points.Length < 3) continue;
            graphics.FillPolygon(fill, points);
            graphics.DrawPolygon(outline, points);
            if (_selection == new LayerSelection(SceneLayerKind.Interactable, index))
            {
                DrawSelectedOutline(graphics, points);
            }

            foreach (var interactionPoint in interactable.EffectiveInteractionPoints)
            {
                DrawInteractionPoint(graphics, interactionPoint);
            }
            if (interactable.InteractionHintPoint is { } interactionHintPoint)
            {
                DrawInteractionHintPoint(graphics, interactionHintPoint);
            }
        }
    }

    private void DrawInteractionPoint(Graphics graphics, InteractionPoint point)
    {
        var center = new PointF(point.X, point.Y);
        var radius = 8f / _zoom;
        using var fill = new SolidBrush(Color.FromArgb(238, 255, 232, 74));
        using var outline = new Pen(Color.FromArgb(245, 45, 40, 18), 2f / _zoom);
        graphics.FillEllipse(fill, center.X - radius, center.Y - radius, radius * 2, radius * 2);
        graphics.DrawEllipse(outline, center.X - radius, center.Y - radius, radius * 2, radius * 2);

        var direction = DirectionVector(point.Facing);
        var length = 29f / _zoom;
        using var arrow = new Pen(Color.FromArgb(255, 255, 244, 136), 3f / _zoom)
        {
            CustomEndCap = new AdjustableArrowCap(4f / _zoom, 5f / _zoom),
        };
        graphics.DrawLine(
            arrow,
            center.X,
            center.Y,
            center.X + direction.X * length,
            center.Y + direction.Y * length);
    }

    private void DrawInteractionHintPoint(Graphics graphics, ScenePoint point)
    {
        var center = new PointF(point.X, point.Y);
        var radius = 7f / _zoom;
        using var glow = new SolidBrush(Color.FromArgb(58, 255, 255, 255));
        using var fill = new SolidBrush(Color.FromArgb(205, 255, 255, 255));
        using var outline = new Pen(Color.FromArgb(245, 105, 219, 238), 2f / _zoom);
        graphics.FillEllipse(
            glow,
            center.X - radius * 1.9f,
            center.Y - radius * 1.9f,
            radius * 3.8f,
            radius * 3.8f);
        graphics.FillEllipse(fill, center.X - radius, center.Y - radius, radius * 2, radius * 2);
        graphics.DrawEllipse(outline, center.X - radius, center.Y - radius, radius * 2, radius * 2);
    }

    private void DrawStoryTriggers(Graphics graphics)
    {
        using var fill = new SolidBrush(Color.FromArgb(62, 185, 104, 255));
        using var outline = new Pen(Color.FromArgb(245, 206, 145, 255), 2.5f / _zoom)
        {
            DashStyle = DashStyle.DashDot,
        };

        for (var index = 0; index < _document.StoryTriggers.Count; index++)
        {
            var points = ToPointFArray(_document.StoryTriggers[index].Points);
            if (points.Length < 3) continue;
            graphics.FillPolygon(fill, points);
            graphics.DrawPolygon(outline, points);
            if (_selection == new LayerSelection(SceneLayerKind.StoryTrigger, index))
            {
                DrawSelectedOutline(graphics, points);
            }
        }
    }

    private void DrawMovementGuides(Graphics graphics)
    {
        for (var index = 0; index < _document.MovementGuides.Count; index++)
        {
            var guide = _document.MovementGuides[index];
            var points = ToPointFArray(guide.Points);
            if (points.Length < 2) continue;

            using var corridor = new Pen(Color.FromArgb(54, 92, 203, 255), Math.Max(4, guide.Width))
            {
                StartCap = LineCap.Round,
                EndCap = LineCap.Round,
                LineJoin = LineJoin.Round,
            };
            graphics.DrawLines(corridor, points);

            using var arrow = new Pen(Color.FromArgb(245, 93, 218, 255), 3f / _zoom)
            {
                DashStyle = DashStyle.Dash,
                LineJoin = LineJoin.Round,
                CustomStartCap = new AdjustableArrowCap(4f / _zoom, 5f / _zoom),
                CustomEndCap = new AdjustableArrowCap(4f / _zoom, 5f / _zoom),
            };
            graphics.DrawLines(arrow, points);

            if (_selection == new LayerSelection(SceneLayerKind.MovementGuide, index))
            {
                using var selected = new Pen(Color.FromArgb(240, 255, 229, 72), 2f / _zoom)
                {
                    DashStyle = DashStyle.Dot,
                };
                graphics.DrawLines(selected, points);
            }
        }
    }

    private void DrawSelectedOutline(Graphics graphics, PointF[] points)
    {
        using var selectedPen = CreateSelectionPen();
        graphics.DrawPolygon(selectedPen, points);
    }

    private Pen CreateSelectionPen()
    {
        var pen = new Pen(Color.FromArgb(255, 255, 215, 72), 3f / _zoom)
        {
            DashStyle = DashStyle.Dash,
        };
        return pen;
    }

    private void DrawSpawn(Graphics graphics)
    {
        var spawn = _document.PlayerSpawn;
        var radius = 9f / _zoom;
        using var fill = new SolidBrush(Color.FromArgb(230, 70, 226, 255));
        using var outline = new Pen(Color.White, 2f / _zoom);
        graphics.FillEllipse(fill, spawn.X - radius, spawn.Y - radius, radius * 2, radius * 2);
        graphics.DrawEllipse(outline, spawn.X - radius, spawn.Y - radius, radius * 2, radius * 2);

        var direction = DirectionVector(spawn.Facing);
        var length = 34f / _zoom;
        var end = new PointF(spawn.X + direction.X * length, spawn.Y + direction.Y * length);
        using var directionPen = new Pen(Color.FromArgb(240, 78, 230, 255), 3f / _zoom)
        {
            CustomEndCap = new AdjustableArrowCap(4f / _zoom, 5f / _zoom),
        };
        graphics.DrawLine(directionPen, spawn.X, spawn.Y, end.X, end.Y);
    }

    private void DrawTeleportPoints(Graphics graphics)
    {
        using var labelFont = new Font("Segoe UI", 8f, FontStyle.Bold);
        using var labelBrush = new SolidBrush(Color.FromArgb(245, 190, 255, 255));
        for (var index = 0; index < _document.TeleportPoints.Count; index++)
        {
            var point = _document.TeleportPoints[index];
            var selected = _selection == new LayerSelection(SceneLayerKind.TeleportPoint, index);
            var radius = (selected ? 11f : 9f) / _zoom;
            using var fill = new SolidBrush(selected
                ? Color.FromArgb(245, 93, 242, 255)
                : Color.FromArgb(225, 35, 190, 224));
            using var outline = new Pen(Color.White, (selected ? 3f : 2f) / _zoom);
            graphics.FillRectangle(fill, point.X - radius, point.Y - radius, radius * 2, radius * 2);
            graphics.DrawRectangle(outline, point.X - radius, point.Y - radius, radius * 2, radius * 2);

            var direction = DirectionVector(point.Facing);
            var length = 34f / _zoom;
            using var directionPen = new Pen(Color.FromArgb(245, 95, 240, 255), 3f / _zoom)
            {
                CustomEndCap = new AdjustableArrowCap(4f / _zoom, 5f / _zoom),
            };
            graphics.DrawLine(directionPen, point.X, point.Y,
                point.X + direction.X * length, point.Y + direction.Y * length);
            graphics.DrawString($"{point.Label} · {point.Id}", labelFont, labelBrush,
                point.X + 13f / _zoom, point.Y - 19f / _zoom);
        }
    }

    private void DrawItemPoints(Graphics graphics)
    {
        using var labelFont = new Font("Segoe UI", 8f, FontStyle.Bold);
        using var labelBrush = new SolidBrush(Color.FromArgb(235, 255, 245, 184));
        for (var index = 0; index < _document.ItemPoints.Count; index++)
        {
            var point = _document.ItemPoints[index];
            var selected = _selection == new LayerSelection(SceneLayerKind.ItemPoint, index);
            var radius = (selected ? 10f : 8f) / _zoom;
            using var fill = new SolidBrush(
                selected
                    ? Color.FromArgb(245, 255, 207, 73)
                    : Color.FromArgb(220, 255, 169, 56));
            using var outline = new Pen(Color.FromArgb(245, 255, 252, 222), (selected ? 3f : 2f) / _zoom);
            var diamond = new[]
            {
                new PointF(point.X, point.Y - radius),
                new PointF(point.X + radius, point.Y),
                new PointF(point.X, point.Y + radius),
                new PointF(point.X - radius, point.Y),
            };
            graphics.FillPolygon(fill, diamond);
            graphics.DrawPolygon(outline, diamond);
            if (point.ShowOnMinimap)
            {
                using var minimapPen = new Pen(Color.FromArgb(230, 94, 247, 236), 1.5f / _zoom)
                {
                    DashStyle = DashStyle.Dot,
                };
                graphics.DrawEllipse(
                    minimapPen,
                    point.X - radius * 1.7f,
                    point.Y - radius * 1.7f,
                    radius * 3.4f,
                    radius * 3.4f);
            }
            graphics.DrawString(
                $"{point.Label} · {point.ItemId} ×{point.Quantity}",
                labelFont,
                labelBrush,
                point.X + 12f / _zoom,
                point.Y - 18f / _zoom);
        }
    }

    private void DrawDraft(Graphics graphics)
    {
        using var pen = new Pen(Color.FromArgb(245, 255, 226, 101), 2f / _zoom)
        {
            DashStyle = DashStyle.Dash,
        };
        using var fill = new SolidBrush(Color.FromArgb(45, 255, 226, 101));

        if (_draftPoints.Count > 0)
        {
            var points = ToPointFArray(_draftPoints);
            if (points.Length >= 2) graphics.DrawLines(pen, points);
            var last = points[^1];
            graphics.DrawLine(pen, last, _draftCursor);
            if (points.Length >= 3 && _tool != EditorTool.MovementGuide)
            {
                var preview = points.Append(_draftCursor).ToArray();
                graphics.FillPolygon(fill, preview);
            }

            DrawVertexHandle(graphics, points[0], Color.FromArgb(255, 113, 244, 155), 5f);
            foreach (var point in points.Skip(1))
            {
                DrawVertexHandle(graphics, point, Color.FromArgb(255, 255, 226, 101), 4f);
            }
        }

        if (_shapeStart.HasValue && _shapeEnd.HasValue)
        {
            var start = _shapeStart.Value;
            var end = _shapeEnd.Value;
            if (_tool == EditorTool.CollisionRectangle)
            {
                var rectangle = RectangleFromPoints(start, end);
                graphics.FillRectangle(fill, rectangle);
                graphics.DrawRectangle(pen, rectangle.X, rectangle.Y, rectangle.Width, rectangle.Height);
            }
            else if (_tool == EditorTool.CollisionCircle)
            {
                var radius = Distance(start, end);
                graphics.FillEllipse(fill, start.X - radius, start.Y - radius, radius * 2, radius * 2);
                graphics.DrawEllipse(pen, start.X - radius, start.Y - radius, radius * 2, radius * 2);
            }
        }
    }

    private void DrawSelectionHandles(Graphics graphics)
    {
        if (!IsValidSelection(_selection)) return;
        // Point layers draw their own selection marker and have no polygon vertices.
        if (_selection.Kind is SceneLayerKind.ItemPoint or SceneLayerKind.TeleportPoint) return;

        if (_selection.Kind == SceneLayerKind.Collision)
        {
            var collision = _document.Collisions[_selection.Index];
            if (collision.Shape == "circle" && collision.Center is not null)
            {
                DrawVertexHandle(
                    graphics,
                    new PointF(collision.Center.X + collision.Radius, collision.Center.Y),
                    Color.FromArgb(255, 255, 215, 72),
                    5f);
                return;
            }

            var points = collision.Points ?? new List<ScenePoint>();
            for (var index = 0; index < points.Count; index++)
            {
                var point = points[index];
                DrawVertexHandle(
                    graphics,
                    new PointF(point.X, point.Y),
                    index == _selectedVertex
                        ? Color.FromArgb(255, 82, 229, 255)
                        : Color.FromArgb(255, 255, 215, 72),
                    index == _selectedVertex ? 6.5f : 5f);
            }
        }
        else
        {
            var points = _selection.Kind switch
            {
                SceneLayerKind.NavMesh => _document.NavMesh[_selection.Index].Points,
                SceneLayerKind.Interactable => _document.Interactables[_selection.Index].Points,
                SceneLayerKind.StoryTrigger => _document.StoryTriggers[_selection.Index].Points,
                SceneLayerKind.MovementGuide => _document.MovementGuides[_selection.Index].Points,
                _ => null,
            };
            if (points is null) return;
            for (var index = 0; index < points.Count; index++)
            {
                var point = points[index];
                DrawVertexHandle(
                    graphics,
                    new PointF(point.X, point.Y),
                    index == _selectedVertex
                        ? Color.FromArgb(255, 82, 229, 255)
                        : Color.FromArgb(255, 255, 215, 72),
                    index == _selectedVertex ? 6.5f : 5f);
            }
        }
    }

    private void DrawVertexHandle(Graphics graphics, PointF point, Color color, float sizeOnScreen)
    {
        var size = sizeOnScreen / _zoom;
        using var fill = new SolidBrush(color);
        using var outline = new Pen(Color.FromArgb(240, 20, 23, 27), 1.2f / _zoom);
        graphics.FillRectangle(fill, point.X - size, point.Y - size, size * 2, size * 2);
        graphics.DrawRectangle(outline, point.X - size, point.Y - size, size * 2, size * 2);
    }

    private void DrawRulers(Graphics graphics)
    {
        using var background = new SolidBrush(Color.FromArgb(32, 36, 44));
        using var border = new Pen(Color.FromArgb(69, 76, 88));
        using var tickPen = new Pen(Color.FromArgb(130, 142, 154));
        using var textBrush = new SolidBrush(Color.FromArgb(188, 196, 204));
        using var font = new Font("Segoe UI", 7.5f);

        graphics.FillRectangle(background, 0, 0, Width, RulerSize);
        graphics.FillRectangle(background, 0, 0, RulerSize, Height);
        graphics.DrawLine(border, 0, RulerSize - 1, Width, RulerSize - 1);
        graphics.DrawLine(border, RulerSize - 1, 0, RulerSize - 1, Height);

        if (_sceneImage is null) return;

        var tickInterval = 10f;
        while (tickInterval * _zoom < 58) tickInterval *= 2;
        var content = ContentRectangle;
        var leftWorld = (content.Left - RulerSize - _pan.X) / _zoom;
        var rightWorld = (content.Right - RulerSize - _pan.X) / _zoom;
        var topWorld = (content.Top - RulerSize - _pan.Y) / _zoom;
        var bottomWorld = (content.Bottom - RulerSize - _pan.Y) / _zoom;

        for (var value = (float)Math.Floor(leftWorld / tickInterval) * tickInterval; value <= rightWorld; value += tickInterval)
        {
            var x = RulerSize + _pan.X + value * _zoom;
            if (x < RulerSize || x > Width) continue;
            graphics.DrawLine(tickPen, x, RulerSize - 9, x, RulerSize);
            graphics.DrawString(Math.Round(value).ToString(), font, textBrush, x + 2, 2);
        }

        for (var value = (float)Math.Floor(topWorld / tickInterval) * tickInterval; value <= bottomWorld; value += tickInterval)
        {
            var y = RulerSize + _pan.Y + value * _zoom;
            if (y < RulerSize || y > Height) continue;
            graphics.DrawLine(tickPen, RulerSize - 9, y, RulerSize, y);
            graphics.TranslateTransform(2, y + 2);
            graphics.RotateTransform(-90);
            graphics.DrawString(Math.Round(value).ToString(), font, textBrush, 0, 0);
            graphics.ResetTransform();
        }

        graphics.FillRectangle(background, 0, 0, RulerSize, RulerSize);
        graphics.DrawRectangle(border, 0, 0, RulerSize - 1, RulerSize - 1);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();
        _lastMouseScreen = e.Location;

        if (e.Button == MouseButtons.Middle || _tool == EditorTool.Pan || (_spacePressed && e.Button == MouseButtons.Left))
        {
            _panning = true;
            Cursor = Cursors.Hand;
            Capture = true;
            return;
        }

        var rawWorld = ScreenToWorld(e.Location);
        var world = SnapAndClamp(rawWorld);
        _draftCursor = world;

        if (e.Button == MouseButtons.Right && IsPolygonTool(_tool))
        {
            FinishPolygon();
            return;
        }

        if (e.Button == MouseButtons.Right && _tool == EditorTool.Select)
        {
            if (TryShowWorldPointContextMenu(e.Location, rawWorld)) return;
            ShowNodeContextMenu(e.Location, rawWorld);
            return;
        }

        if (e.Button != MouseButtons.Left || !IsInsideWorld(rawWorld)) return;

        switch (_tool)
        {
            case EditorTool.NavMeshPolygon:
            case EditorTool.CollisionPolygon:
            case EditorTool.InteractionPolygon:
            case EditorTool.StoryTriggerPolygon:
            case EditorTool.MovementGuide:
                if (e.Clicks >= 2)
                {
                    FinishPolygon();
                }
                else if (
                    _tool != EditorTool.MovementGuide &&
                    _draftPoints.Count >= 3 &&
                    Distance(ToPointF(_draftPoints[0]), world) <= 9f / _zoom)
                {
                    FinishPolygon();
                }
                else
                {
                    _draftPoints.Add(new ScenePoint(world.X, world.Y));
                    Invalidate();
                }
                break;

            case EditorTool.CollisionRectangle:
            case EditorTool.CollisionCircle:
                _shapeStart = world;
                _shapeEnd = world;
                Capture = true;
                break;

            case EditorTool.PlayerSpawn:
                PerformMutation(() =>
                {
                    _document.PlayerSpawn.X = world.X;
                    _document.PlayerSpawn.Y = world.Y;
                });
                break;

            case EditorTool.TeleportPoint:
                if (!IsPointInsideNavMesh(world))
                {
                    StatusChanged?.Invoke(this, "傳送 Point 必須位於 NavMesh 範圍內。");
                    break;
                }
                PerformMutation(() =>
                {
                    var index = _document.TeleportPoints.Count;
                    _document.TeleportPoints.Add(new SceneTeleportPoint
                    {
                        Id = NextId("teleport-point", _document.TeleportPoints.Select(item => item.Id)),
                        Label = $"傳送點 {index + 1}",
                        X = world.X,
                        Y = world.Y,
                        Facing = "S",
                    });
                    _selection = new LayerSelection(SceneLayerKind.TeleportPoint, index);
                });
                SelectionChanged?.Invoke(this, EventArgs.Empty);
                break;

            case EditorTool.Select:
                BeginSelectDrag(
                    rawWorld,
                    ModifierKeys.HasFlag(Keys.Alt));
                break;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        var rawWorld = ScreenToWorld(e.Location);
        var world = SnapAndClamp(rawWorld);
        _draftCursor = world;
        PublishPointerStatus(rawWorld);

        if (_panning)
        {
            var deltaX = e.X - _lastMouseScreen.X;
            var deltaY = e.Y - _lastMouseScreen.Y;
            _lastMouseScreen = e.Location;
            if (deltaX == 0 && deltaY == 0) return;
            _pan.X += deltaX;
            _pan.Y += deltaY;
            RequestRender();
            return;
        }

        if (_shapeStart.HasValue)
        {
            if (_shapeEnd == world) return;
            _shapeEnd = world;
            RequestRender();
            return;
        }

        if (_dragMode != DragMode.None)
        {
            if (UpdateSelectionDrag(world)) RequestRender();
            return;
        }

        if (_draftPoints.Count > 0) RequestRender();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        PublishPointerStatus(ScreenToWorld(e.Location), force: true);

        if (_panning)
        {
            _panning = false;
            ReleaseMouseCapture();
            UpdateCursor();
            OnViewChanged();
            return;
        }

        if (_shapeStart.HasValue && _shapeEnd.HasValue && e.Button == MouseButtons.Left)
        {
            FinishPresetShape();
            ReleaseMouseCapture();
            return;
        }

        if (_dragMode != DragMode.None)
        {
            _dragMode = DragMode.None;
            _activeHandle = -1;
            ReleaseMouseCapture();
            CommitMutation();
        }
    }

    protected override void OnMouseCaptureChanged(EventArgs e)
    {
        base.OnMouseCaptureChanged(e);
        if (_endingCapture || Capture || IsDisposed || Disposing) return;

        var viewChanged = _panning;
        _panning = false;

        if (_shapeStart.HasValue)
        {
            _shapeStart = null;
            _shapeEnd = null;
        }

        if (_dragMode != DragMode.None)
        {
            _dragMode = DragMode.None;
            _activeHandle = -1;
            CommitMutation();
        }

        UpdateCursor();
        if (viewChanged) OnViewChanged();
        else RequestRender();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        _spacePressed = false;
        if (!_panning) UpdateCursor();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        SetZoomAt(_zoom * (e.Delta > 0 ? 1.12f : 1f / 1.12f), e.Location);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);

        if (e.KeyCode == Keys.Space)
        {
            _spacePressed = true;
            Cursor = Cursors.Hand;
            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Escape)
        {
            CancelDraft();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.Enter && IsPolygonTool(_tool))
        {
            FinishPolygon();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.Delete)
        {
            DeleteSelectedNodeOrShape();
            e.Handled = true;
        }
        else if (e.Control && e.KeyCode == Keys.Z)
        {
            Undo();
            e.Handled = true;
        }
        else if (e.Control && e.KeyCode == Keys.Y)
        {
            Redo();
            e.Handled = true;
        }
        else if (e.Control && e.KeyCode == Keys.D0)
        {
            FitToView();
            e.Handled = true;
        }
        else if (e.KeyCode is Keys.Add or Keys.Oemplus)
        {
            ZoomBy(1.12f);
            e.Handled = true;
        }
        else if (e.KeyCode is Keys.Subtract or Keys.OemMinus)
        {
            ZoomBy(1f / 1.12f);
            e.Handled = true;
        }
    }

    protected override void OnKeyUp(KeyEventArgs e)
    {
        base.OnKeyUp(e);
        if (e.KeyCode != Keys.Space) return;
        _spacePressed = false;
        if (!_panning) UpdateCursor();
    }

    private void BeginSelectDrag(PointF world, bool cycleOverlappingShapes = false)
    {
        var handle = cycleOverlappingShapes ? -1 : HitSelectedHandle(world);
        if (handle >= 0)
        {
            SetSelectedVertex(SelectedEditablePolygonPoints() is null ? -1 : handle);
            BeginMutation();
            _activeHandle = handle;
            _dragMode = IsSelectedCircle() ? DragMode.CircleRadius : DragMode.Vertex;
            _lastDragWorld = SnapAndClamp(world);
            Capture = true;
            return;
        }

        var hit = cycleOverlappingShapes
            ? CycleHitTest(world)
            : HitTest(world);
        SetSelectedVertex(-1);
        SelectLayer(hit);
        if (!IsValidSelection(hit)) return;

        if (cycleOverlappingShapes)
        {
            StatusChanged?.Invoke(
                this,
                $"已循環選取重疊圖形：{DescribeSelection(hit)}");
        }

        BeginMutation();
        _lastDragWorld = SnapAndClamp(world);
        _dragMode = DragMode.MoveShape;
        Capture = true;
    }

    private bool UpdateSelectionDrag(PointF world)
    {
        if (!IsValidSelection(_selection) || !IsFinite(world)) return false;

        if (_dragMode == DragMode.CircleRadius)
        {
            var collision = _document.Collisions[_selection.Index];
            if (collision.Center is not null)
            {
                var radius = Math.Max(2, Distance(new PointF(collision.Center.X, collision.Center.Y), world));
                if (Math.Abs(collision.Radius - radius) < 0.001f) return false;
                collision.Radius = radius;
                return true;
            }
            return false;
        }

        if (_dragMode == DragMode.Vertex)
        {
            var points = SelectedPoints();
            if (points is not null && _activeHandle >= 0 && _activeHandle < points.Count)
            {
                if (
                    Math.Abs(points[_activeHandle].X - world.X) < 0.001f &&
                    Math.Abs(points[_activeHandle].Y - world.Y) < 0.001f)
                {
                    return false;
                }

                points[_activeHandle].X = world.X;
                points[_activeHandle].Y = world.Y;
                return true;
            }
            return false;
        }

        var deltaX = world.X - _lastDragWorld.X;
        var deltaY = world.Y - _lastDragWorld.Y;
        _lastDragWorld = world;
        if (Math.Abs(deltaX) < 0.001f && Math.Abs(deltaY) < 0.001f) return false;

        if (_selection.Kind == SceneLayerKind.Collision)
        {
            var collision = _document.Collisions[_selection.Index];
            if (collision.Shape == "circle" && collision.Center is not null)
            {
                collision.Center.X += deltaX;
                collision.Center.Y += deltaY;
            }
            else
            {
                MovePoints(collision.Points, deltaX, deltaY);
            }
        }
        else if (_selection.Kind == SceneLayerKind.NavMesh)
        {
            MovePoints(_document.NavMesh[_selection.Index].Points, deltaX, deltaY);
        }
        else if (_selection.Kind == SceneLayerKind.Interactable)
        {
            var interactable = _document.Interactables[_selection.Index];
            MovePoints(interactable.Points, deltaX, deltaY);
            foreach (var interactionPoint in interactable.EffectiveInteractionPoints)
            {
                interactionPoint.X += deltaX;
                interactionPoint.Y += deltaY;
            }
            if (interactable.InteractionHintPoint is { } interactionHintPoint)
            {
                interactionHintPoint.X += deltaX;
                interactionHintPoint.Y += deltaY;
            }
        }
        else if (_selection.Kind == SceneLayerKind.StoryTrigger)
        {
            MovePoints(_document.StoryTriggers[_selection.Index].Points, deltaX, deltaY);
        }
        else if (_selection.Kind == SceneLayerKind.MovementGuide)
        {
            MovePoints(_document.MovementGuides[_selection.Index].Points, deltaX, deltaY);
        }
        else if (_selection.Kind == SceneLayerKind.ItemPoint)
        {
            var itemPoint = _document.ItemPoints[_selection.Index];
            var next = ClampToWorld(new PointF(itemPoint.X + deltaX, itemPoint.Y + deltaY));
            if (!IsPointInsideNavMesh(next)) return false;
            itemPoint.X = next.X;
            itemPoint.Y = next.Y;
        }
        else if (_selection.Kind == SceneLayerKind.TeleportPoint)
        {
            var point = _document.TeleportPoints[_selection.Index];
            var next = ClampToWorld(new PointF(point.X + deltaX, point.Y + deltaY));
            if (!IsPointInsideNavMesh(next)) return false;
            point.X = next.X;
            point.Y = next.Y;
        }

        return true;
    }

    private void FinishPolygon()
    {
        var minimumPoints = _tool == EditorTool.MovementGuide ? 2 : 3;
        if (_draftPoints.Count < minimumPoints)
        {
            CancelDraft();
            return;
        }

        var points = _draftPoints.Select(point => point.Clone()).ToList();
        if (
            _tool != EditorTool.MovementGuide &&
            points.Count > 3 &&
            Distance(ToPointF(points[0]), ToPointF(points[^1])) < 0.5f)
        {
            points.RemoveAt(points.Count - 1);
        }

        PerformMutation(() =>
        {
            if (_tool == EditorTool.NavMeshPolygon)
            {
                var index = _document.NavMesh.Count;
                _document.NavMesh.Add(new NavMeshRegion
                {
                    Id = NextId("nav", _document.NavMesh.Select(item => item.Id)),
                    Label = $"NavMesh {index + 1}",
                    Points = points,
                });
                _selection = new LayerSelection(SceneLayerKind.NavMesh, index);
                _selectedVertex = -1;
            }
            else if (_tool == EditorTool.CollisionPolygon)
            {
                var index = _document.Collisions.Count;
                _document.Collisions.Add(new CollisionShape
                {
                    Id = NextId("collision", _document.Collisions.Select(item => item.Id)),
                    Label = $"多邊形碰撞 {index + 1}",
                    Shape = "polygon",
                    Points = points,
                });
                _selection = new LayerSelection(SceneLayerKind.Collision, index);
                _selectedVertex = -1;
            }
            else if (_tool == EditorTool.InteractionPolygon)
            {
                var index = _document.Interactables.Count;
                var defaults = InteractionTypeDefaults.Get("dialogue");
                _document.Interactables.Add(new SceneInteractable
                {
                    Id = NextId("interaction", _document.Interactables.Select(item => item.Id)),
                    Label = $"互動區域 {index + 1}",
                    Shape = "polygon",
                    Points = points,
                    Type = defaults.Id,
                    Verb = defaults.Verb,
                    SurvivalEffects = defaults.Effects.Clone(),
                    DailyInteractionLimit = defaults.DailyLimit,
                    Dialogue = DialogueScript.CreateDefault(),
                });
                _selection = new LayerSelection(SceneLayerKind.Interactable, index);
                _selectedVertex = -1;
            }
            else if (_tool == EditorTool.StoryTriggerPolygon)
            {
                var index = _document.StoryTriggers.Count;
                _document.StoryTriggers.Add(new StoryTriggerZone
                {
                    Id = NextId("story-trigger", _document.StoryTriggers.Select(item => item.Id)),
                    Label = $"劇情觸發區 {index + 1}",
                    Points = points,
                    Once = true,
                    DialogueId = "",
                });
                _selection = new LayerSelection(SceneLayerKind.StoryTrigger, index);
                _selectedVertex = -1;
            }
            else
            {
                var index = _document.MovementGuides.Count;
                _document.MovementGuides.Add(new MovementGuide
                {
                    Id = NextId("guide", _document.MovementGuides.Select(item => item.Id)),
                    Label = $"強制引導線 {index + 1}",
                    Points = points,
                    Width = 36,
                    Bidirectional = true,
                });
                _selection = new LayerSelection(SceneLayerKind.MovementGuide, index);
                _selectedVertex = -1;
            }
        });

        _draftPoints.Clear();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    private void FinishPresetShape()
    {
        var start = _shapeStart!.Value;
        var end = _shapeEnd!.Value;
        _shapeStart = null;
        _shapeEnd = null;

        if (_tool == EditorTool.CollisionCircle)
        {
            var radius = Distance(start, end);
            if (radius < 2) return;

            PerformMutation(() =>
            {
                var index = _document.Collisions.Count;
                _document.Collisions.Add(new CollisionShape
                {
                    Id = NextId("collision", _document.Collisions.Select(item => item.Id)),
                    Label = $"圓形碰撞 {index + 1}",
                    Shape = "circle",
                    Center = new ScenePoint(start.X, start.Y),
                    Radius = radius,
                });
                _selection = new LayerSelection(SceneLayerKind.Collision, index);
                _selectedVertex = -1;
            });
        }
        else
        {
            var rectangle = RectangleFromPoints(start, end);
            if (rectangle.Width < 2 || rectangle.Height < 2) return;

            PerformMutation(() =>
            {
                var index = _document.Collisions.Count;
                _document.Collisions.Add(new CollisionShape
                {
                    Id = NextId("collision", _document.Collisions.Select(item => item.Id)),
                    Label = $"矩形碰撞 {index + 1}",
                    Shape = "rectangle",
                    Points = new List<ScenePoint>
                    {
                        new(rectangle.Left, rectangle.Top),
                        new(rectangle.Right, rectangle.Top),
                        new(rectangle.Right, rectangle.Bottom),
                        new(rectangle.Left, rectangle.Bottom),
                    },
                });
                _selection = new LayerSelection(SceneLayerKind.Collision, index);
                _selectedVertex = -1;
            });
        }

        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    private LayerSelection HitTest(PointF point)
    {
        return GetHitTestCandidates(point).FirstOrDefault(LayerSelection.None);
    }

    private LayerSelection CycleHitTest(PointF point)
    {
        var candidates = GetHitTestCandidates(point);
        if (candidates.Count == 0) return LayerSelection.None;
        var currentIndex = candidates.IndexOf(_selection);
        return candidates[(currentIndex + 1) % candidates.Count];
    }

    private List<LayerSelection> GetHitTestCandidates(PointF point)
    {
        var candidates = new List<LayerSelection>();
        var teleportPointHitRadius = 14f / _zoom;
        for (var index = _document.TeleportPoints.Count - 1; index >= 0; index--)
        {
            var teleportPoint = _document.TeleportPoints[index];
            if (Distance(point, new PointF(teleportPoint.X, teleportPoint.Y)) <= teleportPointHitRadius)
            {
                candidates.Add(new LayerSelection(SceneLayerKind.TeleportPoint, index));
            }
        }
        var itemPointHitRadius = 13f / _zoom;
        for (var index = _document.ItemPoints.Count - 1; index >= 0; index--)
        {
            var itemPoint = _document.ItemPoints[index];
            if (Distance(point, new PointF(itemPoint.X, itemPoint.Y)) <= itemPointHitRadius)
            {
                candidates.Add(new LayerSelection(SceneLayerKind.ItemPoint, index));
            }
        }
        for (var index = _document.MovementGuides.Count - 1; index >= 0; index--)
        {
            var guide = _document.MovementGuides[index];
            for (var segment = 0; segment < guide.Points.Count - 1; segment++)
            {
                var nearest = ClosestPointOnSegment(
                    point,
                    ToPointF(guide.Points[segment]),
                    ToPointF(guide.Points[segment + 1]));
                if (Distance(point, nearest) <= guide.Width / 2f + 7f / _zoom)
                {
                    candidates.Add(new LayerSelection(SceneLayerKind.MovementGuide, index));
                    break;
                }
            }
        }

        for (var index = _document.StoryTriggers.Count - 1; index >= 0; index--)
        {
            if (PointInPolygon(point, _document.StoryTriggers[index].Points))
            {
                candidates.Add(new LayerSelection(SceneLayerKind.StoryTrigger, index));
            }
        }

        for (var index = _document.Interactables.Count - 1; index >= 0; index--)
        {
            if (PointInPolygon(point, _document.Interactables[index].Points))
            {
                candidates.Add(new LayerSelection(SceneLayerKind.Interactable, index));
            }
        }

        for (var index = _document.Collisions.Count - 1; index >= 0; index--)
        {
            var collision = _document.Collisions[index];
            var hit = collision.Shape == "circle" && collision.Center is not null
                ? Distance(point, new PointF(collision.Center.X, collision.Center.Y)) <= collision.Radius
                : PointInPolygon(point, collision.Points);
            if (hit) candidates.Add(new LayerSelection(SceneLayerKind.Collision, index));
        }

        for (var index = _document.NavMesh.Count - 1; index >= 0; index--)
        {
            if (PointInPolygon(point, _document.NavMesh[index].Points))
            {
                candidates.Add(new LayerSelection(SceneLayerKind.NavMesh, index));
            }
        }

        return candidates;
    }

    private int HitSelectedHandle(PointF point)
    {
        if (!IsValidSelection(_selection)) return -1;
        var threshold = 8f / _zoom;

        if (IsSelectedCircle())
        {
            var collision = _document.Collisions[_selection.Index];
            var handle = new PointF(collision.Center!.X + collision.Radius, collision.Center.Y);
            return Distance(point, handle) <= threshold ? 0 : -1;
        }

        var points = SelectedPoints();
        if (points is null) return -1;
        for (var index = 0; index < points.Count; index++)
        {
            if (Distance(point, ToPointF(points[index])) <= threshold) return index;
        }

        return -1;
    }

    private bool TryShowWorldPointContextMenu(Point screenLocation, PointF world)
    {
        if (!IsInsideWorld(world)) return false;
        _contextWorldPoint = SnapAndClamp(world);
        var topmostHit = HitTest(world);
        _contextItemPointIndex = topmostHit.Kind == SceneLayerKind.ItemPoint
            ? topmostHit.Index
            : -1;

        if (_contextItemPointIndex >= 0)
        {
            SelectLayer(new LayerSelection(SceneLayerKind.ItemPoint, _contextItemPointIndex));
            var itemPoint = _document.ItemPoints[_contextItemPointIndex];
            PopulateItemPointItemMenu(itemPoint);
            _moveSpawnContextItem.Visible = false;
            _addItemPointContextItem.Visible = false;
            _assignItemPointItemContextItem.Visible = true;
            _deleteItemPointContextItem.Visible = true;
            _worldPointContextMenu.Show(this, screenLocation);
            return true;
        }

        // NavMesh is drawn beneath collision, interaction, story-trigger and guide layers.
        // Its world menu must not intercept a right-click that visually belongs to one of
        // those upper layers.
        if (topmostHit.Kind != SceneLayerKind.NavMesh) return false;

        if (
            _selection.Kind == SceneLayerKind.NavMesh &&
            IsValidSelection(_selection) &&
            (HitSelectedHandle(world) >= 0 ||
             TryFindNearestSelectedEdge(world, out _, out _)))
        {
            return false;
        }

        if (!IsPointInsideNavMesh(_contextWorldPoint)) return false;
        _moveSpawnContextItem.Text = "移動出生點至此";
        _moveSpawnContextItem.Visible = true;
        _addItemPointContextItem.Visible = true;
        _assignItemPointItemContextItem.Visible = false;
        _deleteItemPointContextItem.Visible = false;
        _worldPointContextMenu.Show(this, screenLocation);
        return true;
    }

    private void PopulateItemPointItemMenu(SceneItemPoint itemPoint)
    {
        _assignItemPointItemContextItem.DropDownItems.Clear();
        foreach (var item in ItemCatalog.All)
        {
            var menuItem = new ToolStripMenuItem(item.ToString())
            {
                Checked = item.Id.Equals(itemPoint.ItemId, StringComparison.OrdinalIgnoreCase),
                Tag = item.Id,
            };
            menuItem.Click += (_, _) =>
            {
                if (menuItem.Tag is not string itemId) return;
                SetItemPointItemAtContext(itemId);
            };
            _assignItemPointItemContextItem.DropDownItems.Add(menuItem);
        }
        _assignItemPointItemContextItem.DropDownItems.Add(new ToolStripSeparator());
        _assignItemPointItemContextItem.DropDownItems.Add(new ToolStripLabel("生成數量（1～99）"));
        _itemPointQuantityContextTextBox.Text = itemPoint.Quantity.ToString();
        _assignItemPointItemContextItem.DropDownItems.Add(_itemPointQuantityContextTextBox);
    }

    private void SetPlayerSpawnAtContext()
    {
        if (!IsPointInsideNavMesh(_contextWorldPoint)) return;
        PerformMutation(() =>
        {
            _document.PlayerSpawn.X = _contextWorldPoint.X;
            _document.PlayerSpawn.Y = _contextWorldPoint.Y;
        });
        StatusChanged?.Invoke(this, "已將玩家出生點移動到此處。");
    }

    private void AddItemPointAtContext()
    {
        if (!IsPointInsideNavMesh(_contextWorldPoint)) return;
        var index = _document.ItemPoints.Count;
        PerformMutation(() =>
        {
            _document.ItemPoints.Add(new SceneItemPoint
            {
                Id = NextId("item-point", _document.ItemPoints.Select(item => item.Id)),
                Label = $"ItemPoint {index + 1}",
                X = _contextWorldPoint.X,
                Y = _contextWorldPoint.Y,
                ItemId = ItemCatalog.All.FirstOrDefault()?.Id ?? "R0001",
                Quantity = 1,
                SpawnPolicy = "once",
                ShowOnMinimap = false,
            });
            _selection = new LayerSelection(SceneLayerKind.ItemPoint, index);
            _selectedVertex = -1;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, "已新增 ItemPoint；請在右側設定道具、數量與生成規則。");
    }

    private void SetItemPointItemAtContext(string itemId)
    {
        if (_contextItemPointIndex < 0 || _contextItemPointIndex >= _document.ItemPoints.Count) return;
        var item = ItemCatalog.Find(itemId);
        if (item is null) return;
        PerformMutation(() => _document.ItemPoints[_contextItemPointIndex].ItemId = item.Id);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, $"此 ItemPoint 已指定生成 {item.Id} · {item.Name}。");
    }

    private void SetItemPointQuantityAtContext(string text)
    {
        if (_contextItemPointIndex < 0 || _contextItemPointIndex >= _document.ItemPoints.Count) return;
        if (!int.TryParse(text, out var quantity)) quantity = 1;
        quantity = Math.Clamp(quantity, 1, 99);
        PerformMutation(() => _document.ItemPoints[_contextItemPointIndex].Quantity = quantity);
        _itemPointQuantityContextTextBox.Text = quantity.ToString();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, $"此 ItemPoint 的生成數量已設為 {quantity}。");
    }

    private void DeleteItemPointAtContext()
    {
        if (_contextItemPointIndex < 0 || _contextItemPointIndex >= _document.ItemPoints.Count) return;
        SelectLayer(new LayerSelection(SceneLayerKind.ItemPoint, _contextItemPointIndex));
        DeleteSelection();
        _contextItemPointIndex = -1;
        StatusChanged?.Invoke(this, "已刪除此 ItemPoint。");
    }

    private int FindItemPointAt(PointF world)
    {
        var threshold = 14f / _zoom;
        for (var index = _document.ItemPoints.Count - 1; index >= 0; index--)
        {
            var point = _document.ItemPoints[index];
            if (Distance(world, new PointF(point.X, point.Y)) <= threshold) return index;
        }
        return -1;
    }

    private void ShowNodeContextMenu(Point screenLocation, PointF world)
    {
        if (!IsInsideWorld(world)) return;

        // A selected vertex/radius handle is rendered above every polygon and remains an
        // explicit editing target. Otherwise, right-click follows the same top-to-bottom
        // order as drawing so an underlying NavMesh cannot steal another layer's menu.
        var selectedHandleHit = HitSelectedHandle(world) >= 0;
        if (!selectedHandleHit)
        {
            var hit = HitTest(world);
            if (hit != _selection)
            {
                SelectLayer(hit);
            }
        }

        if (!PrepareNodeContextMenu(world))
        {
            StatusChanged?.Invoke(
                this,
                "請先選取多邊形，再對準黃色 Node 或邊線按滑鼠右鍵。");
            return;
        }

        var interactionSelected = _selection.Kind == SceneLayerKind.Interactable && IsValidSelection(_selection);
        PopulateOverlapSelectionMenu(world);
        _interactionTypeContextItem.Visible = interactionSelected;
        _interactionPointContextItem.Visible = interactionSelected;
        _interactionPointContextItem.Text =
            _contextInteractionPointIndex >= 0 ? "變更此互動 Point" : "新增互動 Point";
        _deleteInteractionPointContextItem.Visible =
            interactionSelected && _contextInteractionPointIndex >= 0;
        _deleteInteractionPointContextItem.Enabled =
            interactionSelected && _contextInteractionPointIndex >= 0;
        var hasInteractionHintPoint = interactionSelected &&
            _document.Interactables[_selection.Index].InteractionHintPoint is not null;
        _interactionHintPointContextItem.Visible = interactionSelected;
        _interactionHintPointContextItem.Text = hasInteractionHintPoint
            ? "移動互動提示點至此"
            : "新增互動提示點";
        _deleteInteractionHintPointContextItem.Visible = hasInteractionHintPoint;
        _deleteInteractionHintPointContextItem.Enabled = hasInteractionHintPoint;
        foreach (var (type, item) in _interactionTypeContextItems)
        {
            item.Checked = interactionSelected &&
                _document.Interactables[_selection.Index].Type.Equals(type, StringComparison.OrdinalIgnoreCase);
        }
        _nodeContextMenu.Show(this, screenLocation);
    }

    private void PopulateOverlapSelectionMenu(PointF world)
    {
        _overlapSelectionContextItem.DropDownItems.Clear();
        var candidates = GetHitTestCandidates(world);
        _overlapSelectionContextItem.Visible = candidates.Count > 1;
        foreach (var candidate in candidates)
        {
            var item = new ToolStripMenuItem(DescribeSelection(candidate))
            {
                Checked = candidate == _selection,
                Tag = candidate,
            };
            item.Click += (_, _) =>
            {
                if (item.Tag is not LayerSelection selection) return;
                SelectLayer(selection);
                StatusChanged?.Invoke(this, $"已選取重疊圖形：{DescribeSelection(selection)}");
            };
            _overlapSelectionContextItem.DropDownItems.Add(item);
        }
    }

    private string DescribeSelection(LayerSelection selection)
    {
        if (!IsValidSelection(selection)) return "無";
        return selection.Kind switch
        {
            SceneLayerKind.NavMesh => $"NavMesh · {_document.NavMesh[selection.Index].Label}",
            SceneLayerKind.Collision => $"Collision · {_document.Collisions[selection.Index].Label}",
            SceneLayerKind.Interactable => $"互動區域 · {_document.Interactables[selection.Index].Label}",
            SceneLayerKind.StoryTrigger => $"劇情觸發區 · {_document.StoryTriggers[selection.Index].Label}",
            SceneLayerKind.MovementGuide => $"強制引導線 · {_document.MovementGuides[selection.Index].Label}",
            SceneLayerKind.ItemPoint => $"ItemPoint · {_document.ItemPoints[selection.Index].Label}",
            SceneLayerKind.TeleportPoint => $"傳送 Point · {_document.TeleportPoints[selection.Index].Label}",
            _ => "無",
        };
    }

    private bool PrepareNodeContextMenu(PointF world)
    {
        var points = SelectedEditablePolygonPoints();
        if (points is null) return false;
        _contextInteractionPoint = ClampToWorld(world);
        _contextInteractionHintPoint = ClampToWorld(world);
        _contextInteractionPointIndex = FindInteractionPointAtContext(world);

        if (_contextInteractionPointIndex >= 0)
        {
            SetSelectedVertex(-1);
            _contextSelection = _selection;
            _contextEdgeIndex = -1;
            _insertNodeContextItem.Visible = false;
            _deleteNodeContextItem.Visible = false;
            return true;
        }

        var handle = HitSelectedHandle(world);
        _contextSelection = _selection;
        if (handle >= 0)
        {
            SetSelectedVertex(handle);
            _contextEdgeIndex = -1;
            _insertNodeContextItem.Visible = false;
            _deleteNodeContextItem.Visible = true;
            var minimumPoints = MinimumSelectedPointCount();
            _deleteNodeContextItem.Enabled = points.Count > minimumPoints;
            _deleteNodeContextItem.ToolTipText = points.Count > minimumPoints
                ? "刪除這個 Node，多邊形會自動重新封閉"
                : $"目前圖形至少需要保留 {minimumPoints} 個 Node";
            return true;
        }

        if (!TryFindNearestSelectedEdge(world, out var edgeIndex, out var insertionPoint))
        {
            if (_selection.Kind != SceneLayerKind.Interactable || !PointInPolygon(world, points)) return false;
            SetSelectedVertex(-1);
            _contextSelection = _selection;
            _contextEdgeIndex = -1;
            _contextInteractionPoint = ClampToWorld(world);
            _insertNodeContextItem.Visible = false;
            _deleteNodeContextItem.Visible = false;
            return true;
        }

        SetSelectedVertex(-1);
        _contextEdgeIndex = edgeIndex;
        _contextInsertPoint = insertionPoint;
        _contextInteractionPoint = ClampToWorld(world);
        _insertNodeContextItem.Visible = true;
        _insertNodeContextItem.Enabled = true;
        _insertNodeContextItem.ToolTipText = "在目前游標對準的邊線位置插入 Node";
        _deleteNodeContextItem.Visible = false;
        return true;
    }

    private void SetSelectedInteractionType(string type, string verb)
    {
        UpdateSelectedInteractable(type, verb);
        StatusChanged?.Invoke(this, $"互動類型已設定為「{verb}」。");
    }

    private void SetInteractionPointAtContext(string facing)
    {
        var interactable = SelectedInteractable;
        if (interactable is null || _contextSelection != _selection) return;
        var point = _contextInteractionPoint;
        var interactionPointIndex = _contextInteractionPointIndex;
        PerformMutation(() =>
        {
            var interactionPoints = interactable.EnsureInteractionPoints();
            var interactionPoint = new InteractionPoint
            {
                X = point.X,
                Y = point.Y,
                Facing = facing,
            };
            if (interactionPointIndex >= 0 && interactionPointIndex < interactionPoints.Count)
            {
                interactionPoints[interactionPointIndex] = interactionPoint;
            }
            else
            {
                interactionPoints.Add(interactionPoint);
            }
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(
            this,
            $"已設定互動 Point {interactable.EffectiveInteractionPoints.Count}，角色抵達後面向 {facing}。");
    }

    private void DeleteSelectedInteractionPoint()
    {
        var interactable = SelectedInteractable;
        var interactionPointIndex = _contextInteractionPointIndex;
        if (
            interactable is null ||
            interactionPointIndex < 0 ||
            interactionPointIndex >= interactable.EffectiveInteractionPoints.Count
        ) return;
        PerformMutation(() =>
        {
            var interactionPoints = interactable.EnsureInteractionPoints();
            interactionPoints.RemoveAt(interactionPointIndex);
            interactable.NormalizeInteractionPoints();
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(
            this,
            interactable.EffectiveInteractionPoints.Count > 0
                ? $"已刪除互動 Point；目前剩餘 {interactable.EffectiveInteractionPoints.Count} 個。"
                : "已刪除最後一個互動 Point；觸發時將不自動移動角色。");
    }

    private void SetInteractionHintPointAtContext()
    {
        var interactable = SelectedInteractable;
        if (interactable is null || _contextSelection != _selection) return;
        var point = _contextInteractionHintPoint;
        PerformMutation(() =>
        {
            interactable.InteractionHintPoint = new ScenePoint(point.X, point.Y);
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, "已設定互動提示點；遊戲中會在此顯示半透明白色提示圓點。");
    }

    private void DeleteSelectedInteractionHintPoint()
    {
        var interactable = SelectedInteractable;
        if (interactable?.InteractionHintPoint is null) return;
        PerformMutation(() => interactable.InteractionHintPoint = null);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, "已刪除互動提示點。");
    }

    private int FindInteractionPointAtContext(PointF world)
    {
        var interactable = SelectedInteractable;
        if (interactable is null) return -1;

        var threshold = 12f / _zoom;
        var interactionPoints = interactable.EffectiveInteractionPoints;
        var nearestIndex = -1;
        var nearestDistance = threshold;
        for (var index = 0; index < interactionPoints.Count; index++)
        {
            var distance = Distance(world, ToPointF(interactionPoints[index]));
            if (distance <= nearestDistance)
            {
                nearestIndex = index;
                nearestDistance = distance;
            }
        }
        return nearestIndex;
    }

    private void InsertNodeAtContextLocation()
    {
        if (_selection != _contextSelection || _contextEdgeIndex < 0) return;
        InsertNodeOnEdge(_contextEdgeIndex, _contextInsertPoint);
    }

    private void InsertNodeOnEdge(int edgeIndex, PointF requestedPoint)
    {
        var points = SelectedEditablePolygonPoints();
        if (points is null || edgeIndex < 0 || edgeIndex >= points.Count) return;

        var nextIndex = (edgeIndex + 1) % points.Count;
        var insertionPoint = ClampToWorld(requestedPoint);

        if (
            Distance(insertionPoint, ToPointF(points[edgeIndex])) < 0.01f ||
            Distance(insertionPoint, ToPointF(points[nextIndex])) < 0.01f)
        {
            StatusChanged?.Invoke(this, "插入位置與既有 Node 重疊，請改在邊線中段新增。");
            return;
        }

        var insertIndex = edgeIndex + 1;
        PerformMutation(() =>
        {
            points.Insert(insertIndex, new ScenePoint(insertionPoint.X, insertionPoint.Y));
            _selectedVertex = insertIndex;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, $"已插入 Node；目前多邊形共有 {points.Count} 個 Node。");
    }

    private bool TryFindNearestSelectedEdge(
        PointF world,
        out int edgeIndex,
        out PointF insertionPoint)
    {
        edgeIndex = -1;
        insertionPoint = PointF.Empty;
        var points = SelectedEditablePolygonPoints();
        if (points is null || points.Count < MinimumSelectedPointCount()) return false;

        var nearestDistance = float.MaxValue;
        var edgeCount = _selection.Kind == SceneLayerKind.MovementGuide
            ? points.Count - 1
            : points.Count;
        for (var index = 0; index < edgeCount; index++)
        {
            var nextIndex = index + 1;
            if (nextIndex >= points.Count) nextIndex = 0;
            var closest = ClosestPointOnSegment(
                world,
                ToPointF(points[index]),
                ToPointF(points[nextIndex]));
            var distance = Distance(world, closest);
            if (distance >= nearestDistance) continue;
            nearestDistance = distance;
            edgeIndex = index;
            insertionPoint = closest;
        }

        return edgeIndex >= 0 && nearestDistance <= 14f / _zoom;
    }

    private bool IsSelectedCircle()
    {
        return _selection.Kind == SceneLayerKind.Collision &&
            IsValidSelection(_selection) &&
            _document.Collisions[_selection.Index].Shape == "circle";
    }

    private List<ScenePoint>? SelectedPoints()
    {
        return _selection.Kind switch
        {
            SceneLayerKind.NavMesh when IsValidSelection(_selection) => _document.NavMesh[_selection.Index].Points,
            SceneLayerKind.Collision when IsValidSelection(_selection) => _document.Collisions[_selection.Index].Points,
            SceneLayerKind.Interactable when IsValidSelection(_selection) => _document.Interactables[_selection.Index].Points,
            SceneLayerKind.StoryTrigger when IsValidSelection(_selection) => _document.StoryTriggers[_selection.Index].Points,
            SceneLayerKind.MovementGuide when IsValidSelection(_selection) => _document.MovementGuides[_selection.Index].Points,
            _ => null,
        };
    }

    private List<ScenePoint>? SelectedEditablePolygonPoints()
    {
        if (!IsValidSelection(_selection)) return null;
        if (_selection.Kind == SceneLayerKind.NavMesh)
        {
            return _document.NavMesh[_selection.Index].Points;
        }

        if (_selection.Kind == SceneLayerKind.Interactable)
        {
            return _document.Interactables[_selection.Index].Points;
        }

        if (_selection.Kind == SceneLayerKind.StoryTrigger)
        {
            return _document.StoryTriggers[_selection.Index].Points;
        }

        if (_selection.Kind == SceneLayerKind.MovementGuide)
        {
            return _document.MovementGuides[_selection.Index].Points;
        }

        if (_selection.Kind != SceneLayerKind.Collision) return null;

        var collision = _document.Collisions[_selection.Index];
        return collision.Shape.Equals("polygon", StringComparison.OrdinalIgnoreCase)
            ? collision.Points
            : null;
    }

    private bool CanEditSelectedVertex(bool requireMoreThanThreePoints)
    {
        var points = SelectedEditablePolygonPoints();
        return points is not null &&
            _selectedVertex >= 0 &&
            _selectedVertex < points.Count &&
            (!requireMoreThanThreePoints || points.Count > MinimumSelectedPointCount());
    }

    private int MinimumSelectedPointCount() =>
        _selection.Kind == SceneLayerKind.MovementGuide ? 2 : 3;

    private void SetSelectedVertex(int index)
    {
        var points = SelectedEditablePolygonPoints();
        if (points is null || index < 0 || index >= points.Count) index = -1;
        if (_selectedVertex == index) return;
        _selectedVertex = index;
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        RequestRender();
    }

    private bool IsValidSelection(LayerSelection selection)
    {
        return selection.Kind switch
        {
            SceneLayerKind.NavMesh => selection.Index >= 0 && selection.Index < _document.NavMesh.Count,
            SceneLayerKind.Collision => selection.Index >= 0 && selection.Index < _document.Collisions.Count,
            SceneLayerKind.Interactable => selection.Index >= 0 && selection.Index < _document.Interactables.Count,
            SceneLayerKind.StoryTrigger => selection.Index >= 0 && selection.Index < _document.StoryTriggers.Count,
            SceneLayerKind.MovementGuide => selection.Index >= 0 && selection.Index < _document.MovementGuides.Count,
            SceneLayerKind.ItemPoint => selection.Index >= 0 && selection.Index < _document.ItemPoints.Count,
            SceneLayerKind.TeleportPoint => selection.Index >= 0 && selection.Index < _document.TeleportPoints.Count,
            _ => false,
        };
    }

    private void BeginMutation()
    {
        _mutationBefore ??= SceneJson.Serialize(_document);
    }

    private void CommitMutation()
    {
        if (_mutationBefore is null) return;
        var current = SceneJson.Serialize(_document);
        if (!string.Equals(current, _mutationBefore, StringComparison.Ordinal))
        {
            _undo.Push(_mutationBefore);
            _redo.Clear();
            DocumentChanged?.Invoke(this, EventArgs.Empty);
        }

        _mutationBefore = null;
        ViewChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    private void PerformMutation(Action mutation)
    {
        BeginMutation();
        mutation();
        CommitMutation();
    }

    private void NotifyDocumentReplaced()
    {
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        DocumentChanged?.Invoke(this, EventArgs.Empty);
        ViewChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    private void CancelDraft()
    {
        _draftPoints.Clear();
        _shapeStart = null;
        _shapeEnd = null;
        Invalidate();
    }

    private void SetZoomAt(float requestedZoom, Point screenAnchor)
    {
        var before = ScreenToWorld(screenAnchor);
        _zoom = Math.Clamp(requestedZoom, MinimumZoom, MaximumZoom);
        _pan.X = screenAnchor.X - RulerSize - before.X * _zoom;
        _pan.Y = screenAnchor.Y - RulerSize - before.Y * _zoom;
        OnViewChanged();
    }

    private void OnViewChanged()
    {
        ViewChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    private void RequestRender()
    {
        if (IsDisposed || Disposing || !IsHandleCreated) return;
        if (!_renderTimer.Enabled) _renderTimer.Start();
    }

    private void PublishPointerStatus(PointF world, bool force = false)
    {
        if (!force && _statusUpdateStopwatch.ElapsedMilliseconds < 40) return;
        _statusUpdateStopwatch.Restart();
        StatusChanged?.Invoke(
            this,
            $"X {Math.Round(world.X)}  Y {Math.Round(world.Y)}  ·  {Math.Round(_zoom * 100)}%" +
            (_document.Grid.Snap ? $"  ·  吸附 {_document.Grid.Size}px" : ""));
    }

    private void ReleaseMouseCapture()
    {
        if (!Capture) return;
        _endingCapture = true;
        try
        {
            Capture = false;
        }
        finally
        {
            _endingCapture = false;
        }
    }

    private PointF ScreenToWorld(Point point)
    {
        return new PointF(
            (point.X - RulerSize - _pan.X) / _zoom,
            (point.Y - RulerSize - _pan.Y) / _zoom);
    }

    private PointF SnapAndClamp(PointF point)
    {
        var x = point.X;
        var y = point.Y;
        if (_document.Grid.Snap && _document.Grid.Size > 0)
        {
            x = (float)Math.Round(x / _document.Grid.Size) * _document.Grid.Size;
            y = (float)Math.Round(y / _document.Grid.Size) * _document.Grid.Size;
        }

        return new PointF(
            Math.Clamp(x, 0, _document.World.Width),
            Math.Clamp(y, 0, _document.World.Height));
    }

    private PointF ClampToWorld(PointF point)
    {
        return new PointF(
            Math.Clamp(point.X, 0, _document.World.Width),
            Math.Clamp(point.Y, 0, _document.World.Height));
    }

    private bool IsPointInsideNavMesh(PointF point) =>
        _document.NavMesh.Any(region => PointInPolygon(point, region.Points));

    private static bool IsFinite(PointF point)
    {
        return float.IsFinite(point.X) && float.IsFinite(point.Y);
    }

    private bool IsInsideWorld(PointF point)
    {
        return point.X >= 0 && point.Y >= 0 && point.X <= _document.World.Width && point.Y <= _document.World.Height;
    }

    private Rectangle ContentRectangle => new(
        RulerSize,
        RulerSize,
        Math.Max(0, ClientSize.Width - RulerSize),
        Math.Max(0, ClientSize.Height - RulerSize));

    private void UpdateCursor()
    {
        Cursor = _tool switch
        {
            EditorTool.Pan => Cursors.Hand,
            EditorTool.Select => Cursors.Default,
            _ => Cursors.Cross,
        };
    }

    private static bool IsPolygonTool(EditorTool tool)
    {
        return tool is EditorTool.NavMeshPolygon or EditorTool.CollisionPolygon or EditorTool.InteractionPolygon or EditorTool.StoryTriggerPolygon or EditorTool.MovementGuide;
    }

    private static void ScalePoints(List<ScenePoint>? points, float factor)
    {
        if (points is null || points.Count == 0) return;
        var centerX = points.Average(point => point.X);
        var centerY = points.Average(point => point.Y);
        foreach (var point in points)
        {
            point.X = centerX + (point.X - centerX) * factor;
            point.Y = centerY + (point.Y - centerY) * factor;
        }
    }

    private static void MovePoints(List<ScenePoint>? points, float deltaX, float deltaY)
    {
        if (points is null) return;
        foreach (var point in points)
        {
            point.X += deltaX;
            point.Y += deltaY;
        }
    }

    private static void ScalePointAround(ScenePoint point, PointF center, float factor)
    {
        point.X = center.X + (point.X - center.X) * factor;
        point.Y = center.Y + (point.Y - center.Y) * factor;
    }

    private static string NextId(string prefix, IEnumerable<string> existingIds)
    {
        var used = existingIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        for (var number = 1; number < int.MaxValue; number++)
        {
            var candidate = $"{prefix}-{number:000}";
            if (!used.Contains(candidate)) return candidate;
        }

        return $"{prefix}-{Guid.NewGuid():N}";
    }

    private static PointF[] ToPointFArray(IEnumerable<ScenePoint>? points)
    {
        return points?.Select(ToPointF).ToArray() ?? Array.Empty<PointF>();
    }

    private static PointF ToPointF(ScenePoint point) => new(point.X, point.Y);

    private static float Distance(PointF first, PointF second)
    {
        return MathF.Sqrt(MathF.Pow(first.X - second.X, 2) + MathF.Pow(first.Y - second.Y, 2));
    }

    private static PointF ClosestPointOnSegment(PointF point, PointF start, PointF end)
    {
        var deltaX = end.X - start.X;
        var deltaY = end.Y - start.Y;
        var lengthSquared = deltaX * deltaX + deltaY * deltaY;
        if (lengthSquared <= float.Epsilon) return start;

        var amount = Math.Clamp(
            ((point.X - start.X) * deltaX + (point.Y - start.Y) * deltaY) / lengthSquared,
            0f,
            1f);
        return new PointF(start.X + deltaX * amount, start.Y + deltaY * amount);
    }

    private static RectangleF RectangleFromPoints(PointF first, PointF second)
    {
        return RectangleF.FromLTRB(
            Math.Min(first.X, second.X),
            Math.Min(first.Y, second.Y),
            Math.Max(first.X, second.X),
            Math.Max(first.Y, second.Y));
    }

    private static bool PointInPolygon(PointF point, List<ScenePoint>? polygon)
    {
        if (polygon is null || polygon.Count < 3) return false;
        var inside = false;
        for (int current = 0, previous = polygon.Count - 1; current < polygon.Count; previous = current++)
        {
            var start = polygon[previous];
            var end = polygon[current];
            var crosses = (end.Y > point.Y) != (start.Y > point.Y) &&
                point.X < (start.X - end.X) * (point.Y - end.Y) / (start.Y - end.Y + float.Epsilon) + end.X;
            if (crosses) inside = !inside;
        }

        return inside;
    }

    private static PointF DirectionVector(string direction)
    {
        const float diagonal = 0.70710678f;
        return direction.ToUpperInvariant() switch
        {
            "N" => new PointF(0, -1),
            "NE" => new PointF(diagonal, -diagonal),
            "E" => new PointF(1, 0),
            "SE" => new PointF(diagonal, diagonal),
            "S" => new PointF(0, 1),
            "SW" => new PointF(-diagonal, diagonal),
            "W" => new PointF(-1, 0),
            "NW" => new PointF(-diagonal, -diagonal),
            _ => new PointF(0, 1),
        };
    }
}
