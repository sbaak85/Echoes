using System.Drawing.Drawing2D;

namespace Echoes.MapEditor;

// 牆面遮擋片段（SceneLayerKind.Occluder）：
//   - 用「遮擋片段」工具在前景牆面圖上逐點圈出一段牆（裁切範圍），完成後自動把最下方的邊設為牆腳線；
//   - 選取片段後拖曳橘色牆腳線端點微調；端點和 Node 重疊時，拖 Node 會一起帶動牆腳線；
//   - 遊戲中角色腳底在牆腳線南側（畫面下方）時角色蓋住這段牆，在北側時這段牆蓋住角色。
public sealed partial class EditorCanvas
{
    private int _occluderBaselineHandle = -1;

    public SceneOccluder? SelectedOccluder => _selection.Kind == SceneLayerKind.Occluder && IsValidSelection(_selection)
        ? _document.OccluderList[_selection.Index] : null;

    private void AddOccluderFromDraft(List<ScenePoint> points)
    {
        var layer = _document.ForegroundLayers.FirstOrDefault(item => item.Visible) ?? _document.ForegroundLayers.FirstOrDefault();
        if (layer is null)
        {
            StatusChanged?.Invoke(this, "遮擋片段要切自前景圖層：請先在「前景圖片」加入牆面圖。");
            return;
        }
        var index = _document.OccluderList.Count;
        var occluder = new SceneOccluder
        {
            Id = NextId("occluder", _document.OccluderList.Select(item => item.Id)),
            Label = $"遮擋片段 {index + 1}",
            LayerId = layer.Id,
            Points = points,
        };
        occluder.ResetBaselineToBottomEdge();
        _document.OccluderList.Add(occluder);
        _selection = new LayerSelection(SceneLayerKind.Occluder, index);
        _selectedVertex = -1;
        StatusChanged?.Invoke(this, "已建立遮擋片段；橘色線是牆腳線（預設為最下方的邊），可拖曳端點調整到牆真正貼地的位置。");
    }

    public void ResetSelectedOccluderBaseline()
    {
        if (SelectedOccluder is not { } occluder) return;
        PerformMutation(occluder.ResetBaselineToBottomEdge);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>牆腳線改用範圍的下一條邊（依 Node 順序輪流）；自動預設選錯邊時用</summary>
    public void UseNextOccluderEdgeAsBaseline()
    {
        if (SelectedOccluder is not { } occluder || occluder.Points.Count < 3) return;
        var count = occluder.Points.Count;
        bool Same(ScenePoint a, ScenePoint b) => Math.Abs(a.X - b.X) < 0.5f && Math.Abs(a.Y - b.Y) < 0.5f;
        var current = Enumerable.Range(0, count).FirstOrDefault(index =>
        {
            var a = occluder.Points[index];
            var b = occluder.Points[(index + 1) % count];
            return (Same(a, occluder.BaselineStart) && Same(b, occluder.BaselineEnd)) ||
                (Same(b, occluder.BaselineStart) && Same(a, occluder.BaselineEnd));
        }, -1);
        var next = (current + 1) % count;
        var start = occluder.Points[next];
        var end = occluder.Points[(next + 1) % count];
        PerformMutation(() => (occluder.BaselineStart, occluder.BaselineEnd) = start.X <= end.X
            ? (start.Clone(), end.Clone()) : (end.Clone(), start.Clone()));
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, $"牆腳線改用第 {next + 1}–{(next + 1) % count + 1} 個 Node 之間的邊。");
    }

    public void SwapSelectedOccluderBaseline()
    {
        if (SelectedOccluder is not { } occluder) return;
        PerformMutation(() => (occluder.BaselineStart, occluder.BaselineEnd) = (occluder.BaselineEnd, occluder.BaselineStart));
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetSelectedOccluderLayer(string layerId)
    {
        if (SelectedOccluder is not { } occluder ||
            !_document.ForegroundLayers.Any(layer => layer.Id.Equals(layerId, StringComparison.OrdinalIgnoreCase))) return;
        PerformMutation(() => occluder.LayerId = layerId);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void MoveOccluder(SceneOccluder occluder, float deltaX, float deltaY)
    {
        MovePoints(occluder.Points, deltaX, deltaY);
        foreach (var point in new[] { occluder.BaselineStart, occluder.BaselineEnd })
        {
            point.X += deltaX;
            point.Y += deltaY;
        }
    }

    private void ScaleOccluder(SceneOccluder occluder, float factor)
    {
        if (occluder.Points.Count == 0) return;
        var center = new PointF(occluder.Points.Average(point => point.X), occluder.Points.Average(point => point.Y));
        ScalePoints(occluder.Points, factor);
        ScalePointAround(occluder.BaselineStart, center, factor);
        ScalePointAround(occluder.BaselineEnd, center, factor);
    }

    /// <summary>拖曳 Node 時，與它重疊的牆腳線端點一起移動</summary>
    private void SyncOccluderBaselineWithVertex(ScenePoint before, ScenePoint after)
    {
        if (SelectedOccluder is not { } occluder) return;
        foreach (var end in new[] { occluder.BaselineStart, occluder.BaselineEnd })
        {
            if (Math.Abs(end.X - before.X) < 0.5f && Math.Abs(end.Y - before.Y) < 0.5f)
            {
                end.X = after.X;
                end.Y = after.Y;
            }
        }
    }

    private bool TryBeginOccluderBaselineDrag(PointF world)
    {
        if (SelectedOccluder is not { } occluder) return false;
        var threshold = 9f / _zoom;
        var ends = new[] { occluder.BaselineStart, occluder.BaselineEnd };
        for (var index = 0; index < ends.Length; index++)
        {
            var end = new PointF(ends[index].X, ends[index].Y);
            if (Distance(world, end) > threshold) continue;
            // 端點落在 Node 上：交給 Node 拖曳（牆腳線會跟著動）；按住 Shift 則只拖牆腳線端點
            if (!ModifierKeys.HasFlag(Keys.Shift) &&
                occluder.Points.Any(point => Math.Abs(point.X - end.X) < 0.5f && Math.Abs(point.Y - end.Y) < 0.5f)) return false;
            _occluderBaselineHandle = index;
            BeginMutation();
            _dragMode = DragMode.OccluderBaseline;
            Capture = true;
            return true;
        }
        return false;
    }

    private bool UpdateOccluderBaselineDrag(PointF world)
    {
        if (SelectedOccluder is not { } occluder || _occluderBaselineHandle < 0) return false;
        var target = _occluderBaselineHandle == 0 ? occluder.BaselineStart : occluder.BaselineEnd;
        var other = _occluderBaselineHandle == 0 ? occluder.BaselineEnd : occluder.BaselineStart;
        var next = SnapAndClamp(world);
        if (Math.Abs(next.X - other.X) + Math.Abs(next.Y - other.Y) < 1) return false;
        if (Math.Abs(target.X - next.X) < 0.001f && Math.Abs(target.Y - next.Y) < 0.001f) return false;
        target.X = next.X;
        target.Y = next.Y;
        return true;
    }

    private void DrawOccluders(Graphics graphics)
    {
        using var fill = new SolidBrush(Color.FromArgb(46, 93, 202, 165));
        using var outline = new Pen(Color.FromArgb(220, 93, 202, 165), 1.6f / _zoom) { DashStyle = DashStyle.Dash };
        using var baseline = new Pen(Color.FromArgb(245, 255, 112, 40), 3.5f / _zoom);
        using var frontArrow = new Pen(Color.FromArgb(245, 255, 112, 40), 2f / _zoom) { CustomEndCap = new AdjustableArrowCap(4, 4) };
        using var font = new Font("Microsoft JhengHei UI", 9 / _zoom, FontStyle.Bold);
        using var labelBrush = new SolidBrush(Color.FromArgb(235, 159, 225, 203));
        for (var index = 0; index < _document.OccluderList.Count; index++)
        {
            if (SkipLayer(SceneLayerKind.Occluder, index)) continue;
            var occluder = _document.OccluderList[index];
            var points = ToPointFArray(occluder.Points);
            if (points.Length < 3) continue;
            var selected = _selection == new LayerSelection(SceneLayerKind.Occluder, index);
            graphics.FillPolygon(fill, points);
            graphics.DrawPolygon(outline, points);
            if (selected) DrawSelectedOutline(graphics, points);
            var start = new PointF(occluder.BaselineStart.X, occluder.BaselineStart.Y);
            var end = new PointF(occluder.BaselineEnd.X, occluder.BaselineEnd.Y);
            graphics.DrawLine(baseline, start, end);
            // 中點的小箭頭指向「牆前」（畫面下方那一側）：角色腳底在這一側就會蓋住這段牆
            var length = Distance(start, end);
            if (length > 0.01f)
            {
                var normal = new PointF(-(end.Y - start.Y) / length, (end.X - start.X) / length);
                if (normal.Y < 0) normal = new PointF(-normal.X, -normal.Y);
                var middle = new PointF((start.X + end.X) / 2, (start.Y + end.Y) / 2);
                graphics.DrawLine(frontArrow, middle, new PointF(middle.X + normal.X * 22 / _zoom, middle.Y + normal.Y * 22 / _zoom));
            }
            if (selected)
            {
                foreach (var point in new[] { start, end })
                {
                    var radius = 6f / _zoom;
                    using var handleFill = new SolidBrush(Color.FromArgb(255, 239, 159, 39));
                    using var handlePen = new Pen(Color.FromArgb(255, 65, 36, 2), 1.4f / _zoom);
                    var diamond = new[]
                    {
                        new PointF(point.X, point.Y - radius), new PointF(point.X + radius, point.Y),
                        new PointF(point.X, point.Y + radius), new PointF(point.X - radius, point.Y),
                    };
                    graphics.FillPolygon(handleFill, diamond);
                    graphics.DrawPolygon(handlePen, diamond);
                }
            }
            var center = new PointF(points.Average(point => point.X), points.Average(point => point.Y));
            var label = occluder.Label;
            var size = graphics.MeasureString(label, font);
            graphics.DrawString(label, font, labelBrush, center.X - size.Width / 2, center.Y - size.Height / 2);
        }
    }
}
