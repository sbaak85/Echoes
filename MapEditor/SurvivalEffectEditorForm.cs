namespace Echoes.MapEditor;

public sealed class SurvivalEffectEditorForm : Form
{
    private sealed record TeleportPointChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed record UseRequirementChoice(string Kind, string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed record RequirementScopeChoice(string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed class UseRequirementControls
    {
        public Panel Row { get; } = new();
        public ComboBox Scope { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public ComboBox Target { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public ComboBox Amount { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public Button StageSettings { get; } = CreateButton("設定…", 0, 0, 136, 28);
        public InteractionUseRequirement StageRequirement { get; set; } = new()
        {
            Kind = "questStage",
            StageMode = "CurrentStageOnly",
        };
        public InteractionUseRequirement StateRequirement { get; set; } = new()
        {
            Kind = "questState",
            QuestState = "completed",
        };
        public Button Remove { get; } = CreateButton("×", 0, 0, 32, 28);
    }

    private sealed class RewardControls
    {
        public Panel Row { get; } = new();
        public ComboBox Item { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public NumericUpDown Quantity { get; } = new() { Minimum = 1, Maximum = 99, Value = 1 };
        public ComboBox Delivery { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public Button Remove { get; } = CreateButton("×", 0, 0, 32, 28);
    }

    private sealed class RequirementControls
    {
        public ComboBox Mode { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public NumericUpDown Value { get; } = CreateRequirementValueInput();
    }

    private static readonly object[] RequirementAmountItems =
        Enumerable.Range(1, 99).Cast<object>().ToArray();
    private readonly UseRequirementChoice[] _useRequirementChoiceItems;
    private readonly object[] _useRequirementComboItems;
    private readonly UseRequirementChoice[] _questChoiceItems;
    private readonly QuestCatalogEntry[] _quests;
    private readonly RequirementControls _staminaRequirement = new();
    private readonly RequirementControls _hungerRequirement = new();
    private readonly RequirementControls _thirstRequirement = new();
    private readonly RequirementControls _spiritRequirement = new();
    private readonly ComboBox _requirementMatchMode = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly NumericUpDown _stamina = CreateEffectValueInput();
    private readonly NumericUpDown _hunger = CreateEffectValueInput();
    private readonly NumericUpDown _thirst = CreateEffectValueInput();
    private readonly NumericUpDown _spirit = CreateEffectValueInput();
    private readonly NumericUpDown _timeHours = new()
    {
        Minimum = 0,
        Maximum = 168,
        DecimalPlaces = 1,
        Increment = 0.5m,
        TextAlign = HorizontalAlignment.Right,
    };
    private readonly ComboBox _dailyLimit = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly Button _useRequirementToggle = CreateButton("", 18, 320, 350, 32);
    private readonly Button _addUseRequirementButton = CreateButton("＋", 378, 320, 46, 32);
    private readonly CheckBox _allowAttemptWhenRequirementsUnmet = new()
    {
        Text = "無視提示條件，仍顯示並可嘗試",
        AutoSize = true,
    };
    private readonly ComboBox _completionTeleportPoint = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
    };
    private readonly NumericUpDown _completionTeleportDelay = new()
    {
        Minimum = 0,
        Maximum = 3600,
        DecimalPlaces = 1,
        Increment = 0.1m,
        TextAlign = HorizontalAlignment.Right,
    };
    private readonly Panel _useRequirementList = new()
    {
        AutoScroll = true,
        BackColor = Color.FromArgb(19, 22, 27),
        BorderStyle = BorderStyle.FixedSingle,
    };
    private readonly List<UseRequirementControls> _useRequirementRows = new();
    private readonly bool _showRequirementScope;
    private bool _useRequirementsExpanded;
    private readonly Button _rewardToggle = CreateButton("", 18, 378, 350, 32);
    private readonly Button _addRewardButton = CreateButton("＋", 378, 378, 46, 32);
    private readonly Panel _rewardList = new()
    {
        AutoScroll = true,
        BackColor = Color.FromArgb(19, 22, 27),
        BorderStyle = BorderStyle.FixedSingle,
    };
    private readonly List<RewardControls> _rewardRows = new();
    private bool _rewardsExpanded;
    private readonly CheckedListBox _startQuestList = new()
    {
        CheckOnClick = true,
        BackColor = Color.FromArgb(19, 22, 27),
        ForeColor = Color.FromArgb(226, 230, 234),
        BorderStyle = BorderStyle.FixedSingle,
    };
    private readonly InteractionTypeDefaults _defaults;

    public SurvivalRequirements Requirements => new()
    {
        Mode = _requirementMatchMode.SelectedIndex == 1 ? "any" : "all",
        Stamina = ReadRequirement(_staminaRequirement),
        Hunger = ReadRequirement(_hungerRequirement),
        Thirst = ReadRequirement(_thirstRequirement),
        Spirit = ReadRequirement(_spiritRequirement),
    };

    public SurvivalEffects Effects => new()
    {
        Stamina = (float)_stamina.Value,
        Hunger = (float)_hunger.Value,
        Thirst = (float)_thirst.Value,
        Spirit = (float)_spirit.Value,
        TimeMinutes = (float)_timeHours.Value * 60,
    };

    public string? InteractionLimitMode => _dailyLimit.SelectedIndex == 1
        ? "once"
        : null;

    public int? DailyLimit => _dailyLimit.SelectedIndex < 2
        ? null
        : _dailyLimit.SelectedIndex - 1;

    public List<InteractionUseRequirement> UseRequirements => _useRequirementRows
        .Select(ReadUseRequirement)
        .ToList();

    public bool AllowAttemptWhenRequirementsUnmet =>
        _allowAttemptWhenRequirementsUnmet.Checked;

    public string? CompletionTeleportPointId =>
        (_completionTeleportPoint.SelectedItem as TeleportPointChoice)?.Id is { Length: > 0 } id
            ? id
            : null;

    public float CompletionTeleportDelaySeconds =>
        (float)_completionTeleportDelay.Value;

    public List<InteractionItemReward> ItemRewards =>
        _rewardRows.Select(ReadReward).ToList();

    public List<string> StartQuestIds =>
        _startQuestList.CheckedItems
            .Cast<QuestCatalogEntry>()
            .Select(quest => quest.Id)
            .ToList();

    public SurvivalEffectEditorForm(
        string interactionType,
        SurvivalRequirements requirements,
        SurvivalEffects effects,
        int? dailyLimit,
        string? interactionLimitMode,
        IEnumerable<InteractionUseRequirement>? useRequirements,
        IEnumerable<InteractionItemReward>? itemRewards,
        IEnumerable<QuestCatalogEntry>? quests,
        IEnumerable<string>? startQuestIds = null,
        bool showQuestStartOptions = false,
        bool allowAttemptWhenRequirementsUnmet = false,
        bool showAllowAttemptOption = true,
        IEnumerable<SceneTeleportPoint>? teleportPoints = null,
        string? completionTeleportPointId = null,
        float completionTeleportDelaySeconds = 0,
        bool showCompletionTeleportOption = false,
        bool showEffectsPage = true)
    {
        SuspendLayout();
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer,
            true);
        _defaults = InteractionTypeDefaults.Get(interactionType);
        _showRequirementScope = showAllowAttemptOption;
        var useRequirementList = useRequirements?
            .Select(requirement => requirement.Clone())
            .ToList() ?? new List<InteractionUseRequirement>();
        var configuredStartQuestIds = (startQuestIds ?? Array.Empty<string>())
            .Select(questId => questId.Trim())
            .Where(questId => questId.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var questList = (quests ?? Array.Empty<QuestCatalogEntry>())
            .Concat(useRequirementList
                .Where(requirement =>
                    (requirement.Kind.Equals("quest", StringComparison.OrdinalIgnoreCase) ||
                     requirement.Kind.Equals("questState", StringComparison.OrdinalIgnoreCase)) &&
                    !string.IsNullOrWhiteSpace(requirement.QuestId))
                .Select(requirement => new QuestCatalogEntry(
                    requirement.QuestId.Trim(),
                    "（目前場景使用中）")))
            .Concat(configuredStartQuestIds.Select(questId =>
                new QuestCatalogEntry(questId, "（資料庫中未找到）")))
            .GroupBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(quest => quest.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        _questChoiceItems = questList
            .Select(quest => new UseRequirementChoice(
                "quest",
                quest.Id,
                $"{quest.Id}｜{quest.Name}"))
            .ToArray();
        _quests = questList;
        _useRequirementChoiceItems = ItemCatalog.All
            .Select(item => new UseRequirementChoice("item", item.Id, $"道具｜{item.Name}"))
            .Append(new UseRequirementChoice("chapter", "chapter", "進度｜當前章節"))
            .Append(new UseRequirementChoice("quest", "quest", "進度｜需求任務"))
            .Append(new UseRequirementChoice("questState", "questState", "進度｜任務狀態"))
            .Append(new UseRequirementChoice("questStage", "questStage", "進度｜任務階段"))
            .Append(new UseRequirementChoice("campPower", "campPower", "資源｜營地電力"))
            .ToArray();
        _useRequirementComboItems = _useRequirementChoiceItems.Cast<object>().ToArray();
        Text = showEffectsPage ? "互動需求與完成效果" : "出入口需求條件";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(520, 760);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);

        var tabs = new TabControl
        {
            Left = 18,
            Top = 18,
            Width = 464,
            Height = 680,
        };
        var requirementPage = CreateTab("使用需求");
        var effectPage = CreateTab("完成效果");
        var questStartPage = showQuestStartOptions
            ? CreateTab("任務啟動")
            : null;
        tabs.SuspendLayout();
        requirementPage.SuspendLayout();
        effectPage.SuspendLayout();
        tabs.TabPages.Add(requirementPage);
        if (showEffectsPage) tabs.TabPages.Add(effectPage);
        if (questStartPage is not null) tabs.TabPages.Add(questStartPage);
        Controls.Add(tabs);

        BuildRequirementsPage(
            requirementPage,
            requirements ?? new SurvivalRequirements(),
            useRequirementList,
            allowAttemptWhenRequirementsUnmet,
            showAllowAttemptOption);
        if (showEffectsPage)
        {
            BuildEffectsPage(
                effectPage,
                effects ?? new SurvivalEffects(),
                dailyLimit,
                interactionLimitMode,
                itemRewards?.Select(reward => reward.Clone()).ToList() ?? new(),
                teleportPoints?.ToArray() ?? Array.Empty<SceneTeleportPoint>(),
                completionTeleportPointId,
                completionTeleportDelaySeconds,
                showCompletionTeleportOption);
        }
        if (questStartPage is not null)
        {
            BuildQuestStartPage(questStartPage, configuredStartQuestIds);
        }

        var cancelButton = CreateButton("取消", 326, 710, 82, 34);
        cancelButton.DialogResult = DialogResult.Cancel;
        Controls.Add(cancelButton);
        var saveButton = CreateButton("儲存", 416, 710, 86, 34);
        saveButton.DialogResult = DialogResult.OK;
        Controls.Add(saveButton);
        AcceptButton = saveButton;
        CancelButton = cancelButton;

        requirementPage.ResumeLayout(false);
        effectPage.ResumeLayout(false);
        tabs.ResumeLayout(false);
        ResumeLayout(false);
    }

    private void BuildRequirementsPage(
        Control page,
        SurvivalRequirements requirements,
        IReadOnlyCollection<InteractionUseRequirement> useRequirements,
        bool allowAttemptWhenRequirementsUnmet,
        bool showAllowAttemptOption)
    {
        var explanation = new Label
        {
            Text = "預設為無限制。複數生存條件可設為全部或任一成立；營地電力為獨立最低門檻。",
            AutoSize = false,
            ForeColor = Color.FromArgb(154, 166, 177),
        };
        explanation.SetBounds(18, 18, 410, 44);
        page.Controls.Add(explanation);

        var matchModeLabel = AddFieldLabel(page, "條件組合", 69);
        matchModeLabel.Width = 106;
        _requirementMatchMode.SetBounds(136, 66, 286, 28);
        _requirementMatchMode.Items.AddRange(new object[]
        {
            "全部成立（AND）",
            "任一成立（OR）",
        });
        _requirementMatchMode.SelectedIndex = "any".Equals(
            requirements.Mode,
            StringComparison.OrdinalIgnoreCase)
            ? 1
            : 0;
        page.Controls.Add(_requirementMatchMode);

        AddRequirementRow(page, "體力", _staminaRequirement, 108, requirements.Stamina);
        AddRequirementRow(page, "飢餓", _hungerRequirement, 154, requirements.Hunger);
        AddRequirementRow(page, "口渴", _thirstRequirement, 200, requirements.Thirst);
        AddRequirementRow(page, "精神", _spiritRequirement, 246, requirements.Spirit);

        var example = new Label
        {
            Text = "營火範例：選「任一成立」，體力與精神皆選「以下」99。",
            AutoSize = false,
            ForeColor = Color.FromArgb(129, 222, 211),
        };
        example.SetBounds(18, 282, 410, 34);
        page.Controls.Add(example);

        _useRequirementToggle.Click += (_, _) =>
        {
            _useRequirementsExpanded = !_useRequirementsExpanded;
            RefreshUseRequirementLayout();
        };
        page.Controls.Add(_useRequirementToggle);
        _addUseRequirementButton.Click += (_, _) =>
        {
            AddUseRequirementRow(new InteractionUseRequirement
            {
                Kind = "item",
                ItemId = ItemCatalog.All[0].Id,
                Quantity = 1,
            });
            _useRequirementsExpanded = true;
            RefreshUseRequirementLayout();
        };
        page.Controls.Add(_addUseRequirementButton);
        _useRequirementList.SetBounds(18, 360, 406, 100);
        if (_showRequirementScope)
        {
            var scopeHeader = new Label
            {
                Text = "用途",
                AutoSize = false,
                ForeColor = Color.FromArgb(145, 158, 170),
            };
            scopeHeader.SetBounds(8, 2, 88, 20);
            _useRequirementList.Controls.Add(scopeHeader);
        }
        var targetHeader = new Label
        {
            Text = "條件項目",
            AutoSize = false,
            ForeColor = Color.FromArgb(145, 158, 170),
        };
        targetHeader.SetBounds(_showRequirementScope ? 106 : 8, 2,
            _showRequirementScope ? 126 : 230, 20);
        _useRequirementList.Controls.Add(targetHeader);
        var amountHeader = new Label
        {
            Text = "設定",
            AutoSize = false,
            ForeColor = Color.FromArgb(145, 158, 170),
        };
        amountHeader.SetBounds(244, 2, 88, 20);
        _useRequirementList.Controls.Add(amountHeader);
        page.Controls.Add(_useRequirementList);
        _useRequirementList.SuspendLayout();
        foreach (var requirement in useRequirements)
        {
            AddUseRequirementRow(requirement, refreshLayout: false);
        }
        _useRequirementList.ResumeLayout(false);
        _useRequirementsExpanded = useRequirements.Count is > 0 and <= 2;
        RefreshUseRequirementLayout();

        var clearButton = CreateButton("清除所有需求", 18, 466, 150, 34);
        clearButton.Click += (_, _) =>
        {
            _requirementMatchMode.SelectedIndex = 0;
            foreach (var controls in RequirementRows()) controls.Mode.SelectedIndex = 0;
            foreach (var row in _useRequirementRows.ToList()) RemoveUseRequirementRow(row);
        };
        page.Controls.Add(clearButton);

        if (showAllowAttemptOption)
        {
            _allowAttemptWhenRequirementsUnmet.Checked =
                allowAttemptWhenRequirementsUnmet;
            _allowAttemptWhenRequirementsUnmet.SetBounds(18, 516, 390, 28);
            page.Controls.Add(_allowAttemptWhenRequirementsUnmet);

            var attemptExplanation = new Label
            {
                Text = "通常請用每條需求的「用途」設定。勾選此項會無視所有提示條件，仍顯示並允許嘗試。",
                AutoSize = false,
                ForeColor = Color.FromArgb(154, 166, 177),
            };
            attemptExplanation.SetBounds(38, 548, 386, 54);
            page.Controls.Add(attemptExplanation);
        }
    }

    private void AddUseRequirementRow(
        InteractionUseRequirement requirement,
        bool refreshLayout = true)
    {
        var controls = new UseRequirementControls();
        controls.Row.SuspendLayout();
        controls.Row.Height = 38;
        controls.Row.Width = 378;
        controls.Row.BackColor = Color.FromArgb(25, 28, 34);
        controls.Scope.Items.AddRange(new object[]
        {
            new RequirementScopeChoice("both", "提示＋互動"),
            new RequirementScopeChoice("prompt", "僅提示"),
            new RequirementScopeChoice("interaction", "僅互動"),
        });
        controls.Scope.SelectedIndex = requirement.Scope switch
        {
            "prompt" => 1,
            "interaction" => 2,
            _ => 0,
        };
        controls.Scope.DropDownWidth = 112;
        controls.Target.SetBounds(_showRequirementScope ? 102 : 4, 5,
            _showRequirementScope ? 132 : 180, 28);
        controls.Target.DropDownWidth = 280;
        controls.Target.BeginUpdate();
        controls.Target.Items.AddRange(_useRequirementComboItems);
        controls.Target.SelectedIndex = _useRequirementChoiceItems
            .Select((choice, index) => new { choice, index })
            .FirstOrDefault(entry =>
                entry.choice.Kind.Equals(requirement.Kind, StringComparison.OrdinalIgnoreCase) &&
                (entry.choice.Kind is "chapter" or "quest" or "questState" or "questStage" or "campPower" ||
                 entry.choice.Kind == "item" &&
                 entry.choice.Id.Equals(requirement.ItemId, StringComparison.OrdinalIgnoreCase)))
            ?.index ?? 0;
        controls.Target.EndUpdate();
        controls.Amount.SetBounds(240, 5, 92, 28);
        controls.StageSettings.SetBounds(240, 5, 92, 28);
        controls.StageSettings.Click += (_, _) => EditSpecialRequirement(controls);
        ConfigureRequirementAmount(controls, requirement);
        controls.Target.SelectedIndexChanged += (_, _) =>
            ConfigureRequirementAmount(controls, null);
        controls.Remove.SetBounds(338, 5, 32, 28);
        controls.Remove.Click += (_, _) => RemoveUseRequirementRow(controls);
        if (_showRequirementScope)
        {
            controls.Scope.SetBounds(4, 5, 92, 28);
            controls.Row.Controls.Add(controls.Scope);
        }
        controls.Row.Controls.Add(controls.Target);
        controls.Row.Controls.Add(controls.Amount);
        controls.Row.Controls.Add(controls.StageSettings);
        controls.Row.Controls.Add(controls.Remove);
        controls.Row.ResumeLayout(false);
        _useRequirementRows.Add(controls);
        _useRequirementList.Controls.Add(controls.Row);
        if (refreshLayout) RefreshUseRequirementLayout();
    }

    private void RemoveUseRequirementRow(UseRequirementControls controls)
    {
        _useRequirementRows.Remove(controls);
        _useRequirementList.Controls.Remove(controls.Row);
        controls.Row.Dispose();
        RefreshUseRequirementLayout();
    }

    private void RefreshUseRequirementLayout()
    {
        for (var index = 0; index < _useRequirementRows.Count; index++)
        {
            _useRequirementRows[index].Row.SetBounds(4, 24 + index * 40, 378, 38);
        }
        _useRequirementToggle.Text =
            $"{(_useRequirementsExpanded ? "▼" : "▶")} 提示／互動需求（{_useRequirementRows.Count}）";
        _useRequirementList.Visible = _useRequirementsExpanded;
    }

    private void ConfigureRequirementAmount(
        UseRequirementControls controls,
        InteractionUseRequirement? existing)
    {
        var choice = controls.Target.SelectedItem as UseRequirementChoice ??
            _useRequirementChoiceItems[0];
        controls.Amount.BeginUpdate();
        controls.Amount.Items.Clear();
        if (choice.Kind == "questStage")
        {
            controls.StageRequirement = existing?.Kind.Equals(
                "questStage",
                StringComparison.OrdinalIgnoreCase) == true
                ? existing.Clone()
                : new InteractionUseRequirement
                {
                    Kind = "questStage",
                    QuestId = _quests.FirstOrDefault()?.Id ?? "",
                    StageId = _quests.FirstOrDefault()?.StageEntries.FirstOrDefault()?.Id ?? "",
                    StageMode = "CurrentStageOnly",
                };
            controls.Amount.Visible = false;
            controls.StageSettings.Visible = true;
            RefreshStageRequirementButton(controls);
        }
        else if (choice.Kind == "questState")
        {
            controls.StateRequirement = existing?.Kind.Equals(
                "questState",
                StringComparison.OrdinalIgnoreCase) == true
                ? existing.Clone()
                : new InteractionUseRequirement
                {
                    Kind = "questState",
                    QuestId = _quests.FirstOrDefault()?.Id ?? "",
                    QuestState = "completed",
                };
            controls.Amount.Visible = false;
            controls.StageSettings.Visible = true;
            RefreshStateRequirementButton(controls);
        }
        else if (choice.Kind == "quest")
        {
            controls.Amount.Visible = true;
            controls.StageSettings.Visible = false;
            controls.Amount.DropDownStyle = ComboBoxStyle.DropDown;
            controls.Amount.Items.AddRange(_questChoiceItems.Cast<object>().ToArray());
            var questId = existing?.QuestId?.Trim() ?? "";
            var selectedIndex = _questChoiceItems
                .Select((quest, index) => new { quest, index })
                .FirstOrDefault(entry => entry.quest.Id.Equals(
                    questId,
                    StringComparison.OrdinalIgnoreCase))
                ?.index ?? -1;
            if (selectedIndex >= 0)
            {
                controls.Amount.SelectedIndex = selectedIndex;
            }
            else
            {
                controls.Amount.Text = questId;
            }
            controls.Amount.Enabled = true;
        }
        else
        {
            controls.Amount.Visible = true;
            controls.StageSettings.Visible = false;
            controls.Amount.DropDownStyle = ComboBoxStyle.DropDownList;
            var amountItems = choice.Kind == "campPower"
                ? Enumerable.Range(1, 50).Cast<object>().ToArray()
                : RequirementAmountItems;
            controls.Amount.Items.AddRange(amountItems);
            var amount = choice.Kind == "campPower"
                ? existing?.MinimumPower ?? 1
                : choice.Kind == "chapter"
                ? existing?.Chapter ?? 1
                : existing?.Quantity ?? 1;
            controls.Amount.SelectedIndex = Math.Clamp(amount - 1, 0, amountItems.Length - 1);
            controls.Amount.Enabled = true;
        }
        controls.Amount.EndUpdate();
    }

    private InteractionUseRequirement ReadUseRequirement(
        UseRequirementControls controls)
    {
        var choice = controls.Target.SelectedItem as UseRequirementChoice ??
            _useRequirementChoiceItems[0];
        var amount = Math.Max(1, controls.Amount.SelectedIndex + 1);
        var selectedQuest = controls.Amount.SelectedItem as UseRequirementChoice;
        var requirement = choice.Kind == "questStage"
            ? controls.StageRequirement.Clone()
            : choice.Kind == "questState"
            ? controls.StateRequirement.Clone()
            : choice.Kind == "quest"
            ? new InteractionUseRequirement
            {
                Kind = "quest",
                QuestId = selectedQuest?.Id ?? controls.Amount.Text.Trim(),
            }
            : choice.Kind == "chapter"
            ? new InteractionUseRequirement
            {
                Kind = "chapter",
                Chapter = amount,
            }
            : choice.Kind == "campPower"
            ? new InteractionUseRequirement
            {
                Kind = "campPower",
                MinimumPower = amount,
            }
            : new InteractionUseRequirement
            {
                Kind = "item",
                ItemId = choice.Id,
                Quantity = amount,
            };
        requirement.Scope =
            (controls.Scope.SelectedItem as RequirementScopeChoice)?.Id ?? "both";
        return requirement;
    }

    private void EditSpecialRequirement(UseRequirementControls controls)
    {
        var choice = controls.Target.SelectedItem as UseRequirementChoice;
        if (choice?.Kind == "questState")
        {
            EditStateRequirement(controls);
            return;
        }
        EditStageRequirement(controls);
    }

    private void EditStageRequirement(UseRequirementControls controls)
    {
        using var editor = new QuestStageRequirementEditorForm(_quests, controls.StageRequirement);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        controls.StageRequirement = editor.Requirement;
        RefreshStageRequirementButton(controls);
    }

    private void EditStateRequirement(UseRequirementControls controls)
    {
        using var editor = new QuestStateRequirementEditorForm(_quests, controls.StateRequirement);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        controls.StateRequirement = editor.Requirement;
        RefreshStateRequirementButton(controls);
    }

    private static void RefreshStageRequirementButton(UseRequirementControls controls)
    {
        var requirement = controls.StageRequirement;
        controls.StageSettings.Text = string.IsNullOrWhiteSpace(requirement.StageId)
            ? "設定…"
            : $"{ModeShortLabel(requirement.StageMode)}｜{requirement.StageId}";
    }

    private static void RefreshStateRequirementButton(UseRequirementControls controls)
    {
        var requirement = controls.StateRequirement;
        var state = requirement.QuestState switch
        {
            "locked" => "未解鎖",
            "available" => "可啟動",
            "active" => "進行中",
            "failed" => "失敗",
            "abandoned" => "已放棄",
            _ => "已完成",
        };
        controls.StageSettings.Text = string.IsNullOrWhiteSpace(requirement.QuestId)
            ? "設定任務狀態…"
            : $"{state}｜{requirement.QuestId}";
    }

    private static string ModeShortLabel(string mode) => mode switch
    {
        "UnlockFromStage" => "永久",
        "UnlockUntilCondition" => "直到關閉",
        _ => "本階段",
    };

    private void BuildEffectsPage(
        Control page,
        SurvivalEffects effects,
        int? dailyLimit,
        string? interactionLimitMode,
        IReadOnlyCollection<InteractionItemReward> itemRewards,
        IReadOnlyCollection<SceneTeleportPoint> teleportPoints,
        string? completionTeleportPointId,
        float completionTeleportDelaySeconds,
        bool showCompletionTeleportOption)
    {
        var explanation = new Label
        {
            Text = "對話完整結束後才套用。正數為恢復，負數為消耗；經過時間也會造成自然消耗。",
            AutoSize = false,
            ForeColor = Color.FromArgb(154, 166, 177),
        };
        explanation.SetBounds(18, 18, 410, 44);
        page.Controls.Add(explanation);

        AddEffectRow(page, "體力", _stamina, 70, effects.Stamina);
        AddEffectRow(page, "飢餓", _hunger, 112, effects.Hunger);
        AddEffectRow(page, "口渴", _thirst, 154, effects.Thirst);
        AddEffectRow(page, "精神", _spirit, 196, effects.Spirit);

        AddFieldLabel(page, "經過時間（小時）", 246);
        _timeHours.SetBounds(186, 243, 236, 28);
        _timeHours.Value = Math.Clamp(
            (decimal)effects.TimeMinutes / 60,
            _timeHours.Minimum,
            _timeHours.Maximum);
        page.Controls.Add(_timeHours);

        AddFieldLabel(page, "每日允許互動次數", 290);
        page.Controls.OfType<Label>().Last().Text = "互動次數限制";
        _dailyLimit.SetBounds(186, 287, 236, 28);
        _dailyLimit.Items.Add("無限");
        _dailyLimit.Items.Add("唯一一次（不重置）");
        for (var value = 1; value <= 10; value++)
        {
            _dailyLimit.Items.Add($"每日 {value} 次");
        }
        _dailyLimit.SelectedIndex = "once".Equals(
            interactionLimitMode,
            StringComparison.OrdinalIgnoreCase)
            ? 1
            : dailyLimit is null
                ? 0
                : Math.Clamp(dailyLimit.Value + 1, 2, 11);
        page.Controls.Add(_dailyLimit);

        var resetTime = new Label
        {
            Text = "有限次數於每個遊戲日 06:00 重置。",
            AutoSize = false,
            ForeColor = Color.FromArgb(129, 222, 211),
        };
        resetTime.SetBounds(186, 320, 236, 40);
        void RefreshLimitHint()
        {
            resetTime.Text = _dailyLimit.SelectedIndex switch
            {
                1 => "完成後永久鎖定；只有重新開始新遊戲才會重置。",
                >= 2 => "每日次數於遊戲時間 06:00 自動重置。",
                _ => "不限制互動次數。",
            };
        }
        _dailyLimit.SelectedIndexChanged += (_, _) => RefreshLimitHint();
        RefreshLimitHint();
        page.Controls.Add(resetTime);

        var nextSectionTop = 370;
        if (showCompletionTeleportOption)
        {
            AddFieldLabel(page, "完成後傳送 Point", 370);
            _completionTeleportPoint.SetBounds(186, 367, 236, 28);
            _completionTeleportPoint.Items.Add(new TeleportPointChoice("", "無"));
            _completionTeleportPoint.Items.AddRange(
                teleportPoints
                    .Select(point => (object)new TeleportPointChoice(
                        point.Id,
                        $"{point.Id}｜{point.Label}"))
                    .ToArray());
            _completionTeleportPoint.SelectedIndex = Math.Max(
                0,
                _completionTeleportPoint.Items
                    .Cast<TeleportPointChoice>()
                    .Select((choice, index) => new { choice, index })
                    .FirstOrDefault(entry => entry.choice.Id.Equals(
                        completionTeleportPointId?.Trim() ?? "",
                        StringComparison.OrdinalIgnoreCase))
                    ?.index ?? 0);
            page.Controls.Add(_completionTeleportPoint);

            AddFieldLabel(page, "傳送延遲（秒）", 410);
            _completionTeleportDelay.SetBounds(186, 407, 236, 28);
            _completionTeleportDelay.Value = Math.Clamp(
                (decimal)completionTeleportDelaySeconds,
                _completionTeleportDelay.Minimum,
                _completionTeleportDelay.Maximum);
            _completionTeleportDelay.Enabled =
                _completionTeleportPoint.SelectedIndex > 0;
            _completionTeleportPoint.SelectedIndexChanged += (_, _) =>
                _completionTeleportDelay.Enabled =
                    _completionTeleportPoint.SelectedIndex > 0;
            page.Controls.Add(_completionTeleportDelay);
            nextSectionTop = 454;
        }

        var defaultsButton = CreateButton(
            $"套用「{_defaults.Label}」預設值",
            18,
            nextSectionTop,
            210,
            34);
        defaultsButton.Click += (_, _) => ApplyDefaults();
        page.Controls.Add(defaultsButton);

        var rewardTop = nextSectionTop + 50;
        _rewardToggle.SetBounds(18, rewardTop, 350, 32);
        _rewardToggle.Click += (_, _) =>
        {
            _rewardsExpanded = !_rewardsExpanded;
            RefreshRewardLayout();
        };
        page.Controls.Add(_rewardToggle);
        _addRewardButton.SetBounds(378, rewardTop, 46, 32);
        _addRewardButton.Click += (_, _) =>
        {
            AddRewardRow(new InteractionItemReward
            {
                ItemId = ItemCatalog.All[0].Id,
                Quantity = 1,
                Delivery = "inventory",
            });
            _rewardsExpanded = true;
            RefreshRewardLayout();
        };
        page.Controls.Add(_addRewardButton);
        _rewardList.SetBounds(
            18,
            rewardTop + 40,
            406,
            showCompletionTeleportOption ? 88 : 160);
        page.Controls.Add(_rewardList);
        _rewardList.SuspendLayout();
        foreach (var reward in itemRewards)
        {
            AddRewardRow(reward, refreshLayout: false);
        }
        _rewardList.ResumeLayout(false);
        _rewardsExpanded = itemRewards.Count > 0;
        RefreshRewardLayout();
    }

    private void AddRewardRow(
        InteractionItemReward reward,
        bool refreshLayout = true)
    {
        var controls = new RewardControls();
        controls.Row.SuspendLayout();
        controls.Row.Height = 38;
        controls.Row.Width = 378;
        controls.Row.BackColor = Color.FromArgb(25, 28, 34);
        controls.Item.SetBounds(4, 5, 172, 28);
        controls.Item.Items.AddRange(ItemCatalog.All.Cast<object>().ToArray());
        controls.Item.SelectedIndex = Math.Max(
            0,
            ItemCatalog.All
                .Select((item, index) => new { item.Id, index })
                .FirstOrDefault(entry => entry.Id.Equals(
                    reward.ItemId,
                    StringComparison.OrdinalIgnoreCase))
                ?.index ?? 0);
        controls.Quantity.SetBounds(182, 5, 48, 28);
        controls.Quantity.Value = Math.Clamp(
            reward.Quantity,
            (int)controls.Quantity.Minimum,
            (int)controls.Quantity.Maximum);
        controls.Delivery.SetBounds(236, 5, 94, 28);
        controls.Delivery.Items.AddRange(new object[]
        {
            "直接進背包",
            "Spawn 場上",
        });
        controls.Delivery.SelectedIndex = reward.Delivery.Equals(
            "world",
            StringComparison.OrdinalIgnoreCase)
            ? 1
            : 0;
        controls.Remove.SetBounds(338, 5, 32, 28);
        controls.Remove.Click += (_, _) => RemoveRewardRow(controls);
        controls.Row.Controls.Add(controls.Item);
        controls.Row.Controls.Add(controls.Quantity);
        controls.Row.Controls.Add(controls.Delivery);
        controls.Row.Controls.Add(controls.Remove);
        controls.Row.ResumeLayout(false);
        _rewardRows.Add(controls);
        _rewardList.Controls.Add(controls.Row);
        if (refreshLayout) RefreshRewardLayout();
    }

    private void BuildQuestStartPage(
        Control page,
        IReadOnlyCollection<string> configuredQuestIds)
    {
        var explanation = new Label
        {
            Text = "劇情對話確實播放完成後，才會向任務系統提出啟動下列任務。任務本身若設定啟動延遲，會再完成該段倒數才正式啟動。",
            AutoSize = false,
            ForeColor = Color.FromArgb(154, 166, 177),
        };
        explanation.SetBounds(18, 18, 410, 58);
        page.Controls.Add(explanation);

        var heading = new Label
        {
            Text = "完成後啟動任務（可複選）",
            AutoSize = false,
            ForeColor = Color.FromArgb(196, 209, 221),
        };
        heading.SetBounds(18, 84, 410, 26);
        page.Controls.Add(heading);

        _startQuestList.SetBounds(18, 114, 410, 470);
        _startQuestList.Items.AddRange(_quests.Cast<object>().ToArray());
        for (var index = 0; index < _startQuestList.Items.Count; index++)
        {
            if (_startQuestList.Items[index] is QuestCatalogEntry quest &&
                configuredQuestIds.Contains(quest.Id, StringComparer.OrdinalIgnoreCase))
            {
                _startQuestList.SetItemChecked(index, true);
            }
        }
        page.Controls.Add(_startQuestList);

        var hint = new Label
        {
            Text = "未勾選任何任務時，劇情區只播放腳本並結算其他完成效果。",
            AutoSize = false,
            ForeColor = Color.FromArgb(129, 222, 211),
        };
        hint.SetBounds(18, 596, 410, 42);
        page.Controls.Add(hint);
    }

    private void RemoveRewardRow(RewardControls controls)
    {
        _rewardRows.Remove(controls);
        _rewardList.Controls.Remove(controls.Row);
        controls.Row.Dispose();
        RefreshRewardLayout();
    }

    private void RefreshRewardLayout()
    {
        for (var index = 0; index < _rewardRows.Count; index++)
        {
            _rewardRows[index].Row.SetBounds(4, 4 + index * 40, 378, 38);
        }
        _rewardToggle.Text =
            $"{(_rewardsExpanded ? "▼" : "▶")} 完成後產生道具（{_rewardRows.Count} 種）";
        _rewardList.Visible = _rewardsExpanded;
    }

    private static InteractionItemReward ReadReward(RewardControls controls)
    {
        var item = controls.Item.SelectedItem as ItemCatalogEntry ?? ItemCatalog.All[0];
        return new InteractionItemReward
        {
            ItemId = item.Id,
            Quantity = (int)controls.Quantity.Value,
            Delivery = controls.Delivery.SelectedIndex == 1 ? "world" : "inventory",
        };
    }

    private IEnumerable<RequirementControls> RequirementRows()
    {
        yield return _staminaRequirement;
        yield return _hungerRequirement;
        yield return _thirstRequirement;
        yield return _spiritRequirement;
    }

    private static TabPage CreateTab(string text) => new(text)
    {
        BackColor = Color.FromArgb(25, 28, 34),
        ForeColor = Color.FromArgb(226, 230, 234),
    };

    private static NumericUpDown CreateEffectValueInput() => new()
    {
        Minimum = -100,
        Maximum = 100,
        DecimalPlaces = 1,
        Increment = 1,
        TextAlign = HorizontalAlignment.Right,
    };

    private static NumericUpDown CreateRequirementValueInput() => new()
    {
        Minimum = 0,
        Maximum = 100,
        DecimalPlaces = 1,
        Increment = 1,
        TextAlign = HorizontalAlignment.Right,
    };

    private static void AddRequirementRow(
        Control page,
        string label,
        RequirementControls controls,
        int top,
        SurvivalRequirementRule? rule)
    {
        var fieldLabel = new Label
        {
            Text = label,
            AutoSize = false,
            ForeColor = Color.FromArgb(185, 193, 201),
        };
        fieldLabel.SetBounds(18, top + 3, 64, 26);
        page.Controls.Add(fieldLabel);

        controls.Mode.Items.AddRange(new object[]
        {
            "無限制",
            "至少（≥）",
            "低於（<）",
            "以下（≤）",
        });
        controls.Mode.SetBounds(88, top, 144, 28);
        controls.Mode.SelectedIndex = rule is null
            ? 0
            : rule.Comparison.Equals("below", StringComparison.OrdinalIgnoreCase)
                ? 2
                : rule.Comparison.Equals("atMost", StringComparison.OrdinalIgnoreCase)
                    ? 3
                    : 1;
        page.Controls.Add(controls.Mode);

        controls.Value.SetBounds(244, top, 178, 28);
        controls.Value.Value = Math.Clamp(
            (decimal)(rule?.Value ?? 0),
            controls.Value.Minimum,
            controls.Value.Maximum);
        controls.Value.Enabled = controls.Mode.SelectedIndex > 0;
        controls.Mode.SelectedIndexChanged += (_, _) =>
            controls.Value.Enabled = controls.Mode.SelectedIndex > 0;
        page.Controls.Add(controls.Value);
    }

    private static SurvivalRequirementRule? ReadRequirement(RequirementControls controls)
    {
        if (controls.Mode.SelectedIndex <= 0) return null;
        return new SurvivalRequirementRule
        {
            Comparison = controls.Mode.SelectedIndex switch
            {
                2 => "below",
                3 => "atMost",
                _ => "atLeast",
            },
            Value = (float)controls.Value.Value,
        };
    }

    private static void AddEffectRow(
        Control page,
        string label,
        NumericUpDown input,
        int top,
        float value)
    {
        AddFieldLabel(page, label, top + 3);
        input.SetBounds(186, top, 236, 28);
        input.Value = Math.Clamp((decimal)value, input.Minimum, input.Maximum);
        page.Controls.Add(input);
    }

    private static Label AddFieldLabel(Control page, string text, int top)
    {
        var label = new Label
        {
            Text = text,
            AutoSize = false,
            ForeColor = Color.FromArgb(185, 193, 201),
        };
        label.SetBounds(18, top, 162, 26);
        page.Controls.Add(label);
        return label;
    }

    private void ApplyDefaults()
    {
        _stamina.Value = (decimal)_defaults.Effects.Stamina;
        _hunger.Value = (decimal)_defaults.Effects.Hunger;
        _thirst.Value = (decimal)_defaults.Effects.Thirst;
        _spirit.Value = (decimal)_defaults.Effects.Spirit;
        _timeHours.Value = (decimal)_defaults.Effects.TimeMinutes / 60;
        _dailyLimit.SelectedIndex = _defaults.DailyLimit is null
            ? 0
            : Math.Clamp(_defaults.DailyLimit.Value + 1, 2, 11);
    }

    private static Button CreateButton(string text, int left, int top, int width, int height)
    {
        var button = new Button
        {
            Text = text,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 50, 59),
            ForeColor = Color.FromArgb(230, 234, 238),
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(85, 94, 108);
        button.SetBounds(left, top, width, height);
        return button;
    }
}
