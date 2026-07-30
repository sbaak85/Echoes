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
    MovementGuide,
    PlayerSpawn,
}

public enum SceneLayerKind
{
    None,
    NavMesh,
    Collision,
    Interactable,
    MovementGuide,
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
    private readonly ToolStripMenuItem _interactionTypeContextItem = new("互動類型");
    private readonly ToolStripMenuItem _dialogueTypeContextItem = new("對話");
    private readonly ToolStripMenuItem _interactionPointContextItem = new("新增／變更互動 Point");
    private readonly ToolStripMenuItem _deleteInteractionPointContextItem = new("刪除互動 Point");

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
    private PointF _contextInsertPoint;
    private PointF _contextInteractionPoint;
    private bool _panning;
    private bool _spacePressed;
    private bool _endingCapture;
    private bool _paintFailureReported;
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
        _dialogueTypeContextItem.Click += (_, _) => SetSelectedInteractionType("dialogue", "對話");
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
        _interactionTypeContextItem.DropDownItems.Add(_dialogueTypeContextItem);
        _deleteInteractionPointContextItem.Click += (_, _) => DeleteSelectedInteractionPoint();
        _nodeContextMenu.Items.AddRange(new ToolStripItem[]
        {
            _insertNodeContextItem,
            _deleteNodeContextItem,
            new ToolStripSeparator(),
            _interactionTypeContextItem,
            _interactionPointContextItem,
            _deleteInteractionPointContextItem,
        });
        _nodeContextMenu.BackColor = Color.FromArgb(35, 39, 47);
        _nodeContextMenu.ForeColor = Color.WhiteSmoke;
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
                else
                    _document.MovementGuides[_selection.Index].Label = label;
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
            else if (_selection.Kind == SceneLayerKind.MovementGuide)
            {
                _document.MovementGuides.RemoveAt(_selection.Index);
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
            else if (_selection.Kind is SceneLayerKind.NavMesh or SceneLayerKind.Interactable)
            {
                ScalePoints(
                    _selection.Kind == SceneLayerKind.NavMesh
                        ? _document.NavMesh[_selection.Index].Points
                        : _document.Interactables[_selection.Index].Points,
                    factor);
            }
            else
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
        verb = string.IsNullOrWhiteSpace(verb) ? "對話" : verb.Trim();
        PerformMutation(() =>
        {
            interactable.Type = type;
            interactable.Verb = verb;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateSelectedDialogue(
        IEnumerable<DialogueLine> lines,
        IEnumerable<string> speakers,
        float characterDelaySeconds)
    {
        var interactable = SelectedInteractable;
        if (interactable is null) return;
        var replacement = lines.Select(line => new DialogueLine
        {
            Speaker = line.Speaker,
            Text = line.Text,
        }).ToList();
        var speakerList = speakers
            .Where(speaker => !string.IsNullOrWhiteSpace(speaker))
            .Select(speaker => speaker.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (speakerList.Count == 0) speakerList.AddRange(new[] { "Sbaak", "Echo" });
        if (replacement.Count == 0)
        {
            replacement.Add(new DialogueLine { Speaker = speakerList[0], Text = "..." });
        }
        else if (string.IsNullOrWhiteSpace(replacement[0].Speaker))
        {
            replacement[0].Speaker = speakerList[0];
        }
        PerformMutation(() => interactable.Dialogue = new DialogueScript
        {
            CharacterDelaySeconds = Math.Clamp(characterDelaySeconds, 0, 2),
            Speakers = speakerList,
            Lines = replacement,
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
                e.Graphics.Clear(BackColor);
                TextRenderer.DrawText(
                    e.Graphics,
                    "場景暫時無法重繪，請放開滑鼠後再試一次。",
                    Font,
                    ClientRectangle,
                    Color.FromArgb(255, 205, 110),
                    TextFormatFlags.HorizontalCenter |
                    TextFormatFlags.VerticalCenter |
                    TextFormatFlags.WordBreak);
            }
            catch
            {
                // If the native drawing surface itself is unavailable, allow the
                // next scheduled paint to recreate it instead of closing the app.
            }
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _renderTimer.Stop();
            _renderTimer.Dispose();
            _nodeContextMenu.Dispose();
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
            _panning || _dragMode != DragMode.None || _shapeStart.HasValue;
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
        DrawMovementGuides(graphics);
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

            if (interactable.InteractionPoint is not null)
            {
                DrawInteractionPoint(graphics, interactable.InteractionPoint);
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
                _ => _document.MovementGuides[_selection.Index].Points,
            };
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
            ShowNodeContextMenu(e.Location, rawWorld);
            return;
        }

        if (e.Button != MouseButtons.Left || !IsInsideWorld(rawWorld)) return;

        switch (_tool)
        {
            case EditorTool.NavMeshPolygon:
            case EditorTool.CollisionPolygon:
            case EditorTool.InteractionPolygon:
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

            case EditorTool.Select:
                BeginSelectDrag(rawWorld);
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

    private void BeginSelectDrag(PointF world)
    {
        var handle = HitSelectedHandle(world);
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

        var hit = HitTest(world);
        SetSelectedVertex(-1);
        SelectLayer(hit);
        if (!IsValidSelection(hit)) return;

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
            if (interactable.InteractionPoint is not null)
            {
                interactable.InteractionPoint.X += deltaX;
                interactable.InteractionPoint.Y += deltaY;
            }
        }
        else
        {
            MovePoints(_document.MovementGuides[_selection.Index].Points, deltaX, deltaY);
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
                _document.Interactables.Add(new SceneInteractable
                {
                    Id = NextId("interaction", _document.Interactables.Select(item => item.Id)),
                    Label = $"互動區域 {index + 1}",
                    Shape = "polygon",
                    Points = points,
                    Type = "dialogue",
                    Verb = "對話",
                    Dialogue = DialogueScript.CreateDefault(),
                });
                _selection = new LayerSelection(SceneLayerKind.Interactable, index);
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
                    return new LayerSelection(SceneLayerKind.MovementGuide, index);
                }
            }
        }

        for (var index = _document.Interactables.Count - 1; index >= 0; index--)
        {
            if (PointInPolygon(point, _document.Interactables[index].Points))
            {
                return new LayerSelection(SceneLayerKind.Interactable, index);
            }
        }

        for (var index = _document.Collisions.Count - 1; index >= 0; index--)
        {
            var collision = _document.Collisions[index];
            var hit = collision.Shape == "circle" && collision.Center is not null
                ? Distance(point, new PointF(collision.Center.X, collision.Center.Y)) <= collision.Radius
                : PointInPolygon(point, collision.Points);
            if (hit) return new LayerSelection(SceneLayerKind.Collision, index);
        }

        for (var index = _document.NavMesh.Count - 1; index >= 0; index--)
        {
            if (PointInPolygon(point, _document.NavMesh[index].Points))
            {
                return new LayerSelection(SceneLayerKind.NavMesh, index);
            }
        }

        return LayerSelection.None;
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

    private void ShowNodeContextMenu(Point screenLocation, PointF world)
    {
        if (!IsInsideWorld(world)) return;

        if (!PrepareNodeContextMenu(world))
        {
            var hit = HitTest(world);
            if (hit != _selection)
            {
                SelectLayer(hit);
            }

            if (!PrepareNodeContextMenu(world))
            {
                StatusChanged?.Invoke(
                    this,
                    "請先選取多邊形，再對準黃色 Node 或邊線按滑鼠右鍵。");
                return;
            }
        }

        var interactionSelected = _selection.Kind == SceneLayerKind.Interactable && IsValidSelection(_selection);
        _interactionTypeContextItem.Visible = interactionSelected;
        _interactionPointContextItem.Visible = interactionSelected;
        _deleteInteractionPointContextItem.Visible = interactionSelected;
        _deleteInteractionPointContextItem.Enabled = interactionSelected &&
            _document.Interactables[_selection.Index].InteractionPoint is not null;
        _dialogueTypeContextItem.Checked = interactionSelected &&
            _document.Interactables[_selection.Index].Type.Equals("dialogue", StringComparison.OrdinalIgnoreCase);
        _nodeContextMenu.Show(this, screenLocation);
    }

    private bool PrepareNodeContextMenu(PointF world)
    {
        var points = SelectedEditablePolygonPoints();
        if (points is null) return false;
        _contextInteractionPoint = ClampToWorld(world);

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
        PerformMutation(() => interactable.InteractionPoint = new InteractionPoint
        {
            X = point.X,
            Y = point.Y,
            Facing = facing,
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, $"已設定互動 Point，角色抵達後面向 {facing}。");
    }

    private void DeleteSelectedInteractionPoint()
    {
        var interactable = SelectedInteractable;
        if (interactable?.InteractionPoint is null) return;
        PerformMutation(() => interactable.InteractionPoint = null);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, "已刪除互動 Point；觸發時將不自動移動角色。");
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

        if (_selection.Kind == SceneLayerKind.MovementGuide)
        {
            return _document.MovementGuides[_selection.Index].Points;
        }

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
            SceneLayerKind.MovementGuide => selection.Index >= 0 && selection.Index < _document.MovementGuides.Count,
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
        return tool is EditorTool.NavMeshPolygon or EditorTool.CollisionPolygon or EditorTool.InteractionPolygon or EditorTool.MovementGuide;
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
