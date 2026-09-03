using Echoes.MapEditor;

namespace Echoes.ChapterScriptEditor;

public sealed class ChapterScriptDocument
{
    public int SchemaVersion { get; set; } = 4;
    public List<ChapterDefinition> Chapters { get; set; } = new();
}

public sealed class ChapterDefinition
{
    public string Id { get; set; } = "";
    public string TabName { get; set; } = "新章節";
    public string Title { get; set; } = "";
    public int ChapterNumber { get; set; }
    public List<SubtitleEventDefinition> SubtitleEvents { get; set; } = new();
    public List<DialogueSectionDefinition> DialogueSections { get; set; } = new();
    public List<DialogueSectionDefinition> StoryTriggerDialogues { get; set; } = new();
}

public sealed class SubtitleEventDefinition
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "黑幕字幕";
    public string Text { get; set; } = "";
    public List<SubtitleLineDefinition> Lines { get; set; } = new();
    public string TriggerType { get; set; } = "chapterStart";
    public string TriggerValue { get; set; } = "";
    public int TriggerCount { get; set; } = 1;
    public int DelayBeforeMs { get; set; } = 2000;
    public int FadeInMs { get; set; } = 1500;
    public int HoldMs { get; set; } = 8000;
    public int FadeOutMs { get; set; } = 1500;
    public int DelayAfterMs { get; set; } = 2000;
    public bool KeepBlack { get; set; }
    public bool LockInput { get; set; } = true;
    public string ChapterStartTimeMode { get; set; } = ChapterStartTimeModeItem.Inherit;
    public int ChapterStartElapsedMinutes { get; set; }
    public int ChapterStartClockMinuteOfDay { get; set; } = 6 * 60;
}

public sealed class SubtitleLineDefinition
{
    public string Text { get; set; } = "";
    public int FontSizePx { get; set; } = 34;
}

public sealed class DialogueSectionDefinition
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "新對話段落";
    public DialogueScript Dialogue { get; set; } = DialogueScript.CreateDefault();
}

public sealed record TriggerTypeItem(string Id, string Label)
{
    public override string ToString() => Label;

    public static readonly IReadOnlyList<TriggerTypeItem> All = new TriggerTypeItem[]
    {
        new("chapterStart", "章節開始時"),
        new("afterDialogue", "指定對話結束後"),
        new("storyEvent", "收到劇情事件時"),
        new("elapsedDays", "經過指定遊戲日數"),
        new("manual", "由程式或其他系統手動觸發"),
    };
}

public sealed record ChapterStartTimeModeItem(string Id, string Label)
{
    public const string Inherit = "inherit";
    public const string Elapsed = "elapsed";
    public const string Clock = "clock";

    public override string ToString() => Label;

    public static readonly IReadOnlyList<ChapterStartTimeModeItem> All =
        new ChapterStartTimeModeItem[]
        {
            new(Inherit, "延續上一章時間"),
            new(Elapsed, "距離上一章結束後經過"),
            new(Clock, "直接推進至指定時刻"),
        };
}
