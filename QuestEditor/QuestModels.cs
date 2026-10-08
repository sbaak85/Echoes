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
    [Description("OBJ啟用後啟用")] ObjectiveActivated,
    [Description("OBJ核取後啟用")] ObjectiveCompleted,
    [Description("對話開始時啟用")] DialogueStarted,
    [Description("對話播完後啟用")] DialogueCompleted,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum ObjectiveType
{
    [Description("收集道具")] CollectItem,
    [Description("複合道具收集")] CompoundCollectItem,
    [Description("向互動區投入道具")] SubmitItemAtInteraction,
    [Description("持有道具")] HaveItem,
    [Description("開啟介面")] InterfaceOpened,
    [Description("使用道具")] ItemUsed,
    [Description("開始互動")] InteractionStarted,
    [Description("互動成功")] InteractionSucceeded,
    [Description("進入區域")] EnterArea,
    [Description("完成場景轉移")] SceneTransferCompleted,
    [Description("完成解謎")] PuzzleCompleted,
    [Description("完成對話")] DialogueCompleted,
    [Description("場景物件達到指定狀態")] ObjectStateReached,
    [Description("到達指定日期或時間")] DayOrTimeReached,
    [Description("旗標條件成立")] FlagCondition,
    [Description("自訂進度")] CustomProgress,
}

[TypeConverter(typeof(LocalizedEnumConverter))]
public enum CompoundItemMatchMode
{
    [Description("全部道具達標")] All,
    [Description("任選 N 種")] AnyN,
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

/// <summary>
/// PropertyGrid group names. PropertyGrid sorts categories by name, so a leading number
/// fixes the order; related settings (activation, completion…) stay next to each other.
/// </summary>
internal static class PropertyGroup
{
    public const string Basic = "1. 基本";
    public const string Criteria = "2. 判定條件";
    public const string Grant = "2. 派發與啟動";
    public const string Activation = "3. 啟用設定";
    public const string StageStart = "2. 啟動設定";
    public const string Completion = "4. 完成設定";
    public const string StageCompletion = "3. 完成設定";
    public const string QuestCompletion = "3. 完成設定";
    public const string Reward = "4. 獎勵";
    public const string Rules = "5. 規則與失敗";
    public const string Display = "5. 介面顯示";
    public const string ChapterFlow = "2. 章節流程";
}

/// <summary>Display order inside a PropertyGrid group (declaration order is kept for JSON).</summary>
[AttributeUsage(AttributeTargets.Property)]
internal sealed class DisplayOrderAttribute : Attribute
{
    public DisplayOrderAttribute(int order) => Order = order;
    public int Order { get; }
}

/// <summary>Lists properties by <see cref="DisplayOrderAttribute"/> instead of alphabetically.</summary>
internal sealed class DisplayOrderConverter : TypeConverter
{
    public override bool GetPropertiesSupported(ITypeDescriptorContext? context) => true;

    public override PropertyDescriptorCollection GetProperties(
        ITypeDescriptorContext? context, object value, Attribute[]? attributes)
    {
        var properties = TypeDescriptor.GetProperties(value, attributes, true);
        var ordered = properties.Cast<PropertyDescriptor>()
            .OrderBy(property => (property.Attributes[typeof(DisplayOrderAttribute)] as DisplayOrderAttribute)?.Order ?? int.MaxValue)
            .ToArray();
        return new PropertyDescriptorCollection(ordered).Sort(ordered.Select(property => property.Name).ToArray());
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

[TypeConverter(typeof(DisplayOrderConverter))]
public sealed class ChapterDefinition
{
    [Category(PropertyGroup.Basic), DisplayName("章節 ID"), DisplayOrder(1)]
    public string Id { get; set; } = "CH01";

    [Category(PropertyGroup.Basic), DisplayName("章節名稱"), DisplayOrder(2)]
    public string Name { get; set; } = "新章節";

    [Category(PropertyGroup.ChapterFlow), DisplayName("開始條件"), DisplayOrder(10)]
    public string StartCondition { get; set; } = "";

    [Category(PropertyGroup.ChapterFlow), DisplayName("開場事件流程 ID"), DisplayOrder(11)]
    public string OpeningEventFlowId { get; set; } = "";

    [Category(PropertyGroup.ChapterFlow), DisplayName("完成所需任務 ID"), DisplayOrder(12)]
    [Description("每行一個本章必須完成的主線任務 ID。")]
    [Editor(typeof(StringListEditor), typeof(System.Drawing.Design.UITypeEditor))]
    [TypeConverter(typeof(StringListConverter))]
    public List<string> CompletionQuestIds { get; set; } = new();

    [Category(PropertyGroup.ChapterFlow), DisplayName("結尾事件流程 ID"), DisplayOrder(13)]
    public string EndingEventFlowId { get; set; } = "";

    [Category(PropertyGroup.ChapterFlow), DisplayName("下一章 ID"), DisplayOrder(14)]
    public string NextChapterId { get; set; } = "";

    public override string ToString() => $"{Id}  {Name}";
}

[TypeConverter(typeof(DisplayOrderConverter))]
public sealed class QuestDefinition
{
    [Category(PropertyGroup.Basic), DisplayName("任務 ID"), DisplayOrder(1)]
    public string Id { get; set; } = "QUEST_NEW";

    [Category(PropertyGroup.Basic), DisplayName("任務名稱"), DisplayOrder(2)]
    public string Name { get; set; } = "新任務";

    [Category(PropertyGroup.Basic), DisplayName("任務說明"), DisplayOrder(3)]
    public string Description { get; set; } = "";

    [Category(PropertyGroup.Basic), DisplayName("所屬章節 ID"), DisplayOrder(4)]
    public string ChapterId { get; set; } = "CH01";

    [Category(PropertyGroup.Basic), DisplayName("任務類型"), DisplayOrder(5)]
    public QuestType Type { get; set; } = QuestType.Main;

    [Category(PropertyGroup.Grant), DisplayName("派發方式"), DisplayOrder(10)]
    public QuestGrantMethod GrantMethod { get; set; } = QuestGrantMethod.Automatic;

    [Category(PropertyGroup.Grant), DisplayName("派發來源 ID"), DisplayOrder(11)]
    [Description("互動派發填 Interaction ID；對話後派發填 Dialogue ID。")]
    public string GrantSourceId { get; set; } = "";

    [Category(PropertyGroup.Grant), DisplayName("派發條件"), DisplayOrder(12)]
    public string GrantCondition { get; set; } = "";

    [Category(PropertyGroup.Grant), DisplayName("前置任務 ID"), DisplayOrder(13)]
    [Description("按右側 […] 開啟任務清單；可複選，所有勾選任務都完成後才會開放此任務。")]
    [Editor(typeof(PrerequisiteQuestIdsEditor), typeof(System.Drawing.Design.UITypeEditor))]
    [TypeConverter(typeof(StringListConverter))]
    public List<string> PrerequisiteQuestIds { get; set; } = new();

    [Category(PropertyGroup.Grant), DisplayName("啟動延遲（秒）"), DisplayOrder(14)]
    [Description("派發條件成立後，等待指定的現實秒數才讓任務正式啟動。0 代表立即啟動。")]
    public double StartDelaySeconds { get; set; }

    [Category(PropertyGroup.Grant), DisplayName("啟動延遲_效果（秒）"), DisplayOrder(15)]
    [Description("只延後任務啟動通知與 UI 演出，不影響任務正式啟動、條件判定或存檔。0 代表立即播放效果。")]
    public double StartPresentationDelaySeconds { get; set; }

    [Category(PropertyGroup.Grant), DisplayName("啟動傳送 Point ID"), DisplayOrder(16)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StartTeleportPointId { get; set; }

    [Category(PropertyGroup.Grant), DisplayName("啟動傳送延遲（秒）"), DisplayOrder(17)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double StartTeleportDelaySeconds { get; set; }

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成傳送 Point ID"), DisplayOrder(25)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成傳送延遲（秒）"), DisplayOrder(26)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double CompletionTeleportDelaySeconds { get; set; }

    [Category(PropertyGroup.Rules), DisplayName("可放棄"), DisplayOrder(40)]
    public bool CanAbandon { get; set; }

    [Category(PropertyGroup.Rules), DisplayName("可重新接取"), DisplayOrder(41)]
    public bool CanReaccept { get; set; }

    [Category(PropertyGroup.Basic), DisplayName("顯示模式"), DisplayOrder(6)]
    public QuestDisplayMode DisplayMode { get; set; } = QuestDisplayMode.Standard;

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成旗標 ID"), DisplayOrder(20)]
    public string CompletionFlagId { get; set; } = "";

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成後觸發類型"), DisplayOrder(21)]
    [Description("任務完成後可播放一段對話，或執行一個事件流程。選擇「無」即不觸發。")]
    public QuestCompletionTriggerType CompletionTriggerType { get; set; }

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成後觸發 ID"), DisplayOrder(22)]
    [Description("依觸發類型填入 Dialogue ID 或 Event Flow ID；也可從視窗下方的外部 ID 清單選取。")]
    public string CompletionTriggerId { get; set; } = "";

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成後觸發延遲（秒）"), DisplayOrder(23)]
    [Description("COMPLETE 任務完成 UI 播放結束後，等待指定現實秒數才觸發對話或事件流程。0 代表 UI 結束後立即觸發。")]
    public double CompletionTriggerDelaySeconds { get; set; }

    [Category(PropertyGroup.QuestCompletion), DisplayName("完成延遲_效果（秒）"), DisplayOrder(24)]
    [Description("只延後 COMPLETE 等任務完成 UI 演出，不影響任務真實完成、完成旗標、後續條件或存檔。0 代表立即播放效果。")]
    public double CompletionPresentationDelaySeconds { get; set; }

    [Browsable(false)]
    public string CompletionEventFlowId { get; set; } = "";

    [Category(PropertyGroup.Reward), DisplayName("獎勵道具 ID"), DisplayOrder(30)]
    public string RewardItemId { get; set; } = "";

    [Category(PropertyGroup.Reward), DisplayName("獎勵數量"), DisplayOrder(31)]
    public int RewardItemAmount { get; set; }

    [Category(PropertyGroup.Rules), DisplayName("失敗期限條件"), DisplayOrder(42)]
    public string FailureDeadline { get; set; } = "";

    [Category(PropertyGroup.Rules), DisplayName("指定失敗事件 ID"), DisplayOrder(43)]
    public string FailureEventId { get; set; } = "";

    [Category(PropertyGroup.Rules), DisplayName("失敗模式"), DisplayOrder(44)]
    public FailureMode FailureMode { get; set; } = FailureMode.Permanent;

    [Category(PropertyGroup.Rules), DisplayName("失敗事件流程 ID"), DisplayOrder(45)]
    public string OnFailedEventFlowId { get; set; } = "";

    [Browsable(false)]
    public List<QuestStageDefinition> Stages { get; set; } = new();

    public override string ToString() => $"{Id}  {Name}";
}

[TypeConverter(typeof(DisplayOrderConverter))]
public sealed class QuestStageDefinition
{
    [Category(PropertyGroup.Basic), DisplayName("階段 ID"), DisplayOrder(1)]
    public string Id { get; set; } = "QUEST_NEW_STAGE_01";

    [Category(PropertyGroup.Basic), DisplayName("階段名稱"), DisplayOrder(2)]
    public string Name { get; set; } = "新階段";

    [Category(PropertyGroup.StageStart), DisplayName("啟動延遲（秒）"), DisplayOrder(10)]
    [Description("進入此階段後，等待指定的現實秒數才顯示階段目標並開始接受判定。0 代表立即啟動。")]
    public double StartDelaySeconds { get; set; }

    [Category(PropertyGroup.StageStart), DisplayName("啟動延遲_效果（秒）"), DisplayOrder(11)]
    [Description("只延後此 Stage 的 UI 進場效果，不影響 Stage 正式啟動、互動條件、事件判定或存檔。0 代表立即播放效果。")]
    public double StartPresentationDelaySeconds { get; set; }

    [Category(PropertyGroup.StageCompletion), DisplayName("完成延遲（秒）"), DisplayOrder(20)]
    [Description("此階段完成條件成立後，等待指定的現實秒數才播放完成演出並切換下一階段。完成紀錄會立即保存。0 代表立即處理。")]
    public double CompletionDelaySeconds { get; set; }

    [Category(PropertyGroup.StageCompletion), DisplayName("完成延遲_效果（秒）"), DisplayOrder(21)]
    [Description("只延後 NEXT／完成通知等 UI 演出，不影響此 Stage 的真實完成、下一 Stage 切換、互動條件或存檔。0 代表立即播放效果。")]
    public double CompletionPresentationDelaySeconds { get; set; }

    [Category(PropertyGroup.StageStart), DisplayName("啟動傳送 Point ID"), DisplayOrder(13)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StartTeleportPointId { get; set; }

    [Category(PropertyGroup.StageStart), DisplayName("啟動傳送延遲（秒）"), DisplayOrder(14)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double StartTeleportDelaySeconds { get; set; }

    [Category(PropertyGroup.StageCompletion), DisplayName("完成傳送 Point ID"), DisplayOrder(23)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [Category(PropertyGroup.StageCompletion), DisplayName("完成傳送延遲（秒）"), DisplayOrder(24)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double CompletionTeleportDelaySeconds { get; set; }

    [Category(PropertyGroup.Basic), DisplayName("完成方式"), DisplayOrder(3)]
    public StageCompletionMode CompletionMode { get; set; } = StageCompletionMode.All;

    [Category(PropertyGroup.StageStart), DisplayName("階段開始流程 ID"), DisplayOrder(12)]
    public string StartEventFlowId { get; set; } = "";

    [Category(PropertyGroup.StageCompletion), DisplayName("階段完成流程 ID"), DisplayOrder(22)]
    public string CompletionEventFlowId { get; set; } = "";

    [Category(PropertyGroup.Basic), DisplayName("下一階段 ID"), DisplayOrder(4)]
    public string NextStageId { get; set; } = "";

    [Browsable(false)]
    public List<QuestObjectiveDefinition> Objectives { get; set; } = new();

    public override string ToString() => $"{Id}  {Name}";
}

[TypeConverter(typeof(DisplayOrderConverter))]
public sealed class QuestObjectiveDefinition
{
    [Category(PropertyGroup.Basic), DisplayName("目標 ID"), DisplayOrder(1)]
    public string Id { get; set; } = "QUEST_NEW_OBJ_01";

    [Category(PropertyGroup.Basic), DisplayName("顯示文字"), DisplayOrder(2)]
    public string DisplayText { get; set; } = "新目標";

    [Category(PropertyGroup.Activation), DisplayName("啟動延遲（秒）"), DisplayOrder(23)]
    [Description("一般模式從階段啟動起算；對話模式從指定腳本開始／完整播完起算，等待指定現實秒數後才真正啟用 OBJ。0 代表觸發後立即啟用。")]
    public double StartDelaySeconds { get; set; }

    [Category(PropertyGroup.Activation), DisplayName("啟動延遲_效果（秒）"), DisplayOrder(24)]
    [Description("只延後此 OBJ 的啟動提示與 UI 效果，不影響 OBJ 正式啟用、事件判定或存檔。0 代表立即播放效果。")]
    public double StartPresentationDelaySeconds { get; set; }

    [Category(PropertyGroup.Completion), DisplayName("完成延遲（秒）"), DisplayOrder(30)]
    [Description("目標條件成立後，等待指定的現實秒數才顯示核取與完成演出。完成紀錄會立即保存。0 代表立即顯示。")]
    public double CompletionDelaySeconds { get; set; }

    [Category(PropertyGroup.Completion), DisplayName("完成延遲_效果（秒）"), DisplayOrder(31)]
    [Description("只延後 OBJ 核取與完成通知的 UI 演出，不影響真實完成、後續 Stage 切換、互動條件或存檔。0 代表立即播放效果。")]
    public double CompletionPresentationDelaySeconds { get; set; }

    [Category(PropertyGroup.Activation), DisplayName("啟用方式"), DisplayOrder(20)]
    [Description("立即啟用隨 Stage 顯示；事件／OBJ 模式等待指定事件；對話模式填對話腳本 ID，從開始或完整播完時起算啟動延遲，倒數後才真正啟用。")]
    public ObjectiveActivationMode ActivationMode { get; set; } = ObjectiveActivationMode.Immediate;

    [Category(PropertyGroup.Activation), DisplayName("啟用事件 ID／OBJ ID／劇情觸發區"), DisplayOrder(21)]
    [Description("事件啟用填事件 ID；OBJ 模式填來源 OBJ ID；對話模式直接填對話腳本 ID（例如 chapter04-section-5）。")]
    public string ActivationEventId { get; set; } = "";

    [Category(PropertyGroup.Activation), DisplayName("未解鎖時阻擋階段完成"), DisplayOrder(22)]
    [Description("True：鎖定中的 OBJ 仍會阻止 Stage 完成。False：解鎖前不列入 Stage 完成判定。")]
    public bool BlocksStageCompletion { get; set; } = true;

    [Category(PropertyGroup.Activation), DisplayName("啟動傳送 Point ID"), DisplayOrder(25)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StartTeleportPointId { get; set; }

    [Category(PropertyGroup.Activation), DisplayName("啟動傳送延遲（秒）"), DisplayOrder(26)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double StartTeleportDelaySeconds { get; set; }

    [Category(PropertyGroup.Completion), DisplayName("完成傳送 Point ID"), DisplayOrder(35)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CompletionTeleportPointId { get; set; }

    [Category(PropertyGroup.Completion), DisplayName("完成傳送延遲（秒）"), DisplayOrder(36)]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public double CompletionTeleportDelaySeconds { get; set; }

    [Category(PropertyGroup.Basic), DisplayName("目標類型"), DisplayOrder(3)]
    public ObjectiveType Type { get; set; } = ObjectiveType.CollectItem;

    [Category(PropertyGroup.Criteria), DisplayName("判定目標 ID"), DisplayOrder(10)]
    [Description("完成場景轉移：填入抵達的目標場景 ID（例如 Scene_6）。未填入不會判定完成。")]
    public string TargetId { get; set; } = "";

    [Category(PropertyGroup.Criteria), DisplayName("指定互動 ID 清單"), DisplayOrder(11)]
    [Description("互動開始／互動成功：可列出多個不同 Interaction ID（每行一個），同一 ID 只計一次，達到需求數量後完成。向互動區投入道具：可在清單中任一互動區投入，需求數量為投入的道具數。設定此清單時優先於單一判定目標 ID。")]
    [Editor(typeof(StringListEditor), typeof(System.Drawing.Design.UITypeEditor))]
    [TypeConverter(typeof(StringListConverter))]
    public List<string> TargetIds { get; set; } = new();

    [Category(PropertyGroup.Criteria), DisplayName("來源場景 ID（選填）"), DisplayOrder(18)]
    [Description("僅用於完成場景轉移。留空允許從任意場景抵達；指定出口時必須同時指定來源場景。")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SourceSceneId { get; set; }

    [Category(PropertyGroup.Criteria), DisplayName("來源出口 ID（選填）"), DisplayOrder(19)]
    [Description("僅用於完成場景轉移。填入來源場景內的出口 ID（例如 scene-exit-001）；留空接受該來源的任意出口。")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SourceConnectionId { get; set; }

    [Category(PropertyGroup.Criteria), DisplayName("道具需求"), DisplayOrder(12)]
    [Description("「複合道具收集」可加入多個道具；「向互動區投入道具」第一版請設定一個道具 ID 與數量。")]
    public List<QuestItemRequirement> ItemRequirements { get; set; } = new();

    [Category(PropertyGroup.Criteria), DisplayName("複合道具判定模式"), DisplayOrder(13)]
    [Description("僅用於複合道具收集。全部道具達標：每種都須取得指定數量。任選 N 種：外層需求數量代表種類數 N，每種仍須達到集合內指定數量；同一 Item ID 只算一種。")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public CompoundItemMatchMode CompoundMatchMode { get; set; } = CompoundItemMatchMode.All;

    [Category(PropertyGroup.Criteria), DisplayName("目標狀態／條件"), DisplayOrder(17)]
    public string TargetState { get; set; } = "";

    [Category(PropertyGroup.Criteria), DisplayName("需求數量"), DisplayOrder(14)]
    [Description("複合道具收集選擇「任選 N 種」時，此欄為須達標的不同道具種類數 N；選擇「全部道具達標」時，以集合內每項需求數量為準。其他類型為一般需求數量。")]
    public int RequiredAmount { get; set; } = 1;

    [Category(PropertyGroup.Criteria), DisplayName("計數方式"), DisplayOrder(15)]
    public ObjectiveCountMode CountMode { get; set; } = ObjectiveCountMode.Accumulated;

    [Category(PropertyGroup.Criteria), DisplayName("互動成立時機"), DisplayOrder(16)]
    public InteractionObjectiveMode InteractionMode { get; set; } = InteractionObjectiveMode.Succeeded;

    [Category(PropertyGroup.Display), DisplayName("顯示進度"), DisplayOrder(40)]
    public bool ShowProgress { get; set; } = false;

    [Category(PropertyGroup.Display), DisplayName("顯示提示圖示"), DisplayOrder(41)]
    public bool ShowHintIcon { get; set; }

    [Category(PropertyGroup.Completion), DisplayName("完成事件流程 ID"), DisplayOrder(32)]
    public string CompletionEventFlowId { get; set; } = "";

    [Category(PropertyGroup.Completion), DisplayName("完成後介面操作"), DisplayOrder(33)]
    [Description("此目標第一次完成時，開啟或關閉指定介面。")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public CompletionInterfaceAction CompletionInterfaceAction { get; set; }

    [Category(PropertyGroup.Completion), DisplayName("目標介面"), DisplayOrder(34)]
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
