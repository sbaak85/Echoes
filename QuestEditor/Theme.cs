using System.Reflection;
using System.Runtime.InteropServices;

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
    public static readonly Color Selection = Color.FromArgb(37, 82, 83);
    public static readonly Color Error = Color.FromArgb(244, 120, 110);
    public static readonly Color ErrorBack = Color.FromArgb(58, 26, 30);
    public static readonly Color Warning = Color.FromArgb(236, 188, 92);
    public static readonly Color WarningBack = Color.FromArgb(52, 42, 20);
    public static readonly Color Success = Color.FromArgb(120, 214, 150);

    // Shared fonts: one GDI font object each instead of a new one per label.
    public static readonly Font BodyFont = new("Microsoft JhengHei UI", 10F);
    public static readonly Font HeaderFont = new("Microsoft JhengHei UI", 11F, FontStyle.Bold);
    public static readonly Font BoldFont = new("Microsoft JhengHei UI", 10F, FontStyle.Bold);

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
        grid.AllowUserToResizeRows = false;
        grid.MultiSelect = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = PanelAlt;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Gold;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = PanelAlt;
        grid.DefaultCellStyle.BackColor = Color.FromArgb(14, 28, 36);
        grid.DefaultCellStyle.ForeColor = Text;
        grid.DefaultCellStyle.SelectionBackColor = Selection;
        grid.DefaultCellStyle.SelectionForeColor = Color.White;
        grid.RowTemplate.Height = 32;
        grid.ReadOnly = true;
        EnableDoubleBuffering(grid);
    }

    /// <summary>Turns on the protected DoubleBuffered flag (DataGridView, ListView…) to stop flicker.</summary>
    public static void EnableDoubleBuffering(Control control) =>
        typeof(Control).GetProperty("DoubleBuffered", BindingFlags.Instance | BindingFlags.NonPublic)
            ?.SetValue(control, true);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);

    /// <summary>Native TreeView double buffering (TVS_EX_DOUBLEBUFFER); call once the handle exists.</summary>
    public static void EnableTreeDoubleBuffering(TreeView tree)
    {
        const int setExtendedStyle = 0x1100 + 44, doubleBuffer = 0x0004;
        SendMessage(tree.Handle, setExtendedStyle, (IntPtr)doubleBuffer, (IntPtr)doubleBuffer);
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
    private static extern int SetWindowTheme(IntPtr window, string? subAppName, string? subIdList);

    /// <summary>Dark title bar (Windows 10 2004+ / 11). Silently ignored where unsupported.</summary>
    public static void UseDarkTitleBar(Form form)
    {
        form.HandleCreated += (_, _) =>
        {
            var enabled = 1;
            if (DwmSetWindowAttribute(form.Handle, 20, ref enabled, sizeof(int)) != 0)
                DwmSetWindowAttribute(form.Handle, 19, ref enabled, sizeof(int));
        };
    }

    /// <summary>Dark native scroll bars / tree lines for common controls.</summary>
    public static void UseDarkScrollBars(Control control)
    {
        if (control.IsHandleCreated) SetWindowTheme(control.Handle, "DarkMode_Explorer", null);
        else control.HandleCreated += (_, _) => SetWindowTheme(control.Handle, "DarkMode_Explorer", null);
    }
}
