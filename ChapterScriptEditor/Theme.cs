namespace Echoes.ChapterScriptEditor;

internal static class Theme
{
    public static readonly Color Background = Color.FromArgb(16, 24, 31);
    public static readonly Color Panel = Color.FromArgb(20, 33, 41);
    public static readonly Color PanelAlt = Color.FromArgb(25, 42, 51);
    public static readonly Color Gold = Color.FromArgb(222, 177, 99);
    public static readonly Color Cyan = Color.FromArgb(112, 220, 214);
    public static readonly Color Text = Color.FromArgb(229, 235, 232);
    public static readonly Color Muted = Color.FromArgb(151, 171, 174);
    public static readonly Color Border = Color.FromArgb(72, 89, 88);

    public static Button Button(string text, int width = 100) => new()
    {
        Text = text,
        Width = width,
        Height = 34,
        FlatStyle = FlatStyle.Flat,
        BackColor = PanelAlt,
        ForeColor = Text,
        Margin = new Padding(4),
    };

    public static void StyleInput(Control control)
    {
        control.BackColor = Color.FromArgb(11, 25, 32);
        control.ForeColor = Text;
        if (control is TextBoxBase textBox) textBox.BorderStyle = BorderStyle.FixedSingle;
        if (control is ComboBox comboBox) comboBox.FlatStyle = FlatStyle.Flat;
    }

    public static void StyleGrid(DataGridView grid)
    {
        grid.BackgroundColor = Color.FromArgb(12, 24, 31);
        grid.BorderStyle = BorderStyle.None;
        grid.GridColor = Border;
        grid.RowHeadersVisible = false;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.AllowUserToResizeRows = false;
        grid.MultiSelect = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.ColumnHeadersDefaultCellStyle.BackColor = PanelAlt;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Gold;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = PanelAlt;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Microsoft JhengHei UI", 10F, FontStyle.Bold);
        grid.EnableHeadersVisualStyles = false;
        grid.DefaultCellStyle.BackColor = Color.FromArgb(14, 29, 37);
        grid.DefaultCellStyle.ForeColor = Text;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(36, 85, 86);
        grid.DefaultCellStyle.SelectionForeColor = Color.White;
        grid.RowTemplate.Height = 36;
        grid.ReadOnly = true;
    }
}
