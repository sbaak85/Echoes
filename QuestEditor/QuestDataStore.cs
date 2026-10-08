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
        QuestDocument? document;
        try
        {
            document = JsonSerializer.Deserialize<QuestDocument>(File.ReadAllText(path, Encoding.UTF8), JsonOptions);
        }
        catch (JsonException exception)
        {
            // Point at the broken spot instead of a raw serializer stack message.
            var where = exception.LineNumber is { } line
                ? $"第 {line + 1} 行、第 {(exception.BytePositionInLine ?? 0) + 1} 個字元附近"
                : "未知位置";
            throw new InvalidDataException(
                $"無法讀取任務資料：{Path.GetFileName(path)} 的 JSON 格式有誤（{where}）。\n\n" +
                $"可能是手動或其他工具修改時少了逗號、引號或括號，或欄位值的型別不符。\n" +
                $"請修正該位置後再開啟；原始檔案沒有被變更。\n\n詳細訊息：{exception.Message}",
                exception);
        }
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
            if (objective.ActivationMode is ObjectiveActivationMode.ObjectiveActivated or
                ObjectiveActivationMode.ObjectiveCompleted or
                ObjectiveActivationMode.DialogueStarted or ObjectiveActivationMode.DialogueCompleted)
            {
                objective.ActivationEventId = objective.ActivationEventId.Trim();
                // Explicit trigger modes must not inherit the legacy immediate dialogue gate.
                objective.UnlockDialogueId = "";
                continue;
            }
            if (string.IsNullOrWhiteSpace(objective.ActivationEventId) &&
                !string.IsNullOrWhiteSpace(objective.UnlockDialogueId))
            {
                objective.ActivationEventId = objective.UnlockDialogueId.Trim();
                if (objective.ActivationMode == ObjectiveActivationMode.Immediate)
                    objective.ActivationMode = ObjectiveActivationMode.Event;
            }
            else if (!string.IsNullOrWhiteSpace(objective.ActivationEventId))
            {
                objective.ActivationEventId = objective.ActivationEventId.Trim();
                if (objective.ActivationMode == ObjectiveActivationMode.Immediate)
                    objective.ActivationMode = ObjectiveActivationMode.Event;
            }

            if (objective.ActivationMode == ObjectiveActivationMode.Event)
            {
                // Mirror the value for older game builds that only knew the dialogue gate field.
                objective.UnlockDialogueId = objective.ActivationEventId;
            }
            else if (objective.ActivationMode == ObjectiveActivationMode.Immediate)
            {
                objective.ActivationEventId = "";
                objective.UnlockDialogueId = "";
            }
        }
    }
}
