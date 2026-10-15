using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace Echoes.MapEditor;

public static class ForegroundRendering
{
    public static void Draw(Graphics graphics, Bitmap image, ForegroundImageLayer layer)
    {
        if (!layer.Visible || layer.Opacity <= 0) return;
        using var attributes = new ImageAttributes();
        attributes.SetColorMatrix(new ColorMatrix { Matrix33 = layer.Opacity });
        var w = image.Width * layer.Scale;
        var h = image.Height * layer.Scale;
        graphics.DrawImage(image, new[] { new PointF(layer.X, layer.Y),
            new PointF(layer.X + w, layer.Y), new PointF(layer.X, layer.Y + h) },
            new RectangleF(0, 0, image.Width, image.Height), GraphicsUnit.Pixel, attributes);
    }
}

public sealed class ForegroundLayerEditorForm : Form
{
    public List<ForegroundImageLayer> Layers { get; }
    private readonly ListBox _list = new() { Dock = DockStyle.Fill, DisplayMember = "Label",
        BackColor = Color.FromArgb(22, 26, 33), ForeColor = Color.Gainsboro };
    private readonly TextBox _name = new() { Dock = DockStyle.Fill };
    private readonly NumericUpDown _x = Number(-1000000, 1000000, 2);
    private readonly NumericUpDown _y = Number(-1000000, 1000000, 2);
    private readonly NumericUpDown _scale = Number(0.01m, 10000, 2);
    private readonly NumericUpDown _opacity = Number(0, 100, 0);
    private readonly CheckBox _visible = new() { Text = "顯示此圖層", AutoSize = true };
    private readonly Label _file = new() { AutoSize = true, MaximumSize = new Size(290, 0) };
    private readonly PreviewPanel _preview = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(13, 16, 21) };
    private readonly Dictionary<string, Bitmap> _images = new(StringComparer.OrdinalIgnoreCase);
    private readonly Bitmap _background;
    private readonly SceneWorld _world;
    private readonly Func<string, string?> _resolve;
    private bool _loading;
    private ForegroundImageLayer? Selected => _list.SelectedIndex < 0 ? null : Layers[_list.SelectedIndex];

    public ForegroundLayerEditorForm(SceneDocument document, string backgroundPath, Func<string, string?> resolve)
    {
        Text = "前景圖片圖層 · 牆面疊合";
        Size = new Size(1130, 760);
        MinimumSize = new Size(850, 650);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(31, 35, 42);
        ForeColor = Color.Gainsboro;
        Font = new Font("Microsoft JhengHei UI", 10);
        Layers = document.ForegroundLayers.Select(l => l.Copy()).ToList();
        _background = ImageLoader.Load(backgroundPath);
        _world = document.World;
        _resolve = resolve;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 330));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var side = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 6, Padding = new Padding(0, 0, 12, 0) };
        side.RowStyles.Add(new RowStyle(SizeType.Absolute, 45));
        side.RowStyles.Add(new RowStyle(SizeType.Absolute, 150));
        side.RowStyles.Add(new RowStyle(SizeType.Absolute, 75));
        side.RowStyles.Add(new RowStyle(SizeType.Absolute, 250));
        side.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        side.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        side.Controls.Add(new Label { Text = "底圖上方的圖片（清單越下方越靠前）", Dock = DockStyle.Fill }, 0, 0);
        side.Controls.Add(_list, 0, 1);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill };
        AddButton(actions, "新增圖片…", AddImage);
        AddButton(actions, "移除", () => { if (Selected is null) return; var i = _list.SelectedIndex; Layers.RemoveAt(i); RefreshList(Math.Min(i, Layers.Count - 1)); });
        AddButton(actions, "往底層", () => MoveLayer(-1));
        AddButton(actions, "往前層", () => MoveLayer(1));
        side.Controls.Add(actions, 0, 2);
        var fields = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 7 };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var controls = new Control[] { _name, _x, _y, _scale, _opacity, _visible };
        var labels = new[] { "名稱", "X 位置", "Y 位置", "縮放 %", "不透明度 %", "" };
        for (var i = 0; i < controls.Length; i++)
        {
            controls[i].BackColor = Color.FromArgb(22, 26, 33);
            controls[i].ForeColor = Color.Gainsboro;
            fields.RowStyles.Add(new RowStyle(SizeType.Absolute, 33));
            fields.Controls.Add(new Label { Text = labels[i], AutoSize = true, Anchor = AnchorStyles.Left }, 0, i);
            fields.Controls.Add(controls[i], 1, i);
        }
        var reset = new Button { Text = "原位對齊：0, 0 ／ 100%", Dock = DockStyle.Fill };
        reset.Click += (_, _) => { if (Selected is null) return; _x.Value = 0; _y.Value = 0; _scale.Value = 100; };
        fields.Controls.Add(reset, 0, 6); fields.SetColumnSpan(reset, 2);
        side.Controls.Add(fields, 0, 3);
        var info = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, AutoScroll = true };
        info.Controls.Add(_file);
        info.Controls.Add(new Label { Text = "同尺寸、同構圖圖片以 0, 0 ／ 100% 疊合。\n透明 PNG 會保留透明處。\n此處編輯圖片疊層；角色防遮擋另由遊戲端處理。", AutoSize = true, MaximumSize = new Size(295, 0), Margin = new Padding(0, 12, 0, 0) });
        side.Controls.Add(info, 0, 4);
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill };
        var apply = AddButton(footer, "套用", () => { DialogResult = DialogResult.OK; Close(); });
        var cancel = AddButton(footer, "取消", () => { DialogResult = DialogResult.Cancel; Close(); });
        AcceptButton = apply; CancelButton = cancel;
        side.Controls.Add(footer, 0, 5);
        root.Controls.Add(side, 0, 0); root.Controls.Add(_preview, 1, 0); Controls.Add(root);
        _list.SelectedIndexChanged += (_, _) => LoadSelection();
        _name.TextChanged += (_, _) => Change();
        foreach (var input in new[] { _x, _y, _scale, _opacity }) input.ValueChanged += (_, _) => Change();
        _visible.CheckedChanged += (_, _) => Change();
        _preview.Paint += (_, e) => PaintPreview(e.Graphics);
        RefreshList(Layers.Count > 0 ? 0 : -1);
    }

    private static NumericUpDown Number(decimal min, decimal max, int decimals) => new()
        { Minimum = min, Maximum = max, DecimalPlaces = decimals, Dock = DockStyle.Fill };
    private static Button AddButton(Control parent, string text, Action action)
    {
        var button = new Button { Text = text, AutoSize = true, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(2) };
        button.Click += (_, _) => action(); parent.Controls.Add(button); return button;
    }
    private void AddImage()
    {
        using var dialog = new OpenFileDialog { Title = "加入前景圖片（建議透明 PNG）", Filter = ImageLoader.FileDialogFilter };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            using var check = ImageLoader.Load(dialog.FileName);
            Layers.Add(new ForegroundImageLayer { File = dialog.FileName, Label = Path.GetFileNameWithoutExtension(dialog.FileName) });
            RefreshList(Layers.Count - 1);
        }
        catch (Exception e) { MessageBox.Show(this, e.Message, "無法載入前景圖片"); }
    }
    private void MoveLayer(int delta)
    {
        var i = _list.SelectedIndex; var target = i + delta;
        if (i < 0 || target < 0 || target >= Layers.Count) return;
        (Layers[i], Layers[target]) = (Layers[target], Layers[i]); RefreshList(target);
    }
    private void RefreshList(int selected)
    {
        _loading = true; _list.Items.Clear(); foreach (var layer in Layers) _list.Items.Add(layer);
        _list.SelectedIndex = selected; _loading = false; LoadSelection(); _preview.Invalidate();
    }
    private void LoadSelection()
    {
        if (_loading) return;
        _loading = true;
        var layer = Selected;
        foreach (var c in new Control[] { _name, _x, _y, _scale, _opacity, _visible }) c.Enabled = layer is not null;
        if (layer is not null)
        {
            _name.Text = layer.Label; _x.Value = Math.Clamp((decimal)layer.X, _x.Minimum, _x.Maximum);
            _y.Value = Math.Clamp((decimal)layer.Y, _y.Minimum, _y.Maximum);
            _scale.Value = Math.Clamp((decimal)layer.Scale * 100, _scale.Minimum, _scale.Maximum);
            _opacity.Value = (decimal)layer.Opacity * 100; _visible.Checked = layer.Visible;
            _file.Text = "圖片：" + Path.GetFileName(layer.File);
        }
        else _file.Text = "按「新增圖片…」加入牆圖。";
        _loading = false;
    }
    private void Change()
    {
        if (_loading || Selected is not { } layer) return;
        layer.Label = _name.Text; layer.X = (float)_x.Value; layer.Y = (float)_y.Value;
        layer.Scale = (float)_scale.Value / 100; layer.Opacity = (float)_opacity.Value / 100; layer.Visible = _visible.Checked;
        var i = _list.SelectedIndex; _loading = true; _list.Items[i] = layer; _loading = false;
        _preview.Invalidate();
    }
    private void PaintPreview(Graphics graphics)
    {
        var zoom = Math.Min(_preview.Width / _world.Width, _preview.Height / _world.Height) * .96f;
        graphics.TranslateTransform((_preview.Width - _world.Width * zoom) / 2, (_preview.Height - _world.Height * zoom) / 2);
        graphics.ScaleTransform(zoom, zoom); graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.DrawImage(_background, new RectangleF(0, 0, _world.Width, _world.Height));
        foreach (var layer in Layers)
        {
            var path = _resolve(layer.File);
            if (path is null) continue;
            try
            {
                if (!_images.TryGetValue(path, out var image)) { image = ImageLoader.Load(path); _images.Add(path, image); }
                ForegroundRendering.Draw(graphics, image, layer);
            }
            catch (Exception) { /* Missing/broken images are reported when applying or saving. */ }
        }
    }

    internal void RunControlSelfTest(string screenshotPath)
    {
        if (Layers.Count == 0) throw new InvalidOperationException("Test needs a foreground layer.");
        _x.Value = 12; _y.Value = -7; _scale.Value = 85; _opacity.Value = 40; _visible.Checked = false;
        var layer = Layers[0];
        if (layer.X != 12 || layer.Y != -7 || Math.Abs(layer.Scale - .85f) > .001f ||
            Math.Abs(layer.Opacity - .4f) > .001f || layer.Visible)
            throw new InvalidOperationException("Foreground controls did not update the layer.");
        _x.Value = 0; _y.Value = 0; _scale.Value = 100; _opacity.Value = 100; _visible.Checked = true;
        Layers.Add(new ForegroundImageLayer { Label = "排序測試", File = layer.File });
        RefreshList(1); MoveLayer(-1);
        if (Layers[0].Label != "排序測試") throw new InvalidOperationException("Foreground ordering failed.");
        Layers.RemoveAt(0); RefreshList(0);
        using var bitmap = new Bitmap(Width, Height);
        DrawToBitmap(bitmap, new Rectangle(0, 0, Width, Height));
        bitmap.Save(screenshotPath, ImageFormat.Png);
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { _background.Dispose(); foreach (var image in _images.Values) image.Dispose(); }
        base.Dispose(disposing);
    }
    private sealed class PreviewPanel : Panel { public PreviewPanel() { DoubleBuffered = true; ResizeRedraw = true; } }
}
