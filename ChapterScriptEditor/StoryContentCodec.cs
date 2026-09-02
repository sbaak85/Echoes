using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Text.Encodings.Web;
using Echoes.MapEditor;

namespace Echoes.ChapterScriptEditor;

public static class StoryContentCodec
{
    private const string DataBegin = "/* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN";
    private const string DataEnd = "CHAPTER_SCRIPT_EDITOR_DATA_END */";
    private const string GeneratedBegin = "// CHAPTER_SCRIPT_EDITOR_GENERATED_BEGIN";
    private const string GeneratedEnd = "// CHAPTER_SCRIPT_EDITOR_GENERATED_END";
    private const string LegacyLowerLeftDialogueAnchor =
        "export const LOWER_LEFT_STORY_ZONE_DIALOGUE_ID";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static ChapterScriptDocument Load(string storyContentPath)
    {
        if (!File.Exists(storyContentPath)) return CreateDefault();
        var source = File.ReadAllText(storyContentPath, Encoding.UTF8);
        var encoded = ExtractBetween(source, DataBegin, DataEnd)?.Trim();
        if (string.IsNullOrWhiteSpace(encoded)) return CreateDefault();
        try
        {
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
            var document = JsonSerializer.Deserialize<ChapterScriptDocument>(json, JsonOptions)
                ?? CreateDefault();
            Normalize(document);
            MigrateLegacyStoryTriggerDialogue(document, source);
            return document;
        }
        catch (Exception exception) when (
            exception is FormatException or JsonException or DecoderFallbackException)
        {
            throw new InvalidDataException(
                "story-content.ts 內的章節編輯器資料無法讀取；原始檔案尚未被修改。",
                exception);
        }
    }

    public static string Save(string storyContentPath, ChapterScriptDocument document)
    {
        Validate(document);
        var existingSource = File.Exists(storyContentPath)
            ? File.ReadAllText(storyContentPath, Encoding.UTF8)
            : "";
        var generatedSource = GenerateSource(existingSource, document);
        var directory = Path.GetDirectoryName(storyContentPath)
            ?? throw new InvalidOperationException("找不到 story-content.ts 所在資料夾。");
        Directory.CreateDirectory(directory);

        if (File.Exists(storyContentPath))
        {
            File.Copy(storyContentPath, storyContentPath + ".bak", true);
            var backupDirectory = Path.Combine(directory, "story-content.backups");
            Directory.CreateDirectory(backupDirectory);
            var backupPath = Path.Combine(
                backupDirectory,
                $"story-content_{DateTime.Now:yyyyMMdd_HHmmss_fff}.ts.backup");
            File.Copy(storyContentPath, backupPath, false);
        }

        var temporaryPath = storyContentPath + ".tmp";
        File.WriteAllText(temporaryPath, generatedSource, new UTF8Encoding(false));
        File.Move(temporaryPath, storyContentPath, true);
        return storyContentPath;
    }

    public static string GenerateSource(
        string existingSource,
        ChapterScriptDocument document)
    {
        Validate(document);
        var dataJson = JsonSerializer.Serialize(document, JsonOptions);
        var encodedData = Convert.ToBase64String(Encoding.UTF8.GetBytes(dataJson));
        var preservedTail = ExtractPreservedTail(existingSource);
        var builder = new StringBuilder();
        builder.AppendLine("import type { ChapterFlowDefinition } from \"./chapter-flow-manager\";");
        builder.AppendLine("import type { InteractionDialogueScript } from \"./interaction-flow\";");
        builder.AppendLine();
        builder.AppendLine(DataBegin);
        builder.AppendLine(encodedData);
        builder.AppendLine(DataEnd);
        builder.AppendLine();
        builder.AppendLine(GeneratedBegin);
        AppendGeneratedContent(builder, document);
        builder.AppendLine(GeneratedEnd);
        if (!string.IsNullOrWhiteSpace(preservedTail))
        {
            builder.AppendLine();
            builder.AppendLine(preservedTail.Trim());
        }
        return builder.ToString().Replace("\r\n", "\n");
    }

    public static void Validate(ChapterScriptDocument document)
    {
        Normalize(document);
        if (document.Chapters.Count == 0)
        {
            throw new InvalidDataException("至少需要保留一個章節頁籤。");
        }

        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var chapter in document.Chapters)
        {
            RequireUniqueId(ids, chapter.Id, $"章節「{chapter.TabName}」");
            if (string.IsNullOrWhiteSpace(chapter.TabName))
            {
                throw new InvalidDataException("章節頁籤名稱不可留空。");
            }
            foreach (var subtitle in chapter.SubtitleEvents)
            {
                RequireUniqueId(ids, subtitle.Id, $"黑幕字幕「{subtitle.Name}」");
                if (string.IsNullOrWhiteSpace(subtitle.Text))
                {
                    throw new InvalidDataException($"黑幕字幕「{subtitle.Name}」沒有文字內容。");
                }
                if (subtitle.Lines.Count == 0 ||
                    subtitle.Lines.All(line => string.IsNullOrWhiteSpace(line.Text)))
                {
                    throw new InvalidDataException($"黑幕字幕「{subtitle.Name}」至少需要一句有效文字。");
                }
                if (subtitle.Lines.Any(line => line.FontSizePx is < 8 or > 120))
                {
                    throw new InvalidDataException($"黑幕字幕「{subtitle.Name}」的逐句字級必須介於 8～120 px。");
                }
                if (subtitle.TriggerCount < 1 || subtitle.TriggerCount > 999)
                {
                    throw new InvalidDataException($"黑幕字幕「{subtitle.Name}」的觸發次數必須介於 1 到 999。");
                }
                foreach (var duration in new[]
                {
                    subtitle.DelayBeforeMs,
                    subtitle.FadeInMs,
                    subtitle.HoldMs,
                    subtitle.FadeOutMs,
                    subtitle.DelayAfterMs,
                })
                {
                    if (duration < 0 || duration > 600000)
                    {
                        throw new InvalidDataException($"黑幕字幕「{subtitle.Name}」的時間設定超出 0～600 秒範圍。");
                    }
                }
            }

            foreach (var section in chapter.DialogueSections)
            {
                RequireUniqueId(ids, section.Id, $"對話段落「{section.Name}」");
                if (string.IsNullOrWhiteSpace(section.Name))
                {
                    throw new InvalidDataException("對話段落名稱不可留空。");
                }
                section.Dialogue ??= DialogueScript.CreateDefault();
                section.Dialogue.Speakers ??= new List<string>();
                section.Dialogue.Lines ??= new List<DialogueLine>();
                if (section.Dialogue.Lines.Count == 0 ||
                    section.Dialogue.Lines.All(line => string.IsNullOrWhiteSpace(line.Text)))
                {
                    throw new InvalidDataException($"對話段落「{section.Name}」至少需要一句有效文字。");
                }
            }
            foreach (var section in chapter.StoryTriggerDialogues)
            {
                RequireUniqueId(ids, section.Id, $"劇情多邊形對話「{section.Name}」");
                if (string.IsNullOrWhiteSpace(section.Name))
                {
                    throw new InvalidDataException("劇情多邊形對話名稱不可留空。");
                }
                section.Dialogue ??= DialogueScript.CreateDefault();
                section.Dialogue.Speakers ??= new List<string>();
                section.Dialogue.Lines ??= new List<DialogueLine>();
                if (section.Dialogue.Lines.Count == 0 ||
                    section.Dialogue.Lines.All(line => string.IsNullOrWhiteSpace(line.Text)))
                {
                    throw new InvalidDataException(
                        $"劇情多邊形對話「{section.Name}」至少需要一句有效文字。");
                }
            }
        }
    }

    public static ChapterScriptDocument CreateDefault()
    {
        return new ChapterScriptDocument
        {
            Chapters = new List<ChapterDefinition>
            {
                new()
                {
                    Id = "prologue",
                    TabName = "序章",
                    Title = "",
                    ChapterNumber = 0,
                },
                new()
                {
                    Id = "chapter02",
                    TabName = "第二章",
                    Title = "",
                    ChapterNumber = 2,
                },
                new()
                {
                    Id = "chapter03",
                    TabName = "第三章",
                    Title = "存活的準備",
                    ChapterNumber = 3,
                    SubtitleEvents = new List<SubtitleEventDefinition>
                    {
                        new()
                        {
                            Id = "chapter03-Open",
                            Name = "第三章開場",
                            Text = "第三章\r\nChapter.3",
                            Lines = new List<SubtitleLineDefinition>
                            {
                                new() { Text = "第三章\r\nChapter.3", FontSizePx = 38 },
                            },
                            TriggerType = "chapterStart",
                            TriggerCount = 1,
                            FadeInMs = 1000,
                            HoldMs = 2000,
                            FadeOutMs = 2000,
                            DelayAfterMs = 500,
                            KeepBlack = true,
                            LockInput = true,
                        },
                        new()
                        {
                            Id = "chapter03-opening-card",
                            Name = "第三章開場字幕",
                            Text =
                                "時間：墜落後第3天，清晨\r\n" +
                                "地點：飛船殘骸旁的臨時營地\r\n" +
                                "前提：身體與精神狀態尚未恢復，現有補給即將耗盡，必須開始尋找穩定的食物與資源，同時加固營地並檢修電腦與通訊設備。",
                            TriggerType = "chapterStart",
                            TriggerCount = 1,
                            DelayBeforeMs = 2000,
                            FadeInMs = 1500,
                            HoldMs = 8000,
                            FadeOutMs = 1500,
                            DelayAfterMs = 2000,
                            KeepBlack = true,
                            LockInput = true,
                        },
                    },
                    DialogueSections = new List<DialogueSectionDefinition>
                    {
                        new()
                        {
                            Id = "chapter03-start",
                            Name = "第三章_Start",
                            Dialogue = new DialogueScript
                            {
                                CharacterDelaySeconds = 0.02f,
                                Speakers = new List<string> { "Sbaak", "???", "飛船輔助系統" },
                                Lines = new List<DialogueLine>
                                {
                                    new() { Speaker = "", Text = "船艙內傳來了機械啟動的喀噠聲，混著風躦進空隙的聲音..." },
                                    new() { Speaker = "", Text = "低微的電流雜音與金屬板鬆動不時碰撞的聲響。" },
                                    new() { Speaker = "???", Text = "......" },
                                    new() { Speaker = "飛船輔助系統", Text = "事故後時間……五十八小時，二十一分鐘。" },
                                    new() { Speaker = "飛船輔助系統", Text = "生命狀態評估：輕度脫水、睡眠不足，\n右側肋部挫傷尚未恢復。" },
                                    new() { Speaker = "Sbaak", Text = "我感覺得到。（身體的每個地方都在提醒我。）" },
                                    new() { Speaker = "飛船輔助系統", Text = "建議繼續休息。" },
                                    new() { Speaker = "Sbaak", Text = "食物只剩兩份，水也撐不到明天。\n（我不由開始擔心起來……）" },
                                    new() { Speaker = "Sbaak", Text = "再躺下去，情況不會自己變好。" },
                                },
                            },
                        },
                    },
                    StoryTriggerDialogues = new List<DialogueSectionDefinition>
                    {
                        CreateLegacyLowerLeftStoryTriggerDialogue(),
                    },
                },
            },
        };
    }

    private static void AppendGeneratedContent(
        StringBuilder builder,
        ChapterScriptDocument document)
    {
        var chaptersJson = JsonSerializer.Serialize(document.Chapters, JsonOptions);
        builder.AppendLine("export const STORY_CHAPTERS =");
        builder.Append(chaptersJson);
        builder.AppendLine(" as const;");
        builder.AppendLine();
        builder.AppendLine("export const STORY_DIALOGUES: Record<string, InteractionDialogueScript> = {");
        foreach (var section in document.Chapters.SelectMany(chapter =>
                     chapter.DialogueSections.Concat(chapter.StoryTriggerDialogues)))
        {
            builder.Append("  ");
            builder.Append(ToTsString(section.Id));
            builder.Append(": ");
            builder.Append(JsonSerializer.Serialize(section.Dialogue, JsonOptions));
            builder.AppendLine(",");
        }
        builder.AppendLine("};");
        builder.AppendLine();

        var chapterThree = document.Chapters.FirstOrDefault(chapter => chapter.ChapterNumber == 3)
            ?? document.Chapters.FirstOrDefault(chapter => chapter.Id.Equals("chapter03", StringComparison.OrdinalIgnoreCase));
        var startSection = chapterThree?.DialogueSections.FirstOrDefault(section =>
                section.Id.Contains("start", StringComparison.OrdinalIgnoreCase) ||
                section.Name.Contains("Start", StringComparison.OrdinalIgnoreCase))
            ?? chapterThree?.DialogueSections.FirstOrDefault();
        var startDialogueId = startSection?.Id ?? "chapter03-start";
        var sectionOne = chapterThree?.DialogueSections.FirstOrDefault(section =>
            section.Id.Equals("chapter03-section-1", StringComparison.OrdinalIgnoreCase) ||
            section.Name.Equals("第三章_Section 1", StringComparison.OrdinalIgnoreCase));

        builder.AppendLine($"export const CHAPTER_3_START_DIALOGUE_ID = {ToTsString(startDialogueId)};");
        if (sectionOne is not null)
        {
            builder.AppendLine(
                $"export const CHAPTER_3_SECTION_1_DIALOGUE_ID = {ToTsString(sectionOne.Id)};");
        }
        builder.AppendLine("export const CHAPTER_3_START_FLOW_ID = \"chapter03-start-flow\";");
        builder.AppendLine("export const CHAPTER_3_START_DIALOGUE: InteractionDialogueScript =");
        builder.AppendLine("  STORY_DIALOGUES[CHAPTER_3_START_DIALOGUE_ID] ?? {");
        builder.AppendLine("    characterDelaySeconds: 0.02,");
        builder.AppendLine("    speakers: [\"Sbaak\"],");
        builder.AppendLine("    lines: [{ speaker: \"Sbaak\", text: \"...\" }],");
        builder.AppendLine("  };");
        builder.AppendLine();
        builder.AppendLine("export const CHAPTER_3_START_FLOW: ChapterFlowDefinition = {");
        builder.AppendLine("  id: CHAPTER_3_START_FLOW_ID,");
        builder.AppendLine("  chapter: 3,");
        builder.AppendLine("  once: true,");
        builder.AppendLine("  actions: [");
        builder.AppendLine("    { type: \"lockInput\" },");
        builder.AppendLine("    { type: \"setBlack\", visible: true },");
        foreach (var subtitle in chapterThree?.SubtitleEvents
                     .Where(item => item.TriggerType.Equals("chapterStart", StringComparison.OrdinalIgnoreCase))
                     .Where(item => item.Id.StartsWith("chapter03-", StringComparison.OrdinalIgnoreCase))
                     .OrderBy(item => item.Id.Equals("chapter03-Open", StringComparison.OrdinalIgnoreCase) ? 0 :
                         item.Id.Equals("chapter03-opening-card", StringComparison.OrdinalIgnoreCase) ? 1 : 2)
                     ?? Enumerable.Empty<SubtitleEventDefinition>())
        {
            if (subtitle.DelayBeforeMs > 0)
            {
                builder.AppendLine($"    {{ type: \"wait\", durationMs: {subtitle.DelayBeforeMs} }},");
            }
            builder.AppendLine("    {");
            builder.AppendLine("      type: \"showCenteredText\",");
            builder.Append("      lines: ");
            builder.Append(JsonSerializer.Serialize(
                subtitle.Lines.Select(line => line.Text).ToArray(),
                JsonOptions));
            builder.AppendLine(",");
            builder.Append("      fontSizesPx: ");
            builder.Append(JsonSerializer.Serialize(
                subtitle.Lines.Select(line => line.FontSizePx).ToArray(),
                JsonOptions));
            builder.AppendLine(",");
            builder.AppendLine($"      fadeInMs: {subtitle.FadeInMs},");
            builder.AppendLine($"      holdMs: {subtitle.HoldMs},");
            builder.AppendLine($"      fadeOutMs: {subtitle.FadeOutMs},");
            if (subtitle.Id.Equals("chapter03-Open", StringComparison.OrdinalIgnoreCase) ||
                subtitle.Id.Equals("chapter03-opening-card", StringComparison.OrdinalIgnoreCase))
            {
                builder.AppendLine("      fadeOnly: true,");
            }
            if (subtitle.Id.Equals("chapter03-opening-card", StringComparison.OrdinalIgnoreCase))
            {
                builder.AppendLine("      holdSkipConfirmAfterMs: 2000,");
            }
            builder.AppendLine("    },");
            if (subtitle.DelayAfterMs > 0)
            {
                builder.AppendLine($"    {{ type: \"wait\", durationMs: {subtitle.DelayAfterMs} }},");
            }
        }
        builder.AppendLine("    { type: \"playDialogue\", dialogueId: CHAPTER_3_START_DIALOGUE_ID },");
        builder.AppendLine("    { type: \"wait\", durationMs: 2000 },");
        builder.AppendLine("    { type: \"fadeFromBlack\", durationMs: 1000 },");
        if (sectionOne is not null)
        {
            builder.AppendLine("    { type: \"lockInput\" },");
            builder.AppendLine("    { type: \"wait\", durationMs: 1000 },");
            builder.AppendLine(
                "    { type: \"playDialogue\", dialogueId: CHAPTER_3_SECTION_1_DIALOGUE_ID },");
            builder.AppendLine(
                "    { type: \"startQuest\", questId: \"QUEST_CH03_MAIN_001\" },");
        }
        builder.AppendLine("    { type: \"unlockInput\" },");
        builder.AppendLine("  ],");
        builder.AppendLine("  skipActions: [");
        builder.AppendLine("    { type: \"setBlack\", visible: true },");
        builder.AppendLine("    { type: \"fadeFromBlack\", durationMs: 1000 },");
        builder.AppendLine("    { type: \"startQuest\", questId: \"QUEST_CH03_MAIN_001\" },");
        builder.AppendLine("    { type: \"unlockInput\" },");
        builder.AppendLine("  ],");
        builder.AppendLine("};");
        builder.AppendLine();
        builder.AppendLine("export const STORY_EVENT_FLOWS: Readonly<Record<string, ChapterFlowDefinition>> = {");
        builder.AppendLine("  [CHAPTER_3_START_FLOW.id]: CHAPTER_3_START_FLOW,");
        builder.AppendLine("};");
    }

    private static void Normalize(ChapterScriptDocument document)
    {
        document.SchemaVersion = 3;
        document.Chapters ??= new List<ChapterDefinition>();
        var dialogueLineIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var chapter in document.Chapters)
        {
            chapter.Id = chapter.Id?.Trim() ?? "";
            chapter.TabName = chapter.TabName?.Trim() ?? "";
            chapter.Title = chapter.Title?.Trim() ?? "";
            chapter.SubtitleEvents ??= new List<SubtitleEventDefinition>();
            chapter.DialogueSections ??= new List<DialogueSectionDefinition>();
            chapter.StoryTriggerDialogues ??= new List<DialogueSectionDefinition>();
            foreach (var subtitle in chapter.SubtitleEvents)
            {
                subtitle.Id = subtitle.Id?.Trim() ?? "";
                subtitle.Name = subtitle.Name?.Trim() ?? "";
                subtitle.TriggerType = TriggerTypeItem.All.Any(item => item.Id == subtitle.TriggerType)
                    ? subtitle.TriggerType
                    : "manual";
                subtitle.TriggerValue ??= "";
                subtitle.Text ??= "";
                subtitle.Lines ??= new List<SubtitleLineDefinition>();
                if (subtitle.Lines.Count == 0)
                {
                    var legacyLines = Regex.Split(
                        subtitle.Text.Replace("\r\n", "\n"),
                        "\n");
                    subtitle.Lines = legacyLines
                        .Select((text, index) => new SubtitleLineDefinition
                        {
                            Text = text,
                            FontSizePx = index == legacyLines.Length - 1 ? 27 : 34,
                        })
                        .ToList();
                }
                foreach (var line in subtitle.Lines)
                {
                    line.Text ??= "";
                    line.FontSizePx = Math.Clamp(line.FontSizePx, 8, 120);
                }
                subtitle.Text = string.Join("\n", subtitle.Lines.Select(line => line.Text));
            }
            foreach (var section in chapter.DialogueSections)
            {
                section.Id = section.Id?.Trim() ?? "";
                section.Name = section.Name?.Trim() ?? "";
                section.Dialogue ??= DialogueScript.CreateDefault();
                NormalizeDialogueLineIds(
                    section.Dialogue,
                    $"{NormalizeLineIdPrefix(section.Id)}-line",
                    dialogueLineIds);
                // Early editor builds incorrectly filled the first blank narration line
                // of Chapter 3 with the first speaker option (Sbaak). Repair that known
                // legacy record once; future blank first lines are preserved normally.
                if (
                    section.Id.Equals("chapter03-start", StringComparison.OrdinalIgnoreCase) &&
                    section.Dialogue.Lines.Count >= 2 &&
                    section.Dialogue.Lines[0].Speaker.Equals(
                        "Sbaak",
                        StringComparison.OrdinalIgnoreCase) &&
                    string.IsNullOrWhiteSpace(section.Dialogue.Lines[1].Speaker) &&
                    section.Dialogue.Lines[0].Text.StartsWith(
                        "船艙內傳來了機械啟動",
                        StringComparison.Ordinal)
                )
                {
                    section.Dialogue.Lines[0].Speaker = "";
                }
            }
            foreach (var section in chapter.StoryTriggerDialogues)
            {
                section.Id = section.Id?.Trim() ?? "";
                section.Name = section.Name?.Trim() ?? "";
                section.Dialogue ??= DialogueScript.CreateDefault();
                NormalizeDialogueLineIds(
                    section.Dialogue,
                    $"{NormalizeLineIdPrefix(section.Id)}-line",
                    dialogueLineIds);
            }
        }
    }

    private static string NormalizeLineIdPrefix(string value)
    {
        var normalized = new string((value ?? "")
            .Where(character => char.IsLetterOrDigit(character) || character is '-' or '_')
            .ToArray());
        return string.IsNullOrWhiteSpace(normalized) ? "dialogue" : normalized;
    }

    private static void NormalizeDialogueLineIds(
        DialogueScript dialogue,
        string prefix,
        HashSet<string> documentLineIds)
    {
        dialogue.Speakers ??= new List<string>();
        dialogue.Lines ??= new List<DialogueLine>();
        var reservedIds = dialogue.Lines
            .Select(line => line.LineId?.Trim() ?? "")
            .Where(id => id.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var sequence = 1;
        foreach (var line in dialogue.Lines)
        {
            line.Speaker ??= "";
            line.Text ??= "";
            var lineId = line.LineId?.Trim() ?? "";
            if (lineId.Length > 0 && documentLineIds.Add(lineId))
            {
                line.LineId = lineId;
                continue;
            }
            string candidate;
            do candidate = $"{prefix}-{sequence++:000}";
            while (reservedIds.Contains(candidate) || documentLineIds.Contains(candidate));
            line.LineId = candidate;
            reservedIds.Add(candidate);
            documentLineIds.Add(candidate);
        }
    }

    private static void MigrateLegacyStoryTriggerDialogue(
        ChapterScriptDocument document,
        string source)
    {
        if (!source.Contains(LegacyLowerLeftDialogueAnchor, StringComparison.Ordinal) ||
            document.Chapters.SelectMany(chapter => chapter.StoryTriggerDialogues).Any(section =>
                section.Id.Equals(
                    "chapter03-lower-left-not-ready",
                    StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        var chapter = document.Chapters.FirstOrDefault(item => item.ChapterNumber == 3)
            ?? document.Chapters.FirstOrDefault(item =>
                item.Id.Equals("chapter03", StringComparison.OrdinalIgnoreCase));
        chapter?.StoryTriggerDialogues.Add(CreateLegacyLowerLeftStoryTriggerDialogue());
    }

    private static DialogueSectionDefinition CreateLegacyLowerLeftStoryTriggerDialogue() => new()
    {
        Id = "chapter03-lower-left-not-ready",
        Name = "第三章_左下劇情區_尚未準備好",
        Dialogue = new DialogueScript
        {
            CharacterDelaySeconds = 0.02f,
            Speakers = new List<string> { "Sbaak" },
            Lines = new List<DialogueLine>
            {
                new() { Speaker = "Sbaak", Text = "現在我還沒準備好。" },
            },
        },
    };

    private static string ExtractPreservedTail(string source)
    {
        var generatedEndIndex = source.IndexOf(GeneratedEnd, StringComparison.Ordinal);
        if (generatedEndIndex >= 0)
        {
            var tail = source[(generatedEndIndex + GeneratedEnd.Length)..].Trim();
            return tail.StartsWith(LegacyLowerLeftDialogueAnchor, StringComparison.Ordinal)
                ? ""
                : tail;
        }
        return "";
    }

    private static string? ExtractBetween(string source, string start, string end)
    {
        var startIndex = source.IndexOf(start, StringComparison.Ordinal);
        if (startIndex < 0) return null;
        startIndex += start.Length;
        var endIndex = source.IndexOf(end, startIndex, StringComparison.Ordinal);
        return endIndex < 0 ? null : source[startIndex..endIndex];
    }

    private static string ToTsString(string value) =>
        JsonSerializer.Serialize(value, JsonOptions);

    private static void RequireUniqueId(HashSet<string> ids, string id, string owner)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            throw new InvalidDataException($"{owner} 的 ID 不可留空。");
        }
        if (!Regex.IsMatch(id, "^[A-Za-z0-9_-]+$"))
        {
            throw new InvalidDataException($"{owner} 的 ID 只能使用英文字母、數字、- 與 _。");
        }
        if (!ids.Add(id))
        {
            throw new InvalidDataException($"ID「{id}」重複，請為每個章節、字幕與對話段落使用不同 ID。");
        }
    }
}
