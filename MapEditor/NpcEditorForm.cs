using System.Drawing.Drawing2D;

namespace Echoes.MapEditor;

internal sealed class NpcEditorForm : Form
{
    private readonly NpcCatalog _catalog;
    private readonly SceneNpc _draft;
    private readonly Dictionary<string, Button> _characters = new();
    private readonly Dictionary<string, Button> _directions = new();
    private readonly List<Bitmap> _thumbnails = new();
    private readonly Panel _preview = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(47, 52, 61) };
    private readonly NumericUpDown _percent = new() { Minimum = 10, Maximum = 500, DecimalPlaces = 1, Increment = 5, Width = 110 };
    private readonly Label _previewCaption = new() { AutoSize = true, ForeColor = Color.WhiteSmoke };
    public SceneNpc Result => _draft.Copy();
    internal int CharacterChoiceCount => _characters.Count;
    internal int DirectionChoiceCount => _directions.Count;

    public NpcEditorForm(NpcCatalog catalog, SceneNpc npc)
    {
        _catalog = catalog;
        _draft = npc.Copy();
        if (catalog.Find(_draft.CharacterId) is null) _draft.CharacterId = catalog.Characters[0].Id;
        Text = "NPC 角色與方向";
        Font = new Font("Microsoft JhengHei UI", 9);
        ClientSize = new Size(780, 610);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(27, 31, 38); ForeColor = Color.WhiteSmoke;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), RowCount = 4, ColumnCount = 1 };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 200));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        layout.Controls.Add(new Label { Text = "選擇角色，設定朝向與大小", AutoSize = true, Font = new Font(Font, FontStyle.Bold) }, 0, 0);
        var cards = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = catalog.Characters.Count, RowCount = 1 };
        foreach (var character in catalog.Characters)
        {
            cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / catalog.Characters.Count));
            var thumbnail = new Bitmap(130, 145);
            using (var graphics = Graphics.FromImage(thumbnail)) catalog.DrawPreview(graphics, new Rectangle(0, 0, 130, 145), character.Id, "SE");
            _thumbnails.Add(thumbnail);
            var button = new Button { Text = character.Name, Image = thumbnail, TextImageRelation = TextImageRelation.ImageAboveText,
                Dock = DockStyle.Fill, Margin = new Padding(4), FlatStyle = FlatStyle.Flat, ForeColor = Color.WhiteSmoke, Tag = character.Id };
            button.Click += (_, _) => SelectCharacter(character.Id);
            _characters.Add(character.Id, button); cards.Controls.Add(button);
        }
        layout.Controls.Add(cards, 0, 1);
        var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Padding = new Padding(4, 12, 4, 8) };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 46)); body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 54));
        body.Controls.Add(_preview, 0, 0);
        _preview.Paint += (_, e) =>
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            _catalog.DrawPreview(e.Graphics, new Rectangle(20, 10, _preview.Width - 40, _preview.Height - 26), _draft.CharacterId, _draft.Facing);
            using var pen = new Pen(Color.FromArgb(128, 184, 206));
            e.Graphics.DrawLine(pen, 30, _preview.Height - 12, _preview.Width - 30, _preview.Height - 12);
        };
        var settings = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(18, 0, 0, 0) };
        settings.Controls.Add(new Label { Text = "面向（即時預覽）", AutoSize = true });
        var compass = new TableLayoutPanel { Width = 270, Height = 118, ColumnCount = 3, RowCount = 3, Margin = new Padding(0, 6, 0, 8) };
        for (var i = 0; i < 3; i++) { compass.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f)); compass.RowStyles.Add(new RowStyle(SizeType.Percent, 33.333f)); }
        var placement = new[] { "NW", "N", "NE", "W", "", "E", "SW", "S", "SE" };
        for (var i = 0; i < placement.Length; i++)
        {
            var facing = placement[i]; if (facing.Length == 0) continue;
            var button = new Button { Text = facing, Dock = DockStyle.Fill, FlatStyle = FlatStyle.Flat, ForeColor = Color.WhiteSmoke, Margin = new Padding(2) };
            button.Click += (_, _) => SelectFacing(facing);
            _directions.Add(facing, button); compass.Controls.Add(button, i % 3, i / 3);
        }
        settings.Controls.Add(compass);
        var sizeRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0, 0, 0, 5) };
        sizeRow.Controls.Add(new Label { Text = "大小 %", AutoSize = true, Padding = new Padding(0, 5, 8, 0) });
        _percent.Value = (decimal)Math.Clamp(_draft.Scale * 100, 10, 500);
        _percent.ValueChanged += (_, _) => { _draft.Scale = (float)_percent.Value / 100; UpdateChoices(); };
        sizeRow.Controls.Add(_percent); settings.Controls.Add(sizeRow);
        settings.Controls.Add(_previewCaption);
        settings.Controls.Add(new Label { Text = "腳底位置保持不變。\n新增後可直接拖曳，或拖動右上角縮放。", AutoSize = true, Margin = new Padding(0, 8, 0, 0), ForeColor = Color.FromArgb(184, 194, 205) });
        body.Controls.Add(settings, 1, 0); layout.Controls.Add(body, 0, 2);
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 6, 0, 0) };
        var accept = new Button { Text = "套用", DialogResult = DialogResult.OK, Width = 100, Height = 30 };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 100, Height = 30 };
        footer.Controls.Add(accept); footer.Controls.Add(cancel); layout.Controls.Add(footer, 0, 3);
        AcceptButton = accept; CancelButton = cancel; Controls.Add(layout); UpdateChoices();
    }

    internal void SelectCharacter(string id) { if (!_characters.ContainsKey(id)) return; _draft.CharacterId = id; UpdateChoices(); }
    internal void SelectFacing(string facing) { if (!_directions.ContainsKey(facing)) return; _draft.Facing = facing; UpdateChoices(); }
    internal void SetPercent(decimal value) => _percent.Value = value;
    private void UpdateChoices()
    {
        foreach (var (id, button) in _characters) button.BackColor = id == _draft.CharacterId ? Color.FromArgb(49, 92, 111) : Color.FromArgb(43, 48, 57);
        foreach (var (facing, button) in _directions) button.BackColor = facing == _draft.Facing ? Color.FromArgb(49, 112, 137) : Color.FromArgb(43, 48, 57);
        _previewCaption.Text = $"{_catalog.Find(_draft.CharacterId)?.Name} · {_draft.Facing} · 可見身高 {_catalog.BodyHeight(_draft):0.#} px（100% 與主角同高）";
        _preview.Invalidate();
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) foreach (var thumbnail in _thumbnails) thumbnail.Dispose();
        base.Dispose(disposing);
    }
}
