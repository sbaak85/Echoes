using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Echoes.QuestEditor;

internal static class QuestDataStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static QuestDocument Load(string path)
    {
        if (!File.Exists(path)) return CreateDefault();
        var document = JsonSerializer.Deserialize<QuestDocument>(File.ReadAllText(path, Encoding.UTF8), JsonOptions);
        var result = document ?? CreateDefault();
        NormalizeObjectiveActivation(result);
        return result;
    }

    public static void Save(string path, QuestDocument document)
    {
        NormalizeObjectiveActivation(document);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporaryPath = path + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(document, JsonOptions), new UTF8Encoding(false));
        File.Move(temporaryPath, path, true);
    }

    public static QuestDocument Clone(QuestDocument source) =>
        JsonSerializer.Deserialize<QuestDocument>(JsonSerializer.Serialize(source, JsonOptions), JsonOptions)
        ?? throw new InvalidDataException("無法複製任務資料。");

    public static QuestDocument CreateDefault() => new()
    {
        Chapters = new List<ChapterDefinition>
        {
            new() { Id = "CH03", Name = "存活的準備" },
        },
    };

    private static void NormalizeObjectiveActivation(QuestDocument document)
    {
        foreach (var objective in document.Quests
                     .SelectMany(quest => quest.Stages)
                     .SelectMany(stage => stage.Objectives))
        {
            if (string.IsNullOrWhiteSpace(objective.ActivationEventId) &&
                !string.IsNullOrWhiteSpace(objective.UnlockDialogueId))
            {
                objective.ActivationEventId = objective.UnlockDialogueId.Trim();
                objective.ActivationMode = ObjectiveActivationMode.Event;
            }
            else if (!string.IsNullOrWhiteSpace(objective.ActivationEventId))
            {
                objective.ActivationEventId = objective.ActivationEventId.Trim();
                objective.ActivationMode = ObjectiveActivationMode.Event;
            }

            if (objective.ActivationMode == ObjectiveActivationMode.Event)
            {
                // Mirror the value for older game builds that only knew the dialogue gate field.
                objective.UnlockDialogueId = objective.ActivationEventId;
            }
            else
            {
                objective.ActivationEventId = "";
                objective.UnlockDialogueId = "";
            }
        }
    }
}
