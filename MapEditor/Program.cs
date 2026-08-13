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
                null,
                new[]
                {
                    new InteractionUseRequirement
                    {
                        Kind = "item",
                        ItemId = "R0011",
                        Quantity = 3,
                    },
                    new InteractionUseRequirement { Kind = "chapter", Chapter = 4 },
                    new InteractionUseRequirement { Kind = "campPower", MinimumPower = 8 },
                },
                new[]
                {
                    new InteractionItemReward
                    {
                        ItemId = "R0005",
                        Quantity = 2,
                        Delivery = "inventory",
                    },
                    new InteractionItemReward
                    {
                        ItemId = "R0004",
                        Quantity = 2,
                        Delivery = "world",
                    },
                },
                QuestCatalog.Load(projectRoot))
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
            };
            using var itemPointSpawnRequirementEditor =
                new ItemPointSpawnRequirementEditorForm(
                    new[]
                    {
                        new QuestCatalogEntry(
                            "QUEST_UI_TEST",
                            "UI 測試任務",
                            new[]
                            {
                                new QuestStageCatalogEntry(
                                    "QUEST_UI_TEST_STAGE_01",
                                    "第一階段"),
                            }),
                    },
                    new ItemPointSpawnRequirement
                    {
                        QuestId = "QUEST_UI_TEST",
                        StageId = "QUEST_UI_TEST_STAGE_01",
                        StageMode = "CurrentStageOnly",
                    })
                {
                    ShowInTaskbar = false,
                    WindowState = FormWindowState.Minimized,
                    Opacity = 0,
                };
            using var dialogueEditor = new DialogueEditorForm(
                new DialogueScript
                {
                    Speakers = new List<string> { "Sbaak", "Echo" },
                    Lines = new List<DialogueLine>
                    {
                        new()
                        {
                            Speaker = "Sbaak",
                            Text = "今天似乎會有不同的事發生。",
                            RandomGroupId = "random-group-1",
                            Weight = 1,
                        },
                        new()
                        {
                            Speaker = "Echo",
                            Text = "也許只是你的錯覺。",
                            RandomGroupId = "random-group-1",
                            Weight = 3,
                        },
                    },
                },
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
                    form.RunMapPageNavigationUiSelfTest();
                    requirementsEditor.Show();
                    System.Windows.Forms.Application.DoEvents();
                    requirementsEditor.Close();
                    itemPointSpawnRequirementEditor.Show();
                    System.Windows.Forms.Application.DoEvents();
                    itemPointSpawnRequirementEditor.Close();
                    dialogueEditor.Show();
                    System.Windows.Forms.Application.DoEvents();
                    dialogueEditor.RunCellEditingUiSelfTest();
                    dialogueEditor.Close();
                    audioEditor?.Show();
                    timer.Start();
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
            ItemCatalog.All.Count != 30 ||
            ItemCatalog.Find("crystal-shard")?.Id != "R0001" ||
            ItemCatalog.Find("R0012")?.Name != "外星果實" ||
            ItemCatalog.Find("R0015")?.Name != "校正元件" ||
            ItemCatalog.Find("T0009")?.Name != "多功能折刀" ||
            ItemCatalog.Find("R0100")?.Name != "全回復道具（測試用）"
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
        var navigationCurrent = SceneDocument.CreateForImage("current.png", 1254, 1254);
        navigationCurrent.WorldLayout = new WorldLayout { X = 1254, Y = 0, Layer = 0 };
        var navigationLeft = SceneDocument.CreateForImage("left.png", 1254, 1254);
        navigationLeft.SceneId = "Scene_Left";
        navigationLeft.WorldLayout = new WorldLayout { X = 0, Y = 0, Layer = 0 };
        var navigationCatalog = new[]
        {
            new MapPageRecord(
                Path.GetFullPath(Path.Combine(projectRoot, "current.scene.json")),
                navigationCurrent),
            new MapPageRecord(
                Path.GetFullPath(Path.Combine(projectRoot, "left.scene.json")),
                navigationLeft),
        };
        var leftNeighbor = MapPageNavigation.FindNeighbor(
            navigationCurrent,
            navigationCatalog[0].ScenePath,
            MapPageDirection.Left,
            navigationCatalog);
        var rightNeighbor = MapPageNavigation.FindNeighbor(
            navigationLeft,
            navigationCatalog[1].ScenePath,
            MapPageDirection.Right,
            navigationCatalog);
        var newDownLayout = MapPageNavigation.CreateAdjacentLayout(
            navigationCurrent,
            1536,
            1536,
            MapPageDirection.Down);
        if (
            leftNeighbor?.Document.SceneId != "Scene_Left" ||
            rightNeighbor?.Document != navigationCurrent ||
            newDownLayout.X != 1254 ||
            newDownLayout.Y != 1254 ||
            newDownLayout.Layer != 0
        )
        {
            throw new InvalidDataException(
                "MapEditor 地圖頁鄰接查找或新頁世界座標不正確。");
        }
        if (roundTrip.TeleportPoints.SingleOrDefault(point => point.Id == "teleport-point-center") is not
            { X: 730, Y: 680, Facing: "S" })
        {
            throw new InvalidDataException("傳送 Point 未能正確讀取或通過場景 JSON round-trip。");
        }
        if (roundTrip.EntryPoints.SingleOrDefault(point => point.Id == "entry-scene3-from-scene2") is not
            { X: 100, Y: 1145, Facing: "NE" })
        {
            throw new InvalidDataException("地圖 Entry Point 未能正確讀取或通過場景 JSON round-trip。");
        }
        if (roundTrip.Connections.SingleOrDefault(connection => connection.Id == "exit-scene3-to-scene2") is not
            {
                TargetSceneId: "Scene_2",
                TargetEntryPointId: "entry-scene2-from-scene3",
                TriggerMode: "auto",
                TransitionMode: "seamless",
                TransferMode: "teleport",
                CameraFocus: "player",
            })
        {
            throw new InvalidDataException("Scene_3 出入口設定未能正確通過場景 JSON round-trip。");
        }
        var scene2 = SceneJson.Load(Path.Combine(
            projectRoot,
            "public",
            "maps",
            "map_test02.scene.json"));
        SceneJson.Validate(scene2);
        var scene2Entry = scene2.EntryPoints.SingleOrDefault(
            point => point.Id == "entry-scene2-from-scene3");
        var scene2Exit = scene2.Connections.SingleOrDefault(
            connection => connection.Id == "exit-scene2-to-scene3");
        if (
            scene2Entry is not { Facing: "NW" } ||
            scene2Exit is not
            {
                TargetSceneId: "Scene_3",
                TargetEntryPointId: "entry-scene3-from-scene2",
            })
        {
            throw new InvalidDataException("Scene_2 與 Scene_3 的雙向出入口設定不完整。");
        }
        var cliffUpperPoint = scene2.TeleportPoints.SingleOrDefault(
            point => point.Id == "teleport-point-scene2-cliff-upper");
        var cliffLowerPoint = scene2.TeleportPoints.SingleOrDefault(
            point => point.Id == "teleport-point-scene2-cliff-lower");
        var cliffUpperInteraction = scene2.Interactables.SingleOrDefault(
            interactable => interactable.Id == "interaction-001");
        var cliffLowerInteraction = scene2.Interactables.SingleOrDefault(
            interactable => interactable.Id == "interaction-002");
        if (
            cliffUpperPoint is not { Facing: "NE", BlackoutEnabled: true } ||
            cliffLowerPoint is not { Facing: "SW", BlackoutEnabled: true } ||
            Math.Abs(cliffUpperPoint.BlackoutFadeSeconds - 0.3f) > 0.0001f ||
            Math.Abs(cliffUpperPoint.BlackoutHoldSeconds) > 0.0001f ||
            Math.Abs(cliffLowerPoint.BlackoutFadeSeconds - 0.3f) > 0.0001f ||
            Math.Abs(cliffLowerPoint.BlackoutHoldSeconds) > 0.0001f ||
            cliffUpperInteraction?.CompletionTeleportPointId != cliffLowerPoint.Id ||
            cliffLowerInteraction?.CompletionTeleportPointId != cliffUpperPoint.Id ||
            cliffUpperInteraction.UseRequirements?.Any(requirement =>
                requirement.Kind == "item" && requirement.ItemId == "T0001") != true ||
            cliffLowerInteraction.UseRequirements?.Any(requirement =>
                requirement.Kind == "item" && requirement.ItemId == "T0001") != true)
        {
            throw new InvalidDataException(
                "Scene_2 石壁上下層傳送 Point、往返互動或繩索需求設定不完整。");
        }
        var itemPointDocument = SceneJson.Deserialize(SceneJson.Serialize(roundTrip));
        itemPointDocument.ItemPoints.Add(new SceneItemPoint
        {
            Id = "item-point-self-test",
            Label = "測試道具點",
            X = itemPointDocument.PlayerSpawn.X,
            Y = itemPointDocument.PlayerSpawn.Y,
            ItemId = "R0001",
            Quantity = 3,
            SpawnPolicy = "daily",
            ShowOnMinimap = true,
            SpawnRequirement = new ItemPointSpawnRequirement
            {
                QuestId = "QUEST_SELF_TEST",
                StageId = "QUEST_SELF_TEST_STAGE_02",
                StageMode = "UnlockFromStage",
            },
        });
        var itemPointRoundTrip = SceneJson.Deserialize(SceneJson.Serialize(itemPointDocument));
        SceneJson.Validate(itemPointRoundTrip);
        if (itemPointRoundTrip.ItemPoints.SingleOrDefault(item => item.Id == "item-point-self-test") is not
            {
                Id: "item-point-self-test",
                ItemId: "R0001",
                Quantity: 3,
                SpawnPolicy: "daily",
                ShowOnMinimap: true,
                SpawnRequirement:
                {
                    QuestId: "QUEST_SELF_TEST",
                    StageId: "QUEST_SELF_TEST_STAGE_02",
                    StageMode: "UnlockFromStage",
                },
            })
        {
            throw new InvalidDataException("ItemPoint 未能正確通過場景 JSON round-trip。");
        }
        if (
            roundTrip.StoryTriggers.FirstOrDefault() is not
                {
                    Id: "story-trigger-001",
                    Once: true,
                    DialogueId: "chapter03-lower-left-not-ready",
                }
        )
        {
            throw new InvalidDataException("劇情觸發區未能正確讀取或通過 JSON round-trip。");
        }

        var storyConfigurationDocument = SceneJson.Deserialize(SceneJson.Serialize(roundTrip));
        var configuredStoryTrigger = storyConfigurationDocument.StoryTriggers.First();
        configuredStoryTrigger.Once = false;
        configuredStoryTrigger.SurvivalRequirements = new SurvivalRequirements
        {
            Mode = "any",
            Stamina = new SurvivalRequirementRule
            {
                Comparison = "atMost",
                Value = 60,
            },
        };
        configuredStoryTrigger.SurvivalEffects = new SurvivalEffects
        {
            Stamina = 10,
            Hunger = -5,
            TimeMinutes = 120,
        };
        configuredStoryTrigger.DailyInteractionLimit = 2;
        configuredStoryTrigger.InteractionLimitMode = null;
        configuredStoryTrigger.TriggerDelaySeconds = 1.5f;
        configuredStoryTrigger.StartQuestIds = new List<string>
        {
            "QUEST_STORY_NEXT",
        };
        configuredStoryTrigger.UseRequirements = new List<InteractionUseRequirement>
        {
            new() { Kind = "item", ItemId = "R0011", Quantity = 3 },
            new() { Kind = "chapter", Chapter = 4 },
            new() { Kind = "quest", QuestId = "QUEST_STORY_ACTIVE" },
            new()
            {
                Kind = "questState",
                QuestId = "QUEST_STORY_REQUIRED",
                QuestState = "completed",
            },
            new()
            {
                Kind = "questStage",
                QuestId = "QUEST_STORY_ACTIVE",
                StageId = "QUEST_STORY_ACTIVE_STAGE_02",
                StageMode = "CurrentStageOnly",
            },
        };
        configuredStoryTrigger.ItemRewards = new List<InteractionItemReward>
        {
            new() { ItemId = "R0004", Quantity = 2, Delivery = "inventory" },
            new() { ItemId = "R0005", Quantity = 1, Delivery = "world" },
        };
        var storyConfigurationRoundTrip = SceneJson.Deserialize(
            SceneJson.Serialize(storyConfigurationDocument));
        SceneJson.Validate(storyConfigurationRoundTrip);
        if (
            storyConfigurationRoundTrip.StoryTriggers.FirstOrDefault() is not
                {
                    Once: false,
                    DailyInteractionLimit: 2,
                    InteractionLimitMode: null,
                    TriggerDelaySeconds: 1.5f,
                    SurvivalRequirements:
                    {
                        Mode: "any",
                        Stamina: { Comparison: "atMost", Value: 60 },
                    },
                    SurvivalEffects: { Stamina: 10, Hunger: -5, TimeMinutes: 120 },
                } storyRoundTripTrigger ||
            storyRoundTripTrigger.StartQuestIds is not { Count: 1 } ||
            storyRoundTripTrigger.StartQuestIds[0] != "QUEST_STORY_NEXT" ||
            storyRoundTripTrigger.UseRequirements?.Count != 5 ||
            storyRoundTripTrigger.UseRequirements?[0] is not
                { Kind: "item", ItemId: "R0011", Quantity: 3 } ||
            storyRoundTripTrigger.UseRequirements?[1] is not
                { Kind: "chapter", Chapter: 4 } ||
            storyRoundTripTrigger.UseRequirements?[2] is not
                { Kind: "quest", QuestId: "QUEST_STORY_ACTIVE" } ||
            storyRoundTripTrigger.UseRequirements?[3] is not
                {
                    Kind: "questState",
                    QuestId: "QUEST_STORY_REQUIRED",
                    QuestState: "completed",
                } ||
            storyRoundTripTrigger.UseRequirements?[4] is not
                {
                    Kind: "questStage",
                    QuestId: "QUEST_STORY_ACTIVE",
                    StageId: "QUEST_STORY_ACTIVE_STAGE_02",
                    StageMode: "CurrentStageOnly",
                } ||
            storyRoundTripTrigger.ItemRewards?.Count != 2 ||
            storyRoundTripTrigger.ItemRewards?[0] is not
                { ItemId: "R0004", Quantity: 2, Delivery: "inventory" } ||
            storyRoundTripTrigger.ItemRewards?[1] is not
                { ItemId: "R0005", Quantity: 1, Delivery: "world" }
        )
        {
            throw new InvalidDataException(
                "Story trigger requirements, completion effects, limits, or rewards did not survive JSON round-trip.");
        }

        var multiPointDocument = SceneJson.Deserialize(SceneJson.Serialize(roundTrip));
        var multiPointInteractable = multiPointDocument.Interactables.FirstOrDefault()
            ?? throw new InvalidDataException("Interaction Point self-test requires an interactable.");
        if (multiPointInteractable.Dialogue.Lines.Count == 0)
        {
            multiPointInteractable.Dialogue.Lines.Add(new DialogueLine
            {
                Speaker = "",
                Text = "無發話者旁白。",
            });
        }
        else
        {
            multiPointInteractable.Dialogue.Lines[0].Speaker = "";
        }
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
        multiPointInteractable.DailyInteractionLimit = null;
        multiPointInteractable.InteractionLimitMode = "once";
        multiPointInteractable.ItemReward = new InteractionItemReward
        {
            ItemId = "R0002",
            Quantity = 4,
            Delivery = "world",
        };
        multiPointInteractable.ItemRewards = new List<InteractionItemReward>
        {
            new()
            {
                ItemId = "R0004",
                Quantity = 2,
                Delivery = "inventory",
            },
        };
        multiPointInteractable.FailureDialogue = new DialogueScript
        {
            CharacterDelaySeconds = 0.03f,
            Speakers = new List<string> { "Sbaak", "Echo" },
            Lines = new List<DialogueLine>
            {
                new()
                {
                    Speaker = "Echo",
                    Text = "條件尚未達成。",
                    RandomGroupId = "random-group-1",
                    Weight = 1,
                },
                new()
                {
                    Speaker = "Sbaak",
                    Text = "現在還不行。",
                    RandomGroupId = "random-group-1",
                    Weight = 4,
                },
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
        multiPointInteractable.SkipSuccessDialogue = true;
        multiPointInteractable.UseRequirements = new List<InteractionUseRequirement>
        {
            new() { Kind = "item", Scope = "interaction", ItemId = "R0011", Quantity = 3 },
            new() { Kind = "chapter", Scope = "prompt", Chapter = 4 },
            new() { Kind = "quest", QuestId = "QUEST_TEST_ACTIVE" },
            new() { Kind = "campPower", MinimumPower = 8 },
            new()
            {
                Kind = "questStage",
                QuestId = "QUEST_TEST_ACTIVE",
                StageId = "QUEST_TEST_ACTIVE_STAGE_02",
                StageMode = "UnlockUntilCondition",
                DisableQuestId = "QUEST_TEST_CLOSE",
                DisableStageId = "QUEST_TEST_CLOSE_STAGE_01",
            },
        };
        multiPointInteractable.AllowAttemptWhenRequirementsUnmet = true;
        var expectedInteractionPointCount = interactionPoints.Count;
        var multiPointRoundTrip = SceneJson.Deserialize(SceneJson.Serialize(multiPointDocument));
        SceneJson.Validate(multiPointRoundTrip);
        if (
            multiPointRoundTrip.Interactables[0].EffectiveInteractionPoints.Count !=
            expectedInteractionPointCount ||
            multiPointRoundTrip.Interactables[0].Dialogue.Lines[0].Speaker != "" ||
            multiPointRoundTrip.Interactables[0].InteractionHintPoint is not { X: 150, Y: 150 } ||
            multiPointRoundTrip.Interactables[0].SurvivalRequirements is not
                { Mode: "any", Stamina: { Comparison: "atMost", Value: 99 } } ||
            multiPointRoundTrip.Interactables[0].SurvivalEffects.Stamina != -4 ||
            multiPointRoundTrip.Interactables[0].SurvivalEffects.TimeMinutes != 480 ||
            multiPointRoundTrip.Interactables[0].InteractionLimitMode != "once" ||
            multiPointRoundTrip.Interactables[0].DailyInteractionLimit is not null ||
            multiPointRoundTrip.Interactables[0].ItemReward is not null ||
            multiPointRoundTrip.Interactables[0].ItemRewards?.Count != 2 ||
            multiPointRoundTrip.Interactables[0].ItemRewards?.FirstOrDefault() is not
                { ItemId: "R0002", Quantity: 4, Delivery: "world" } ||
            multiPointRoundTrip.Interactables[0].ItemRewards?.ElementAtOrDefault(1) is not
                { ItemId: "R0004", Quantity: 2, Delivery: "inventory" } ||
            multiPointRoundTrip.Interactables[0].FailureDialogue.Lines.FirstOrDefault() is not
                {
                    Speaker: "Echo",
                    Text: "條件尚未達成。",
                    RandomGroupId: "random-group-1",
                    Weight: 1,
                } ||
            multiPointRoundTrip.Interactables[0].FailureDialogue.Lines.ElementAtOrDefault(1) is not
                {
                    Speaker: "Sbaak",
                    Text: "現在還不行。",
                    RandomGroupId: "random-group-1",
                    Weight: 4,
                } ||
            multiPointRoundTrip.Interactables[0].CompletionDialogue?.Lines.FirstOrDefault() is not
                { Speaker: "Sbaak", Text: "互動已完成。" } ||
            !multiPointRoundTrip.Interactables[0].SkipSuccessDialogue ||
            !multiPointRoundTrip.Interactables[0].AllowAttemptWhenRequirementsUnmet ||
            multiPointRoundTrip.Interactables[0].UseRequirements?.Count != 5 ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[0] is not
                { Kind: "item", Scope: "interaction", ItemId: "R0011", Quantity: 3 } ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[1] is not
                { Kind: "chapter", Scope: "prompt", Chapter: 4 } ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[2] is not
                { Kind: "quest", QuestId: "QUEST_TEST_ACTIVE" } ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[3] is not
                { Kind: "campPower", MinimumPower: 8 } ||
            multiPointRoundTrip.Interactables[0].UseRequirements?[4] is not
                {
                    Kind: "questStage",
                    QuestId: "QUEST_TEST_ACTIVE",
                    StageId: "QUEST_TEST_ACTIVE_STAGE_02",
                    StageMode: "UnlockUntilCondition",
                    DisableQuestId: "QUEST_TEST_CLOSE",
                    DisableStageId: "QUEST_TEST_CLOSE_STAGE_01",
                }
        )
        {
            throw new InvalidDataException(
                "Interaction Points, hint Point, survival settings, item reward, requirements, dialogue phases, or weighted dialogue groups did not survive JSON round-trip.");
        }

        using (var requirementsEditor = new SurvivalEffectEditorForm(
            multiPointRoundTrip.Interactables[0].Type,
            multiPointRoundTrip.Interactables[0].SurvivalRequirements,
            multiPointRoundTrip.Interactables[0].SurvivalEffects,
            multiPointRoundTrip.Interactables[0].DailyInteractionLimit,
            multiPointRoundTrip.Interactables[0].InteractionLimitMode,
            multiPointRoundTrip.Interactables[0].UseRequirements,
            multiPointRoundTrip.Interactables[0].ItemRewards,
            new[]
            {
                new QuestCatalogEntry(
                    "QUEST_TEST_ACTIVE",
                    "測試進行中任務",
                    new[]
                    {
                        new QuestStageCatalogEntry(
                            "QUEST_TEST_ACTIVE_STAGE_02",
                            "測試啟用階段"),
                    }),
                new QuestCatalogEntry(
                    "QUEST_TEST_CLOSE",
                    "測試關閉任務",
                    new[]
                    {
                        new QuestStageCatalogEntry(
                            "QUEST_TEST_CLOSE_STAGE_01",
                            "測試關閉階段"),
                    }),
            },
            new[] { "QUEST_TEST_CLOSE" },
            showQuestStartOptions: true,
            allowAttemptWhenRequirementsUnmet:
                multiPointRoundTrip.Interactables[0].AllowAttemptWhenRequirementsUnmet))
        {
            if (
                !requirementsEditor.AllowAttemptWhenRequirementsUnmet ||
                requirementsEditor.UseRequirements.Count != 5 ||
                requirementsEditor.UseRequirements[0].Scope != "interaction" ||
                requirementsEditor.UseRequirements[1].Scope != "prompt" ||
                requirementsEditor.UseRequirements[2] is not
                    { Kind: "quest", QuestId: "QUEST_TEST_ACTIVE" } ||
                requirementsEditor.UseRequirements[3] is not
                    { Kind: "campPower", MinimumPower: 8 } ||
                requirementsEditor.UseRequirements[4] is not
                    {
                        Kind: "questStage",
                        QuestId: "QUEST_TEST_ACTIVE",
                        StageId: "QUEST_TEST_ACTIVE_STAGE_02",
                        StageMode: "UnlockUntilCondition",
                        DisableQuestId: "QUEST_TEST_CLOSE",
                        DisableStageId: "QUEST_TEST_CLOSE_STAGE_01",
                    } ||
                requirementsEditor.ItemRewards.Count != 2 ||
                requirementsEditor.ItemRewards[0] is not
                    { ItemId: "R0002", Quantity: 4, Delivery: "world" } ||
                requirementsEditor.ItemRewards[1] is not
                    { ItemId: "R0004", Quantity: 2, Delivery: "inventory" } ||
                requirementsEditor.StartQuestIds.Count != 1 ||
                requirementsEditor.StartQuestIds[0] != "QUEST_TEST_CLOSE" ||
                requirementsEditor.InteractionLimitMode != "once" ||
                requirementsEditor.DailyLimit is not null ||
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
