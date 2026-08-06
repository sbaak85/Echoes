namespace Echoes.QuestEditor;

public enum ValidationSeverity { Error, Warning }

public sealed record QuestValidationIssue(ValidationSeverity Severity, string Message, object? Target)
{
    public override string ToString() => $"{(Severity == ValidationSeverity.Error ? "錯誤" : "警告")}：{Message}";
}

internal static class QuestValidator
{
    public static List<QuestValidationIssue> Validate(QuestDocument document, QuestReferenceCatalog references)
    {
        var issues = new List<QuestValidationIssue>();
        ValidateUnique(document.Chapters, chapter => chapter.Id, "Chapter ID", issues);
        ValidateUnique(document.Quests, quest => quest.Id, "Quest ID", issues);
        ValidateUnique(
            document.Quests.SelectMany(quest => quest.Stages),
            stage => stage.Id,
            "Stage ID",
            issues);
        var chapterIds = document.Chapters.Select(chapter => chapter.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var questIds = document.Quests.Select(quest => quest.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var chapter in document.Chapters)
        {
            Required(chapter.Id, "Chapter ID 不可空白", chapter, issues);
            if (!string.IsNullOrWhiteSpace(chapter.NextChapterId) && !chapterIds.Contains(chapter.NextChapterId))
                issues.Add(new(ValidationSeverity.Error, $"{chapter.Id} 找不到下一章：{chapter.NextChapterId}", chapter));
            foreach (var questId in chapter.CompletionQuestIds.Where(id => !questIds.Contains(id)))
                issues.Add(new(ValidationSeverity.Error, $"{chapter.Id} 找不到完成條件任務：{questId}", chapter));
        }

        foreach (var quest in document.Quests)
        {
            Required(quest.Id, "Quest ID 不可空白", quest, issues);
            if (!chapterIds.Contains(quest.ChapterId))
                issues.Add(new(ValidationSeverity.Error, $"{quest.Id} 找不到所屬章節：{quest.ChapterId}", quest));
            if (quest.Type == QuestType.Main && quest.CanAbandon)
                issues.Add(new(ValidationSeverity.Warning, $"主線任務 {quest.Id} 被設定為可放棄", quest));
            if (quest.Stages.Count == 0)
                issues.Add(new(ValidationSeverity.Error, $"{quest.Id} 沒有任務階段", quest));
            foreach (var prerequisite in quest.PrerequisiteQuestIds.Where(id => !questIds.Contains(id)))
                issues.Add(new(ValidationSeverity.Error, $"{quest.Id} 找不到前置任務：{prerequisite}", quest));

            ValidateUnique(quest.Stages, stage => stage.Id, $"{quest.Id} 的 Stage ID", issues);
            ValidateUnique(
                quest.Stages.SelectMany(stage => stage.Objectives),
                objective => objective.Id,
                $"{quest.Id} 的 Objective ID",
                issues);
            if (!double.IsFinite(quest.StartDelaySeconds) ||
                quest.StartDelaySeconds < 0 ||
                quest.StartDelaySeconds > 3600)
            {
                issues.Add(new(
                    ValidationSeverity.Error,
                    $"{quest.Id} 的啟動延遲必須介於 0 至 3600 秒。",
                    quest));
            }
            ValidateCompletionDelay(
                quest.CompletionTriggerDelaySeconds,
                $"{quest.Id} 完成後觸發",
                quest,
                issues);
            ValidateTeleport(quest.StartTeleportPointId, quest.StartTeleportDelaySeconds,
                $"{quest.Id} 啟動", quest, references, issues);
            ValidateTeleport(quest.CompletionTeleportPointId, quest.CompletionTeleportDelaySeconds,
                $"{quest.Id} 完成", quest, references, issues);
            var completionReferenceKind = quest.CompletionTriggerType switch
            {
                QuestCompletionTriggerType.Dialogue => "Dialogue",
                QuestCompletionTriggerType.EventFlow => "EventFlow",
                _ => null,
            };
            if (completionReferenceKind is not null)
            {
                if (string.IsNullOrWhiteSpace(quest.CompletionTriggerId))
                {
                    issues.Add(new(
                        ValidationSeverity.Error,
                        $"{quest.Id} 已設定完成後觸發類型，但尚未指定觸發 ID",
                        quest));
                }
                else if (references.Get(completionReferenceKind).Count > 0 &&
                         !references.Contains(completionReferenceKind, quest.CompletionTriggerId))
                {
                    issues.Add(new(
                        ValidationSeverity.Error,
                        $"找不到 {completionReferenceKind} ID：{quest.CompletionTriggerId}",
                        quest));
                }
            }

            foreach (var stage in quest.Stages)
            {
                Required(stage.Id, $"{quest.Id} 的 Stage ID 不可空白", stage, issues);
                ValidateStartDelay(stage.StartDelaySeconds, stage.Id, stage, issues);
                ValidateCompletionDelay(stage.CompletionDelaySeconds, stage.Id, stage, issues);
                ValidateTeleport(stage.StartTeleportPointId, stage.StartTeleportDelaySeconds,
                    $"{stage.Id} 啟動", stage, references, issues);
                ValidateTeleport(stage.CompletionTeleportPointId, stage.CompletionTeleportDelaySeconds,
                    $"{stage.Id} 完成", stage, references, issues);
                if (!stage.Id.StartsWith($"{quest.Id}_STAGE_", StringComparison.OrdinalIgnoreCase))
                    issues.Add(new(
                        ValidationSeverity.Error,
                        $"{stage.Id} 必須使用 {quest.Id}_STAGE_XX 格式",
                        stage));
                if (stage.Objectives.Count == 0)
                    issues.Add(new(ValidationSeverity.Error, $"{quest.Id}/{stage.Id} 沒有任務目標", stage));
                if (!string.IsNullOrWhiteSpace(stage.NextStageId) &&
                    !quest.Stages.Any(candidate => candidate.Id.Equals(stage.NextStageId, StringComparison.OrdinalIgnoreCase)))
                    issues.Add(new(ValidationSeverity.Error, $"{stage.Id} 找不到下一階段：{stage.NextStageId}", stage));
                ValidateUnique(stage.Objectives, objective => objective.Id, $"{quest.Id}/{stage.Id} 的 Objective ID", issues);
                foreach (var objective in stage.Objectives)
                {
                    ValidateStartDelay(objective.StartDelaySeconds, objective.Id, objective, issues);
                    ValidateCompletionDelay(objective.CompletionDelaySeconds, objective.Id, objective, issues);
                    ValidateTeleport(objective.StartTeleportPointId, objective.StartTeleportDelaySeconds,
                        $"{objective.Id} 啟動", objective, references, issues);
                    ValidateTeleport(objective.CompletionTeleportPointId, objective.CompletionTeleportDelaySeconds,
                        $"{objective.Id} 完成", objective, references, issues);
                    if (!objective.Id.StartsWith($"{quest.Id}_OBJ_", StringComparison.OrdinalIgnoreCase))
                        issues.Add(new(
                            ValidationSeverity.Error,
                            $"{objective.Id} 必須使用 {quest.Id}_OBJ_XX 格式",
                            objective));
                    ValidateObjective(objective, references, issues);
                }
            }
        }

        ValidatePrerequisiteCycles(document, issues);
        return issues;
    }

    private static void ValidateStartDelay(
        double value,
        string id,
        object target,
        List<QuestValidationIssue> issues)
    {
        if (double.IsFinite(value) && value >= 0 && value <= 3600) return;
        issues.Add(new(
            ValidationSeverity.Error,
            $"{id} 的啟動延遲必須介於 0 至 3600 秒。",
            target));
    }

    private static void ValidateCompletionDelay(
        double value,
        string id,
        object target,
        List<QuestValidationIssue> issues)
    {
        if (double.IsFinite(value) && value >= 0 && value <= 3600) return;
        issues.Add(new(
            ValidationSeverity.Error,
            $"{id} 的完成延遲必須介於 0 至 3600 秒。",
            target));
    }

    private static void ValidateTeleport(
        string? pointId,
        double delaySeconds,
        string label,
        object target,
        QuestReferenceCatalog references,
        List<QuestValidationIssue> issues)
    {
        if (!double.IsFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 3600)
        {
            issues.Add(new(ValidationSeverity.Error,
                $"{label}傳送延遲必須介於 0 到 3600 秒。", target));
        }
        if (string.IsNullOrWhiteSpace(pointId)) return;
        if (references.Get("TeleportPoint").Count > 0 &&
            !references.Contains("TeleportPoint", pointId))
        {
            issues.Add(new(ValidationSeverity.Error,
                $"找不到傳送 Point ID：{pointId}", target));
        }
    }

    private static void ValidateObjective(QuestObjectiveDefinition objective, QuestReferenceCatalog references, List<QuestValidationIssue> issues)
    {
        Required(objective.Id, "Objective ID 不可空白", objective, issues);
        ValidateCompletionInterfaceAction(objective, references, issues);
        if (objective.RequiredAmount < 1)
            issues.Add(new(ValidationSeverity.Error, $"{objective.Id} 的需求數量必須大於 0", objective));
        if (objective.Type == ObjectiveType.CompoundCollectItem)
        {
            if (objective.ItemRequirements.Count == 0)
            {
                issues.Add(new(ValidationSeverity.Error, $"{objective.Id} 必須至少設定一項複合道具需求", objective));
                return;
            }
            foreach (var requirement in objective.ItemRequirements)
            {
                if (string.IsNullOrWhiteSpace(requirement.ItemId))
                    issues.Add(new(ValidationSeverity.Error, $"{objective.Id} 的複合道具 Item ID 不可空白", objective));
                else if (references.Get("Item").Count > 0 && !references.Contains("Item", requirement.ItemId))
                    issues.Add(new(ValidationSeverity.Error, $"找不到 Item ID：{requirement.ItemId}", objective));
                if (requirement.RequiredAmount < 1)
                    issues.Add(new(ValidationSeverity.Error, $"{objective.Id}/{requirement.ItemId} 的需求數量必須大於 0", objective));
            }
            return;
        }
        var kind = ReferenceKind(objective.Type);
        if (kind is null) return;
        if (string.IsNullOrWhiteSpace(objective.TargetId))
        {
            issues.Add(new(ValidationSeverity.Error, $"{objective.Id} 尚未指定 {kind} Target ID", objective));
            return;
        }
        var available = references.Get(kind);
        if (available.Count > 0 && !references.Contains(kind, objective.TargetId))
            issues.Add(new(ValidationSeverity.Error, $"找不到 {kind} ID：{objective.TargetId}", objective));
        if (objective.ShowHintIcon)
            issues.Add(new(ValidationSeverity.Warning, $"{objective.Id} 需要 HintIcon；請在 MapEditor 綁定場景物件", objective));
    }

    private static void ValidateCompletionInterfaceAction(
        QuestObjectiveDefinition objective,
        QuestReferenceCatalog references,
        List<QuestValidationIssue> issues)
    {
        if (objective.CompletionInterfaceAction == CompletionInterfaceAction.None)
            return;

        if (string.IsNullOrWhiteSpace(objective.CompletionInterfaceId))
        {
            issues.Add(new(
                ValidationSeverity.Error,
                $"{objective.Id} 已設定完成後介面操作，但尚未指定目標介面",
                objective));
            return;
        }

        var available = references.Get("Interface");
        if (available.Count > 0 && !references.Contains("Interface", objective.CompletionInterfaceId))
            issues.Add(new(
                ValidationSeverity.Error,
                $"找不到 Interface ID：{objective.CompletionInterfaceId}",
                objective));
    }

    public static string? ReferenceKind(ObjectiveType type) => type switch
    {
        ObjectiveType.CollectItem or ObjectiveType.HaveItem or ObjectiveType.ItemUsed => "Item",
        ObjectiveType.InterfaceOpened => "Interface",
        ObjectiveType.InteractionStarted or ObjectiveType.InteractionSucceeded => "Interaction",
        ObjectiveType.EnterArea => "Area",
        ObjectiveType.PuzzleCompleted => "Puzzle",
        ObjectiveType.DialogueCompleted => "Dialogue",
        ObjectiveType.ObjectStateReached => "WorldObject",
        ObjectiveType.FlagCondition => "Flag",
        _ => null,
    };

    private static void ValidateUnique<T>(IEnumerable<T> values, Func<T, string> selector, string label, List<QuestValidationIssue> issues)
    {
        foreach (var group in values.Where(value => !string.IsNullOrWhiteSpace(selector(value)))
                     .GroupBy(selector, StringComparer.OrdinalIgnoreCase).Where(group => group.Count() > 1))
            issues.Add(new(ValidationSeverity.Error, $"{label} 重複：{group.Key}", group.First()));
    }

    private static void Required(string value, string message, object target, List<QuestValidationIssue> issues)
    {
        if (string.IsNullOrWhiteSpace(value)) issues.Add(new(ValidationSeverity.Error, message, target));
    }

    private static void ValidatePrerequisiteCycles(QuestDocument document, List<QuestValidationIssue> issues)
    {
        var quests = document.Quests.ToDictionary(quest => quest.Id, StringComparer.OrdinalIgnoreCase);
        var visiting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        bool Visit(string id)
        {
            if (visiting.Contains(id)) return true;
            if (!visited.Add(id) || !quests.TryGetValue(id, out var quest)) return false;
            visiting.Add(id);
            foreach (var dependency in quest.PrerequisiteQuestIds)
                if (Visit(dependency)) return true;
            visiting.Remove(id);
            return false;
        }
        foreach (var quest in document.Quests)
            if (Visit(quest.Id))
            {
                issues.Add(new(ValidationSeverity.Error, $"任務前置條件形成循環：{quest.Id}", quest));
                break;
            }
    }
}
