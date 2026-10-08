using System.ComponentModel;
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
            if (args.Contains("--validate", StringComparer.OrdinalIgnoreCase))
            {
                // Prints every validation issue of quest-data.json; exit code 2 when errors exist.
                var issues = QuestValidator.Validate(QuestDataStore.Load(dataPath), QuestReferenceProvider.Load(projectRoot));
                foreach (var issue in issues)
                    Console.WriteLine($"{(issue.Severity == ValidationSeverity.Error ? "ERROR" : "WARN ")} | {issue.Target?.ToString()?.Split("  ")[0]} | {issue.Message}");
                Console.WriteLine($"{issues.Count(issue => issue.Severity == ValidationSeverity.Error)} errors, " +
                                  $"{issues.Count(issue => issue.Severity == ValidationSeverity.Warning)} warnings");
                return issues.Any(issue => issue.Severity == ValidationSeverity.Error) ? 2 : 0;
            }
            if (args.Contains("--ui-smoke-test", StringComparer.OrdinalIgnoreCase))
            {
                var smokeDataPath = Path.Combine(projectRoot, "output", "quest-editor-tests", "quest-data-ui-smoke.json");
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
            if (args.Contains("--layout-benchmark", StringComparer.OrdinalIgnoreCase))
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
                Console.WriteLine(form.RunLayoutBenchmark());
                form.CloseWithoutPrompts();
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
                // A hidden window must never wait on the close-time validation prompt.
                form.CloseWithoutPrompts();
                Console.WriteLine(previewPath);
                return 0;
            }
            ApplicationConfiguration.Initialize();
            // An unexpected error in one action should not take the editor (and unsaved work) down.
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, eventArgs) => MessageBox.Show(
                "這個操作發生未預期的錯誤，已中止，但編輯器仍可繼續使用；尚未儲存的修改沒有遺失。\n" +
                "建議先按【儲存】，再回報下列訊息：\n\n" + eventArgs.Exception.Message,
                "任務編輯器", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            Application.Run(new MainForm(projectRoot, dataPath));
            return 0;
        }
        catch (Exception exception)
        {
            if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--validate", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--ui-smoke-test", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--layout-benchmark", StringComparer.OrdinalIgnoreCase) ||
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

    private static void ValidatePuzzleReferences(string projectRoot, QuestReferenceCatalog references)
    {
        foreach (var id in new[] { "interaction-012", "scene3-interaction-024", "scene3-interaction-025", "chapter04-phototropic-plant" })
            if (!references.Contains("Puzzle", id))
                throw new InvalidDataException($"解謎參照清單漏掉正式解謎：{id}");
        if (references.Contains("Puzzle", "scene3-interaction-023"))
            throw new InvalidDataException("一般互動不可被當成解謎完成目標。");

        var document = QuestDataStore.Load(Path.Combine(projectRoot, "public", "quests", "quest-data.json"));
        var objectives = document.Quests.SelectMany(quest => quest.Stages).SelectMany(stage => stage.Objectives);
        var welding = objectives.Single(objective => objective.Id == "QUEST_CH03_MAIN_006_OBJ_04");
        var frequency = objectives.Single(objective => objective.Id == "QUEST_CH03_MAIN_006_OBJ_05");
        if (welding.TargetId != "scene3-interaction-024" || frequency.TargetId != "scene3-interaction-025")
            throw new InvalidDataException("焊接與調頻 OBJ 必須保留正式遊戲使用的解謎完成 ID。");
        var issues = QuestValidator.Validate(document, references);
        if (issues.Any(issue => (ReferenceEquals(issue.Target, welding) || ReferenceEquals(issue.Target, frequency)) &&
                                issue.Severity == ValidationSeverity.Error && issue.Message.Contains("Puzzle")))
            throw new InvalidDataException("地圖中存在的焊接或調頻解謎被誤判為找不到 Puzzle ID。");
        foreach (var invalidId in new[] { "missing-puzzle", "scene3-interaction-023" })
        {
            welding.TargetId = invalidId;
            if (!QuestValidator.Validate(document, references).Any(issue => ReferenceEquals(issue.Target, welding) &&
                issue.Severity == ValidationSeverity.Error && issue.Message.Contains($"找不到 Puzzle ID：{invalidId}")))
                throw new InvalidDataException($"無效解謎目標仍必須被驗證阻擋：{invalidId}");
        }
        Console.WriteLine("Puzzle references passed: power routing, welding, frequency, plant; invalid targets rejected.");
    }

    private static void ValidateScriptActivationAndSubmitTargets(string projectRoot, QuestReferenceCatalog references)
    {
        // OBJs that game code activates directly (chapter flows, welding hint).
        foreach (var id in new[]
                 {
                     "QUEST_CH04_MAIN_001_OBJ_02", "QUEST_CH04_MAIN_001_OBJ_03",
                     "QUEST_CH04_MAIN_001_OBJ_05", "QUEST_CH04_MAIN_001_OBJ_16", "QUEST_CH03_MAIN_006_OBJ_06",
                 })
            if (!references.Contains(QuestReferenceProvider.ScriptActivatedObjective, id))
                throw new InvalidDataException($"程式流程啟用的 OBJ 沒有被辨識：{id}");
        if (references.Contains(QuestReferenceProvider.ScriptActivatedObjective, "QUEST_CH04_MAIN_001_OBJ_04"))
            throw new InvalidDataException("只出現在完成規則裡的 OBJ 不可被當成由程式啟用。");

        var document = QuestDataStore.Load(Path.Combine(projectRoot, "public", "quests", "quest-data.json"));
        var objectives = document.Quests.SelectMany(quest => quest.Stages).SelectMany(stage => stage.Objectives).ToList();
        var flowActivated = objectives.Single(objective => objective.Id == "QUEST_CH04_MAIN_001_OBJ_02");
        var submit = objectives.Single(objective => objective.Id == "QUEST_CH04_MAIN_001_OBJ_15");
        var issues = QuestValidator.Validate(document, references);
        if (issues.Any(issue => issue.Severity == ValidationSeverity.Error &&
                                (ReferenceEquals(issue.Target, flowActivated) || ReferenceEquals(issue.Target, submit))))
            throw new InvalidDataException("程式流程啟用的 OBJ 或多互動區投入道具 OBJ 被誤判為錯誤。");

        // Still rejected: an event-mode OBJ nobody activates, and interaction lists on other types.
        var collect = objectives.First(objective => objective.Type == ObjectiveType.CollectItem &&
            !references.Contains(QuestReferenceProvider.ScriptActivatedObjective, objective.Id));
        collect.ActivationMode = ObjectiveActivationMode.Event;
        collect.ActivationEventId = "";
        collect.UnlockDialogueId = "";
        if (!QuestValidator.Validate(document, references).Any(issue => ReferenceEquals(issue.Target, collect) &&
                issue.Message.Contains("尚未填入啟用事件")))
            throw new InvalidDataException("沒有任何來源啟用的事件 OBJ 仍必須被驗證攔截。");
        collect.ActivationMode = ObjectiveActivationMode.Immediate;
        collect.TargetIds = new() { "scene6-interaction-018" };
        if (!QuestValidator.Validate(document, references).Any(issue => ReferenceEquals(issue.Target, collect) &&
                issue.Message.Contains("指定互動 ID 清單只適用於")))
            throw new InvalidDataException("收集道具類型不可使用指定互動 ID 清單。");
        Console.WriteLine("Script-activated OBJs and multi-interaction item submission passed.");
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
        stage.Objectives.Add(new QuestObjectiveDefinition
        {
            Id = "QUEST_TEST_OBJ_02",
            DisplayText = "來源目標核取後啟用",
            Type = ObjectiveType.CollectItem,
            TargetId = "R0001",
            RequiredAmount = 1,
            ActivationMode = ObjectiveActivationMode.ObjectiveCompleted,
            ActivationEventId = "QUEST_TEST_OBJ_01",
        });
        quest.Stages.Add(stage);
        source.Quests.Add(quest);
        var path = Path.Combine(projectRoot, "output", "quest-editor-tests", "quest-data.json");
        QuestDataStore.Save(path, source);
        var loaded = QuestDataStore.Load(path);
        if (loaded.Quests.Count != 1 ||
            loaded.Quests[0].Stages[0].Objectives[0].RequiredAmount != 3 ||
            loaded.Quests[0].Stages[0].Objectives[0].CompletionInterfaceAction != CompletionInterfaceAction.Close ||
            loaded.Quests[0].Stages[0].Objectives[0].CompletionInterfaceId != "Inventory" ||
            loaded.Quests[0].Stages[0].Objectives[0].ActivationMode != ObjectiveActivationMode.Event ||
            loaded.Quests[0].Stages[0].Objectives[0].ActivationEventId != "story-trigger-001" ||
            loaded.Quests[0].Stages[0].Objectives[1].ActivationMode != ObjectiveActivationMode.ObjectiveCompleted ||
            loaded.Quests[0].Stages[0].Objectives[1].ActivationEventId != "QUEST_TEST_OBJ_01" ||
            loaded.Quests[0].Stages[0].Objectives[1].UnlockDialogueId.Length != 0 ||
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
        var activationModeConverter = TypeDescriptor.GetConverter(typeof(ObjectiveActivationMode));
        if (activationModeConverter.ConvertToString(ObjectiveActivationMode.ObjectiveActivated) != "OBJ啟用後啟用" ||
            activationModeConverter.ConvertToString(ObjectiveActivationMode.ObjectiveCompleted) != "OBJ核取後啟用" ||
            activationModeConverter.ConvertToString(ObjectiveActivationMode.DialogueStarted) != "對話開始時啟用" ||
            activationModeConverter.ConvertToString(ObjectiveActivationMode.DialogueCompleted) != "對話播完後啟用")
            throw new InvalidDataException("OBJ 生命週期啟用方式的中文選項未正確顯示。");
        var dependentObjective = loaded.Quests[0].Stages[0].Objectives[1];
        dependentObjective.ActivationEventId = "QUEST_TEST_OBJ_MISSING";
        if (!QuestValidator.Validate(loaded, QuestReferenceProvider.Load(projectRoot))
                .Any(issue => issue.Message.Contains("找不到啟用來源 OBJ")))
            throw new InvalidDataException("不存在的啟用來源 OBJ 必須被驗證攔截。");
        dependentObjective.ActivationEventId = "QUEST_TEST_OBJ_01";
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
        ValidatePuzzleReferences(projectRoot, references);
        ValidateScriptActivationAndSubmitTargets(projectRoot, references);
        if (!references.Contains("Puzzle", "chapter04-phototropic-plant"))
            throw new InvalidDataException("植物解謎系統必須從 runtime 登記到完成解謎選項。");
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
