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
    public List<NavMeshRegion> NavMesh { get; set; } = new();
    public List<CollisionShape> Collisions { get; set; } = new();
    public List<SceneInteractable> Interactables { get; set; } = new();
    public List<MovementGuide> MovementGuides { get; set; } = new();
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

public sealed class SceneInteractable
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
    public InteractionItemReward? ItemReward { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionUseRequirement>? UseRequirements { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<InteractionPoint>? InteractionPoints { get; set; }

    // Legacy schema support. Validation migrates this single point into
    // InteractionPoints so all newly saved scenes use the array format.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public InteractionPoint? InteractionPoint { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ScenePoint? InteractionHintPoint { get; set; }

    public float ActivationDistance { get; set; } = 52;
    public DialogueScript Dialogue { get; set; } = DialogueScript.CreateDefault();
    public DialogueScript FailureDialogue { get; set; } = DialogueScript.CreateFailureDefault();

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
}

public sealed class SurvivalEffects
{
    public float Stamina { get; set; }
    public float Hunger { get; set; }
    public float Thirst { get; set; }
    public float Spirit { get; set; }
    public float TimeMinutes { get; set; }

    public SurvivalEffects Clone() => new()
    {
        Stamina = Stamina,
        Hunger = Hunger,
        Thirst = Thirst,
        Spirit = Spirit,
        TimeMinutes = TimeMinutes,
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
    public string ItemId { get; set; } = "";
    public int Quantity { get; set; } = 1;
    public int Chapter { get; set; } = 1;

    public InteractionUseRequirement Clone() => new()
    {
        Kind = Kind,
        ItemId = ItemId,
        Quantity = Quantity,
        Chapter = Chapter,
    };
}

public sealed record ItemCatalogEntry(string Id, string Name)
{
    public override string ToString() => Name;
}

public static class ItemCatalog
{
    public static readonly IReadOnlyList<ItemCatalogEntry> All = new ItemCatalogEntry[]
    {
        new("crystal-shard", "藍色晶體碎片"),
        new("metal-parts", "金屬零件"),
        new("fiber-bundle", "纖維束"),
        new("water-bottle", "淨水瓶"),
        new("emergency-ration", "緊急口糧"),
        new("alien-spore", "外星種子"),
        new("utility-rope", "繩索"),
        new("scanner-parts", "掃描器零件"),
        new("repair-kit", "修理工具"),
        new("tracking-module", "訊號模組"),
        new("time-crystal", "時間定位晶體"),
        new("navigation-data", "飛船導航資料"),
        new("memory-charm", "遺留下的記憶物"),
        new("ancient-plate", "古代符號板"),
        new("medkit", "醫療包"),
        new("lantern", "照明燈"),
        new("battery", "電池組"),
        new("energy-cell", "能量單元"),
        new("metal-scrap", "金屬碎片"),
        new("synthetic-cloth", "合成布料"),
        new("ruin-key", "遺跡鑰匙"),
        new("transistor", "電晶體"),
        new("welding-tool", "銲槍工具"),
    };

    public static ItemCatalogEntry? Find(string? id) =>
        All.FirstOrDefault(item => item.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
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
            Speaker = line.Speaker,
            Text = line.Text,
        }).ToList(),
    };
}

public sealed class DialogueLine
{
    public string Speaker { get; set; } = "";
    public string Text { get; set; } = "...";
}

public sealed class MovementGuide
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Movement guide";
    public List<ScenePoint> Points { get; set; } = new();
    public float Width { get; set; } = 36;
    public bool Bidirectional { get; set; } = true;
}

public sealed class SceneConnection
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Scene connection";
    public string Type { get; set; } = "exit";
    public List<ScenePoint> Area { get; set; } = new();
    public string TargetSceneId { get; set; } = "";
    public PlayerSpawn TargetSpawn { get; set; } = new();
    public WorldLayout TargetRelativePosition { get; set; } = new();
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

        foreach (var interactable in document.Interactables)
        {
            if (interactable.Points.Count < 3)
            {
                throw new InvalidDataException($"互動多邊形 {interactable.Id} 至少需要 3 個 Node。");
            }

            interactable.NormalizeInteractionPoints();
            interactable.SurvivalRequirements ??= new SurvivalRequirements();
            interactable.SurvivalEffects ??= new SurvivalEffects();
            NormalizeRequirement(interactable.SurvivalRequirements.Stamina);
            NormalizeRequirement(interactable.SurvivalRequirements.Hunger);
            NormalizeRequirement(interactable.SurvivalRequirements.Thirst);
            NormalizeRequirement(interactable.SurvivalRequirements.Spirit);
            interactable.SurvivalEffects.TimeMinutes = Math.Clamp(
                interactable.SurvivalEffects.TimeMinutes,
                0,
                7 * 24 * 60);
            interactable.DailyInteractionLimit = interactable.DailyInteractionLimit is null
                ? null
                : Math.Clamp(interactable.DailyInteractionLimit.Value, 1, 10);
            if (interactable.ItemReward is not null)
            {
                if (ItemCatalog.Find(interactable.ItemReward.ItemId) is null)
                {
                    throw new InvalidDataException(
                        $"互動多邊形 {interactable.Id} 設定了未知道具 {interactable.ItemReward.ItemId}。");
                }
                interactable.ItemReward.Quantity = Math.Clamp(
                    interactable.ItemReward.Quantity,
                    1,
                    99);
                interactable.ItemReward.Delivery =
                    interactable.ItemReward.Delivery.Equals(
                        "world",
                        StringComparison.OrdinalIgnoreCase)
                        ? "world"
                        : "inventory";
            }
            if (interactable.UseRequirements is { Count: > 0 })
            {
                foreach (var requirement in interactable.UseRequirements)
                {
                    requirement.Kind = requirement.Kind.Equals(
                        "chapter",
                        StringComparison.OrdinalIgnoreCase)
                        ? "chapter"
                        : "item";
                    if (requirement.Kind == "chapter")
                    {
                        requirement.ItemId = "";
                        requirement.Chapter = Math.Clamp(requirement.Chapter, 1, 99);
                        requirement.Quantity = 1;
                        continue;
                    }
                    if (ItemCatalog.Find(requirement.ItemId) is null)
                    {
                        throw new InvalidDataException(
                            $"互動多邊形 {interactable.Id} 設定了未知需求道具 {requirement.ItemId}。");
                    }
                    requirement.Quantity = Math.Clamp(requirement.Quantity, 1, 99);
                    requirement.Chapter = 1;
                }
            }
            else
            {
                interactable.UseRequirements = null;
            }
            interactable.Dialogue ??= DialogueScript.CreateDefault();
            interactable.FailureDialogue ??= DialogueScript.CreateFailureDefault();
            NormalizeDialogue(interactable.Dialogue, "...");
            NormalizeDialogue(interactable.FailureDialogue, "目前無法使用。");
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
    }

    private static void NormalizeRequirement(SurvivalRequirementRule? rule)
    {
        if (rule is null) return;
        rule.Comparison = rule.Comparison.Equals("below", StringComparison.OrdinalIgnoreCase)
            ? "below"
            : "atLeast";
        rule.Value = Math.Clamp(rule.Value, 0, 100);
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
        else if (string.IsNullOrWhiteSpace(dialogue.Lines[0].Speaker))
        {
            dialogue.Lines[0].Speaker = dialogue.Speakers[0];
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
