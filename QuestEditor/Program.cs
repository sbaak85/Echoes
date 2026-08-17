using System.Text;

namespace Echoes.QuestEditor;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
        }
        catch (IOException)
        {
            // WinExe 從檔案總管啟動時沒有主控台；不影響編輯器運作。
        }
        try
        {
            var projectRoot = FindProjectRoot(args.Skip(1).FirstOrDefault());
            var dataPath = Path.Combine(projectRoot, "public", "quests", "quest-data.json");
            if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
            {
                RunSelfTest(projectRoot);
                return 0;
            }
            if (args.Contains("--ui-smoke-test", StringComparer.OrdinalIgnoreCase))
            {
                var smokeDataPath = Path.Combine(Path.GetTempPath(), "EchoesQuestEditor", "quest-data-ui-smoke.json");
                QuestDataStore.Save(smokeDataPath, QuestDataStore.Load(dataPath));
                ApplicationConfiguration.Initialize();
                using var form = new MainForm(projectRoot, smokeDataPath)
                {
                    ShowInTaskbar = false,
                    Opacity = 0,
                    StartPosition = FormStartPosition.Manual,
                    Location = new Point(-10000, -10000),
                };
                form.Show();
                Application.DoEvents();
                form.RunSmokeTest();
                Console.WriteLine("QuestEditor UI smoke test passed.");
                return 0;
            }
            if (args.Contains("--render-preview", StringComparer.OrdinalIgnoreCase))
            {
                ApplicationConfiguration.Initialize();
                using var form = new MainForm(projectRoot, dataPath)
                {
                    ShowInTaskbar = false,
                    StartPosition = FormStartPosition.Manual,
                    Location = new Point(-10000, -10000),
                };
                form.Show();
                Application.DoEvents();
                using var bitmap = new Bitmap(form.Width, form.Height);
                form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                var previewPath = Path.Combine(projectRoot, "QuestEditor", "runtime", "quest-editor-preview.png");
                Directory.CreateDirectory(Path.GetDirectoryName(previewPath)!);
                bitmap.Save(previewPath, System.Drawing.Imaging.ImageFormat.Png);
                form.Close();
                Console.WriteLine(previewPath);
                return 0;
            }
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm(projectRoot, dataPath));
            return 0;
        }
        catch (Exception exception)
        {
            if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--ui-smoke-test", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--render-preview", StringComparer.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine(exception);
                return 1;
            }
            MessageBox.Show(exception.Message, "任務編輯器", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string FindProjectRoot(string? requestedRoot)
    {
        foreach (var candidate in new[] { requestedRoot, AppContext.BaseDirectory, Environment.CurrentDirectory }
                     .Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            var directory = new DirectoryInfo(Path.GetFullPath(candidate!));
            for (var depth = 0; directory is not null && depth < 8; depth++, directory = directory.Parent)
                if (File.Exists(Path.Combine(directory.FullName, "app", "item-database.ts")) &&
                    Directory.Exists(Path.Combine(directory.FullName, "public", "maps")))
                    return directory.FullName;
        }
        throw new DirectoryNotFoundException("找不到 Echoes 專案。請將 QuestEditor.exe 放在專案的 QuestEditor 資料夾內。");
    }

    private static void RunSelfTest(string projectRoot)
    {
        var source = QuestDataStore.CreateDefault();
        var quest = new QuestDefinition
        {
            Id = "QUEST_TEST",
            Name = "測試任務",
            ChapterId = "CH03",
            StartDelaySeconds = 1.5,
            StartPresentationDelaySeconds = 0.25,
            CompletionTriggerType = QuestCompletionTriggerType.Dialogue,
            CompletionTriggerId = "chapter03-section-2",
            CompletionTriggerDelaySeconds = 3,
            CompletionPresentationDelaySeconds = 0.5,
            StartTeleportPointId = "teleport-point-center",
            StartTeleportDelaySeconds = 0.5,
            CompletionTeleportPointId = "teleport-point-center",
            CompletionTeleportDelaySeconds = 1,
        };
        var stage = new QuestStageDefinition
        {
            Id = "QUEST_TEST_STAGE_01",
            Name = "測試階段",
            StartDelaySeconds = 2.5,
            CompletionDelaySeconds = 3.25,
            StartPresentationDelaySeconds = 0.4,
            CompletionPresentationDelaySeconds = 0.6,
            StartTeleportPointId = "teleport-point-center",
            StartTeleportDelaySeconds = 0.6,
            CompletionTeleportPointId = "teleport-point-center",
            CompletionTeleportDelaySeconds = 1.1,
        };
        stage.Objectives.Add(new QuestObjectiveDefinition
        {
            Id = "QUEST_TEST_OBJ_01",
            DisplayText = "取得藍色晶體碎片",
            Type = ObjectiveType.CollectItem,
            TargetId = "R0001",
            RequiredAmount = 3,
            ActivationMode = ObjectiveActivationMode.Event,
            ActivationEventId = "story-trigger-001",
            BlocksStageCompletion = false,
            StartDelaySeconds = 0.75,
            CompletionDelaySeconds = 1.25,
            StartPresentationDelaySeconds = 0.8,
            CompletionPresentationDelaySeconds = 0.9,
            StartTeleportPointId = "teleport-point-center",
            StartTeleportDelaySeconds = 0.7,
            CompletionTeleportPointId = "teleport-point-center",
            CompletionTeleportDelaySeconds = 1.2,
            CompletionInterfaceAction = CompletionInterfaceAction.Close,
            CompletionInterfaceId = "Inventory",
        });
        quest.Stages.Add(stage);
        source.Quests.Add(quest);
        var path = Path.Combine(Path.GetTempPath(), "EchoesQuestEditor", "quest-data.json");
        QuestDataStore.Save(path, source);
        var loaded = QuestDataStore.Load(path);
        if (loaded.Quests.Count != 1 ||
            loaded.Quests[0].Stages[0].Objectives[0].RequiredAmount != 3 ||
            loaded.Quests[0].Stages[0].Objectives[0].CompletionInterfaceAction != CompletionInterfaceAction.Close ||
            loaded.Quests[0].Stages[0].Objectives[0].CompletionInterfaceId != "Inventory" ||
            loaded.Quests[0].Stages[0].Objectives[0].ActivationMode != ObjectiveActivationMode.Event ||
            loaded.Quests[0].Stages[0].Objectives[0].ActivationEventId != "story-trigger-001" ||
            loaded.Quests[0].Stages[0].Objectives[0].BlocksStageCompletion ||
            Math.Abs(loaded.Quests[0].StartDelaySeconds - 1.5) > 0.001 ||
            Math.Abs(loaded.Quests[0].StartPresentationDelaySeconds - 0.25) > 0.001 ||
            loaded.Quests[0].CompletionTriggerType != QuestCompletionTriggerType.Dialogue ||
            loaded.Quests[0].CompletionTriggerId != "chapter03-section-2" ||
            Math.Abs(loaded.Quests[0].CompletionTriggerDelaySeconds - 3) > 0.001 ||
            Math.Abs(loaded.Quests[0].CompletionPresentationDelaySeconds - 0.5) > 0.001 ||
            loaded.Quests[0].StartTeleportPointId != "teleport-point-center" ||
            Math.Abs(loaded.Quests[0].StartTeleportDelaySeconds - 0.5) > 0.001 ||
            loaded.Quests[0].CompletionTeleportPointId != "teleport-point-center" ||
            Math.Abs(loaded.Quests[0].CompletionTeleportDelaySeconds - 1) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].StartDelaySeconds - 2.5) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].CompletionDelaySeconds - 3.25) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].StartPresentationDelaySeconds - 0.4) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].CompletionPresentationDelaySeconds - 0.6) > 0.001 ||
            loaded.Quests[0].Stages[0].StartTeleportPointId != "teleport-point-center" ||
            loaded.Quests[0].Stages[0].CompletionTeleportPointId != "teleport-point-center" ||
            Math.Abs(loaded.Quests[0].Stages[0].Objectives[0].StartDelaySeconds - 0.75) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].Objectives[0].CompletionDelaySeconds - 1.25) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].Objectives[0].StartPresentationDelaySeconds - 0.8) > 0.001 ||
            Math.Abs(loaded.Quests[0].Stages[0].Objectives[0].CompletionPresentationDelaySeconds - 0.9) > 0.001 ||
            loaded.Quests[0].Stages[0].Objectives[0].StartTeleportPointId != "teleport-point-center" ||
            loaded.Quests[0].Stages[0].Objectives[0].CompletionTeleportPointId != "teleport-point-center")
            throw new InvalidDataException("任務資料往返測試失敗。");
        var issues = QuestValidator.Validate(loaded, QuestReferenceProvider.Load(projectRoot));
        if (issues.Any(issue => issue.Severity == ValidationSeverity.Error))
            throw new InvalidDataException(string.Join(Environment.NewLine, issues));
        Console.WriteLine("QuestEditor self-test passed.");
    }
}
