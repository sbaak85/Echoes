namespace Echoes.MapEditor;

// 側欄「遮擋片段」：所屬前景圖層、牆腳線重設與方向對調，以及操作說明。
public sealed partial class MainForm
{
    private readonly GroupBox _occluderGroup = CreateGroup("遮擋片段", 212);
    private readonly ComboBox _occluderLayerCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        BackColor = Color.FromArgb(35, 39, 47),
        ForeColor = Color.FromArgb(226, 230, 234),
        FlatStyle = FlatStyle.Flat,
    };
    private readonly Label _occluderHelpLabel = new() { ForeColor = Color.FromArgb(184, 194, 205) };
    private bool _syncingOccluderSidebar;

    private sealed record OccluderLayerChoice(string Id, string Text)
    {
        public override string ToString() => Text;
    }

    private void AddOccluderSidebar(Control sidebar)
    {
        var layerLabel = new Label { Text = "前景圖層", ForeColor = Color.FromArgb(184, 194, 205) };
        layerLabel.SetBounds(10, 28, 80, 22);
        _occluderLayerCombo.SetBounds(92, 24, SidebarContentWidth - 82, 28);
        _occluderLayerCombo.SelectedIndexChanged += (_, _) =>
        {
            if (_syncingOccluderSidebar || _occluderLayerCombo.SelectedItem is not OccluderLayerChoice choice) return;
            _canvas.SetSelectedOccluderLayer(choice.Id);
            RefreshLayers();
            RefreshSelectionUi();
        };
        var reset = CreateButton("牆腳線設為最下方的邊", 10, 60, 212, 30);
        reset.Click += (_, _) => _canvas.ResetSelectedOccluderBaseline();
        var swap = CreateButton("對調端點", 230, 60, 105, 30);
        swap.Click += (_, _) => _canvas.SwapSelectedOccluderBaseline();
        var nextEdge = CreateButton("牆腳線換成下一條邊", 10, 96, 325, 30);
        nextEdge.Click += (_, _) => _canvas.UseNextOccluderEdgeAsBaseline();
        _occluderHelpLabel.SetBounds(10, 132, SidebarContentWidth, 76);
        _occluderHelpLabel.Text = "橘紅色線是牆腳線：放在這段牆真正貼地的接縫。角色腳底在線的下方（牆前）會蓋住這段牆，在上方（牆後）會被擋住。\n按住 Shift 拖端點＝只移動牆腳線，不帶動範圍的角。\n不要包到另一段牆；轉角拆成兩段。";
        _occluderGroup.Controls.AddRange(new Control[] { layerLabel, _occluderLayerCombo, reset, swap, nextEdge, _occluderHelpLabel });
        _occluderGroup.Visible = false;
        sidebar.Controls.Add(_occluderGroup);
    }

    private void RefreshOccluderSidebar()
    {
        var occluder = _canvas.SelectedOccluder;
        _occluderGroup.Visible = occluder is not null;
        if (occluder is null) return;
        _syncingOccluderSidebar = true;
        try
        {
            _occluderLayerCombo.Items.Clear();
            foreach (var layer in _canvas.Document.ForegroundLayers)
                _occluderLayerCombo.Items.Add(new OccluderLayerChoice(layer.Id, string.IsNullOrWhiteSpace(layer.Label) ? layer.File : layer.Label));
            _occluderLayerCombo.SelectedIndex = _occluderLayerCombo.Items.Cast<OccluderLayerChoice>().ToList()
                .FindIndex(choice => choice.Id == occluder.LayerId);
        }
        finally { _syncingOccluderSidebar = false; }
    }
}
