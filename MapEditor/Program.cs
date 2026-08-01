using System.Runtime.InteropServices;
using System.Text;
using System.IO;
using Echoes.AudioEventTools;

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
            Exception? smokeTestFailure = null;
            using var form = new MainForm
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
                SuppressUnsavedPrompt = true,
            };
            var projectRoot = ProjectPaths.FindProjectRoot(AppContext.BaseDirectory);
            using var audioEditor = projectRoot is null
                ? null
                : new AudioEventEditorForm(projectRoot)
                {
                    ShowInTaskbar = false,
                    WindowState = FormWindowState.Minimized,
                    Opacity = 0,
                };
            using var requirementsEditor = new SurvivalEffectEditorForm(
                "gather",
                new SurvivalRequirements
                {
                    Stamina = new SurvivalRequirementRule
                    {
                        Comparison = "atLeast",
                        Value = 20,
                    },
                },
                new SurvivalEffects { Stamina = -4, Hunger = -2, Thirst = -2 },
                3,
                new[]
                {
                    new InteractionUseRequirement
                    {
                        Kind = "item",
                        ItemId = "R0011",
                        Quantity = 3,
                    },
                    new InteractionUseRequirement { Kind = "chapter", Chapter = 4 },
                })
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
            };
            using var dialogueEditor = new DialogueEditorForm(
                DialogueScript.CreateDefault(),
                DialogueScript.CreateFailureDefault(),
                new DialogueScript
                {
                    Lines = new List<DialogueLine>
                    {
                        new() { Speaker = "Sbaak", Text = "互動已完成。" },
                    },
                })
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
            };
            using var timer = new System.Windows.Forms.Timer { Interval = 1800 };
            timer.Tick += (_, _) =>
            {
                timer.Stop();
                audioEditor?.Close();
                form.Close();
                System.Windows.Forms.Application.ExitThread();
            };
            form.Shown += (_, _) =>
            {
                try
                {
                    form.RunLayerRenameUiSelfTest();
                    requirementsEditor.Show(form);
                    System.Windows.Forms.Application.DoEvents();
                    requirementsEditor.Close();
                    dialogueEditor.Show(form);
                    System.Windows.Forms.Application.DoEvents();
                    dialogueEditor.Close();
                    audioEditor?.Show(form);
                }
                catch (Exception exception)
                {
                    smokeTestFailure = exception;
                    timer.Stop();
                    audioEditor?.Close();
                    form.Close();
                    System.Windows.Forms.Application.ExitThread();
                }
            };
            timer.Start();
            System.Windows.Forms.Application.Run(form);
            if (smokeTestFailure is null) return 0;
            EditorDiagnostics.Log("UI smoke test failure", smokeTestFailure);
            return 1;
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
        if (
            ItemCatalog.All.Count != 24 ||
            ItemCatalog.Find("crystal-shard")?.Id != "R0001" ||
            ItemCatalog.Find("R0012")?.Name != "外星果實"
        )
        {
            throw new InvalidDataException("道具分類流水號、舊 ID 遷移或外星果實目錄不正確。");
        }

        using var image = ImageLoader.Load(imagePath);
        if (image.Width != scene.Image.Width || image.Height != scene.Image.Height)
        {
            throw new InvalidDataException("場景圖片尺寸與 JSON 不一致。");
        }

        var roundTrip = SceneJson.Deserialize(SceneJson.Serialize(scene));
        SceneJson.Validate(roundTrip);

        var multiPointDocument = SceneJson.Deserialize(SceneJson.Serialize(roundTrip));
        var multiPointInteractable = multiPointDocument.Interactables.FirstOrDefault()
            ?? throw new InvalidDataException("Interaction Point self-test requires an interactable.");
        var interactionPoints = multiPointInteractable.EnsureInteractionPoints();
        if (interactionPoints.Count == 0)
        {
            interactionPoints.Add(new InteractionPoint { X = 100, Y = 100, Facing = "S" });
        }
        interactionPoints.Add(new InteractionPoint { X = 200, Y = 200, Facing = "N" });
        multiPointInteractable.InteractionHintPoint = new ScenePoint(150, 150);
        multiPointInteractable.Type = "gather";
        multiPointInteractable.SurvivalRequirements = new SurvivalRequirements
        {
            Mode = "any",
            Stamina = new SurvivalRequirementRule
            {
                Comparison = "atMost",
                Value = 99,
            },
            Spirit = new SurvivalRequirementRule
            {
                Comparison = "below",
                Value = 50,
            },
        };
        multiPointInteractable.SurvivalEffects = new SurvivalEffects
        {
            Stamina = -4,
            Hunger = -2,
            Thirst = -2,
            Spirit = -1,
            TimeMinutes = 480,
        };
        multiPointInteractable.DailyInteractionLimit = 3;
        multiPointInteractable.ItemReward = new InteractionItemReward
        {
            ItemId = "R0002",
            Quantity = 4,
            Delivery = "world",
        };
        multiPointInteractable.FailureDialogue = new DialogueScript
        {
            CharacterDelaySeconds = 0.03f,
            Speakers = new List<string> { "Sbaak", "Echo" },
            Lines = new List<DialogueLine>
            {
                new() { Speaker = "Echo", Text = "條件尚未達成。" },
            },
        };
        multiPointInteractable.CompletionDialogue = new DialogueScript
        {
            CharacterDelaySeconds = 0.02f,
            Speakers = new List<string> { "Sbaak", "Echo" },
            Lines = new List<DialogueLine>
            {
                new() { Speaker = "Sbaak", Text = "互動已完成。" },
            },
        };
        multiPointInteractable.UseRequirements = new List<InteractionUseRequirement>
        {
            new() { Kind = "item", ItemId = "R0011", Quantity = 3 },
            new() { Kind = "chapter", Chapter = 4 },
        };
        var expectedInteractionPointCount = interactionPoints.Count;
        var multiPointRoundTrip = SceneJson.Deserialize(SceneJson.Serialize(multiPointDocument));
        SceneJson.Validate(multiPointRoundTrip);
        if (
            multiPointRoundTrip.Interactables[0].EffectiveInteractionPoints.Count !=
            expectedInteractionPointCount ||
            multiPointRoundTrip.Interactables[0].InteractionHintPoint is not { X: 150, Y: 150 } ||
            multiPointRoundTrip.Interactables[0].SurvivalRequirements is not
                { Mode: "any", Stamina: { Comparison: "atMost", Value: 99 } } ||
            multiPointRoundTrip.Interactables[0].SurvivalEffects.Stamina != -4 ||
            multiPointRoundTrip.Interactables[0].SurvivalEffects.TimeMinutes != 480 ||
            multiPointRoundTrip.Interactables[0].DailyInteractionLimit != 3 ||
            multiPointRoundTrip.Interactables[0].ItemReward is not
                { ItemId: "R0002", Quantity: 4, Delivery: "world" } ||
            multiPointRoundTrip.Interactables[0].FailureDialogue.Lines.FirstOrDefault() is not
                { Speaker: "Echo", Text: "條件尚未達成。" } ||
            multiPointRoundTrip.Interactables[0].CompletionDialogue?.Lines.FirstOrDefault() is not
                { Speaker: "Sbaak", Text: "互動已完成。" } ||
            multiPointRoundTrip.Interactables[0].UseRequirements?.Count != 2 ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[0] is not
                { Kind: "item", ItemId: "R0011", Quantity: 3 } ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[1] is not
                { Kind: "chapter", Chapter: 4 }
        )
        {
            throw new InvalidDataException(
                "Interaction Points, hint Point, survival settings, item reward, requirements, or dialogue phases did not survive JSON round-trip.");
        }

        using (var requirementsEditor = new SurvivalEffectEditorForm(
            multiPointInteractable.Type,
            multiPointInteractable.SurvivalRequirements,
            multiPointInteractable.SurvivalEffects,
            multiPointInteractable.DailyInteractionLimit,
            multiPointInteractable.UseRequirements))
        {
            if (
                requirementsEditor.UseRequirements.Count != 2 ||
                requirementsEditor.Requirements.Mode != "any" ||
                requirementsEditor.Requirements.Stamina is not
                    { Comparison: "atMost", Value: 99 })
            {
                throw new InvalidDataException(
                    "Requirement editor did not preserve match mode, comparison, or multiple conditions.");
            }
        }

        var audioConfigPath = Path.Combine(projectRoot, "app", "audio-event-manager.ts");
        var audioSource = File.ReadAllText(audioConfigPath, Encoding.UTF8);
        var audioEvents = AudioEventConfigDocument.ParseEvents(audioSource);
        var rewrittenAudioSource = AudioEventConfigDocument.RewriteSource(
            audioSource,
            audioEvents);
        var roundTripAudioEvents = AudioEventConfigDocument.ParseEvents(rewrittenAudioSource);
        if (
            audioEvents.Count != roundTripAudioEvents.Count ||
            !rewrittenAudioSource.Contains(
                "export class AudioEventManager",
                StringComparison.Ordinal)
        )
        {
            throw new InvalidDataException(
                "Audio Event config rewrite did not preserve the manager implementation.");
        }

        var audioSaveTestDirectory = Path.Combine(
            projectRoot,
            "MapEditor",
            "runtime",
            "audio-save-self-test");
        var audioSaveTestPath = Path.Combine(
            audioSaveTestDirectory,
            "audio-event-manager.ts");
        var audioSaveBackupPath = Path.Combine(
            audioSaveTestDirectory,
            "audio-event-manager.ts.bak");
        Directory.CreateDirectory(audioSaveTestDirectory);
        try
        {
            File.WriteAllText(audioSaveTestPath, audioSource, new UTF8Encoding(false));
            var audioSaveDocument = AudioEventConfigDocument.Load(
                audioSaveTestPath,
                audioSaveBackupPath);
            audioSaveDocument.Save();
            if (
                !File.Exists(audioSaveBackupPath) ||
                AudioEventConfigDocument.ParseEvents(
                    File.ReadAllText(audioSaveTestPath, Encoding.UTF8)).Count !=
                    audioEvents.Count
            )
            {
                throw new InvalidDataException(
                    "Audio Event file save or backup self-test failed.");
            }
        }
        finally
        {
            if (File.Exists(audioSaveTestPath)) File.Delete(audioSaveTestPath);
            if (File.Exists(audioSaveBackupPath)) File.Delete(audioSaveBackupPath);
            if (
                Directory.Exists(audioSaveTestDirectory) &&
                !Directory.EnumerateFileSystemEntries(audioSaveTestDirectory).Any()
            )
            {
                Directory.Delete(audioSaveTestDirectory);
            }
        }

        using var canvas = new EditorCanvas();
        canvas.RunNodeEditingSelfTest(roundTrip);
        Console.WriteLine(
            $"MapEditor self-test OK | {image.Width}x{image.Height} | " +
            $"NavMesh {roundTrip.NavMesh.Count} | Collision {roundTrip.Collisions.Count} | " +
            $"InteractionPoints {expectedInteractionPointCount} | " +
            $"AudioEvents {audioEvents.Count}");
        return 0;
    }
}
