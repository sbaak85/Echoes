namespace Echoes.QuestEditor;

/// <summary>
/// Lightweight replacement for the external-ID ComboBox. A native ComboBox was the single
/// most expensive control in the window (about half of every relayout, and most of each
/// selection change, because it rebuilds its item list). This is a plain button showing the
/// current value; the searchable list is only created when the user opens it.
/// </summary>
internal sealed class ReferencePicker : Button
{
    private IReadOnlyList<QuestReference> _values = Array.Empty<QuestReference>();
    private QuestReference? _current;

    public event Action<QuestReference>? Picked;

    public QuestReference? Current => _current;
    public IReadOnlyList<QuestReference> Values => _values;

    public ReferencePicker()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderColor = Theme.Border;
        FlatAppearance.MouseOverBackColor = Theme.PanelAlt;
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        TextAlign = ContentAlignment.MiddleLeft;
        AutoEllipsis = true;
        Padding = new Padding(4, 0, 22, 0);
        UseMnemonic = false;
    }

    public void SetValues(IReadOnlyList<QuestReference> values, QuestReference? current, bool enabled)
    {
        _values = values;
        _current = current;
        var text = !enabled ? "—" : current?.ToString() ?? $"（尚未選取，共 {values.Count} 項，點此搜尋選擇）";
        if (Text != text) Text = text;
        if (Enabled != enabled) Enabled = enabled;
    }

    protected override void OnPaint(PaintEventArgs eventArgs)
    {
        base.OnPaint(eventArgs);
        var arrow = new Rectangle(Width - 22, 0, 18, Height);
        TextRenderer.DrawText(eventArgs.Graphics, "▾", Font, arrow, Enabled ? Theme.Cyan : Theme.Muted,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    protected override void OnClick(EventArgs eventArgs)
    {
        base.OnClick(eventArgs);
        if (_values.Count > 0) ShowPopup();
    }

    protected override void OnKeyDown(KeyEventArgs eventArgs)
    {
        base.OnKeyDown(eventArgs);
        if (eventArgs.KeyCode is Keys.Down or Keys.F4 && _values.Count > 0)
        {
            ShowPopup();
            eventArgs.Handled = true;
        }
    }

    private void ShowPopup()
    {
        var search = new TextBox
        {
            Dock = DockStyle.Top,
            BackColor = Theme.Panel,
            ForeColor = Theme.Text,
            BorderStyle = BorderStyle.FixedSingle,
            PlaceholderText = "輸入 ID 或名稱篩選…",
        };
        var list = new ListBox
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Background,
            ForeColor = Theme.Text,
            BorderStyle = BorderStyle.None,
            IntegralHeight = false,
            ItemHeight = 22,
        };
        Theme.UseDarkScrollBars(list);
        var panel = new Panel { BackColor = Theme.Border, Padding = new Padding(1), Size = new Size(Math.Max(Width, 360), 340) };
        panel.Controls.Add(list);
        panel.Controls.Add(search);

        var popup = new ToolStripDropDown { Padding = Padding.Empty, AutoClose = true, DropShadowEnabled = true };
        var host = new ToolStripControlHost(panel) { Padding = Padding.Empty, Margin = Padding.Empty, AutoSize = false, Size = panel.Size };
        popup.Items.Add(host);

        void Fill()
        {
            var filter = search.Text.Trim();
            var matches = filter.Length == 0
                ? _values
                : _values.Where(value => value.Id.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
                                         value.Name.Contains(filter, StringComparison.OrdinalIgnoreCase)).ToList();
            list.BeginUpdate();
            list.Items.Clear();
            list.Items.AddRange(matches.Cast<object>().ToArray());
            list.EndUpdate();
            var index = _current is null ? -1 : list.Items.IndexOf(_current);
            list.SelectedIndex = index >= 0 ? index : list.Items.Count > 0 ? 0 : -1;
        }
        void Choose()
        {
            if (list.SelectedItem is not QuestReference reference) return;
            popup.Close();
            Picked?.Invoke(reference);
        }

        search.TextChanged += (_, _) => Fill();
        search.KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.KeyCode is Keys.Down or Keys.Up && list.Items.Count > 0)
            {
                var next = list.SelectedIndex + (eventArgs.KeyCode == Keys.Down ? 1 : -1);
                list.SelectedIndex = Math.Clamp(next, 0, list.Items.Count - 1);
                eventArgs.Handled = true;
            }
            else if (eventArgs.KeyCode == Keys.Enter)
            {
                Choose();
                eventArgs.SuppressKeyPress = true;
            }
            else if (eventArgs.KeyCode == Keys.Escape)
            {
                popup.Close();
                eventArgs.SuppressKeyPress = true;
            }
        };
        list.DoubleClick += (_, _) => Choose();
        list.KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.KeyCode != Keys.Enter) return;
            Choose();
            eventArgs.SuppressKeyPress = true;
        };
        popup.Closed += (_, _) => popup.Dispose();

        Fill();
        // The picker sits at the bottom-right of the window: open upward when there is no room below.
        var workingArea = Screen.FromControl(this).WorkingArea;
        if (PointToScreen(new Point(0, Height)).Y + panel.Height <= workingArea.Bottom)
            popup.Show(this, new Point(0, Height));
        else
            popup.Show(this, Point.Empty, ToolStripDropDownDirection.AboveRight);
        search.Focus();
    }
}
