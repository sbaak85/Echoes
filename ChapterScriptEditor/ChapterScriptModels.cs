using Echoes.MapEditor;

namespace Echoes.ChapterScriptEditor;

public sealed class ChapterScriptDocument
{
    public int SchemaVersion { get; set; } = 1;
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
}

public sealed class SubtitleEventDefinition
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "黑幕字幕";
    public string Text { get; set; } = "";
    public string TriggerType { get; set; } = "chapterStart";
    public string TriggerValue { get; set; } = "";
    public int TriggerCount { get; set; } = 1;
    public int DelayBeforeMs { get; set; } = 2000;
    public int FadeInMs { get; set; } = 1500;
    public int HoldMs { get; set; } = 8000;
    public int FadeOutMs { get; set; } = 1500;
    public int DelayAfterMs { get; set; } = 2000;
    public bool KeepBlack { get; set; } = true;
    public bool LockInput { get; set; } = true;
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
