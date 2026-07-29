using System.Runtime.InteropServices;
using System.Text;
using System.IO;

namespace Echoes.MapEditor;

internal static class Program
{
    [DllImport("kernel32.dll")]
    private static extern bool AttachConsole(uint processId);

    private const uint AttachParentProcess = 0xFFFFFFFF;
    private static int _errorDialogVisible;

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length > 0 && args[0].Equals("--self-test", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                AttachConsole(AttachParentProcess);
                Console.OutputEncoding = Encoding.UTF8;
                Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
            }
            catch (IOException)
            {
                // A GUI executable can still run the validation when its parent
                // process does not expose a console handle.
            }

            try
            {
                return EditorSelfTest.Run(args.Skip(1).FirstOrDefault());
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(exception);
                return 1;
            }
        }

        ConfigureExceptionHandling();
        ConfigureWindowsForms();

        if (args.Length > 0 && args[0].Equals("--drag-stress-test", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                return EditorDragStressTest.Run(args.Skip(1).FirstOrDefault());
            }
            catch (Exception exception)
            {
                EditorDiagnostics.Log("Drag stress test failure", exception);
                return 1;
            }
        }

        if (args.Length > 0 && args[0].Equals("--ui-smoke-test", StringComparison.OrdinalIgnoreCase))
        {
            using var form = new MainForm
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
                SuppressUnsavedPrompt = true,
            };
            using var timer = new System.Windows.Forms.Timer { Interval = 1800 };
            timer.Tick += (_, _) =>
            {
                timer.Stop();
                form.Close();
                System.Windows.Forms.Application.ExitThread();
            };
            timer.Start();
            System.Windows.Forms.Application.Run(form);
            return 0;
        }

        System.Windows.Forms.Application.Run(new MainForm());
        return 0;
    }

    private static void ConfigureWindowsForms()
    {
        System.Windows.Forms.Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        System.Windows.Forms.Application.EnableVisualStyles();
        System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
    }

    private static void ConfigureExceptionHandling()
    {
        System.Windows.Forms.Application.SetUnhandledExceptionMode(
            UnhandledExceptionMode.CatchException);
        System.Windows.Forms.Application.ThreadException += (_, eventArgs) =>
        {
            EditorDiagnostics.Log("Unhandled Windows Forms exception", eventArgs.Exception);
            RecoverEditorCanvases();

            if (Interlocked.Exchange(ref _errorDialogVisible, 1) != 0) return;
            try
            {
                MessageBox.Show(
                    "編輯器已攔截一個錯誤並取消這次拖曳，場景仍可繼續編輯。\r\n\r\n" +
                    "若問題再次發生，請把 MapEditor\\runtime\\MapEditor.log 交給 Codex 檢查。",
                    "MapEditor 已恢復",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
            finally
            {
                Interlocked.Exchange(ref _errorDialogVisible, 0);
            }
        };

        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
        {
            if (eventArgs.ExceptionObject is Exception exception)
            {
                EditorDiagnostics.Log("Unhandled application exception", exception);
            }
        };
    }

    private static void RecoverEditorCanvases()
    {
        foreach (Form form in System.Windows.Forms.Application.OpenForms)
        {
            RecoverEditorCanvases(form);
        }
    }

    private static void RecoverEditorCanvases(Control parent)
    {
        foreach (Control control in parent.Controls)
        {
            if (control is EditorCanvas canvas)
            {
                canvas.RecoverAfterException();
            }

            if (control.HasChildren) RecoverEditorCanvases(control);
        }
    }
}

internal static class EditorDragStressTest
{
    public static int Run(string? projectRoot)
    {
        projectRoot ??= ProjectPaths.FindProjectRoot(AppContext.BaseDirectory)
            ?? throw new InvalidOperationException("找不到 Echoes 專案資料夾。");

        var scenePath = Path.Combine(projectRoot, "public", "maps", "map_test01.scene.json");
        var imagePath = Path.Combine(projectRoot, "Assets", "map", "map_test01.png");
        var scene = SceneJson.Load(scenePath);
        var image = ImageLoader.Load(imagePath);

        using var form = new Form
        {
            ShowInTaskbar = false,
            StartPosition = FormStartPosition.Manual,
            Location = new Point(-32000, -32000),
            ClientSize = new Size(1200, 760),
            Opacity = 0,
        };
        var canvas = new EditorCanvas { Dock = DockStyle.Fill };
        form.Controls.Add(canvas);
        form.Show();
        System.Windows.Forms.Application.DoEvents();

        canvas.SetScene(scene, image);
        System.Windows.Forms.Application.DoEvents();
        canvas.FitToView();
        canvas.RunNodeDragStressTest(25000);
        form.Close();
        return 0;
    }
}

internal static class EditorSelfTest
{
    public static int Run(string? projectRoot)
    {
        projectRoot ??= ProjectPaths.FindProjectRoot(AppContext.BaseDirectory)
            ?? throw new InvalidOperationException("找不到 Echoes 專案根目錄。");

        var scenePath = Path.Combine(projectRoot, "public", "maps", "map_test01.scene.json");
        var imagePath = Path.Combine(projectRoot, "Assets", "map", "map_test01.png");
        var scene = SceneJson.Load(scenePath);
        SceneJson.Validate(scene);

        using var image = ImageLoader.Load(imagePath);
        if (image.Width != scene.Image.Width || image.Height != scene.Image.Height)
        {
            throw new InvalidDataException("場景圖片尺寸與 JSON 不一致。");
        }

        var roundTrip = SceneJson.Deserialize(SceneJson.Serialize(scene));
        SceneJson.Validate(roundTrip);
        using var canvas = new EditorCanvas();
        canvas.RunNodeEditingSelfTest(roundTrip);
        Console.WriteLine(
            $"MapEditor self-test OK | {image.Width}x{image.Height} | " +
            $"NavMesh {roundTrip.NavMesh.Count} | Collision {roundTrip.Collisions.Count}");
        return 0;
    }
}
