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
        if (new QuestObjectiveDefinition().ShowProgress)
            throw new InvalidDataException("新建任務目標的「顯示進度」預設值必須為 False。");

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
        if (loaded.Quests[0].Stages[0].Objectives[0].CompoundMatchMode != CompoundItemMatchMode.All)
            throw new InvalidDataException("舊任務未設定複合模式時，必須預設全部道具達標。");

        var compound = loaded.Quests[0].Stages[0].Objectives[0];
        compound.Type = ObjectiveType.CompoundCollectItem;
        compound.TargetId = "";
        compound.CompoundMatchMode = CompoundItemMatchMode.AnyN;
        compound.RequiredAmount = 2;
        compound.ItemRequirements = new()
        {
            new() { ItemId = "R0004", RequiredAmount = 2 },
            new() { ItemId = "R0005", RequiredAmount = 1 },
            new() { ItemId = "R0012", RequiredAmount = 1 },
        };
        QuestDataStore.Save(path, loaded);
        var compoundRoundtrip = QuestDataStore.Load(path);
        var roundtripObjective = compoundRoundtrip.Quests[0].Stages[0].Objectives[0];
        if (roundtripObjective.CompoundMatchMode != CompoundItemMatchMode.AnyN ||
            roundtripObjective.RequiredAmount != 2 ||
            roundtripObjective.ItemRequirements[0].RequiredAmount != 2 ||
            !File.ReadAllText(path).Contains("\"compoundMatchMode\": \"anyN\""))
            throw new InvalidDataException("任選 N 種 JSON 儲存讀取失敗。");
        var references = QuestReferenceProvider.Load(projectRoot);
        if (QuestValidator.Validate(compoundRoundtrip, references).Any(issue => issue.Severity == ValidationSeverity.Error))
            throw new InvalidDataException("合法的任選 N 種設定被錯誤阻擋。");
        roundtripObjective.RequiredAmount = 4;
        if (!QuestValidator.Validate(compoundRoundtrip, references).Any(issue => issue.Message.Contains("任選種類數 N")))
            throw new InvalidDataException("任選種類數超過集合種類數時，必須在驗證時警告。");
        roundtripObjective.RequiredAmount = 0;
        if (!QuestValidator.Validate(compoundRoundtrip, references).Any(issue => issue.Message.Contains("需求數量必須大於 0")))
            throw new InvalidDataException("任選種類數為零時，必須在驗證時警告。");
        roundtripObjective.RequiredAmount = 2;
        roundtripObjective.ItemRequirements.Add(new() { ItemId = "R0004", RequiredAmount = 1 });
        if (!QuestValidator.Validate(compoundRoundtrip, references).Any(issue => issue.Message.Contains("重複 Item ID")))
            throw new InvalidDataException("複合道具集合不應接受重複 Item ID。");
        roundtripObjective.Type = ObjectiveType.InteractionSucceeded;
        roundtripObjective.TargetId = "";
        roundtripObjective.TargetIds = new()
        {
            "scene6-interaction-009",
            "scene6-interaction-010",
            "scene6-interaction-011",
        };
        roundtripObjective.RequiredAmount = 3;
        roundtripObjective.ItemRequirements.Clear();
        QuestDataStore.Save(path, compoundRoundtrip);
        var interactionDocument = QuestDataStore.Load(path);
        var interaction = interactionDocument.Quests[0].Stages[0].Objectives[0];
        if (interaction.TargetIds.Count != 3 ||
            interaction.TargetIds[0] != "scene6-interaction-009" ||
            !File.ReadAllText(path).Contains("\"targetIds\": ["))
            throw new InvalidDataException("多目標互動 JSON 往返測試失敗。");
        if (QuestValidator.Validate(interactionDocument, references).Any(issue => issue.Severity == ValidationSeverity.Error))
            throw new InvalidDataException("合法的多目標互動設定被錯誤阻擋。");
        interaction.TargetIds.Add("scene6-interaction-009");
        if (!QuestValidator.Validate(interactionDocument, references).Any(issue => issue.Message.Contains("空白或重複 ID")))
            throw new InvalidDataException("多目標互動不應接受重複 Interaction ID。");
        interaction.TargetIds.RemoveAt(interaction.TargetIds.Count - 1);
        interaction.RequiredAmount = 4;
        if (!QuestValidator.Validate(interactionDocument, references).Any(issue => issue.Message.Contains("不可超過指定互動 ID 數量")))
            throw new InvalidDataException("多目標互動需求數量超過清單時必須警告。");
        interaction.RequiredAmount = 3;
        roundtripObjective = interaction;
        roundtripObjective.Type = ObjectiveType.SceneTransferCompleted;
        roundtripObjective.TargetId = "Scene_6";
        roundtripObjective.TargetIds.Clear();
        roundtripObjective.SourceSceneId = "Scene_3";
        roundtripObjective.SourceConnectionId = "scene-exit-001";
        roundtripObjective.RequiredAmount = 1;
        roundtripObjective.ItemRequirements.Clear();
        QuestDataStore.Save(path, interactionDocument);
        var transferDocument = QuestDataStore.Load(path);
        var transfer = transferDocument.Quests[0].Stages[0].Objectives[0];
        if (transfer.Type != ObjectiveType.SceneTransferCompleted || transfer.TargetId != "Scene_6" ||
            transfer.SourceSceneId != "Scene_3" || transfer.SourceConnectionId != "scene-exit-001" ||
            !File.ReadAllText(path).Contains("\"type\": \"sceneTransferCompleted\""))
            throw new InvalidDataException("完成場景轉移 JSON 往返測試失敗。");
        if (QuestValidator.Validate(transferDocument, references).Any(issue => issue.Severity == ValidationSeverity.Error))
            throw new InvalidDataException("合法的場景轉移設定被錯誤阻擋。");
        transfer.TargetId = "";
        if (!QuestValidator.Validate(transferDocument, references).Any(issue => issue.Message.Contains("Scene Target ID")))
            throw new InvalidDataException("未設定抵達場景時必須驗證警告。");
        transfer.TargetId = "Scene_6";
        transfer.SourceSceneId = "";
        if (!QuestValidator.Validate(transferDocument, references).Any(issue => issue.Message.Contains("同時指定來源場景")))
            throw new InvalidDataException("出口必須指定其來源場景。");
        transfer.SourceSceneId = "Scene_3";
        transfer.SourceConnectionId = "missing-exit";
        if (!QuestValidator.Validate(transferDocument, references).Any(issue => issue.Message.Contains("找不到出口 ID")))
            throw new InvalidDataException("必須驗證出口屬於指定來源場景。");
        transfer.SourceSceneId = null;
        transfer.SourceConnectionId = null;
        if (QuestValidator.Validate(transferDocument, references).Any(issue => issue.Severity == ValidationSeverity.Error))
            throw new InvalidDataException("只指定目標場景的通用設定應有效。");
        Console.WriteLine("QuestEditor self-test passed.");
    }
}
