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
        LoadStoryContent(projectRoot, catalog);
        catalog.Add("HintIcon", "main", "主要任務");
        catalog.Add("HintIcon", "interaction", "互動");
        catalog.Add("HintIcon", "collect", "收集");
        catalog.Add("HintIcon", "area", "區域");
        catalog.Add("Interface", "Inventory", "背包");
        catalog.Add("Interface", "Options", "選項");
        catalog.Sort();
        return catalog;
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
                AddArray(rootElement, "interactables", "Interaction", catalog);
                AddArray(rootElement, "storyTriggers", "Area", catalog);
                AddArray(rootElement, "itemPoints", "WorldObject", catalog);
                AddArray(rootElement, "collisions", "WorldObject", catalog);
            }
            catch (JsonException)
            {
                // Validation panel reports quest data issues; a malformed scene
                // should not prevent the independent editor from opening.
            }
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
        foreach (Match match in Regex.Matches(source, "(?<name>[A-Z0-9_]+)_FLOW_ID\\s*=\\s*\"(?<id>[^\"]+)\""))
            catalog.Add("EventFlow", match.Groups["id"].Value, match.Groups["name"].Value);
        foreach (Match match in Regex.Matches(source, "\"id\"\\s*:\\s*\"(?<id>chapter[^\"]+)\"\\s*,\\s*\"tabName\"\\s*:\\s*\"(?<name>[^\"]+)\""))
            catalog.Add("Chapter", match.Groups["id"].Value, match.Groups["name"].Value);
    }
}
