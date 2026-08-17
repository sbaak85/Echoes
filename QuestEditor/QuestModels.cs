using System.ComponentModel;
using System.Globalization;
using System.Reflection;
using System.Text.Json.Serialization;

namespace Echoes.QuestEditor;

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum QuestState
{
    [Description("鎖定")] Locked,
    [Description("可承接")] Available,
    [Description("進行中")] Active,
    [Description("已完成")] Completed,
    [Description("已失敗")] Failed,
    [Description("已放棄")] Abandoned,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum QuestType
{
    [Description("主線任務")] Main,
    [Description("支線任務")] Side,
    [Description("長期主線任務")] LongTermMain,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum QuestGrantMethod
{
    [Description("自動派發")] Automatic,
    [Description("互動派發")] Interaction,
    [Description("對話結束後派發")] AfterDialogue,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum QuestCompletionTriggerType
{
    [Description("無")] None,
    [Description("播放對話")] Dialogue,
    [Description("執行事件流程")] EventFlow,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum QuestDisplayMode
{
    [Description("標準")] Standard,
    [Description("主線進度")] MainProgress,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum StageCompletionMode
{
    [Description("全部目標完成")] All,
    [Description("任一目標完成")] Any,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum ObjectiveActivationMode
{
    [Description("立即啟用")] Immediate,
    [Description("事件啟用")] Event,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum ObjectiveType
{
    [Description("收集道具")] CollectItem,
    [Description("複合道具收集")] CompoundCollectItem,
    [Description("持有道具")] HaveItem,
    [Description("開啟介面")] InterfaceOpened,
    [Description("使用道具")] ItemUsed,
    [Description("開始互動")] InteractionStarted,
    [Description("互動成功")] InteractionSucceeded,
    [Description("進入區域")] EnterArea,
    [Description("完成解謎")] PuzzleCompleted,
    [Description("完成對話")] DialogueCompleted,
    [Description("場景物件達到指定狀態")] ObjectStateReached,
    [Description("到達指定日期或時間")] DayOrTimeReached,
    [Description("旗標條件成立")] FlagCondition,
    [Description("自訂進度")] CustomProgress,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum ObjectiveCountMode
{
    [Description("累計取得")] Accumulated,
    [Description("目前持有量")] CurrentInventory,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum InteractionObjectiveMode
{
    [Description("互動開始")] Started,
    [Description("互動成功")] Succeeded,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum CompletionInterfaceAction
{
    [Description("無")] None,
    [Description("開啟")] Open,
    [Description("關閉")] Close,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum FailureMode
{
    [Description("永久失敗")] Permanent,
    [Description("重新開始任務")] RestartQuest,
}

public sealed class LocalizedEnumConverter : EnumConverter
{
    public LocalizedEnumConverter(Type type) : base(type) { }

    public override object? ConvertTo(
        ITypeDescriptorContext? context,
        CultureInfo? culture,
        object? value,
        Type destinationType)
    {
        if (destinationType == typeof(string) && value is not null)
            return GetDisplayName(value);
        return base.ConvertTo(context, culture, value, destinationType);
    }

    public override object? ConvertFrom(
        ITypeDescriptorContext? context,
        CultureInfo? culture,
        object value)
    {
        if (value is string text)
        {
            foreach (var enumValue in Enum.GetValues(EnumType))
            {
                if (string.Equals(GetDisplayName(enumValue), text, StringComparison.Ordinal))
                    return enumValue;
            }
        }
        return base.ConvertFrom(context, culture, value);
    }

    private string GetDisplayName(object value)
    {
        var memberName = Enum.GetName(EnumType, value);
        if (memberName is null) return value.ToString() ?? "";
        return EnumType.GetField(memberName)?.GetCustomAttribute<DescriptionAttribute>()?.Description ?? memberName;
    }
}

public sealed record QuestInterfaceEntry(string Id, string Label);

public static class QuestInterfaceRegistry
{
    public static readonly IReadOnlyList<QuestInterfaceEntry> All = new[]
    {
        new QuestInterfaceEntry("Inventory", "背包"),
        new QuestInterfaceEntry("Options", "選項"),
    };
}

public sealed class RegisteredInterfaceIdConverter : StringConverter
{
    public override bool GetStandardValuesSupported(ITypeDescriptorContext? context) => true;
    public override bool GetStandardValuesExclusive(ITypeDescriptorContext? context) => true;

    public override StandardValuesCollection GetStandardValues(ITypeDescriptorContext? context) =>
        new(QuestInterfaceRegistry.All.Select(entry => entry.Id).ToArray());
}

public sealed class QuestItemRequirement
{
    [DisplayName("道具 ID")]
    public string ItemId { get; set; } = "R0001";

    [DisplayName("需求數量")]
    public int RequiredAmount { get; set; } = 1;

    public override string ToString() => $"{ItemId} ×{RequiredAmount}";
}

public sealed class QuestDocument
{
    public int SchemaVersion { get; set; } = 1;
    public List<ChapterDefinition> Chapters { get; set; } = new();
    public List<QuestDefinition> Quests { get; set; } = new();
}

public sealed class ChapterDefinition
{
    [Category("基本"), DisplayName("章節 ID")]
    public string Id { get; set; } = "CH01";

    [Category("基本"), DisplayName("章節名稱")]
    public string Name { get; set; } = "新章節";

    [Category("流程"), DisplayName("開始條件")]
    public string StartCondition { get; set; } = "";

    [Category("流程"), DisplayName("開場事件流程 ID")]
    public string OpeningEventFlowId { get; set; } = "";

    [Category("流程"), DisplayName("完成所需任務 ID")]
    [Description("可在集合編輯器內加入本章必須完成的主線任務 ID。")]
    public List<string> CompletionQuestIds { get; set; } = new();

    [Category("流程"), DisplayName("結尾事件流程 ID")]
    public string EndingEventFlowId { get; set; } = "";

    [Category("流程"), DisplayName("下一章 ID")]
    public string NextChapterId { get; set; } = "";

    public override string ToString() => $"{Id}  {Name}";
}

public sealed class QuestDefinition
{
    [Category("基本"), DisplayName("任務 ID")]
    public string Id { get; set; } = "QUEST_NEW";

    [Category("基本"), DisplayName("任務名稱")]
    public string Name { get; set; } = "新任務";

    [Category("基本"), DisplayName("任務說明")]
    public string Description { get; set; } = "";

    [Category("基本"), DisplayName("所屬章節 ID")]
    public string ChapterId { get; set; } = "CH01";

    [Category("基本"), DisplayName("任務類型")]
    public QuestType Type { get; set; } = QuestType.Main;

    [Category("派發"), DisplayName("派發方式")]
    public QuestGrantMethod GrantMethod { get; set; } = QuestGrantMethod.Automatic;

    [Category("派發"), DisplayName("派發來源 ID")]
    [Description("互動派發填 Interaction ID；對話後派發填 Dialogue ID。")]
    public string GrantSourceId { get; set; } = "";

    [Category("派發"), DisplayName("派發條件")]
    public string GrantCondition { get; set; } = "";

    [Category("派發"), DisplayName("前置任務 ID")]
    [Description("按右側 […] 開啟任務清單；可複選，所有勾選任務都完成後才會開放此任務。")]
    [Editor(typeof(PrerequisiteQuestIdsEditor), typeof(System.Drawing.Design.UITypeEditor))]
    public List<string> PrerequisiteQuestIds { get; set; } = new();

    [Category("派發"), DisplayName("啟動延遲（秒）")]
    [Description("派發條件成立後，等待指定的現實秒數才讓任務正式啟動。0 代表立即啟動。")]
    public double StartDelaySeconds { get; set; }

    [Category("傳送"), DisplayName("啟動傳送 Point ID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StartTeleportPointId { get; set; }

    [Category("傳送"), DisplayName("啟動傳送延遲（秒）")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double StartTeleportDelaySeconds { get; set; }

    [Category("傳送"), DisplayName("完成傳送 Point ID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [Category("傳送"), DisplayName("完成傳送延遲（秒）")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double CompletionTeleportDelaySeconds { get; set; }

    [Category("規則"), DisplayName("可放棄")]
    public bool CanAbandon { get; set; }

    [Category("規則"), DisplayName("可重新接取")]
    public bool CanReaccept { get; set; }

    [Category("介面"), DisplayName("顯示模式")]
    public QuestDisplayMode DisplayMode { get; set; } = QuestDisplayMode.Standard;

    [Category("完成"), DisplayName("完成旗標 ID")]
    public string CompletionFlagId { get; set; } = "";

    [Category("完成"), DisplayName("完成後觸發類型")]
    [Description("任務完成後可播放一段對話，或執行一個事件流程。選擇「無」即不觸發。")]
    public QuestCompletionTriggerType CompletionTriggerType { get; set; }

    [Category("完成"), DisplayName("完成後觸發 ID")]
    [Description("依觸發類型填入 Dialogue ID 或 Event Flow ID；也可從視窗下方的外部 ID 清單選取。")]
    public string CompletionTriggerId { get; set; } = "";

    [Category("完成"), DisplayName("完成後觸發延遲（秒）")]
    [Description("COMPLETE 任務完成 UI 播放結束後，等待指定現實秒數才觸發對話或事件流程。0 代表 UI 結束後立即觸發。")]
    public double CompletionTriggerDelaySeconds { get; set; }

    [Browsable(false)]
    public string CompletionEventFlowId { get; set; } = "";

    [Category("獎勵"), DisplayName("獎勵道具 ID")]
    public string RewardItemId { get; set; } = "";

    [Category("獎勵"), DisplayName("獎勵數量")]
    public int RewardItemAmount { get; set; }

    [Category("失敗"), DisplayName("失敗期限條件")]
    public string FailureDeadline { get; set; } = "";

    [Category("失敗"), DisplayName("指定失敗事件 ID")]
    public string FailureEventId { get; set; } = "";

    [Category("失敗"), DisplayName("失敗模式")]
    public FailureMode FailureMode { get; set; } = FailureMode.Permanent;

    [Category("失敗"), DisplayName("失敗事件流程 ID")]
    public string OnFailedEventFlowId { get; set; } = "";

    [Browsable(false)]
    public List<QuestStageDefinition> Stages { get; set; } = new();

    public override string ToString() => $"{Id}  {Name}";
}

public sealed class QuestStageDefinition
{
    [Category("基本"), DisplayName("階段 ID")]
    public string Id { get; set; } = "QUEST_NEW_STAGE_01";

    [Category("基本"), DisplayName("階段名稱")]
    public string Name { get; set; } = "新階段";

    [Category("流程"), DisplayName("啟動延遲（秒）")]
    [Description("進入此階段後，等待指定的現實秒數才顯示階段目標並開始接受判定。0 代表立即啟動。")]
    public double StartDelaySeconds { get; set; }

    [Category("流程"), DisplayName("完成延遲（秒）")]
    [Description("此階段完成條件成立後，等待指定的現實秒數才播放完成演出並切換下一階段。完成紀錄會立即保存。0 代表立即處理。")]
    public double CompletionDelaySeconds { get; set; }

    [Category("傳送"), DisplayName("啟動傳送 Point ID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StartTeleportPointId { get; set; }

    [Category("傳送"), DisplayName("啟動傳送延遲（秒）")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double StartTeleportDelaySeconds { get; set; }

    [Category("傳送"), DisplayName("完成傳送 Point ID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [Category("傳送"), DisplayName("完成傳送延遲（秒）")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double CompletionTeleportDelaySeconds { get; set; }

    [Category("流程"), DisplayName("完成方式")]
    public StageCompletionMode CompletionMode { get; set; } = StageCompletionMode.All;

    [Category("流程"), DisplayName("階段開始流程 ID")]
    public string StartEventFlowId { get; set; } = "";

    [Category("流程"), DisplayName("階段完成流程 ID")]
    public string CompletionEventFlowId { get; set; } = "";

    [Category("流程"), DisplayName("下一階段 ID")]
    public string NextStageId { get; set; } = "";

    [Browsable(false)]
    public List<QuestObjectiveDefinition> Objectives { get; set; } = new();

    public override string ToString() => $"{Id}  {Name}";
}

public sealed class QuestObjectiveDefinition
{
    [Category("基本"), DisplayName("目標 ID")]
    public string Id { get; set; } = "QUEST_NEW_OBJ_01";

    [Category("基本"), DisplayName("顯示文字")]
    public string DisplayText { get; set; } = "新目標";

    [Category("流程"), DisplayName("啟動延遲（秒）")]
    [Description("所屬階段正式啟動後，再等待指定的現實秒數才顯示並接受此目標判定。0 代表立即啟動。")]
    public double StartDelaySeconds { get; set; }

    [Category("流程"), DisplayName("完成延遲（秒）")]
    [Description("目標條件成立後，等待指定的現實秒數才顯示核取與完成演出。完成紀錄會立即保存。0 代表立即顯示。")]
    public double CompletionDelaySeconds { get; set; }

    [Category("流程"), DisplayName("啟用方式")]
    [Description("立即啟用會隨所屬 Stage 顯示；事件啟用則保持鎖定，直到指定事件或劇情觸發區完成。")]
    public ObjectiveActivationMode ActivationMode { get; set; } = ObjectiveActivationMode.Immediate;

    [Category("流程"), DisplayName("啟用事件 ID／劇情觸發區")]
    [Description("事件啟用時填入事件 ID；也可在 MapEditor 的劇情觸發區直接勾選要啟用的 OBJ。")]
    public string ActivationEventId { get; set; } = "";

    [Category("流程"), DisplayName("未解鎖時阻擋階段完成")]
    [Description("True：鎖定中的 OBJ 仍會阻止 Stage 完成。False：解鎖前不列入 Stage 完成判定。")]
    public bool BlocksStageCompletion { get; set; } = true;

    [Category("傳送"), DisplayName("啟動傳送 Point ID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StartTeleportPointId { get; set; }

    [Category("傳送"), DisplayName("啟動傳送延遲（秒）")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double StartTeleportDelaySeconds { get; set; }

    [Category("傳送"), DisplayName("完成傳送 Point ID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [Category("傳送"), DisplayName("完成傳送延遲（秒）")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double CompletionTeleportDelaySeconds { get; set; }

    [Category("判定"), DisplayName("目標類型")]
    public ObjectiveType Type { get; set; } = ObjectiveType.CollectItem;

    [Category("判定"), DisplayName("判定目標 ID")]
    public string TargetId { get; set; } = "";

    [Category("判定"), DisplayName("複合道具需求")]
    [Description("目標類型選擇「複合道具收集」時，在此加入多個道具 ID 與各自需求數量。")]
    public List<QuestItemRequirement> ItemRequirements { get; set; } = new();

    [Category("判定"), DisplayName("目標狀態／條件")]
    public string TargetState { get; set; } = "";

    [Category("判定"), DisplayName("需求數量")]
    public int RequiredAmount { get; set; } = 1;

    [Category("判定"), DisplayName("計數方式")]
    public ObjectiveCountMode CountMode { get; set; } = ObjectiveCountMode.Accumulated;

    [Category("判定"), DisplayName("互動成立時機")]
    public InteractionObjectiveMode InteractionMode { get; set; } = InteractionObjectiveMode.Succeeded;

    [Category("介面"), DisplayName("顯示進度")]
    public bool ShowProgress { get; set; } = true;

    [Category("介面"), DisplayName("顯示提示圖示")]
    public bool ShowHintIcon { get; set; }

    [Category("完成"), DisplayName("完成事件流程 ID")]
    public string CompletionEventFlowId { get; set; } = "";

    [Category("完成"), DisplayName("完成後介面操作")]
    [Description("此目標第一次完成時，開啟或關閉指定介面。")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public CompletionInterfaceAction CompletionInterfaceAction { get; set; }

    [Category("完成"), DisplayName("目標介面")]
    [Description("從已登記介面選擇，例如 Inventory 或 Options。")]
    [TypeConverter(typeof(RegisteredInterfaceIdConverter))]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionInterfaceId { get; set; }

    [Browsable(false)]
    public string UnlockDialogueId { get; set; } = "";

    [JsonIgnore]
    [Browsable(false)]
    public int CurrentAmount { get; set; }

    public override string ToString() => $"{Id}  {DisplayText}";
}
