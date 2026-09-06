using System.Text.Json;
using System.Text.Json.Serialization;
using System.IO;

namespace Echoes.MapEditor;

public sealed class SceneDocument
{
    public int SchemaVersion { get; set; } = 1;
    public string SceneId { get; set; } = "new_scene";
    public string DisplayName { get; set; } = "New scene";
    public SceneImage Image { get; set; } = new();
    public SceneWorld World { get; set; } = new();
    public GridSettings Grid { get; set; } = new();
    public PlayerSpawn PlayerSpawn { get; set; } = new();
    public List<SceneTeleportPoint> TeleportPoints { get; set; } = new();
    public List<SceneEntryPoint> EntryPoints { get; set; } = new();
    public List<NavMeshRegion> NavMesh { get; set; } = new();
    public List<CollisionShape> Collisions { get; set; } = new();
    public List<SceneInteractable> Interactables { get; set; } = new();
    public List<MovementGuide> MovementGuides { get; set; } = new();
    public List<StoryTriggerZone> StoryTriggers { get; set; } = new();
    public List<SceneItemPoint> ItemPoints { get; set; } = new();
    public WorldLayout WorldLayout { get; set; } = new();
    public List<SceneConnection> Connections { get; set; } = new();

    public static SceneDocument CreateForImage(string imagePath, int width, int height)
    {
        var sceneId = Path.GetFileNameWithoutExtension(imagePath);
        return new SceneDocument
        {
            SceneId = sceneId,
            DisplayName = sceneId,
            Image = new SceneImage
            {
                File = Path.GetFileName(imagePath),
                Width = width,
                Height = height,
            },
            World = new SceneWorld { Width = width, Height = height },
            PlayerSpawn = new PlayerSpawn
            {
                X = width / 2f,
                Y = height / 2f,
                Facing = "S",
            },
        };
    }
}

public sealed class SceneImage
{
    public string File { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
}

public sealed class SceneWorld
{
    public float Width { get; set; }
    public float Height { get; set; }
}

public sealed class GridSettings
{
    public int Size { get; set; } = 18;
    public bool Visible { get; set; } = true;
    public bool Snap { get; set; } = true;
}

public sealed class PlayerSpawn
{
    public float X { get; set; }
    public float Y { get; set; }
    public string Facing { get; set; } = "S";
}

public class ScenePoint
{
    public ScenePoint()
    {
    }

    public ScenePoint(float x, float y)
    {
        X = x;
        Y = y;
    }

    public float X { get; set; }
    public float Y { get; set; }

    public ScenePoint Clone() => new(X, Y);
}

public sealed class NavMeshRegion
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "NavMesh";
    public List<ScenePoint> Points { get; set; } = new();
}

public sealed class CollisionShape
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Collision";
    public string Shape { get; set; } = "polygon";

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ScenePoint>? Points { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ScenePoint? Center { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public float Radius { get; set; }
}

public sealed class WorldLayout
{
    public float X { get; set; }
    public float Y { get; set; }
    public int Layer { get; set; }
}

public interface ITriggerConfiguration
{
    string Id { get; }
    SurvivalRequirements SurvivalRequirements { get; set; }
    SurvivalEffects SurvivalEffects { get; set; }
    int? DailyInteractionLimit { get; set; }
    string? InteractionLimitMode { get; set; }
    List<InteractionItemReward>? ItemRewards { get; set; }
    InteractionItemReward? ItemReward { get; set; }
    List<InteractionUseRequirement>? UseRequirements { get; set; }
    void NormalizeItemRewards();
}

public sealed class SceneTeleportPoint : ScenePoint
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "傳送點";
    public string Facing { get; set; } = "S";
    public bool BlackoutEnabled { get; set; }
    public float BlackoutFadeSeconds { get; set; } = 0.3f;
    public float BlackoutHoldSeconds { get; set; }
}

public sealed class SceneEntryPoint : ScenePoint
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "地圖 Entry Point";
    public string Facing { get; set; } = "S";
}

public sealed class SceneInteractable : ITriggerConfiguration
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Interactable";
    public string Shape { get; set; } = "polygon";
    public List<ScenePoint> Points { get; set; } = new();
    public string Type { get; set; } = "dialogue";
    public string Verb { get; set; } = "對話";
    public SurvivalRequirements SurvivalRequirements { get; set; } = new();
    public SurvivalEffects SurvivalEffects { get; set; } = new();

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? DailyInteractionLimit { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InteractionLimitMode { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionItemReward>? ItemRewards { get; set; }

    // Legacy schema support. Validation migrates the former single reward into
    // ItemRewards so newly saved scenes use the array format.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public InteractionItemReward? ItemReward { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionUseRequirement>? UseRequirements { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool AllowAttemptWhenRequirementsUnmet { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public float CompletionTeleportDelaySeconds { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionPoint>? InteractionPoints { get; set; }

    // Legacy schema support. Validation migrates this single point into
    // InteractionPoints so all newly saved scenes use the array format.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public InteractionPoint? InteractionPoint { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ScenePoint? InteractionHintPoint { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool ShowOnMinimap { get; set; }

    public float ActivationDistance { get; set; } = 52;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool SkipSuccessDialogue { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StoryDialogueId { get; set; }

    public DialogueScript Dialogue { get; set; } = DialogueScript.CreateDefault();
    public DialogueScript FailureDialogue { get; set; } = DialogueScript.CreateFailureDefault();

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public DialogueScript? SurvivalFailureDialogue { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public DialogueScript? CompletionDialogue { get; set; }

    [JsonIgnore]
    public IReadOnlyList<InteractionPoint> EffectiveInteractionPoints
    {
        get
        {
            if (InteractionPoints is { Count: > 0 } points) return points;
            if (InteractionPoint is { } legacyPoint) return new[] { legacyPoint };
            return Array.Empty<InteractionPoint>();
        }
    }

    public List<InteractionPoint> EnsureInteractionPoints()
    {
        InteractionPoints ??= new List<InteractionPoint>();
        if (InteractionPoint is not null)
        {
            InteractionPoints.Add(InteractionPoint);
            InteractionPoint = null;
        }
        return InteractionPoints;
    }

    public void NormalizeInteractionPoints()
    {
        if (InteractionPoint is not null)
        {
            EnsureInteractionPoints();
        }
        if (InteractionPoints is { Count: 0 })
        {
            InteractionPoints = null;
        }
    }

    public List<InteractionItemReward> EnsureItemRewards()
    {
        ItemRewards ??= new List<InteractionItemReward>();
        if (ItemReward is not null)
        {
            ItemRewards.Insert(0, ItemReward);
            ItemReward = null;
        }
        return ItemRewards;
    }

    public void NormalizeItemRewards()
    {
        if (ItemReward is not null) EnsureItemRewards();
        if (ItemRewards is { Count: 0 }) ItemRewards = null;
    }
}

public sealed class SceneItemPoint : ScenePoint
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "ItemPoint";
    public string ItemId { get; set; } = "R0001";
    public int Quantity { get; set; } = 1;
    public string SpawnPolicy { get; set; } = "once";
    public bool ShowOnMinimap { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ItemPointSpawnRequirement? SpawnRequirement { get; set; }
}

public sealed class ItemPointSpawnRequirement
{
    public string QuestId { get; set; } = "";
    public string StageId { get; set; } = "";
    public string StageMode { get; set; } = "CurrentStageOnly";

    public ItemPointSpawnRequirement Clone() => new()
    {
        QuestId = QuestId,
        StageId = StageId,
        StageMode = StageMode,
    };
}

public sealed class SurvivalEffects
{
    public float Stamina { get; set; }
    public float Hunger { get; set; }
    public float Thirst { get; set; }
    public float Spirit { get; set; }
    public float TimeMinutes { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? JumpToTimeMinutes { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int JumpDayOffset { get; set; }

    public SurvivalEffects Clone() => new()
    {
        Stamina = Stamina,
        Hunger = Hunger,
        Thirst = Thirst,
        Spirit = Spirit,
        TimeMinutes = TimeMinutes,
        JumpToTimeMinutes = JumpToTimeMinutes,
        JumpDayOffset = JumpDayOffset,
    };
}

public sealed class SurvivalRequirementRule
{
    public string Comparison { get; set; } = "atLeast";
    public float Value { get; set; }

    public SurvivalRequirementRule Clone() => new()
    {
        Comparison = Comparison,
        Value = Value,
    };
}

public sealed class SurvivalRequirements
{
    public string Mode { get; set; } = "all";

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public SurvivalRequirementRule? Stamina { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public SurvivalRequirementRule? Hunger { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public SurvivalRequirementRule? Thirst { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public SurvivalRequirementRule? Spirit { get; set; }

    public SurvivalRequirements Clone() => new()
    {
        Mode = Mode,
        Stamina = Stamina?.Clone(),
        Hunger = Hunger?.Clone(),
        Thirst = Thirst?.Clone(),
        Spirit = Spirit?.Clone(),
    };
}

public sealed class InteractionItemReward
{
    public string ItemId { get; set; } = "";
    public int Quantity { get; set; } = 1;
    public string Delivery { get; set; } = "inventory";

    public InteractionItemReward Clone() => new()
    {
        ItemId = ItemId,
        Quantity = Quantity,
        Delivery = Delivery,
    };
}

public sealed class InteractionUseRequirement
{
    public string Kind { get; set; } = "item";
    public string Scope { get; set; } = "both";
    public string ItemId { get; set; } = "";
    public string QuestId { get; set; } = "";
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? QuestState { get; set; }
    public string StageId { get; set; } = "";
    public string StageMode { get; set; } = "CurrentStageOnly";
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ObjectiveId { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ObjectiveState { get; set; }
    public string DisableQuestId { get; set; } = "";
    public string DisableStageId { get; set; } = "";
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DisableObjectiveId { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DisableObjectiveState { get; set; }
    public int Quantity { get; set; } = 1;
    public int Chapter { get; set; } = 1;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int MinimumPower { get; set; }

    public InteractionUseRequirement Clone() => new()
    {
        Kind = Kind,
        Scope = Scope,
        ItemId = ItemId,
        QuestId = QuestId,
        QuestState = QuestState,
        StageId = StageId,
        StageMode = StageMode,
        ObjectiveId = ObjectiveId,
        ObjectiveState = ObjectiveState,
        DisableQuestId = DisableQuestId,
        DisableStageId = DisableStageId,
        DisableObjectiveId = DisableObjectiveId,
        DisableObjectiveState = DisableObjectiveState,
        Quantity = Quantity,
        Chapter = Chapter,
        MinimumPower = MinimumPower,
    };
}

public sealed record ItemCatalogEntry(string Id, string Name)
{
    public override string ToString() => string.IsNullOrWhiteSpace(Id) ? Name : $"{Id}｜{Name}";
}

public static class ItemCatalog
{
    private static readonly IReadOnlyDictionary<string, string> LegacyIds =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["crystal-shard"] = "R0001",
            ["metal-parts"] = "R0002",
            ["fiber-bundle"] = "R0003",
            ["water-bottle"] = "R0004",
            ["emergency-ration"] = "R0005",
            ["alien-spore"] = "R0006",
            ["battery"] = "R0007",
            ["energy-cell"] = "R0008",
            ["metal-scrap"] = "R0009",
            ["synthetic-cloth"] = "R0010",
            ["transistor"] = "R0011",
            ["communication-array-panel"] = "R0013",
            ["quantum-transmitter"] = "R0014",
            ["calibration-component"] = "R0015",
            ["mental-focus-stimulant"] = "R0016",
            ["invigorating-supply-drink"] = "R0017",
            ["full-recovery-test-item"] = "R0100",
            ["utility-rope"] = "T0001",
            ["scanner-parts"] = "T0002",
            ["repair-kit"] = "T0003",
            ["tracking-module"] = "T0004",
            ["medkit"] = "T0005",
            ["lantern"] = "T0006",
            ["welding-tool"] = "T0007",
            ["digging-shovel"] = "T0008",
            ["multifunction-folding-knife"] = "T0009",
            ["sharp-metal-fragment"] = "T0010",
            ["navigation-data"] = "Q0001",
            ["memory-charm"] = "Q0002",
            ["ancient-plate"] = "Q0003",
            ["ruin-key"] = "Q0004",
            ["time-crystal"] = "M0001",
        };

    public static readonly IReadOnlyList<ItemCatalogEntry> All = new ItemCatalogEntry[]
    {
        new("R0001", "藍色晶體碎片"),
        new("R0002", "金屬零件"),
        new("R0003", "纖維束"),
        new("R0004", "淨水瓶"),
        new("R0005", "緊急口糧"),
        new("R0006", "外星種子"),
        new("R0007", "電池組"),
        new("R0008", "能量單元"),
        new("R0009", "金屬碎片"),
        new("R0010", "合成布料"),
        new("R0011", "電晶體"),
        new("R0012", "外星果實"),
        new("R0013", "通訊陣列面板"),
        new("R0014", "量子傳輸器"),
        new("R0015", "校正元件"),
        new("R0016", "精神專注劑"),
        new("R0017", "提神補給飲料"),
        new("R0100", "全回復道具（測試用）"),
        new("T0001", "繩索"),
        new("T0002", "掃描器零件"),
        new("T0003", "多功能工具箱"),
        new("T0004", "訊號探測儀"),
        new("T0005", "醫療包"),
        new("T0006", "照明燈"),
        new("T0007", "銲槍工具"),
        new("T0008", "挖掘鏟"),
        new("T0009", "多功能折刀"),
        new("T0010", "鋒利的金屬片"),
        new("Q0001", "飛船導航資料"),
        new("Q0002", "遺留下的記憶物"),
        new("Q0003", "古代符號板"),
        new("Q0004", "遺跡鑰匙"),
        new("M0001", "時間定位晶體"),
    };

    public static ItemCatalogEntry? Find(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        var currentId = LegacyIds.TryGetValue(id.Trim(), out var migratedId)
            ? migratedId
            : id.Trim();
        return All.FirstOrDefault(item =>
            item.Id.Equals(currentId, StringComparison.OrdinalIgnoreCase));
    }
}

public sealed record QuestStageCatalogEntry(string Id, string Name)
{
    public override string ToString() => string.IsNullOrWhiteSpace(Name)
        ? Id
        : $"{Id}｜{Name}";
}

public sealed record QuestObjectiveCatalogEntry(
    string Id,
    string Name,
    string QuestId,
    string StageId)
{
    public override string ToString() => string.IsNullOrWhiteSpace(Name)
        ? Id
        : $"{Id}｜{Name}";
}

public sealed record QuestCatalogEntry(
    string Id,
    string Name,
    IReadOnlyList<QuestStageCatalogEntry>? Stages = null)
{
    public IReadOnlyList<QuestStageCatalogEntry> StageEntries =>
        Stages ?? Array.Empty<QuestStageCatalogEntry>();

    public override string ToString() => string.IsNullOrWhiteSpace(Name)
        ? Id
        : $"{Id}｜{Name}";
}

public static class QuestCatalog
{
    public static IReadOnlyList<QuestCatalogEntry> Load(string? projectRoot)
    {
        if (string.IsNullOrWhiteSpace(projectRoot)) return Array.Empty<QuestCatalogEntry>();
        var path = Path.Combine(projectRoot, "public", "quests", "quest-data.json");
        if (!File.Exists(path)) return Array.Empty<QuestCatalogEntry>();
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            if (!document.RootElement.TryGetProperty("quests", out var quests) ||
                quests.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<QuestCatalogEntry>();
            }
            return quests.EnumerateArray()
                .Select(quest => new QuestCatalogEntry(
                    quest.TryGetProperty("id", out var id)
                        ? id.GetString()?.Trim() ?? ""
                        : "",
                    quest.TryGetProperty("name", out var name)
                        ? name.GetString()?.Trim() ?? ""
                        : "",
                    quest.TryGetProperty("stages", out var stages) &&
                    stages.ValueKind == JsonValueKind.Array
                        ? stages.EnumerateArray()
                            .Select(stage => new QuestStageCatalogEntry(
                                stage.TryGetProperty("id", out var stageId)
                                    ? stageId.GetString()?.Trim() ?? ""
                                    : "",
                                stage.TryGetProperty("name", out var stageName)
                                    ? stageName.GetString()?.Trim() ?? ""
                                    : ""))
                            .Where(stage => !string.IsNullOrWhiteSpace(stage.Id))
                            .ToArray()
                        : Array.Empty<QuestStageCatalogEntry>()))
                .Where(quest => !string.IsNullOrWhiteSpace(quest.Id))
                .GroupBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch
        {
            return Array.Empty<QuestCatalogEntry>();
        }
    }

    public static IReadOnlyList<QuestObjectiveCatalogEntry> LoadObjectives(string? projectRoot)
    {
        if (string.IsNullOrWhiteSpace(projectRoot)) return Array.Empty<QuestObjectiveCatalogEntry>();
        var path = Path.Combine(projectRoot, "public", "quests", "quest-data.json");
        if (!File.Exists(path)) return Array.Empty<QuestObjectiveCatalogEntry>();
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            if (!document.RootElement.TryGetProperty("quests", out var quests) ||
                quests.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<QuestObjectiveCatalogEntry>();
            }

            var result = new List<QuestObjectiveCatalogEntry>();
            foreach (var quest in quests.EnumerateArray())
            {
                var questId = quest.TryGetProperty("id", out var questIdElement)
                    ? questIdElement.GetString()?.Trim() ?? ""
                    : "";
                if (!quest.TryGetProperty("stages", out var stages) || stages.ValueKind != JsonValueKind.Array)
                    continue;
                foreach (var stage in stages.EnumerateArray())
                {
                    var stageId = stage.TryGetProperty("id", out var stageIdElement)
                        ? stageIdElement.GetString()?.Trim() ?? ""
                        : "";
                    if (!stage.TryGetProperty("objectives", out var objectives) || objectives.ValueKind != JsonValueKind.Array)
                        continue;
                    foreach (var objective in objectives.EnumerateArray())
                    {
                        var id = objective.TryGetProperty("id", out var idElement)
                            ? idElement.GetString()?.Trim() ?? ""
                            : "";
                        if (id.Length == 0) continue;
                        var name = objective.TryGetProperty("displayText", out var nameElement)
                            ? nameElement.GetString()?.Trim() ?? ""
                            : "";
                        result.Add(new QuestObjectiveCatalogEntry(id, name, questId, stageId));
                    }
                }
            }
            return result
                .GroupBy(objective => objective.Id, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(objective => objective.Id, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch
        {
            return Array.Empty<QuestObjectiveCatalogEntry>();
        }
    }
}

public sealed record InteractionTypeDefaults(
    string Id,
    string Label,
    string Verb,
    SurvivalEffects Effects,
    int? DailyLimit)
{
    public static readonly IReadOnlyList<InteractionTypeDefaults> All = new InteractionTypeDefaults[]
    {
        new("dialogue", "對話", "對話", new SurvivalEffects(), null),
        new("operation", "操作", "操作", new SurvivalEffects { Stamina = -5, Hunger = -3, Thirst = -3 }, null),
        new("gather", "採集", "採集", new SurvivalEffects { Stamina = -4, Hunger = -2, Thirst = -2, Spirit = -1 }, 3),
        new("move", "移動", "移動", new SurvivalEffects(), null),
        new("interaction", "互動", "互動", new SurvivalEffects { Stamina = -1, Hunger = -1, Thirst = -1 }, null),
        new("check", "檢查", "檢查", new SurvivalEffects(), null),
        new("investigate", "調查", "調查", new SurvivalEffects(), null),
        new("use", "使用", "使用", new SurvivalEffects(), null),
        new("enter", "進入", "進入", new SurvivalEffects(), null),
        new("leave", "離開", "離開", new SurvivalEffects(), null),
    };

    public static InteractionTypeDefaults Get(string? id) =>
        All.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase)) ?? All[0];
}

public sealed class InteractionPoint : ScenePoint
{
    public string Facing { get; set; } = "S";
}

public sealed class DialogueScript
{
    public float CharacterDelaySeconds { get; set; } = 0.02f;
    public List<string> Speakers { get; set; } = new() { "Sbaak", "Echo" };
    public List<DialogueLine> Lines { get; set; } = new();

    public static DialogueScript CreateDefault() => new()
    {
        Speakers = new List<string> { "Sbaak", "Echo" },
        Lines = new List<DialogueLine>
        {
            new() { Speaker = "Sbaak", Text = "..." },
        },
    };

    public static DialogueScript CreateFailureDefault() => new()
    {
        Speakers = new List<string> { "Sbaak", "Echo" },
        Lines = new List<DialogueLine>
        {
            new() { Speaker = "Sbaak", Text = "目前無法使用。" },
        },
    };

    public DialogueScript Clone() => new()
    {
        CharacterDelaySeconds = CharacterDelaySeconds,
        Speakers = Speakers.ToList(),
        Lines = Lines.Select(line => new DialogueLine
        {
            LineId = line.LineId,
            Speaker = line.Speaker,
            Text = line.Text,
            RandomGroupId = line.RandomGroupId,
            Weight = line.Weight,
        }).ToList(),
    };
}

public sealed class DialogueLine
{
    public string LineId { get; set; } = "";
    public string Speaker { get; set; } = "";
    public string Text { get; set; } = "...";
    public string? RandomGroupId { get; set; }
    public int? Weight { get; set; }
}

public sealed class MovementGuide
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Movement guide";
    public List<ScenePoint> Points { get; set; } = new();
    public float Width { get; set; } = 36;
    public bool Bidirectional { get; set; } = true;
}

public sealed class StoryTriggerZone : ITriggerConfiguration
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "劇情觸發區";
    public List<ScenePoint> Points { get; set; } = new();
    public bool Once { get; set; } = true;
    public string DialogueId { get; set; } = "";

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public float TriggerDelaySeconds { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? StartQuestIds { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? ActivateObjectiveIds { get; set; }

    public SurvivalRequirements SurvivalRequirements { get; set; } = new();
    public SurvivalEffects SurvivalEffects { get; set; } = new();

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? DailyInteractionLimit { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InteractionLimitMode { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionItemReward>? ItemRewards { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public InteractionItemReward? ItemReward { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionUseRequirement>? UseRequirements { get; set; }

    public List<InteractionItemReward> EnsureItemRewards()
    {
        ItemRewards ??= new List<InteractionItemReward>();
        if (ItemReward is not null)
        {
            ItemRewards.Insert(0, ItemReward);
            ItemReward = null;
        }
        return ItemRewards;
    }

    public void NormalizeItemRewards()
    {
        if (ItemReward is not null) EnsureItemRewards();
        if (ItemRewards is { Count: 0 }) ItemRewards = null;
    }
}

public sealed class SceneConnection
{
    public ScenePoint? InteractionHintPoint { get; set; }
    public DialogueScript Dialogue { get; set; } = new();
    public DialogueScript FailureDialogue { get; set; } = DialogueScript.CreateFailureDefault();
    public DialogueScript? SurvivalFailureDialogue { get; set; }
    public DialogueScript? CompletionDialogue { get; set; }
    public bool SkipSuccessDialogue { get; set; }
    public string Id { get; set; } = "";
    public string Label { get; set; } = "地圖出入口";
    public string Type { get; set; } = "exit";
    public List<ScenePoint> Area { get; set; } = new();
    public string TargetSceneId { get; set; } = "";
    public string TargetEntryPointId { get; set; } = "";
    public string TriggerMode { get; set; } = "auto";
    public string TransitionMode { get; set; } = "seamless";
    public string TransferMode { get; set; } = "teleport";
    public string CameraFocus { get; set; } = "player";
    public SurvivalRequirements SurvivalRequirements { get; set; } = new();

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionUseRequirement>? UseRequirements { get; set; }

    // Legacy placeholders retained for reading older drafts. New editor data
    // targets a named Entry Point instead of duplicating the landing position.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PlayerSpawn? TargetSpawn { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public WorldLayout? TargetRelativePosition { get; set; }
}

public static class SceneJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static SceneDocument Load(string path)
    {
        return Deserialize(File.ReadAllText(path));
    }

    public static SceneDocument Deserialize(string json)
    {
        return JsonSerializer.Deserialize<SceneDocument>(json, Options)
            ?? throw new InvalidDataException("場景 JSON 沒有有效內容。");
    }

    public static string Serialize(SceneDocument document)
    {
        return JsonSerializer.Serialize(document, Options) + Environment.NewLine;
    }

    public static void Save(string path, SceneDocument document)
    {
        Validate(document);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, Serialize(document));
    }

    public static void Validate(SceneDocument document)
    {
        if (document.SchemaVersion != 1)
        {
            throw new InvalidDataException($"不支援場景格式版本 {document.SchemaVersion}。");
        }

        if (string.IsNullOrWhiteSpace(document.SceneId))
        {
            throw new InvalidDataException("sceneId 不可空白。");
        }
        document.SceneId = document.SceneId.Trim();
        document.DisplayName = string.IsNullOrWhiteSpace(document.DisplayName)
            ? document.SceneId
            : document.DisplayName.Trim();
        document.WorldLayout ??= new WorldLayout();
        document.EntryPoints ??= new List<SceneEntryPoint>();
        document.Connections ??= new List<SceneConnection>();

        if (document.World.Width <= 0 || document.World.Height <= 0)
        {
            throw new InvalidDataException("場景寬度與高度必須大於零。");
        }

        if (document.NavMesh.Any(region => region.Points.Count < 3))
        {
            throw new InvalidDataException("每個 NavMesh 至少需要三個頂點。");
        }

        foreach (var collision in document.Collisions)
        {
            if (collision.Shape.Equals("circle", StringComparison.OrdinalIgnoreCase))
            {
                if (collision.Center is null || collision.Radius <= 0)
                {
                    throw new InvalidDataException($"圓形 Collision {collision.Id} 缺少中心或半徑。");
                }
            }
            else if (collision.Points is null || collision.Points.Count < 3)
            {
                throw new InvalidDataException($"Collision {collision.Id} 至少需要三個頂點。");
            }
        }

        var duplicateInteractionId = document.Interactables
            .Where(interactable => !string.IsNullOrWhiteSpace(interactable.Id))
            .GroupBy(interactable => interactable.Id.Trim(), StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1)
            ?.Key;
        if (duplicateInteractionId is not null)
        {
            throw new InvalidDataException($"互動多邊形 ID 重複：{duplicateInteractionId}");
        }

        foreach (var interactable in document.Interactables)
        {
            if (string.IsNullOrWhiteSpace(interactable.Id))
            {
                throw new InvalidDataException("互動多邊形 ID 不可空白。");
            }
            interactable.Id = interactable.Id.Trim();
            if (interactable.Points.Count < 3)
            {
                throw new InvalidDataException($"互動多邊形 {interactable.Id} 至少需要 3 個 Node。");
            }

            interactable.NormalizeInteractionPoints();
            interactable.SurvivalRequirements ??= new SurvivalRequirements();
            interactable.SurvivalEffects ??= new SurvivalEffects();
            interactable.SurvivalRequirements.Mode =
                "any".Equals(
                    interactable.SurvivalRequirements.Mode,
                    StringComparison.OrdinalIgnoreCase)
                    ? "any"
                    : "all";
            NormalizeRequirement(interactable.SurvivalRequirements.Stamina);
            NormalizeRequirement(interactable.SurvivalRequirements.Hunger);
            NormalizeRequirement(interactable.SurvivalRequirements.Thirst);
            NormalizeRequirement(interactable.SurvivalRequirements.Spirit);
            interactable.SurvivalEffects.TimeMinutes = Math.Clamp(
                interactable.SurvivalEffects.TimeMinutes,
                0,
                7 * 24 * 60);
            NormalizeCompletionTimeJump(interactable.SurvivalEffects);
            interactable.InteractionLimitMode = "once".Equals(
                interactable.InteractionLimitMode,
                StringComparison.OrdinalIgnoreCase)
                ? "once"
                : null;
            interactable.DailyInteractionLimit = interactable.InteractionLimitMode == "once"
                ? null
                : interactable.DailyInteractionLimit is null
                    ? null
                    : Math.Clamp(interactable.DailyInteractionLimit.Value, 1, 10);
            interactable.NormalizeItemRewards();
            if (interactable.ItemRewards is { Count: > 0 })
            {
                foreach (var reward in interactable.ItemRewards)
                {
                    var rewardItem = ItemCatalog.Find(reward.ItemId);
                    if (rewardItem is null)
                    {
                        throw new InvalidDataException(
                            $"互動多邊形 {interactable.Id} 設定了未知道具 {reward.ItemId}。");
                    }
                    reward.ItemId = rewardItem.Id;
                    reward.Quantity = Math.Clamp(reward.Quantity, 1, 99);
                    reward.Delivery = reward.Delivery.Equals(
                        "world",
                        StringComparison.OrdinalIgnoreCase)
                        ? "world"
                        : "inventory";
                }
            }
            if (interactable.UseRequirements is { Count: > 0 })
            {
                foreach (var requirement in interactable.UseRequirements)
                {
                    requirement.Scope = requirement.Scope switch
                    {
                        "prompt" => "prompt",
                        "interaction" => "interaction",
                        _ => "both",
                    };
                    requirement.Kind = requirement.Kind.Equals(
                        "chapter",
                        StringComparison.OrdinalIgnoreCase)
                        ? "chapter"
                        : requirement.Kind.Equals(
                            "campPower",
                            StringComparison.OrdinalIgnoreCase)
                            ? "campPower"
                        : requirement.Kind.Equals(
                            "quest",
                            StringComparison.OrdinalIgnoreCase)
                            ? "quest"
                            : requirement.Kind.Equals(
                                "questState",
                                StringComparison.OrdinalIgnoreCase)
                                ? "questState"
                            : requirement.Kind.Equals(
                                "questStage",
                                StringComparison.OrdinalIgnoreCase)
                                ? "questStage"
                                : "item";
                    if (requirement.Kind == "campPower")
                    {
                        requirement.ItemId = "";
                        requirement.QuestId = "";
                        requirement.QuestState = null;
                        requirement.StageId = "";
                        requirement.DisableQuestId = "";
                        requirement.DisableStageId = "";
                        requirement.Quantity = 1;
                        requirement.Chapter = 1;
                        requirement.MinimumPower = Math.Clamp(requirement.MinimumPower, 1, 50);
                        continue;
                    }
                    if (requirement.Kind == "chapter")
                    {
                        requirement.ItemId = "";
                        requirement.QuestId = "";
                        requirement.StageId = "";
                        requirement.DisableQuestId = "";
                        requirement.DisableStageId = "";
                        requirement.Chapter = Math.Clamp(requirement.Chapter, 1, 99);
                        requirement.Quantity = 1;
                        requirement.MinimumPower = 0;
                        continue;
                    }
                    if (requirement.Kind == "quest")
                    {
                        requirement.ItemId = "";
                        requirement.QuestId = requirement.QuestId.Trim();
                        requirement.StageId = "";
                        requirement.DisableQuestId = "";
                        requirement.DisableStageId = "";
                        requirement.Quantity = 1;
                        requirement.Chapter = 1;
                        requirement.MinimumPower = 0;
                        if (requirement.QuestId.Length == 0)
                        {
                            throw new InvalidDataException(
                                $"互動多邊形 {interactable.Id} 的需求任務 ID 不可空白。");
                        }
                        continue;
                    }
                    if (requirement.Kind == "questState")
                    {
                        requirement.ItemId = "";
                        requirement.QuestId = requirement.QuestId.Trim();
                        requirement.QuestState = requirement.QuestState switch
                        {
                            "locked" => "locked",
                            "available" => "available",
                            "active" => "active",
                            "failed" => "failed",
                            "abandoned" => "abandoned",
                            _ => "completed",
                        };
                        requirement.StageId = "";
                        requirement.DisableQuestId = "";
                        requirement.DisableStageId = "";
                        requirement.Quantity = 1;
                        requirement.Chapter = 1;
                        requirement.MinimumPower = 0;
                        if (requirement.QuestId.Length == 0)
                        {
                            throw new InvalidDataException(
                                $"互動多邊形 {interactable.Id} 的任務狀態條件不可空白。");
                        }
                        continue;
                    }
                    if (requirement.Kind == "questStage")
                    {
                        requirement.ItemId = "";
                        requirement.QuestId = requirement.QuestId.Trim();
                        requirement.StageId = requirement.StageId.Trim();
                        requirement.StageMode = requirement.StageMode switch
                        {
                            "UnlockFromStage" => "UnlockFromStage",
                            "UnlockUntilCondition" => "UnlockUntilCondition",
                            _ => "CurrentStageOnly",
                        };
                        requirement.ObjectiveId = requirement.ObjectiveId?.Trim();
                        if (string.IsNullOrWhiteSpace(requirement.ObjectiveId))
                        {
                            requirement.ObjectiveId = null;
                            requirement.ObjectiveState = null;
                        }
                        else
                        {
                            requirement.ObjectiveState = requirement.ObjectiveState == "completed"
                                ? "completed"
                                : "unlocked";
                        }
                        requirement.DisableQuestId = requirement.DisableQuestId.Trim();
                        requirement.DisableStageId = requirement.DisableStageId.Trim();
                        requirement.DisableObjectiveId = requirement.DisableObjectiveId?.Trim();
                        if (string.IsNullOrWhiteSpace(requirement.DisableObjectiveId))
                        {
                            requirement.DisableObjectiveId = null;
                            requirement.DisableObjectiveState = null;
                        }
                        else
                        {
                            requirement.DisableObjectiveState =
                                requirement.DisableObjectiveState == "unlocked"
                                    ? "unlocked"
                                    : "completed";
                        }
                        requirement.Quantity = 1;
                        requirement.Chapter = 1;
                        requirement.MinimumPower = 0;
                        if (requirement.QuestId.Length == 0 || requirement.StageId.Length == 0)
                        {
                            throw new InvalidDataException(
                                $"互動多邊形 {interactable.Id} 的任務階段條件不可空白。");
                        }
                        if (requirement.StageMode != "UnlockUntilCondition" ||
                            requirement.DisableQuestId.Length == 0 ||
                            requirement.DisableStageId.Length == 0)
                        {
                            requirement.DisableQuestId = "";
                            requirement.DisableStageId = "";
                            requirement.DisableObjectiveId = null;
                            requirement.DisableObjectiveState = null;
                        }
                        continue;
                    }
                    var requiredItem = ItemCatalog.Find(requirement.ItemId);
                    if (requiredItem is null)
                    {
                        throw new InvalidDataException(
                            $"互動多邊形 {interactable.Id} 設定了未知需求道具 {requirement.ItemId}。");
                    }
                    requirement.ItemId = requiredItem.Id;
                    requirement.QuestId = "";
                    requirement.StageId = "";
                    requirement.DisableQuestId = "";
                    requirement.DisableStageId = "";
                    requirement.Quantity = Math.Clamp(requirement.Quantity, 1, 99);
                    requirement.Chapter = 1;
                    requirement.MinimumPower = 0;
                }
            }
            else
            {
                interactable.UseRequirements = null;
            }
            interactable.Dialogue ??= DialogueScript.CreateDefault();
            interactable.FailureDialogue ??= DialogueScript.CreateFailureDefault();
            interactable.StoryDialogueId = string.IsNullOrWhiteSpace(interactable.StoryDialogueId)
                ? null
                : interactable.StoryDialogueId.Trim();
            NormalizeDialogue(interactable.Dialogue, "...");
            NormalizeDialogue(interactable.FailureDialogue, "目前無法使用。");
            if (interactable.SurvivalFailureDialogue is not null)
            {
                NormalizeOptionalDialogue(interactable.SurvivalFailureDialogue);
                if (interactable.SurvivalFailureDialogue.Lines.Count == 0)
                {
                    interactable.SurvivalFailureDialogue = null;
                }
            }
            if (interactable.CompletionDialogue is not null)
            {
                NormalizeOptionalDialogue(interactable.CompletionDialogue);
                if (interactable.CompletionDialogue.Lines.Count == 0)
                {
                    interactable.CompletionDialogue = null;
                }
            }
        }

        foreach (var guide in document.MovementGuides)
        {
            if (guide.Points.Count < 2)
            {
                throw new InvalidDataException($"強制引導線 {guide.Id} 至少需要 2 個 Node。");
            }
            if (guide.Width <= 0)
            {
                throw new InvalidDataException($"強制引導線 {guide.Id} 的生效寬度必須大於 0。");
            }
        }

        foreach (var trigger in document.StoryTriggers)
        {
            if (trigger.Points.Count < 3)
            {
                throw new InvalidDataException($"劇情觸發區 {trigger.Id} 至少需要 3 個 Node。");
            }
            trigger.Label = string.IsNullOrWhiteSpace(trigger.Label)
                ? "劇情觸發區"
                : trigger.Label.Trim();
            trigger.DialogueId = trigger.DialogueId?.Trim() ?? "";
            trigger.TriggerDelaySeconds = Math.Clamp(trigger.TriggerDelaySeconds, 0, 3600);
            trigger.StartQuestIds = trigger.StartQuestIds?
                .Select(questId => questId.Trim())
                .Where(questId => questId.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (trigger.StartQuestIds is { Count: 0 }) trigger.StartQuestIds = null;
            trigger.ActivateObjectiveIds = trigger.ActivateObjectiveIds?
                .Select(objectiveId => objectiveId.Trim())
                .Where(objectiveId => objectiveId.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (trigger.ActivateObjectiveIds is { Count: 0 }) trigger.ActivateObjectiveIds = null;
            if (trigger.Once)
            {
                trigger.InteractionLimitMode = "once";
            }
            NormalizeTriggerConfiguration(trigger, "Story trigger");
            trigger.Once = trigger.InteractionLimitMode == "once";
        }

        var itemPointIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var itemPointIdPrefix = CreateSceneScopedIdPrefix(document.SceneId, "item-point");
        for (var index = 0; index < document.ItemPoints.Count; index++)
        {
            var itemPoint = document.ItemPoints[index];
            var item = ItemCatalog.Find(itemPoint.ItemId);
            if (item is null)
            {
                throw new InvalidDataException(
                    $"ItemPoint {itemPoint.Id} 設定了未知道具 {itemPoint.ItemId}。");
            }
            itemPoint.Id = string.IsNullOrWhiteSpace(itemPoint.Id)
                ? $"{itemPointIdPrefix}-{index + 1:000}"
                : itemPoint.Id.Trim();
            if (!itemPoint.Id.StartsWith(
                    $"{itemPointIdPrefix}-",
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException(
                    $"ItemPoint ID 必須包含目前 Scene：{itemPoint.Id}，預期前綴 {itemPointIdPrefix}-");
            }
            if (!itemPointIds.Add(itemPoint.Id))
            {
                throw new InvalidDataException($"ItemPoint ID 重複：{itemPoint.Id}");
            }
            itemPoint.Label = string.IsNullOrWhiteSpace(itemPoint.Label)
                ? $"ItemPoint {index + 1}"
                : itemPoint.Label.Trim();
            itemPoint.ItemId = item.Id;
            itemPoint.Quantity = Math.Clamp(itemPoint.Quantity, 1, 99);
            itemPoint.SpawnPolicy = itemPoint.SpawnPolicy switch
            {
                "daily" => "daily",
                "sceneEntry" => "sceneEntry",
                _ => "once",
            };
            if (itemPoint.SpawnRequirement is not null)
            {
                itemPoint.SpawnRequirement.QuestId = itemPoint.SpawnRequirement.QuestId.Trim();
                itemPoint.SpawnRequirement.StageId = itemPoint.SpawnRequirement.StageId.Trim();
                if (itemPoint.SpawnRequirement.QuestId.Length == 0 ||
                    itemPoint.SpawnRequirement.StageId.Length == 0)
                {
                    throw new InvalidDataException(
                        $"ItemPoint {itemPoint.Id} 的 Spawn 任務階段需求不完整。");
                }
                itemPoint.SpawnRequirement.StageMode =
                    itemPoint.SpawnRequirement.StageMode.Equals(
                        "UnlockFromStage",
                        StringComparison.OrdinalIgnoreCase)
                        ? "UnlockFromStage"
                        : "CurrentStageOnly";
            }
            itemPoint.X = Math.Clamp(itemPoint.X, 0, document.World.Width);
            itemPoint.Y = Math.Clamp(itemPoint.Y, 0, document.World.Height);
            if (!document.NavMesh.Any(region => PointInPolygon(itemPoint, region.Points)))
            {
                throw new InvalidDataException(
                    $"ItemPoint {itemPoint.Id} 必須放在 NavMesh 範圍內。");
            }
        }

        var teleportPointIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < document.TeleportPoints.Count; index++)
        {
            var teleportPoint = document.TeleportPoints[index];
            teleportPoint.Id = string.IsNullOrWhiteSpace(teleportPoint.Id)
                ? $"teleport-point-{index + 1:000}"
                : teleportPoint.Id.Trim();
            if (!teleportPointIds.Add(teleportPoint.Id))
            {
                throw new InvalidDataException($"傳送 Point ID 重複：{teleportPoint.Id}");
            }
            teleportPoint.Label = string.IsNullOrWhiteSpace(teleportPoint.Label)
                ? $"傳送點 {index + 1}"
                : teleportPoint.Label.Trim();
            teleportPoint.Facing = NormalizeFacing(teleportPoint.Facing);
            teleportPoint.BlackoutFadeSeconds = Math.Clamp(
                teleportPoint.BlackoutFadeSeconds,
                0,
                30);
            teleportPoint.BlackoutHoldSeconds = Math.Clamp(
                teleportPoint.BlackoutHoldSeconds,
                0,
                3600);
            teleportPoint.X = Math.Clamp(teleportPoint.X, 0, document.World.Width);
            teleportPoint.Y = Math.Clamp(teleportPoint.Y, 0, document.World.Height);
            if (!document.NavMesh.Any(region => PointInPolygon(teleportPoint, region.Points)))
            {
                throw new InvalidDataException(
                    $"傳送 Point {teleportPoint.Id} 必須位於 NavMesh 內。");
            }
        }

        foreach (var interactable in document.Interactables)
        {
            interactable.CompletionTeleportPointId =
                string.IsNullOrWhiteSpace(interactable.CompletionTeleportPointId)
                    ? null
                    : interactable.CompletionTeleportPointId.Trim();
            interactable.CompletionTeleportDelaySeconds = Math.Clamp(
                interactable.CompletionTeleportDelaySeconds,
                0,
                3600);
            if (interactable.CompletionTeleportPointId is not null &&
                !teleportPointIds.Contains(interactable.CompletionTeleportPointId))
            {
                throw new InvalidDataException(
                    $"互動多邊形 {interactable.Id} 指定了未知傳送 Point {interactable.CompletionTeleportPointId}。");
            }
        }

        var entryPointIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < document.EntryPoints.Count; index++)
        {
            var entryPoint = document.EntryPoints[index];
            entryPoint.Id = string.IsNullOrWhiteSpace(entryPoint.Id)
                ? $"entry-point-{index + 1:000}"
                : entryPoint.Id.Trim();
            if (!entryPointIds.Add(entryPoint.Id))
            {
                throw new InvalidDataException($"地圖 Entry Point ID 重複：{entryPoint.Id}");
            }
            entryPoint.Label = string.IsNullOrWhiteSpace(entryPoint.Label)
                ? $"地圖 Entry Point {index + 1}"
                : entryPoint.Label.Trim();
            entryPoint.Facing = NormalizeFacing(entryPoint.Facing);
            entryPoint.X = Math.Clamp(entryPoint.X, 0, document.World.Width);
            entryPoint.Y = Math.Clamp(entryPoint.Y, 0, document.World.Height);
            if (!document.NavMesh.Any(region => PointInPolygon(entryPoint, region.Points)))
            {
                throw new InvalidDataException(
                    $"地圖 Entry Point {entryPoint.Id} 必須位於 NavMesh 內。");
            }
        }

        var connectionIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < document.Connections.Count; index++)
        {
            var connection = document.Connections[index];
            connection.Id = string.IsNullOrWhiteSpace(connection.Id)
                ? $"scene-exit-{index + 1:000}"
                : connection.Id.Trim();
            if (!connectionIds.Add(connection.Id))
            {
                throw new InvalidDataException($"地圖出入口 ID 重複：{connection.Id}");
            }
            connection.Label = string.IsNullOrWhiteSpace(connection.Label)
                ? $"地圖出入口 {index + 1}"
                : connection.Label.Trim();
            connection.Type = "exit";
            connection.Dialogue ??= new DialogueScript();
            connection.FailureDialogue ??= DialogueScript.CreateFailureDefault();
            NormalizeOptionalDialogue(connection.Dialogue);
            NormalizeDialogue(connection.FailureDialogue, "目前無法使用。");
            if (connection.SurvivalFailureDialogue is not null) NormalizeOptionalDialogue(connection.SurvivalFailureDialogue);
            if (connection.CompletionDialogue is not null) NormalizeOptionalDialogue(connection.CompletionDialogue);
            connection.Area ??= new List<ScenePoint>();
            if (connection.Area.Count < 3)
            {
                throw new InvalidDataException(
                    $"地圖出入口 {connection.Id} 至少需要 3 個 Node。");
            }
            connection.TargetSceneId = connection.TargetSceneId?.Trim() ?? "";
            connection.TargetEntryPointId = connection.TargetEntryPointId?.Trim() ?? "";
            if (connection.TargetSceneId.Length == 0 || connection.TargetEntryPointId.Length == 0)
            {
                throw new InvalidDataException(
                    $"地圖出入口 {connection.Id} 必須指定目標地圖與 Entry Point。");
            }
            connection.TriggerMode = connection.TriggerMode switch
            {
                "manual" => "manual",
                "choice" => "choice",
                _ => "auto",
            };
            connection.TransitionMode = connection.TransitionMode == "blackout"
                ? "blackout"
                : "seamless";
            connection.TransferMode = connection.TransferMode == "pathfind"
                ? "pathfind"
                : "teleport";
            connection.CameraFocus = connection.CameraFocus == "sceneRoot"
                ? "sceneRoot"
                : "player";
            connection.SurvivalRequirements ??= new SurvivalRequirements();
            connection.UseRequirements = connection.UseRequirements?
                .Where(requirement => requirement is not null)
                .Select(requirement => requirement.Clone())
                .ToList();
            if (connection.UseRequirements is { Count: 0 })
            {
                connection.UseRequirements = null;
            }
        }
    }

    internal static string CreateSceneScopedIdPrefix(string? sceneId, string entityPrefix)
    {
        var sceneToken = string.Concat(
            (sceneId ?? "")
                .Trim()
                .ToLowerInvariant()
                .Where(char.IsLetterOrDigit));
        if (sceneToken.Length == 0) sceneToken = "scene";

        var normalizedEntityPrefix = entityPrefix.Trim().ToLowerInvariant();
        return $"{sceneToken}-{normalizedEntityPrefix}";
    }

    private static bool PointInPolygon(ScenePoint point, IReadOnlyList<ScenePoint> polygon)
    {
        if (polygon.Count < 3) return false;
        var inside = false;
        for (int current = 0, previous = polygon.Count - 1;
             current < polygon.Count;
             previous = current++)
        {
            var a = polygon[current];
            var b = polygon[previous];
            if ((a.Y > point.Y) == (b.Y > point.Y)) continue;
            var intersectionX =
                (b.X - a.X) * (point.Y - a.Y) / (b.Y - a.Y) + a.X;
            if (point.X < intersectionX) inside = !inside;
        }
        return inside;
    }

    private static string NormalizeFacing(string? facing)
    {
        var normalized = facing?.Trim().ToUpperInvariant() ?? "S";
        return normalized is "N" or "NE" or "E" or "SE" or "S" or "SW" or "W" or "NW"
            ? normalized
            : "S";
    }

    private static void NormalizeRequirement(SurvivalRequirementRule? rule)
    {
        if (rule is null) return;
        rule.Comparison = rule.Comparison.Equals("below", StringComparison.OrdinalIgnoreCase)
            ? "below"
            : rule.Comparison.Equals("atMost", StringComparison.OrdinalIgnoreCase)
                ? "atMost"
                : "atLeast";
        rule.Value = Math.Clamp(rule.Value, 0, 100);
    }

    private static void NormalizeCompletionTimeJump(SurvivalEffects effects)
    {
        if (effects.JumpToTimeMinutes is int targetMinutes)
        {
            effects.JumpToTimeMinutes = Math.Clamp(targetMinutes, 0, 24 * 60 - 1);
            effects.JumpDayOffset = Math.Clamp(effects.JumpDayOffset, 0, 30);
            return;
        }

        effects.JumpDayOffset = 0;
    }

    private static void NormalizeTriggerConfiguration(
        ITriggerConfiguration trigger,
        string ownerLabel)
    {
        trigger.SurvivalRequirements ??= new SurvivalRequirements();
        trigger.SurvivalEffects ??= new SurvivalEffects();
        trigger.SurvivalRequirements.Mode = "any".Equals(
            trigger.SurvivalRequirements.Mode,
            StringComparison.OrdinalIgnoreCase)
            ? "any"
            : "all";
        NormalizeRequirement(trigger.SurvivalRequirements.Stamina);
        NormalizeRequirement(trigger.SurvivalRequirements.Hunger);
        NormalizeRequirement(trigger.SurvivalRequirements.Thirst);
        NormalizeRequirement(trigger.SurvivalRequirements.Spirit);
        trigger.SurvivalEffects.TimeMinutes = Math.Clamp(
            trigger.SurvivalEffects.TimeMinutes,
            0,
            7 * 24 * 60);
        NormalizeCompletionTimeJump(trigger.SurvivalEffects);
        trigger.InteractionLimitMode = "once".Equals(
            trigger.InteractionLimitMode,
            StringComparison.OrdinalIgnoreCase)
            ? "once"
            : null;
        trigger.DailyInteractionLimit = trigger.InteractionLimitMode == "once"
            ? null
            : trigger.DailyInteractionLimit is null
                ? null
                : Math.Clamp(trigger.DailyInteractionLimit.Value, 1, 10);

        trigger.NormalizeItemRewards();
        if (trigger.ItemRewards is { Count: > 0 })
        {
            foreach (var reward in trigger.ItemRewards)
            {
                var rewardItem = ItemCatalog.Find(reward.ItemId);
                if (rewardItem is null)
                {
                    throw new InvalidDataException(
                        $"{ownerLabel} {trigger.Id} has an unknown item reward: {reward.ItemId}.");
                }
                reward.ItemId = rewardItem.Id;
                reward.Quantity = Math.Clamp(reward.Quantity, 1, 99);
                reward.Delivery = reward.Delivery.Equals(
                    "world",
                    StringComparison.OrdinalIgnoreCase)
                    ? "world"
                    : "inventory";
            }
        }

        if (trigger.UseRequirements is not { Count: > 0 })
        {
            trigger.UseRequirements = null;
            return;
        }

        foreach (var requirement in trigger.UseRequirements)
        {
            requirement.Scope = requirement.Scope switch
            {
                "prompt" => "prompt",
                "interaction" => "interaction",
                _ => "both",
            };
            requirement.Kind = requirement.Kind.Equals(
                "chapter",
                StringComparison.OrdinalIgnoreCase)
                ? "chapter"
                : requirement.Kind.Equals(
                    "campPower",
                    StringComparison.OrdinalIgnoreCase)
                    ? "campPower"
                : requirement.Kind.Equals(
                    "quest",
                    StringComparison.OrdinalIgnoreCase)
                    ? "quest"
                    : requirement.Kind.Equals(
                        "questState",
                        StringComparison.OrdinalIgnoreCase)
                        ? "questState"
                        : requirement.Kind.Equals(
                        "questStage",
                        StringComparison.OrdinalIgnoreCase)
                        ? "questStage"
                        : "item";
            if (requirement.Kind == "campPower")
            {
                requirement.ItemId = "";
                requirement.QuestId = "";
                requirement.QuestState = null;
                requirement.StageId = "";
                requirement.DisableQuestId = "";
                requirement.DisableStageId = "";
                requirement.Quantity = 1;
                requirement.Chapter = 1;
                requirement.MinimumPower = Math.Clamp(requirement.MinimumPower, 1, 50);
                continue;
            }
            if (requirement.Kind == "chapter")
            {
                requirement.ItemId = "";
                requirement.QuestId = "";
                requirement.QuestState = null;
                requirement.StageId = "";
                requirement.DisableQuestId = "";
                requirement.DisableStageId = "";
                requirement.Chapter = Math.Clamp(requirement.Chapter, 1, 99);
                requirement.Quantity = 1;
                requirement.MinimumPower = 0;
                continue;
            }
            if (requirement.Kind == "quest")
            {
                requirement.ItemId = "";
                requirement.QuestId = requirement.QuestId.Trim();
                requirement.QuestState = null;
                requirement.StageId = "";
                requirement.DisableQuestId = "";
                requirement.DisableStageId = "";
                requirement.Quantity = 1;
                requirement.Chapter = 1;
                requirement.MinimumPower = 0;
                if (requirement.QuestId.Length == 0)
                {
                    throw new InvalidDataException(
                        $"{ownerLabel} {trigger.Id} has an empty quest requirement.");
                }
                continue;
            }
            if (requirement.Kind == "questState")
            {
                requirement.ItemId = "";
                requirement.QuestId = requirement.QuestId.Trim();
                requirement.QuestState = requirement.QuestState switch
                {
                    "locked" => "locked",
                    "available" => "available",
                    "active" => "active",
                    "failed" => "failed",
                    "abandoned" => "abandoned",
                    _ => "completed",
                };
                requirement.StageId = "";
                requirement.DisableQuestId = "";
                requirement.DisableStageId = "";
                requirement.Quantity = 1;
                requirement.Chapter = 1;
                requirement.MinimumPower = 0;
                if (requirement.QuestId.Length == 0)
                {
                    throw new InvalidDataException(
                        $"{ownerLabel} {trigger.Id} has an empty quest-state requirement.");
                }
                continue;
            }
            if (requirement.Kind == "questStage")
            {
                requirement.ItemId = "";
                requirement.QuestId = requirement.QuestId.Trim();
                requirement.QuestState = null;
                requirement.StageId = requirement.StageId.Trim();
                requirement.StageMode = requirement.StageMode switch
                {
                    "UnlockFromStage" => "UnlockFromStage",
                    "UnlockUntilCondition" => "UnlockUntilCondition",
                    _ => "CurrentStageOnly",
                };
                requirement.ObjectiveId = requirement.ObjectiveId?.Trim();
                if (string.IsNullOrWhiteSpace(requirement.ObjectiveId))
                {
                    requirement.ObjectiveId = null;
                    requirement.ObjectiveState = null;
                }
                else
                {
                    requirement.ObjectiveState = requirement.ObjectiveState == "completed"
                        ? "completed"
                        : "unlocked";
                }
                requirement.DisableQuestId = requirement.DisableQuestId.Trim();
                requirement.DisableStageId = requirement.DisableStageId.Trim();
                requirement.DisableObjectiveId = requirement.DisableObjectiveId?.Trim();
                if (string.IsNullOrWhiteSpace(requirement.DisableObjectiveId))
                {
                    requirement.DisableObjectiveId = null;
                    requirement.DisableObjectiveState = null;
                }
                else
                {
                    requirement.DisableObjectiveState =
                        requirement.DisableObjectiveState == "unlocked"
                            ? "unlocked"
                            : "completed";
                }
                requirement.Quantity = 1;
                requirement.Chapter = 1;
                requirement.MinimumPower = 0;
                if (requirement.QuestId.Length == 0 || requirement.StageId.Length == 0)
                {
                    throw new InvalidDataException(
                        $"{ownerLabel} {trigger.Id} has an incomplete quest-stage requirement.");
                }
                if (requirement.StageMode != "UnlockUntilCondition" ||
                    requirement.DisableQuestId.Length == 0 ||
                    requirement.DisableStageId.Length == 0)
                {
                    requirement.DisableQuestId = "";
                    requirement.DisableStageId = "";
                    requirement.DisableObjectiveId = null;
                    requirement.DisableObjectiveState = null;
                }
                continue;
            }

            var requiredItem = ItemCatalog.Find(requirement.ItemId);
            if (requiredItem is null)
            {
                throw new InvalidDataException(
                    $"{ownerLabel} {trigger.Id} has an unknown item requirement: {requirement.ItemId}.");
            }
            requirement.ItemId = requiredItem.Id;
            requirement.QuestId = "";
            requirement.QuestState = null;
            requirement.StageId = "";
            requirement.DisableQuestId = "";
            requirement.DisableStageId = "";
            requirement.Quantity = Math.Clamp(requirement.Quantity, 1, 99);
            requirement.Chapter = 1;
            requirement.MinimumPower = 0;
        }
    }

    private static void NormalizeDialogue(DialogueScript dialogue, string defaultText)
    {
        dialogue.CharacterDelaySeconds = Math.Clamp(dialogue.CharacterDelaySeconds, 0, 2);
        dialogue.Speakers ??= new List<string>();
        dialogue.Lines ??= new List<DialogueLine>();
        dialogue.Speakers = dialogue.Speakers
            .Where(speaker => !string.IsNullOrWhiteSpace(speaker))
            .Select(speaker => speaker.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (dialogue.Speakers.Count == 0)
        {
            dialogue.Speakers.AddRange(new[] { "Sbaak", "Echo" });
        }
        if (dialogue.Lines.Count == 0)
        {
            dialogue.Lines.Add(new DialogueLine
            {
                Speaker = dialogue.Speakers[0],
                Text = defaultText,
            });
        }
        NormalizeDialogueRandomGroups(dialogue.Lines);
    }

    private static void NormalizeOptionalDialogue(DialogueScript dialogue)
    {
        dialogue.CharacterDelaySeconds = Math.Clamp(dialogue.CharacterDelaySeconds, 0, 2);
        dialogue.Speakers ??= new List<string>();
        dialogue.Lines ??= new List<DialogueLine>();
        dialogue.Speakers = dialogue.Speakers
            .Where(speaker => !string.IsNullOrWhiteSpace(speaker))
            .Select(speaker => speaker.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (dialogue.Speakers.Count == 0)
        {
            dialogue.Speakers.AddRange(new[] { "Sbaak", "Echo" });
        }
        dialogue.Lines = dialogue.Lines
            .Where(line => !string.IsNullOrWhiteSpace(line.Text))
            .Select(line => new DialogueLine
            {
                Speaker = line.Speaker?.Trim() ?? "",
                Text = line.Text.Trim(),
                RandomGroupId = string.IsNullOrWhiteSpace(line.RandomGroupId)
                    ? null
                    : line.RandomGroupId.Trim(),
                Weight = line.Weight,
            })
            .ToList();
        NormalizeDialogueRandomGroups(dialogue.Lines);
    }

    private static void NormalizeDialogueRandomGroups(List<DialogueLine> lines)
    {
        foreach (var line in lines)
        {
            line.Speaker = line.Speaker?.Trim() ?? "";
            line.Text = string.IsNullOrWhiteSpace(line.Text) ? "..." : line.Text.Trim();
            line.RandomGroupId = string.IsNullOrWhiteSpace(line.RandomGroupId)
                ? null
                : line.RandomGroupId.Trim();
            line.Weight = line.RandomGroupId is null
                ? null
                : Math.Clamp(line.Weight ?? 1, 1, 999);
        }

        var validGroups = lines
            .Where(line => line.RandomGroupId is not null)
            .GroupBy(line => line.RandomGroupId!, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() >= 2)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Where(line =>
                     line.RandomGroupId is not null &&
                     !validGroups.Contains(line.RandomGroupId)))
        {
            line.RandomGroupId = null;
            line.Weight = null;
        }
    }
}

public static class ProjectPaths
{
    public static string? FindProjectRoot(string startPath)
    {
        var directory = new DirectoryInfo(startPath);
        while (directory is not null)
        {
            if (
                File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                Directory.Exists(Path.Combine(directory.FullName, "public", "maps")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        var currentDirectory = Environment.CurrentDirectory;
        if (
            File.Exists(Path.Combine(currentDirectory, "package.json")) &&
            Directory.Exists(Path.Combine(currentDirectory, "public", "maps")))
        {
            return currentDirectory;
        }

        return null;
    }
}
