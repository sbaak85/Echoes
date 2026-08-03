namespace Echoes.QuestEditor;

internal static class Theme
{
    public static readonly Color Background = Color.FromArgb(12, 22, 29);
    public static readonly Color Panel = Color.FromArgb(17, 31, 39);
    public static readonly Color PanelAlt = Color.FromArgb(23, 42, 50);
    public static readonly Color Gold = Color.FromArgb(219, 174, 91);
    public static readonly Color Cyan = Color.FromArgb(105, 219, 211);
    public static readonly Color Text = Color.FromArgb(230, 237, 234);
    public static readonly Color Muted = Color.FromArgb(145, 166, 169);
    public static readonly Color Border = Color.FromArgb(65, 85, 86);

    public static Button Button(string text, int width = 100) => new()
    {
        Text = text,
        Width = width,
        Height = 32,
        FlatStyle = FlatStyle.Flat,
        BackColor = PanelAlt,
        ForeColor = Text,
        Margin = new Padding(3),
    };

    public static void StyleGrid(DataGridView grid)
    {
        grid.BackgroundColor = Background;
        grid.BorderStyle = BorderStyle.None;
        grid.GridColor = Border;
        grid.RowHeadersVisible = false;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.MultiSelect = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = PanelAlt;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Gold;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = PanelAlt;
        grid.DefaultCellStyle.BackColor = Color.FromArgb(14, 28, 36);
        grid.DefaultCellStyle.ForeColor = Text;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(37, 82, 83);
        grid.DefaultCellStyle.SelectionForeColor = Color.White;
        grid.RowTemplate.Height = 32;
        grid.ReadOnly = true;
    }
}
