using System.IO;

namespace Echoes.MapEditor;

// 遮擋片段自我測試（由 --npc-self-test 一併執行）：建立、預設牆腳線、Node 與牆腳線連動、
// 牆腳線端點拖曳、整段移動／縮放、刪除前景圖層連帶移除、存檔讀回與無片段場景的格式。
public sealed partial class EditorCanvas
{
    internal void RunOccluderSelfTest(string output, List<string> checks)
    {
        void Check(bool condition, string message) => NpcSelfTest.Require(condition, message);
        Point Screen(PointF p) => new((int)Math.Round(RulerSize + _pan.X + p.X * _zoom), (int)Math.Round(RulerSize + _pan.Y + p.Y * _zoom));
        void Click(PointF world, int clicks = 1)
        {
            var screen = Screen(world);
            OnMouseDown(new MouseEventArgs(MouseButtons.Left, clicks, screen.X, screen.Y, 0));
            OnMouseUp(new MouseEventArgs(MouseButtons.Left, clicks, screen.X, screen.Y, 0));
        }
        void MouseDrag(PointF from, PointF to)
        {
            var start = Screen(from); var end = Screen(to);
            OnMouseDown(new MouseEventArgs(MouseButtons.Left, 1, start.X, start.Y, 0));
            OnMouseMove(new MouseEventArgs(MouseButtons.Left, 0, end.X, end.Y, 0));
            OnMouseUp(new MouseEventArgs(MouseButtons.Left, 1, end.X, end.Y, 0));
            Application.DoEvents();
        }
        static bool Near(ScenePoint point, float x, float y) => Math.Abs(point.X - x) < 1.5f && Math.Abs(point.Y - y) < 1.5f;

        var document = SceneDocument.CreateForImage("occluder-test.png", 1000, 680);
        document.Grid.Snap = false;
        Check(!SceneJson.Serialize(document).Contains("\"occluders\"", StringComparison.Ordinal), "Scenes without occluders acquired the field.");
        SetScene(document, new Bitmap(1000, 680)); FitToView();

        // 沒有前景圖層時不建立片段
        Tool = EditorTool.OccluderPolygon;
        foreach (var point in new[] { new PointF(200, 200), new PointF(400, 300), new PointF(400, 420) }) Click(point);
        Click(new PointF(200, 320)); Click(new PointF(200, 320), 2);
        Check(_document.OccluderList.Count == 0, "Occluder created without a foreground layer.");

        _document.ForegroundLayers.Add(new ForegroundImageLayer { Id = "wall-layer", Label = "牆面", File = "wall.png" });
        // 一段往右下斜的牆面：上緣 (200,200)→(400,300)，牆腳 (200,320)→(400,420)
        foreach (var point in new[] { new PointF(200, 200), new PointF(400, 300), new PointF(400, 420) }) Click(point);
        Click(new PointF(200, 320)); Click(new PointF(200, 320), 2);
        Check(_document.OccluderList.Count == 1 && SelectedOccluder is { LayerId: "wall-layer" } created && created.Points.Count == 4,
            "Occluder polygon was not created on the foreground layer.");
        var occluder = SelectedOccluder!;
        Check(Near(occluder.BaselineStart, 200, 320) && Near(occluder.BaselineEnd, 400, 420), "Default baseline is not the bottom edge.");
        // 斜牆的垂直側邊平均高度可能比牆腳更低，預設牆腳線不能挑到側邊
        var slanted = new SceneOccluder { Points = new() { new(100, 100), new(300, 200), new(300, 260), new(100, 160) } };
        slanted.ResetBaselineToBottomEdge();
        Check(Near(slanted.BaselineStart, 100, 160) && Near(slanted.BaselineEnd, 300, 260), "Default baseline picked a vertical side edge.");
        Tool = EditorTool.Select;

        // Node 與牆腳線端點重疊：拖 Node 時牆腳線跟著動
        MouseDrag(new PointF(400, 420), new PointF(410, 440));
        Check(Near(occluder.Points[2], 410, 440) && Near(occluder.BaselineEnd, 410, 440), "Baseline endpoint did not follow its vertex.");
        // 牆腳線端點不在 Node 上：可以單獨拖曳
        occluder.BaselineStart = new ScenePoint(230, 330);
        Invalidate();
        MouseDrag(new PointF(230, 330), new PointF(240, 345));
        Check(Near(occluder.BaselineStart, 240, 345) && Near(occluder.Points[3], 200, 320), "Free baseline endpoint drag failed or moved a vertex.");
        Undo();
        occluder = _document.OccluderList[0];
        Check(Near(occluder.BaselineStart, 230, 330), "Baseline drag undo failed.");
        SelectLayer(new LayerSelection(SceneLayerKind.Occluder, 0));
        ResetSelectedOccluderBaseline();
        occluder = _document.OccluderList[0];
        Check(Near(occluder.BaselineStart, 200, 320) && Near(occluder.BaselineEnd, 410, 440), "Reset baseline did not pick the bottom edge.");
        // 「牆腳線換成下一條邊」：輪完所有邊會回到原本那條
        var original = (occluder.BaselineStart.Clone(), occluder.BaselineEnd.Clone());
        UseNextOccluderEdgeAsBaseline();
        occluder = _document.OccluderList[0];
        Check(!Near(occluder.BaselineStart, original.Item1.X, original.Item1.Y) || !Near(occluder.BaselineEnd, original.Item2.X, original.Item2.Y),
            "Next-edge baseline did not change.");
        for (var turn = 1; turn < occluder.Points.Count; turn++) UseNextOccluderEdgeAsBaseline();
        occluder = _document.OccluderList[0];
        Check(Near(occluder.BaselineStart, original.Item1.X, original.Item1.Y) && Near(occluder.BaselineEnd, original.Item2.X, original.Item2.Y),
            "Cycling every edge did not return to the original baseline.");

        // 整段移動：多邊形與牆腳線一起移動
        MouseDrag(new PointF(300, 320), new PointF(320, 330));
        occluder = _document.OccluderList[0];
        Check(Near(occluder.Points[0], 220, 210) && Near(occluder.BaselineStart, 220, 330), "Moving the occluder left its baseline behind.");
        ScaleSelection(1.1f);
        occluder = _document.OccluderList[0];
        Check(occluder.Points[1].X - occluder.Points[0].X > 210, "Scaling the occluder failed.");
        NpcSelfTest.Screenshot(this, Path.Combine(output, "occluder-canvas.png"));

        // 存檔讀回
        var path = Path.Combine(output, "occluder-roundtrip.scene.json");
        SceneJson.Save(path, _document);
        var reloaded = SceneJson.Load(path);
        Check(reloaded.OccluderList.Count == 1 && reloaded.OccluderList[0].LayerId == "wall-layer" &&
            Math.Abs(reloaded.OccluderList[0].BaselineEnd.X - occluder.BaselineEnd.X) < 0.01f, "Occluder JSON roundtrip failed.");
        Check(File.ReadAllText(path).Contains("\"baselineStart\"", StringComparison.Ordinal), "Occluder JSON fields are not camelCase.");

        // 刪除前景圖層：切自它的片段一起移除；復原會一起還原
        UpdateForegroundLayers(Array.Empty<ForegroundImageLayer>());
        Check(_document.OccluderList.Count == 0, "Removing the foreground layer kept its occluders.");
        Undo();
        Check(_document.OccluderList.Count == 1 && _document.ForegroundLayers.Count == 1, "Foreground removal undo lost the occluder.");

        // 牆腳線退化或圖層不存在時拒絕存檔
        var broken = SceneJson.Deserialize(SceneJson.Serialize(_document));
        broken.OccluderList[0].LayerId = "missing";
        var rejected = false;
        try { SceneJson.Validate(broken); } catch (InvalidDataException) { rejected = true; }
        Check(rejected, "Validation accepted an occluder on a missing layer.");
        SelectLayer(new LayerSelection(SceneLayerKind.Occluder, 0));
        DeleteSelection();
        Check(_document.OccluderList.Count == 0 && _document.ForegroundLayers.Count == 1, "Deleting the occluder failed or removed the layer.");
        checks.Add("PASS: occluder tool needs a foreground layer, defaults the wall-foot line to the bottom edge, links vertex/baseline drags, drags free endpoints, moves/scales with its baseline, roundtrips JSON, follows foreground-layer removal with undo, and rejects invalid layers.");
    }
}
