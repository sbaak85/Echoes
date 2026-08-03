using System.ComponentModel;
using System.Text.Json.Serialization;

namespace Echoes.QuestEditor;

public enum QuestState { Locked, Available, Active, Completed, Failed, Abandoned }
public enum QuestType { Main, Side, LongTermMain }
public enum QuestGrantMethod { Automatic, Interaction, AfterDialogue }
public enum QuestDisplayMode { Standard, MainProgress }
public enum StageCompletionMode { All, Any }
public enum ObjectiveType
{
    CollectItem,
    CompoundCollectItem,
    HaveItem,
    InteractionStarted,
    InteractionSucceeded,
    EnterArea,
    PuzzleCompleted,
    DialogueCompleted,
    ObjectStateReached,
    DayOrTimeReached,
    FlagCondition,
    CustomProgress,
}
public enum ObjectiveCountMode { Accumulated, CurrentInventory }
public enum InteractionObjectiveMode { Started, Succeeded }
public enum FailureMode { Permanent, RestartQuest }

public sealed class QuestItemRequirement
{
    [DisplayName("Item ID")]
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
    [Category("基本"), DisplayName("Chapter ID")]
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
    [Category("基本"), DisplayName("Quest ID")]
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
    public List<string> PrerequisiteQuestIds { get; set; } = new();

    [Category("規則"), DisplayName("可放棄")]
    public bool CanAbandon { get; set; }

    [Category("規則"), DisplayName("可重新接取")]
    public bool CanReaccept { get; set; }

    [Category("UI"), DisplayName("顯示模式")]
    public QuestDisplayMode DisplayMode { get; set; } = QuestDisplayMode.Standard;

    [Category("完成"), DisplayName("完成旗標 ID")]
    public string CompletionFlagId { get; set; } = "";

    [Category("完成"), DisplayName("完成事件流程 ID")]
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
    [Category("基本"), DisplayName("Stage ID")]
    public string Id { get; set; } = "QUEST_NEW_STAGE_01";

    [Category("基本"), DisplayName("階段名稱")]
    public string Name { get; set; } = "新階段";

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
    [Category("基本"), DisplayName("Objective ID")]
    public string Id { get; set; } = "QUEST_NEW_OBJ_01";

    [Category("基本"), DisplayName("顯示文字")]
    public string DisplayText { get; set; } = "新目標";

    [Category("判定"), DisplayName("Objective Type")]
    public ObjectiveType Type { get; set; } = ObjectiveType.CollectItem;

    [Category("判定"), DisplayName("Target ID")]
    public string TargetId { get; set; } = "";

    [Category("判定"), DisplayName("複合道具需求")]
    [Description("Objective Type 選 CompoundCollectItem 時，在此加入多個 Item ID 與各自需求數量。")]
    public List<QuestItemRequirement> ItemRequirements { get; set; } = new();

    [Category("判定"), DisplayName("目標狀態／條件")]
    public string TargetState { get; set; } = "";

    [Category("判定"), DisplayName("需求數量")]
    public int RequiredAmount { get; set; } = 1;

    [Category("判定"), DisplayName("計數方式")]
    public ObjectiveCountMode CountMode { get; set; } = ObjectiveCountMode.Accumulated;

    [Category("判定"), DisplayName("互動成立時機")]
    public InteractionObjectiveMode InteractionMode { get; set; } = InteractionObjectiveMode.Succeeded;

    [Category("UI"), DisplayName("顯示進度")]
    public bool ShowProgress { get; set; } = true;

    [Category("UI"), DisplayName("顯示 HintIcon")]
    public bool ShowHintIcon { get; set; }

    [Category("完成"), DisplayName("完成事件流程 ID")]
    public string CompletionEventFlowId { get; set; } = "";

    [JsonIgnore]
    [Browsable(false)]
    public int CurrentAmount { get; set; }

    public override string ToString() => $"{Id}  {DisplayText}";
}
