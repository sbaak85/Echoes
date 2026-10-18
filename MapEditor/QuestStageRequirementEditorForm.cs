namespace Echoes.MapEditor;

internal sealed class QuestStageRequirementEditorForm : Form
{
    private sealed record ModeChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed record ObjectiveStateChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private readonly QuestCatalogEntry[] _quests;
    private readonly QuestObjectiveCatalogEntry[] _objectives;
    private readonly ComboBox _mode = CreateCombo("stageMode");
    private readonly ComboBox _quest = CreateCombo("enableQuest");
    private readonly ComboBox _stage = CreateCombo("enableStage");
    private readonly ComboBox _objective = CreateCombo("enableObjective");
    private readonly ComboBox _objectiveState = CreateCombo("enableObjectiveState");
    private readonly ComboBox _disableQuest = CreateCombo("disableQuest");
    private readonly ComboBox _disableStage = CreateCombo("disableStage");
    private readonly ComboBox _disableObjective = CreateCombo("disableObjective");
    private readonly ComboBox _disableObjectiveState = CreateCombo("disableObjectiveState");
    private readonly ComboBox _removeQuest = CreateCombo("removeQuest");
    private readonly ComboBox _removeStage = CreateCombo("removeStage");
    private readonly ComboBox _removeObjective = CreateCombo("removeObjective");
    private readonly ComboBox _removeObjectiveState = CreateCombo("removeObjectiveState");

    public InteractionUseRequirement Requirement { get; private set; }

    public QuestStageRequirementEditorForm(
        IEnumerable<QuestCatalogEntry> quests,
        IEnumerable<QuestObjectiveCatalogEntry> objectives,
        InteractionUseRequirement requirement)
    {
        Requirement = requirement.Clone();
        Requirement.NormalizeRemovalCondition();
        requirement = Requirement;
        _quests = BuildQuestChoices(quests, requirement);
        _objectives = BuildObjectiveChoices(objectives, requirement);

        Text = "任務階段／目標啟用條件";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(620, 698);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);

        AddLabel("啟用模式", 24, 21);
        _mode.SetBounds(180, 16, 410, 30);
        _mode.Items.AddRange(new object[]
        {
            new ModeChoice("CurrentStageOnly", "CurrentStageOnly｜只在指定階段啟用"),
            new ModeChoice("UnlockFromStage", "UnlockFromStage｜到達指定階段後永久啟用"),
            new ModeChoice("UnlockUntilCondition", "UnlockUntilCondition｜到達後啟用，可稍後補關閉條件"),
        });
        _mode.SelectedIndex = Math.Max(0, _mode.Items.Cast<ModeChoice>()
            .Select((choice, index) => new { choice, index })
            .FirstOrDefault(entry => entry.choice.Id.Equals(
                requirement.StageMode,
                StringComparison.OrdinalIgnoreCase))?.index ?? 0);
        Controls.Add(_mode);

        AddLabel("啟用 Quest ID", 24, 65);
        _quest.SetBounds(180, 60, 410, 30);
        _quest.Items.AddRange(_quests.Cast<object>().ToArray());
        SelectQuest(_quest, requirement.QuestId);
        Controls.Add(_quest);

        AddLabel("允許互動的 Stage", 24, 109);
        _stage.SetBounds(180, 104, 410, 30);
        Controls.Add(_stage);
        PopulateStages(_quest, _stage, requirement.StageId);

        AddLabel("啟用 OBJ（選填）", 24, 153);
        _objective.SetBounds(180, 148, 410, 30);
        Controls.Add(_objective);
        PopulateObjectives(_quest, _stage, _objective, requirement.ObjectiveId);

        AddLabel("啟用 OBJ 狀態", 24, 197);
        _objectiveState.SetBounds(180, 192, 410, 30);
        PopulateObjectiveStates(_objectiveState, requirement.ObjectiveState);
        Controls.Add(_objectiveState);

        AddLabel("關閉 Quest ID", 24, 257);
        _disableQuest.SetBounds(180, 252, 410, 30);
        _disableQuest.Items.Add("（尚未指定關閉條件）");
        _disableQuest.Items.AddRange(_quests.Cast<object>().ToArray());
        SelectQuest(_disableQuest, requirement.DisableQuestId, allowEmpty: true);
        Controls.Add(_disableQuest);

        AddLabel("關閉條件 Stage", 24, 301);
        _disableStage.SetBounds(180, 296, 410, 30);
        Controls.Add(_disableStage);
        PopulateStages(
            _disableQuest,
            _disableStage,
            requirement.DisableStageId,
            allowEmpty: true);

        AddLabel("關閉 OBJ（選填）", 24, 345);
        _disableObjective.SetBounds(180, 340, 410, 30);
        Controls.Add(_disableObjective);
        PopulateObjectives(
            _disableQuest,
            _disableStage,
            _disableObjective,
            requirement.DisableObjectiveId);

        AddLabel("關閉 OBJ 狀態", 24, 389);
        _disableObjectiveState.SetBounds(180, 384, 410, 30);
        PopulateObjectiveStates(
            _disableObjectiveState,
            requirement.DisableObjectiveState ?? "completed");
        Controls.Add(_disableObjectiveState);

        AddLabel("移除 Quest ID", 24, 445);
        _removeQuest.SetBounds(180, 440, 410, 30);
        _removeQuest.Items.Add("（不設定移除條件）");
        _removeQuest.Items.AddRange(_quests.Cast<object>().ToArray());
        SelectQuest(_removeQuest, requirement.RemoveQuestId ?? "", allowEmpty: true);
        Controls.Add(_removeQuest);

        AddLabel("移除條件 Stage", 24, 489);
        _removeStage.SetBounds(180, 484, 410, 30);
        Controls.Add(_removeStage);
        PopulateStages(_removeQuest, _removeStage, requirement.RemoveStageId ?? "", allowEmpty: true);

        AddLabel("移除 OBJ（選填）", 24, 533);
        _removeObjective.SetBounds(180, 528, 410, 30);
        Controls.Add(_removeObjective);
        PopulateObjectives(_removeQuest, _removeStage, _removeObjective, requirement.RemoveObjectiveId);

        AddLabel("移除 OBJ 狀態", 24, 577);
        _removeObjectiveState.SetBounds(180, 572, 410, 30);
        PopulateObjectiveStates(_removeObjectiveState, requirement.RemoveObjectiveState ?? "completed");
        Controls.Add(_removeObjectiveState);
        var removalHelp = new Label
        {
            Text = "移除條件獨立於啟用／關閉；成立後不顯示、不回應，保留任務進度。",
            ForeColor = Color.FromArgb(169, 186, 201),
            AutoSize = true,
            Location = new Point(24, 615),
        };
        Controls.Add(removalHelp);

        var cancel = CreateButton("取消", 390, 648, 94, 34);
        cancel.DialogResult = DialogResult.Cancel;
        Controls.Add(cancel);
        var save = CreateButton("套用", 496, 648, 94, 34);
        save.Click += (_, _) => SaveRequirement();
        Controls.Add(save);
        AcceptButton = save;
        CancelButton = cancel;

        _quest.SelectedIndexChanged += (_, _) => PopulateStages(_quest, _stage, "");
        _stage.SelectedIndexChanged += (_, _) => PopulateObjectives(_quest, _stage, _objective, "");
        _objective.SelectedIndexChanged += (_, _) => RefreshObjectiveStateControl(
            _objective,
            _objectiveState,
            true);
        _disableQuest.SelectedIndexChanged += (_, _) => PopulateStages(
            _disableQuest,
            _disableStage,
            "",
            allowEmpty: true);
        _disableStage.SelectedIndexChanged += (_, _) => PopulateObjectives(
            _disableQuest,
            _disableStage,
            _disableObjective,
            "");
        _disableObjective.SelectedIndexChanged += (_, _) => RefreshObjectiveStateControl(
            _disableObjective,
            _disableObjectiveState,
            (_mode.SelectedItem as ModeChoice)?.Id == "UnlockUntilCondition");
        _mode.SelectedIndexChanged += (_, _) => RefreshDisableControls();
        _removeQuest.SelectedIndexChanged += (_, _) => PopulateStages(
            _removeQuest, _removeStage, "", allowEmpty: true);
        _removeStage.SelectedIndexChanged += (_, _) => PopulateObjectives(
            _removeQuest, _removeStage, _removeObjective, "");
        _removeObjective.SelectedIndexChanged += (_, _) => RefreshObjectiveStateControl(
            _removeObjective, _removeObjectiveState, true);
        RefreshObjectiveStateControl(_removeObjective, _removeObjectiveState, true);
        RefreshDisableControls();
    }

    private void SaveRequirement()
    {
        if (_quest.SelectedItem is not QuestCatalogEntry quest ||
            _stage.SelectedItem is not QuestStageCatalogEntry stage)
        {
            MessageBox.Show("請選擇啟用任務與階段。", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var mode = (_mode.SelectedItem as ModeChoice)?.Id ?? "CurrentStageOnly";
        var disableQuest = _disableQuest.SelectedItem as QuestCatalogEntry;
        var disableStage = _disableStage.SelectedItem as QuestStageCatalogEntry;
        var objective = _objective.SelectedItem as QuestObjectiveCatalogEntry;
        var disableObjective = _disableObjective.SelectedItem as QuestObjectiveCatalogEntry;
        var hasCompleteDisableCondition = mode == "UnlockUntilCondition" &&
            disableQuest is not null && disableStage is not null;
        var removeQuest = _removeQuest.SelectedItem as QuestCatalogEntry;
        var removeStage = _removeStage.SelectedItem as QuestStageCatalogEntry;
        var removeObjective = _removeObjective.SelectedItem as QuestObjectiveCatalogEntry;
        if (removeQuest is not null && removeStage is null)
        {
            MessageBox.Show("請指定移除條件 Stage，或清空移除 Quest 以取消移除設定。", Text,
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        Requirement = new InteractionUseRequirement
        {
            Kind = "questStage",
            Scope = Requirement.Scope,
            RemoveQuestId = removeQuest?.Id,
            RemoveStageId = removeStage?.Id,
            RemoveObjectiveId = removeObjective?.Id,
            RemoveObjectiveState = removeObjective is null ? null :
                (_removeObjectiveState.SelectedItem as ObjectiveStateChoice)?.Id ?? "completed",
            QuestId = quest.Id,
            StageId = stage.Id,
            StageMode = mode,
            ObjectiveId = objective?.Id,
            ObjectiveState = objective is null
                ? null
                : (_objectiveState.SelectedItem as ObjectiveStateChoice)?.Id ?? "unlocked",
            DisableQuestId = hasCompleteDisableCondition ? disableQuest!.Id : "",
            DisableStageId = hasCompleteDisableCondition ? disableStage!.Id : "",
            DisableObjectiveId = hasCompleteDisableCondition ? disableObjective?.Id : null,
            DisableObjectiveState = hasCompleteDisableCondition && disableObjective is not null
                ? (_disableObjectiveState.SelectedItem as ObjectiveStateChoice)?.Id ?? "completed"
                : null,
        };
        DialogResult = DialogResult.OK;
        Close();
    }

    private void RefreshDisableControls()
    {
        var enabled = (_mode.SelectedItem as ModeChoice)?.Id == "UnlockUntilCondition";
        _disableQuest.Enabled = enabled;
        _disableStage.Enabled = enabled;
        _disableObjective.Enabled = enabled;
        RefreshObjectiveStateControl(_objective, _objectiveState, true);
        RefreshObjectiveStateControl(_disableObjective, _disableObjectiveState, enabled);
    }

    private static QuestObjectiveCatalogEntry[] BuildObjectiveChoices(
        IEnumerable<QuestObjectiveCatalogEntry> source,
        InteractionUseRequirement current)
    {
        var values = source.ToList();
        AddFallback(current.QuestId, current.StageId, current.ObjectiveId);
        AddFallback(
            current.DisableQuestId,
            current.DisableStageId,
            current.DisableObjectiveId);
        AddFallback(current.RemoveQuestId ?? "", current.RemoveStageId ?? "", current.RemoveObjectiveId);
        return values
            .GroupBy(objective => objective.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(objective => objective.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        void AddFallback(string questId, string stageId, string? objectiveId)
        {
            if (string.IsNullOrWhiteSpace(objectiveId) ||
                values.Any(objective => objective.Id.Equals(
                    objectiveId,
                    StringComparison.OrdinalIgnoreCase))) return;
            values.Add(new QuestObjectiveCatalogEntry(
                objectiveId.Trim(),
                "（目前場景使用中）",
                questId,
                stageId));
        }
    }

    private static QuestCatalogEntry[] BuildQuestChoices(
        IEnumerable<QuestCatalogEntry> source,
        InteractionUseRequirement current)
    {
        var values = source.ToList();
        AddFallback(current.QuestId, current.StageId);
        AddFallback(current.DisableQuestId, current.DisableStageId);
        AddFallback(current.RemoveQuestId ?? "", current.RemoveStageId ?? "");
        return values
            .GroupBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        void AddFallback(string questId, string stageId)
        {
            if (string.IsNullOrWhiteSpace(questId) ||
                values.Any(quest => quest.Id.Equals(questId, StringComparison.OrdinalIgnoreCase))) return;
            values.Add(new QuestCatalogEntry(
                questId,
                "（目前場景使用中）",
                string.IsNullOrWhiteSpace(stageId)
                    ? Array.Empty<QuestStageCatalogEntry>()
                    : new[] { new QuestStageCatalogEntry(stageId, "（目前場景使用中）") }));
        }
    }

    private static void SelectQuest(ComboBox combo, string questId, bool allowEmpty = false)
    {
        if (allowEmpty && string.IsNullOrWhiteSpace(questId))
        {
            combo.SelectedIndex = 0;
            return;
        }
        var index = combo.Items.Cast<object>()
            .Select((quest, itemIndex) => new { quest, itemIndex })
            .FirstOrDefault(entry =>
                entry.quest is QuestCatalogEntry quest &&
                quest.Id.Equals(questId, StringComparison.OrdinalIgnoreCase))
            ?.itemIndex ?? (allowEmpty ? 0 : combo.Items.Count > 0 ? 0 : -1);
        combo.SelectedIndex = index;
    }

    private static void PopulateStages(
        ComboBox questCombo,
        ComboBox stageCombo,
        string selectedStageId,
        bool allowEmpty = false)
    {
        stageCombo.BeginUpdate();
        stageCombo.Items.Clear();
        if (allowEmpty) stageCombo.Items.Add("（尚未指定 Stage）");
        if (questCombo.SelectedItem is QuestCatalogEntry quest)
            stageCombo.Items.AddRange(quest.StageEntries.Cast<object>().ToArray());
        var index = stageCombo.Items.Cast<object>()
            .Select((stage, itemIndex) => new { stage, itemIndex })
            .FirstOrDefault(entry =>
                entry.stage is QuestStageCatalogEntry stage &&
                stage.Id.Equals(selectedStageId, StringComparison.OrdinalIgnoreCase))
            ?.itemIndex ?? (stageCombo.Items.Count > 0 ? 0 : -1);
        stageCombo.SelectedIndex = index;
        stageCombo.EndUpdate();
    }

    private void PopulateObjectives(
        ComboBox questCombo,
        ComboBox stageCombo,
        ComboBox objectiveCombo,
        string? selectedObjectiveId)
    {
        objectiveCombo.BeginUpdate();
        objectiveCombo.Items.Clear();
        objectiveCombo.Items.Add("（不指定 OBJ，僅依 Stage）");
        if (questCombo.SelectedItem is QuestCatalogEntry quest &&
            stageCombo.SelectedItem is QuestStageCatalogEntry stage)
        {
            objectiveCombo.Items.AddRange(_objectives
                .Where(objective =>
                    objective.QuestId.Equals(quest.Id, StringComparison.OrdinalIgnoreCase) &&
                    objective.StageId.Equals(stage.Id, StringComparison.OrdinalIgnoreCase))
                .Cast<object>()
                .ToArray());
        }
        var index = objectiveCombo.Items.Cast<object>()
            .Select((objective, itemIndex) => new { objective, itemIndex })
            .FirstOrDefault(entry =>
                entry.objective is QuestObjectiveCatalogEntry objective &&
                objective.Id.Equals(selectedObjectiveId, StringComparison.OrdinalIgnoreCase))
            ?.itemIndex ?? 0;
        objectiveCombo.SelectedIndex = index;
        objectiveCombo.EndUpdate();
    }

    private static void PopulateObjectiveStates(ComboBox combo, string? selectedState)
    {
        combo.Items.AddRange(new object[]
        {
            new ObjectiveStateChoice("unlocked", "OBJ 已啟用／顯示（完成後仍成立）"),
            new ObjectiveStateChoice("completed", "OBJ 已完成／核取"),
        });
        combo.SelectedIndex = combo.Items.Cast<ObjectiveStateChoice>()
            .Select((state, index) => new { state, index })
            .FirstOrDefault(entry => entry.state.Id.Equals(
                selectedState,
                StringComparison.OrdinalIgnoreCase))
            ?.index ?? 0;
    }

    private static void RefreshObjectiveStateControl(
        ComboBox objectiveCombo,
        ComboBox stateCombo,
        bool parentEnabled)
    {
        stateCombo.Enabled = parentEnabled &&
            objectiveCombo.SelectedItem is QuestObjectiveCatalogEntry;
    }

    private void AddLabel(string text, int x, int y)
    {
        Controls.Add(new Label
        {
            Text = text,
            Left = x,
            Top = y,
            Width = 146,
            Height = 26,
            ForeColor = Color.FromArgb(196, 209, 221),
            TextAlign = ContentAlignment.MiddleLeft,
        });
    }

    private static ComboBox CreateCombo(string name) => new()
    {
        Name = name,
        DropDownStyle = ComboBoxStyle.DropDownList,
        BackColor = Color.FromArgb(35, 39, 47),
        ForeColor = Color.FromArgb(226, 230, 234),
        FlatStyle = FlatStyle.Flat,
    };

    private static Button CreateButton(string text, int x, int y, int width, int height) => new()
    {
        Text = text,
        Left = x,
        Top = y,
        Width = width,
        Height = height,
        FlatStyle = FlatStyle.Flat,
        BackColor = Color.FromArgb(38, 43, 52),
        ForeColor = Color.FromArgb(226, 230, 234),
    };
}
