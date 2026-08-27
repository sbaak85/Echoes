using System.IO;
using System.Text;

namespace Echoes.AudioEventTools;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ConfigureWindowsForms();

        try
        {
            var projectRoot = args.Skip(1).FirstOrDefault()
                ?? AudioEventProjectPaths.FindProjectRoot(AppContext.BaseDirectory)
                ?? AudioEventProjectPaths.FindProjectRoot(Environment.CurrentDirectory)
                ?? throw new InvalidOperationException(
                    "找不到 Echoes 專案根目錄。請將 AudioEventManager 資料夾保留在專案根目錄內。");

            if (
                args.Length > 0 &&
                args[0].Equals("--self-test", StringComparison.OrdinalIgnoreCase)
            )
            {
                return RunSelfTest(projectRoot);
            }

            if (
                args.Length > 0 &&
                args[0].Equals("--ui-smoke-test", StringComparison.OrdinalIgnoreCase)
            )
            {
                return RunUiSmokeTest(projectRoot);
            }

            System.Windows.Forms.Application.Run(
                new AudioEventEditorForm(projectRoot));
            return 0;
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                exception.Message,
                "Audio Event Manager 無法啟動",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static void ConfigureWindowsForms()
    {
        System.Windows.Forms.Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        System.Windows.Forms.Application.EnableVisualStyles();
        System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
    }

    private static int RunSelfTest(string projectRoot)
    {
        var sourcePath = Path.Combine(
            projectRoot,
            "app",
            "audio-event-manager.ts");
        var source = File.ReadAllText(sourcePath, Encoding.UTF8);
        var events = AudioEventConfigDocument.ParseEvents(source);
        var bgmTracks = AudioEventConfigDocument.ParseBgmTracks(source);
        var bgmRules = AudioEventConfigDocument.ParseBgmRules(source);
        var expectedGeneratorFadeOutPercent = events["generatorRunning"].FadeOutPercent;
        events.Values.First().SourceAssetPaths.Clear();
        bgmRules.Add(new BgmControlRuleEditableDefinition
        {
            Id = "self-test-rule",
            Label = "Self test",
            Enabled = false,
            TriggerType = "event",
            TargetId = "self-test",
            State = "active",
            Action = "fade",
            TrackId = "default",
            TargetVolume = 0.5,
            FadeOutSeconds = 1,
            FadeInSeconds = 1.5,
            Priority = 99,
            RestoreMode = "resume",
        });
        var rewrittenSource = AudioEventConfigDocument.RewriteSource(
            source,
            events,
            bgmTracks,
            bgmRules);
        var roundTripEvents = AudioEventConfigDocument.ParseEvents(rewrittenSource);
        var roundTripTracks = AudioEventConfigDocument.ParseBgmTracks(rewrittenSource);
        var roundTripRules = AudioEventConfigDocument.ParseBgmRules(rewrittenSource);
        var fadeOutPercent = roundTripEvents["generatorRunning"].FadeOutPercent;
        var firstGameSource = roundTripEvents.Values
            .SelectMany(definition => definition.Sources)
            .First();
        var firstOriginalSource = roundTripEvents.Values
            .SelectMany(definition => definition.SourceAssetPaths)
            .First();
        var previewPath = AudioEventEditorForm.ResolvePreviewPath(
            projectRoot,
            firstGameSource);
        var originalPreviewPath = AudioEventEditorForm.ResolveOriginalPreviewPath(
            projectRoot,
            firstOriginalSource);
        return events.Count == roundTripEvents.Count &&
            roundTripEvents.Values.First().SourceAssetPaths.Count == 0 &&
            roundTripTracks.ContainsKey("default") &&
            roundTripRules.LastOrDefault() is
                {
                    Id: "self-test-rule",
                    Action: "fade",
                    TrackId: "default",
                    Priority: 99,
                } &&
            fadeOutPercent == expectedGeneratorFadeOutPercent &&
            File.Exists(previewPath) &&
            File.Exists(originalPreviewPath) &&
            rewrittenSource.Contains(
                "export class AudioEventManager",
                StringComparison.Ordinal)
            ? 0
            : 1;
    }

    private static int RunUiSmokeTest(string projectRoot)
    {
        using var editor = new AudioEventEditorForm(projectRoot)
        {
            ShowInTaskbar = false,
            WindowState = FormWindowState.Minimized,
            Opacity = 0,
        };
        using var timer = new System.Windows.Forms.Timer { Interval = 1400 };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            editor.Close();
            System.Windows.Forms.Application.ExitThread();
        };
        editor.Shown += (_, _) => editor.RunPreviewSmokeTest();
        timer.Start();
        System.Windows.Forms.Application.Run(editor);
        return 0;
    }
}

internal static class AudioEventProjectPaths
{
    public static string? FindProjectRoot(string startPath)
    {
        var directory = new DirectoryInfo(startPath);
        while (directory is not null)
        {
            if (
                File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                File.Exists(Path.Combine(
                    directory.FullName,
                    "app",
                    "audio-event-manager.ts"))
            )
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
