namespace Echoes.MapEditor;

public sealed class SurvivalEffectEditorForm : Form
{
    private sealed record UseRequirementChoice(string Kind, string Id, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed class UseRequirementControls
    {
        public Panel Row { get; } = new();
        public ComboBox Target { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public ComboBox Amount { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public Button Remove { get; } = CreateButton("×", 0, 0, 32, 28);
    }

    private sealed class RequirementControls
    {
        public ComboBox Mode { get; } = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        public NumericUpDown Value { get; } = CreateRequirementValueInput();
    }

    private static readonly UseRequirementChoice[] UseRequirementChoiceItems =
        ItemCatalog.All
            .Select(item => new UseRequirementChoice("item", item.Id, $"道具｜{item.Name}"))
            .Append(new UseRequirementChoice("chapter", "chapter", "進度｜當前章節"))
            .ToArray();

    private static readonly object[] UseRequirementComboItems =
        UseRequirementChoiceItems.Cast<object>().ToArray();

    private static readonly object[] RequirementAmountItems =
        Enumerable.Range(1, 99).Cast<object>().ToArray();

    private readonly RequirementControls _staminaRequirement = new();
    private readonly RequirementControls _hungerRequirement = new();
    private readonly RequirementControls _thirstRequirement = new();
    private readonly RequirementControls _spiritRequirement = new();
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
    private readonly Button _useRequirementToggle = CreateButton("", 18, 330, 350, 32);
    private readonly Button _addUseRequirementButton = CreateButton("＋", 378, 330, 46, 32);
    private readonly Panel _useRequirementList = new()
    {
        AutoScroll = true,
        BackColor = Color.FromArgb(19, 22, 27),
        BorderStyle = BorderStyle.FixedSingle,
    };
    private readonly List<UseRequirementControls> _useRequirementRows = new();
    private bool _useRequirementsExpanded;
    private readonly InteractionTypeDefaults _defaults;

    public SurvivalRequirements Requirements => new()
    {
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

    public int? DailyLimit => _dailyLimit.SelectedIndex <= 0
        ? null
        : _dailyLimit.SelectedIndex;

    public List<InteractionUseRequirement> UseRequirements =>
        _useRequirementRows.Select(ReadUseRequirement).ToList();

    public SurvivalEffectEditorForm(
        string interactionType,
        SurvivalRequirements requirements,
        SurvivalEffects effects,
        int? dailyLimit,
        IEnumerable<InteractionUseRequirement>? useRequirements)
    {
        SuspendLayout();
        _defaults = InteractionTypeDefaults.Get(interactionType);
        Text = "互動需求與完成效果";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(520, 670);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);

        var tabs = new TabControl
        {
            Left = 18,
            Top = 18,
            Width = 464,
            Height = 590,
        };
        var requirementPage = CreateTab("使用需求");
        var effectPage = CreateTab("完成效果");
        tabs.SuspendLayout();
        requirementPage.SuspendLayout();
        effectPage.SuspendLayout();
        tabs.TabPages.Add(requirementPage);
        tabs.TabPages.Add(effectPage);
        Controls.Add(tabs);

        BuildRequirementsPage(
            requirementPage,
            requirements ?? new SurvivalRequirements(),
            useRequirements?.Select(requirement => requirement.Clone()).ToList() ?? new());
        BuildEffectsPage(effectPage, effects ?? new SurvivalEffects(), dailyLimit);

        var cancelButton = CreateButton("取消", 326, 620, 82, 34);
        cancelButton.DialogResult = DialogResult.Cancel;
        Controls.Add(cancelButton);
        var saveButton = CreateButton("儲存", 416, 620, 86, 34);
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
        IReadOnlyCollection<InteractionUseRequirement> useRequirements)
    {
        var explanation = new Label
        {
            Text = "預設為無限制。可設定數值至少達到，或必須低於指定值才能開始互動。",
            AutoSize = false,
            ForeColor = Color.FromArgb(154, 166, 177),
        };
        explanation.SetBounds(18, 18, 410, 44);
        page.Controls.Add(explanation);

        AddRequirementRow(page, "體力", _staminaRequirement, 76, requirements.Stamina);
        AddRequirementRow(page, "飢餓", _hungerRequirement, 126, requirements.Hunger);
        AddRequirementRow(page, "口渴", _thirstRequirement, 176, requirements.Thirst);
        AddRequirementRow(page, "精神", _spiritRequirement, 226, requirements.Spirit);

        var example = new Label
        {
            Text = "睡覺範例：體力選「低於」75；完成效果設定經過 8 小時、體力 +75。",
            AutoSize = false,
            ForeColor = Color.FromArgb(129, 222, 211),
        };
        example.SetBounds(18, 278, 410, 42);
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
        _useRequirementList.SetBounds(18, 370, 406, 126);
        var targetHeader = new Label
        {
            Text = "條件項目",
            AutoSize = false,
            ForeColor = Color.FromArgb(145, 158, 170),
        };
        targetHeader.SetBounds(8, 2, 230, 20);
        _useRequirementList.Controls.Add(targetHeader);
        var amountHeader = new Label
        {
            Text = "數量／章節",
            AutoSize = false,
            ForeColor = Color.FromArgb(145, 158, 170),
        };
        amountHeader.SetBounds(254, 2, 92, 20);
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

        var clearButton = CreateButton("清除所有需求", 18, 512, 150, 34);
        clearButton.Click += (_, _) =>
        {
            foreach (var controls in RequirementRows()) controls.Mode.SelectedIndex = 0;
            foreach (var row in _useRequirementRows.ToList()) RemoveUseRequirementRow(row);
        };
        page.Controls.Add(clearButton);
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
        controls.Target.SetBounds(4, 5, 240, 28);
        controls.Target.BeginUpdate();
        controls.Target.Items.AddRange(UseRequirementComboItems);
        controls.Target.SelectedIndex = UseRequirementChoiceItems
            .Select((choice, index) => new { choice, index })
            .FirstOrDefault(entry =>
                entry.choice.Kind.Equals(requirement.Kind, StringComparison.OrdinalIgnoreCase) &&
                (entry.choice.Kind == "chapter" ||
                 entry.choice.Id.Equals(requirement.ItemId, StringComparison.OrdinalIgnoreCase)))
            ?.index ?? 0;
        controls.Target.EndUpdate();
        controls.Amount.SetBounds(250, 5, 76, 28);
        controls.Amount.BeginUpdate();
        controls.Amount.Items.AddRange(RequirementAmountItems);
        controls.Amount.SelectedIndex = Math.Clamp(
            requirement.Kind.Equals("chapter", StringComparison.OrdinalIgnoreCase)
                ? requirement.Chapter - 1
                : requirement.Quantity - 1,
            0,
            98);
        controls.Amount.EndUpdate();
        controls.Remove.SetBounds(334, 5, 36, 28);
        controls.Remove.Click += (_, _) => RemoveUseRequirementRow(controls);
        controls.Row.Controls.Add(controls.Target);
        controls.Row.Controls.Add(controls.Amount);
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
            $"{(_useRequirementsExpanded ? "▼" : "▶")} 道具／章節需求（{_useRequirementRows.Count}）";
        _useRequirementList.Visible = _useRequirementsExpanded;
    }

    private static InteractionUseRequirement ReadUseRequirement(
        UseRequirementControls controls)
    {
        var choice = controls.Target.SelectedItem as UseRequirementChoice ??
            UseRequirementChoiceItems[0];
        var amount = Math.Max(1, controls.Amount.SelectedIndex + 1);
        return choice.Kind == "chapter"
            ? new InteractionUseRequirement
            {
                Kind = "chapter",
                Chapter = amount,
            }
            : new InteractionUseRequirement
            {
                Kind = "item",
                ItemId = choice.Id,
                Quantity = amount,
            };
    }

    private void BuildEffectsPage(Control page, SurvivalEffects effects, int? dailyLimit)
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
        _dailyLimit.SetBounds(186, 287, 236, 28);
        _dailyLimit.Items.Add("無限");
        for (var value = 1; value <= 10; value++) _dailyLimit.Items.Add(value.ToString());
        _dailyLimit.SelectedIndex = Math.Clamp(dailyLimit ?? 0, 0, 10);
        page.Controls.Add(_dailyLimit);

        var resetTime = new Label
        {
            Text = "有限次數於每個遊戲日 06:00 重置。",
            AutoSize = false,
            ForeColor = Color.FromArgb(129, 222, 211),
        };
        resetTime.SetBounds(186, 320, 236, 24);
        page.Controls.Add(resetTime);

        var defaultsButton = CreateButton($"套用「{_defaults.Label}」預設值", 18, 370, 210, 34);
        defaultsButton.Click += (_, _) => ApplyDefaults();
        page.Controls.Add(defaultsButton);
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

        controls.Mode.Items.AddRange(new object[] { "無限制", "至少", "低於" });
        controls.Mode.SetBounds(88, top, 132, 28);
        controls.Mode.SelectedIndex = rule is null
            ? 0
            : rule.Comparison.Equals("below", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
        page.Controls.Add(controls.Mode);

        controls.Value.SetBounds(232, top, 190, 28);
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
            Comparison = controls.Mode.SelectedIndex == 2 ? "below" : "atLeast",
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

    private static void AddFieldLabel(Control page, string text, int top)
    {
        var label = new Label
        {
            Text = text,
            AutoSize = false,
            ForeColor = Color.FromArgb(185, 193, 201),
        };
        label.SetBounds(18, top, 162, 26);
        page.Controls.Add(label);
    }

    private void ApplyDefaults()
    {
        _stamina.Value = (decimal)_defaults.Effects.Stamina;
        _hunger.Value = (decimal)_defaults.Effects.Hunger;
        _thirst.Value = (decimal)_defaults.Effects.Thirst;
        _spirit.Value = (decimal)_defaults.Effects.Spirit;
        _timeHours.Value = (decimal)_defaults.Effects.TimeMinutes / 60;
        _dailyLimit.SelectedIndex = _defaults.DailyLimit ?? 0;
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
