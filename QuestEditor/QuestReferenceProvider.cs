using System.Text.Json;
using System.Text.RegularExpressions;

namespace Echoes.QuestEditor;

public sealed record QuestReference(string Id, string Name)
{
    public override string ToString() => string.IsNullOrWhiteSpace(Name) ? Id : $"{Id}　{Name}";
}

internal sealed class QuestReferenceCatalog
{
    private readonly Dictionary<string, List<QuestReference>> _entries = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<QuestReference> Get(string kind) =>
        _entries.TryGetValue(kind, out var values) ? values : Array.Empty<QuestReference>();

    public bool Contains(string kind, string id) =>
        Get(kind).Any(entry => entry.Id.Equals(id, StringComparison.OrdinalIgnoreCase));

    public void Add(string kind, string id, string? name = null)
    {
        if (string.IsNullOrWhiteSpace(id)) return;
        if (!_entries.TryGetValue(kind, out var values)) _entries[kind] = values = new();
        if (values.Any(entry => entry.Id.Equals(id, StringComparison.OrdinalIgnoreCase))) return;
        values.Add(new QuestReference(id, name ?? ""));
    }

    public void Sort()
    {
        foreach (var values in _entries.Values)
            values.Sort((left, right) => StringComparer.OrdinalIgnoreCase.Compare(left.Id, right.Id));
    }
}

internal static class QuestReferenceProvider
{
    public static QuestReferenceCatalog Load(string projectRoot)
    {
        var catalog = new QuestReferenceCatalog();
        LoadItems(projectRoot, catalog);
        LoadScenes(projectRoot, catalog);
        LoadInteractionPuzzles(projectRoot, catalog);
        LoadStoryContent(projectRoot, catalog);
        LoadPlantPuzzle(projectRoot, catalog);
        LoadScriptActivatedObjectives(projectRoot, catalog);
        catalog.Add("HintIcon", "main", "主要任務");
        catalog.Add("HintIcon", "interaction", "互動");
        catalog.Add("HintIcon", "collect", "收集");
        catalog.Add("HintIcon", "area", "區域");
        foreach (var entry in QuestInterfaceRegistry.All)
            catalog.Add("Interface", entry.Id, entry.Label);
        catalog.Sort();
        return catalog;
    }

    private static void LoadInteractionPuzzles(string root, QuestReferenceCatalog catalog)
    {
        // These puzzles emit puzzleCompleted using their entrance Interaction ID.
        // Read the runtime constants so the picker and validator share the actual IDs.
        var definitions = new[]
        {
            (File: "power-routing-puzzle.ts", Constant: "POWER_ROUTING_INTERACTION_ID", Name: "電力路由解謎"),
            (File: "movement-lab.tsx", Constant: "WELDING_ROUTE_INTERACTION_ID", Name: "焊接解謎"),
            (File: "movement-lab.tsx", Constant: "FREQUENCY_CALIBRATION_INTERACTION_ID", Name: "調頻解謎"),
        };
        foreach (var group in definitions.GroupBy(definition => definition.File))
        {
            var path = Path.Combine(root, "app", group.Key);
            if (!File.Exists(path)) continue;
            var source = File.ReadAllText(path);
            foreach (var definition in group)
            {
                var match = Regex.Match(source,
                    @"\b" + Regex.Escape(definition.Constant) + "\\s*=\\s*\"(?<id>[^\"]+)\"",
                    RegexOptions.CultureInvariant);
                if (!match.Success) continue;
                var id = match.Groups["id"].Value;
                // A missing map entrance must still be reported as an invalid target.
                if (catalog.Contains("Interaction", id)) catalog.Add("Puzzle", id, definition.Name);
            }
        }
    }

    /// <summary>Kind for OBJ IDs that game code or map trigger zones activate directly.</summary>
    public const string ScriptActivatedObjective = "ScriptActivatedObjective";

    private static readonly Regex ObjectiveIdPattern = new("_OBJ_\\d+$", RegexOptions.CultureInvariant);

    /// <summary>
    /// Finds OBJ IDs that the game activates from code (chapter flows' "activateObjective"
    /// actions, direct activateObjective(...) calls). Such objectives legitimately use
    /// "event" activation without an activation event ID in quest-data.json.
    /// </summary>
    private static void LoadScriptActivatedObjectives(string root, QuestReferenceCatalog catalog)
    {
        var appDirectory = Path.Combine(root, "app");
        if (!Directory.Exists(appDirectory)) return;
        var files = Directory.EnumerateFiles(appDirectory, "*.ts", SearchOption.TopDirectoryOnly)
            .Concat(Directory.EnumerateFiles(appDirectory, "*.tsx", SearchOption.TopDirectoryOnly));
        foreach (var path in files)
        {
            var source = File.ReadAllText(path);
            if (!source.Contains("activateObjective", StringComparison.Ordinal)) continue;
            var arguments = new List<string>();
            // manager.activateObjective(ID_OR_CONSTANT, …)
            foreach (Match match in Regex.Matches(source, "activateObjective\\(\\s*(?<arg>\"[^\"]+\"|[A-Z][A-Z0-9_]*)"))
                arguments.Add(match.Groups["arg"].Value);
            // { type: "activateObjective", objectiveId: ID_OR_CONSTANT }
            foreach (Match match in Regex.Matches(source,
                         "\"activateObjective\"[^}]{0,120}?objectiveId\\s*:\\s*(?<arg>\"[^\"]+\"|[A-Z][A-Z0-9_]*)"))
                arguments.Add(match.Groups["arg"].Value);
            // ARRAY_CONSTANT.map(id => ({ type: "activateObjective", … }))
            foreach (Match match in Regex.Matches(source,
                         "(?<array>[A-Z][A-Z0-9_]*)\\.map\\([^)]*\\)\\s*=>\\s*\\(\\{\\s*type\\s*:\\s*\"activateObjective\""))
            {
                var array = Regex.Match(source, "\\b" + match.Groups["array"].Value + "\\s*=\\s*\\[(?<body>[^\\]]*)\\]");
                if (!array.Success) continue;
                foreach (Match item in Regex.Matches(array.Groups["body"].Value, "\"(?<id>[^\"]+)\""))
                    arguments.Add($"\"{item.Groups["id"].Value}\"");
            }

            foreach (var argument in arguments)
            {
                var id = argument.StartsWith('"')
                    ? argument.Trim('"')
                    : Regex.Match(source, "\\b" + argument + "\\s*=\\s*\"(?<id>[^\"]+)\"").Groups["id"].Value;
                if (ObjectiveIdPattern.IsMatch(id))
                    catalog.Add(ScriptActivatedObjective, id, $"由 {Path.GetFileName(path)} 啟用");
            }
        }
    }

    private static void LoadPlantPuzzle(string root, QuestReferenceCatalog catalog)
    {
        // The shared L/R puzzle has one runtime identity, independent of its entrance Interaction.
        var path = Path.Combine(root, "app", "phototropic-puzzle.ts");
        if (!File.Exists(path)) return;
        var match = Regex.Match(File.ReadAllText(path), "PLANT_PUZZLE_ID\\s*=\\s*\"(?<id>[^\"]+)\"",
            RegexOptions.CultureInvariant);
        if (match.Success) catalog.Add("Puzzle", match.Groups["id"].Value, "植物解謎系統");
    }

    private static void LoadItems(string root, QuestReferenceCatalog catalog)
    {
        var path = Path.Combine(root, "app", "item-database.ts");
        if (!File.Exists(path)) return;
        var source = File.ReadAllText(path);
        foreach (Match match in Regex.Matches(source,
                     "item\\s*:\\s*\\{\\s*id\\s*:\\s*\"(?<id>[^\"]+)\"[\\s\\S]*?name\\s*:\\s*\"(?<name>[^\"]+)\"",
                     RegexOptions.CultureInvariant))
            catalog.Add("Item", match.Groups["id"].Value, match.Groups["name"].Value);
    }

    private static void LoadScenes(string root, QuestReferenceCatalog catalog)
    {
        var directory = Path.Combine(root, "public", "maps");
        if (!Directory.Exists(directory)) return;
        foreach (var path in Directory.EnumerateFiles(directory, "*.scene.json"))
        {
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                var rootElement = document.RootElement;
                var sceneId = rootElement.TryGetProperty("sceneId", out var sceneIdElement)
                    ? sceneIdElement.GetString() ?? "" : "";
                catalog.Add("Scene", sceneId, Path.GetFileNameWithoutExtension(path));
                if (sceneId.Length > 0)
                    AddArray(rootElement, "connections", $"SceneConnection:{sceneId}", catalog);
                AddArray(rootElement, "interactables", "Interaction", catalog);
                AddArray(rootElement, "storyTriggers", "Area", catalog);
                AddArray(rootElement, "storyTriggers", "StoryTrigger", catalog);
                AddTriggerActivatedObjectives(rootElement, catalog);
                AddArray(rootElement, "itemPoints", "WorldObject", catalog);
                AddArray(rootElement, "teleportPoints", "TeleportPoint", catalog);
                AddArray(rootElement, "collisions", "WorldObject", catalog);
            }
            catch (JsonException)
            {
                // Validation panel reports quest data issues; a malformed scene
                // should not prevent the independent editor from opening.
            }
        }
    }

    // Story trigger zones may unlock OBJs directly through "activateObjectiveIds".
    private static void AddTriggerActivatedObjectives(JsonElement root, QuestReferenceCatalog catalog)
    {
        if (!root.TryGetProperty("storyTriggers", out var triggers) || triggers.ValueKind != JsonValueKind.Array) return;
        foreach (var trigger in triggers.EnumerateArray())
        {
            if (!trigger.TryGetProperty("activateObjectiveIds", out var ids) || ids.ValueKind != JsonValueKind.Array) continue;
            var triggerId = trigger.TryGetProperty("id", out var idElement) ? idElement.GetString() : "";
            foreach (var id in ids.EnumerateArray())
                if (id.ValueKind == JsonValueKind.String)
                    catalog.Add(ScriptActivatedObjective, id.GetString() ?? "", $"由劇情觸發區 {triggerId} 啟用");
        }
    }

    private static void AddArray(JsonElement root, string property, string kind, QuestReferenceCatalog catalog)
    {
        if (!root.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array) return;
        foreach (var value in values.EnumerateArray())
        {
            if (!value.TryGetProperty("id", out var idElement)) continue;
            var id = idElement.GetString() ?? "";
            var name = value.TryGetProperty("label", out var label) ? label.GetString() : id;
            catalog.Add(kind, id, name);
        }
    }

    private static void LoadStoryContent(string root, QuestReferenceCatalog catalog)
    {
        var path = Path.Combine(root, "app", "story-content.ts");
        if (!File.Exists(path)) return;
        var source = File.ReadAllText(path);
        foreach (Match match in Regex.Matches(source, "(?<name>[A-Z0-9_]+)_DIALOGUE_ID\\s*=\\s*\"(?<id>[^\"]+)\""))
            catalog.Add("Dialogue", match.Groups["id"].Value, match.Groups["name"].Value);
        foreach (Match match in Regex.Matches(source, "\"(?<id>chapter[^\"]+)\"\\s*:\\s*\\{"))
            catalog.Add("Dialogue", match.Groups["id"].Value, "章節對話");
        foreach (Match match in Regex.Matches(source, "(?<name>[A-Z0-9_]+)_FLOW_ID\\s*=\\s*\"(?<id>[^\"]+)\""))
            catalog.Add("EventFlow", match.Groups["id"].Value, match.Groups["name"].Value);
        foreach (Match match in Regex.Matches(source, "\"id\"\\s*:\\s*\"(?<id>chapter[^\"]+)\"\\s*,\\s*\"tabName\"\\s*:\\s*\"(?<name>[^\"]+)\""))
            catalog.Add("Chapter", match.Groups["id"].Value, match.Groups["name"].Value);
    }
}
