using System.Text.RegularExpressions;
using Echoes.MapEditor;

namespace Echoes.ChapterScriptEditor;

public sealed class MainForm : Form
{
    private readonly string _projectRoot;
    private readonly string _storyContentPath;
    private readonly TabControl _chapterTabs = new();
    private readonly Label _status = new();
    private const string WindowTitle = "Echoes · 章節腳本編輯器";
    private static readonly Regex ChapterNamePattern =
        new(@"第\s*([0-9０-９]+|[零〇一二兩三四五六七八九十百]+)\s*章", RegexOptions.CultureInvariant);
    private ChapterScriptDocument _document;
    private bool _rebuildingTabs;
    private bool _hasUnsavedChanges;

    internal bool HasUnsavedChanges => _hasUnsavedChanges;

    public MainForm(string projectRoot, string storyContentPath)
    {
        _projectRoot = projectRoot;
        _storyContentPath = storyContentPath;
        _document = StoryContentCodec.Load(_storyContentPath);

        Text = WindowTitle;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1100, 760);
        ClientSize = new Size(1420, 1000);
        // 小螢幕上預設尺寸會超出可視範圍，導致右側按鈕被裁切；一律限制在工作區內。
        var workingArea = Screen.FromPoint(Cursor.Position).WorkingArea;
        MinimumSize = new Size(Math.Min(MinimumSize.Width, workingArea.Width), Math.Min(MinimumSize.Height, workingArea.Height));
        Size = new Size(Math.Min(Width, workingArea.Width), Math.Min(Height, workingArea.Height));
        KeyPreview = true;
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        Font = new Font("Microsoft JhengHei UI", 10F);

        var header = CreateHeader();
        var footer = CreateFooter();

        _chapterTabs.Dock = DockStyle.Fill;
        _chapterTabs.Padding = new Point(22, 8);
        _chapterTabs.SelectedIndexChanged += ChapterTabSelected;

        Controls.Add(_chapterTabs);
        Controls.Add(footer);
        Controls.Add(header);

        RebuildTabs(FindLatestPopulatedChapterIndex(_document));
        FormClosing += ConfirmUnsavedClose;
    }

    internal static int FindLatestPopulatedChapterIndex(ChapterScriptDocument document)
    {
        for (var index = document.Chapters.Count - 1; index >= 0; index--)
        {
            var chapter = document.Chapters[index];
            if (!string.IsNullOrWhiteSpace(chapter.Title) ||
                chapter.SubtitleEvents.Count > 0 ||
                chapter.DialogueSections.Count > 0 ||
                chapter.StoryTriggerDialogues.Count > 0)
            {
                return index;
            }
        }

        return document.Chapters.Count > 0 ? 0 : -1;
    }

    private Control CreateHeader()
    {
        var panel = new Panel { Dock = DockStyle.Top, Height = 78, BackColor = Theme.Panel, Padding = new Padding(18, 10, 18, 8) };
        var title = new Label
        {
            Text = "章節腳本編輯器",
            Font = new Font("Microsoft JhengHei UI", 18F, FontStyle.Bold),
            ForeColor = Theme.Gold,
            AutoSize = true,
            Location = new Point(18, 10),
        };
        var subtitle = new Label
        {
            Text = "管理章節、黑畫面字幕、章節流程對話與劇情多邊形台詞",
            ForeColor = Theme.Muted,
            AutoSize = true,
            Location = new Point(20, 46),
        };
        panel.Controls.Add(title);
        panel.Controls.Add(subtitle);
        return panel;
    }

    private Control CreateFooter()
    {
        var footer = new Panel { Dock = DockStyle.Bottom, Height = 66, BackColor = Theme.Panel, Padding = new Padding(14, 12, 14, 10) };
        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            WrapContents = false,
            FlowDirection = FlowDirection.RightToLeft,
        };
        var save = Theme.Button("儲存並更新遊戲腳本 (Ctrl+S)", 230);
        save.AutoSize = true;
        save.AutoSizeMode = AutoSizeMode.GrowOnly;
        var reload = Theme.Button("重新讀取", 110);
        var openFolder = Theme.Button("開啟所在資料夾", 130);
        save.Click += (_, _) => SaveDocument();
        reload.Click += (_, _) => ReloadDocument();
        openFolder.Click += (_, _) => OpenProjectFolder();
        buttons.Controls.Add(save);
        buttons.Controls.Add(reload);
        buttons.Controls.Add(openFolder);

        _status.Dock = DockStyle.Fill;
        _status.TextAlign = ContentAlignment.MiddleLeft;
        _status.ForeColor = Theme.Muted;
        _status.Text = $"腳本：{_storyContentPath}";
        footer.Controls.Add(_status);
        footer.Controls.Add(buttons);
        return footer;
    }

    private void RebuildTabs(int selectedChapterIndex)
    {
        _rebuildingTabs = true;
        try
        {
            _chapterTabs.TabPages.Clear();
            foreach (var chapter in _document.Chapters)
            {
                _chapterTabs.TabPages.Add(CreateChapterPage(chapter));
            }
            _chapterTabs.TabPages.Add(new TabPage("＋")
            {
                BackColor = Theme.Background,
                ForeColor = Theme.Gold,
                Tag = "add",
            });
            if (_document.Chapters.Count > 0)
            {
                _chapterTabs.SelectedIndex = Math.Clamp(selectedChapterIndex, 0, _document.Chapters.Count - 1);
            }
        }
        finally
        {
            _rebuildingTabs = false;
        }
    }

    private TabPage CreateChapterPage(ChapterDefinition chapter)
    {
        var page = new TabPage(chapter.TabName)
        {
            BackColor = Theme.Background,
            ForeColor = Theme.Text,
            Padding = new Padding(10),
            Tag = chapter,
        };

        var identity = CreateChapterIdentity(chapter, page);
        var lowerContent = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterWidth = 8,
            BackColor = Theme.Background,
        };
        lowerContent.Panel1.Controls.Add(CreateDialogueArea(chapter));
        lowerContent.Panel2.Controls.Add(CreateStoryTriggerDialogueArea(chapter));
        var content = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterWidth = 8,
            BackColor = Theme.Background,
        };
        content.Panel1.Controls.Add(CreateSubtitleArea(chapter));
        content.Panel2.Controls.Add(lowerContent);
        var sectionHeightsInitialized = false;
        page.Layout += (_, _) =>
        {
            // 小螢幕上內容區常低於 500px；門檻太高會讓三區比例永遠不初始化。
            if (sectionHeightsInitialized || content.Height < 240) return;
            sectionHeightsInitialized = true;
            // 字幕事件通常只有一兩筆；把較多高度留給句數最多的「對話段落小節」。
            content.SplitterDistance = (int)((content.Height - content.SplitterWidth) * 0.28);
            lowerContent.SplitterDistance =
                (int)((lowerContent.Height - lowerContent.SplitterWidth) * 0.58);
        };
        page.Controls.Add(content);
        page.Controls.Add(identity);
        return page;
    }

    private Control CreateChapterIdentity(ChapterDefinition chapter, TabPage page)
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 104,
            Padding = new Padding(12, 12, 12, 8),
            BackColor = Theme.Panel,
            ColumnCount = 8,
            RowCount = 2,
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));

        var tabName = CreateTextBox(chapter.TabName);
        var title = CreateTextBox(chapter.Title);
        var id = CreateTextBox(chapter.Id);
        var number = new NumericUpDown { Minimum = 0, Maximum = 999, Value = Math.Clamp(chapter.ChapterNumber, 0, 999), Dock = DockStyle.Fill };
        Theme.StyleInput(number);

        tabName.TextChanged += (_, _) =>
        {
            chapter.TabName = tabName.Text;
            page.Text = string.IsNullOrWhiteSpace(tabName.Text) ? "未命名章節" : tabName.Text.Trim();
            MarkChanged();
        };
        title.TextChanged += (_, _) => { chapter.Title = title.Text; MarkChanged(); };
        id.TextChanged += (_, _) => { chapter.Id = id.Text; MarkChanged(); };
        number.ValueChanged += (_, _) => { chapter.ChapterNumber = (int)number.Value; MarkChanged(); };

        panel.Controls.Add(Caption("頁籤名稱"), 0, 0);
        panel.Controls.Add(tabName, 1, 0);
        panel.Controls.Add(Caption("章節標題"), 2, 0);
        panel.Controls.Add(title, 3, 0);
        panel.SetColumnSpan(title, 3);
        panel.Controls.Add(Caption("章節 ID"), 0, 1);
        panel.Controls.Add(id, 1, 1);
        panel.Controls.Add(Caption("章節編號"), 2, 1);
        panel.Controls.Add(number, 3, 1);

        var duplicate = Theme.Button("複製章節", 100);
        var delete = Theme.Button("刪除章節", 100);
        duplicate.Click += (_, _) => DuplicateChapter(chapter);
        delete.Click += (_, _) => DeleteChapter(chapter);
        panel.Controls.Add(duplicate, 6, 1);
        panel.Controls.Add(delete, 7, 1);
        return panel;
    }

    private Control CreateSubtitleArea(ChapterDefinition chapter)
    {
        var group = CreateGroup("黑畫面白色字幕事件", "可建立多筆；記錄觸發條件、次數與淡入／停留／淡出時間。", out var body);
        var grid = new DataGridView { Dock = DockStyle.Fill };
        Theme.StyleGrid(grid);
        grid.RowTemplate.Height = 32;
        grid.Columns.Add("name", "事件名稱");
        grid.Columns.Add("trigger", "觸發條件");
        grid.Columns.Add("timing", "演出時間");
        grid.Columns.Add("preview", "字幕預覽");
        grid.Columns[0].FillWeight = 22;
        grid.Columns[1].FillWeight = 20;
        grid.Columns[2].FillWeight = 18;
        grid.Columns[3].FillWeight = 40;

        var buttons = CreateToolbar(
            ("新增字幕", () => AddSubtitle(chapter, grid)),
            ("編輯", () => EditSubtitle(chapter, grid)),
            ("刪除", () => DeleteSubtitle(chapter, grid)),
            ("上移", () => MoveSubtitle(chapter, grid, -1)),
            ("下移", () => MoveSubtitle(chapter, grid, 1)));
        grid.CellDoubleClick += (_, args) => { if (args.RowIndex >= 0) EditSubtitle(chapter, grid); };

        body.Controls.Add(grid);
        body.Controls.Add(buttons);
        RefreshSubtitleGrid(chapter, grid);
        return group;
    }

    private Control CreateDialogueArea(ChapterDefinition chapter) =>
        CreateDialogueArea(
            chapter,
            chapter.DialogueSections,
            "對話段落小節",
            "每個小節都是章節流程可呼叫的獨立腳本。",
            "新增段落");

    private Control CreateStoryTriggerDialogueArea(ChapterDefinition chapter) =>
        CreateDialogueArea(
            chapter,
            chapter.StoryTriggerDialogues,
            "劇情多邊形台詞",
            "對話 ID 填入 MapEditor 的劇情觸發多邊形；角色踏入後呼叫此腳本。",
            "新增劇情台詞");

    private Control CreateDialogueArea(
        ChapterDefinition chapter,
        List<DialogueSectionDefinition> sections,
        string title,
        string hint,
        string addButtonText)
    {
        var group = CreateGroup(title, hint, out var body);
        var grid = new DataGridView { Dock = DockStyle.Fill };
        Theme.StyleGrid(grid);
        grid.RowTemplate.Height = 32;
        grid.Columns.Add("name", "段落名稱");
        grid.Columns.Add("id", "對話 ID");
        grid.Columns.Add(new DataGridViewButtonColumn
        {
            Name = "copyId",
            HeaderText = "",
            Text = "複製",
            UseColumnTextForButtonValue = true,
            FlatStyle = FlatStyle.Flat,
            AutoSizeMode = DataGridViewAutoSizeColumnMode.None,
            Width = 62,
            ToolTipText = "複製對話 ID（選取列後按 Ctrl+C 也可以）",
            DefaultCellStyle = new DataGridViewCellStyle
            {
                BackColor = Theme.PanelAlt,
                ForeColor = Theme.Cyan,
                SelectionBackColor = Theme.PanelAlt,
                SelectionForeColor = Theme.Cyan,
                Alignment = DataGridViewContentAlignment.MiddleCenter,
            },
        });
        grid.Columns.Add("count", "句數");
        grid.Columns.Add("speakers", "發話者");
        grid.Columns["name"].FillWeight = 27;
        grid.Columns["id"].FillWeight = 28;
        grid.Columns["count"].FillWeight = 10;
        grid.Columns["speakers"].FillWeight = 35;
        grid.ClipboardCopyMode = DataGridViewClipboardCopyMode.Disable;

        var buttons = CreateToolbar(
            (addButtonText, () => AddDialogueSection(chapter, sections, grid, title)),
            ("編輯腳本", () => EditDialogueSection(sections, grid)),
            ("名稱 / ID", () => RenameDialogueSection(sections, grid)),
            ("複製段落", () => DuplicateDialogueSection(sections, grid)),
            ("刪除", () => DeleteDialogueSection(sections, grid)),
            ("上移", () => MoveDialogueSection(sections, grid, -1)),
            ("下移", () => MoveDialogueSection(sections, grid, 1)));
        grid.CellDoubleClick += (_, args) =>
        {
            if (args.RowIndex >= 0 && grid.Columns[args.ColumnIndex].Name != "copyId")
            {
                EditDialogueSection(sections, grid);
            }
        };
        grid.CellContentClick += (_, args) =>
        {
            if (args.RowIndex >= 0 && args.RowIndex < sections.Count &&
                grid.Columns[args.ColumnIndex].Name == "copyId")
            {
                CopyDialogueId(sections[args.RowIndex].Id);
            }
        };
        grid.KeyDown += (_, args) =>
        {
            if (args.KeyData != (Keys.Control | Keys.C)) return;
            var index = SelectedIndex(grid, sections.Count);
            if (index < 0) return;
            CopyDialogueId(sections[index].Id);
            args.Handled = true;
            args.SuppressKeyPress = true;
        };

        body.Controls.Add(grid);
        body.Controls.Add(buttons);
        RefreshDialogueGrid(sections, grid);
        return group;
    }

    private static Control CreateGroup(string title, string hint, out Panel body)
    {
        var group = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Panel, Padding = new Padding(12) };
        var header = new Panel { Dock = DockStyle.Top, Height = 54 };
        header.Controls.Add(new Label
        {
            Text = title,
            Font = new Font("Microsoft JhengHei UI", 13F, FontStyle.Bold),
            ForeColor = Theme.Gold,
            AutoSize = true,
            Location = new Point(2, 2),
        });
        header.Controls.Add(new Label { Text = hint, ForeColor = Theme.Muted, AutoSize = true, Location = new Point(4, 30) });
        body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 4, 0, 0) };
        group.Controls.Add(body);
        group.Controls.Add(header);
        return group;
    }

    /// <summary>
    /// 表格上方的橫向工具列：寬度不足時自動換行，不會像右側直排按鈕一樣在矮區塊中被裁切。
    /// </summary>
    internal static FlowLayoutPanel CreateToolbar(params (string Text, Action Action)[] definitions)
    {
        var panel = new FlowLayoutPanel
        {
            Name = "sectionToolbar",
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Padding = new Padding(0, 0, 0, 4),
        };
        foreach (var definition in definitions)
        {
            var button = Theme.Button(definition.Text, 80);
            button.AutoSize = true;
            button.AutoSizeMode = AutoSizeMode.GrowOnly;
            button.MinimumSize = new Size(72, 32);
            button.Height = 32;
            button.Margin = new Padding(0, 0, 6, 2);
            button.Click += (_, _) => definition.Action();
            panel.Controls.Add(button);
        }
        return panel;
    }

    private void CopyDialogueId(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return;
        try
        {
            Clipboard.SetText(id);
            ShowStatus($"已複製對話 ID：{id}");
        }
        catch (System.Runtime.InteropServices.ExternalException)
        {
            ShowStatus("剪貼簿暫時被其他程式占用，請再試一次。");
        }
    }

    /// <summary>顯示一般提示；有未儲存修改時保留「尚未儲存」前綴，避免誤以為已存檔。</summary>
    private void ShowStatus(string message)
    {
        _status.Text = _hasUnsavedChanges ? $"尚未儲存 · {message}" : message;
        _status.ForeColor = _hasUnsavedChanges ? Color.FromArgb(245, 192, 93) : Theme.Cyan;
    }

    private void ChapterTabSelected(object? sender, EventArgs e)
    {
        if (_rebuildingTabs || _chapterTabs.SelectedTab?.Tag as string != "add") return;
        AddChapter();
    }

    private void AddChapter()
    {
        var next = _document.Chapters.Count == 0 ? 1 : _document.Chapters.Max(chapter => chapter.ChapterNumber) + 1;
        _document.Chapters.Add(new ChapterDefinition
        {
            Id = UniqueId($"chapter{next:00}"),
            TabName = $"第{next}章",
            Title = "",
            ChapterNumber = next,
        });
        RebuildTabs(_document.Chapters.Count - 1);
        MarkChanged("已新增章節頁籤；請設定名稱與標題。");
    }

    private void DuplicateChapter(ChapterDefinition source)
    {
        var copy = new ChapterDefinition
        {
            Id = UniqueId(source.Id + "-copy"),
            TabName = source.TabName + " 複本",
            Title = source.Title,
            ChapterNumber = source.ChapterNumber,
            SubtitleEvents = source.SubtitleEvents.Select(CloneSubtitle).ToList(),
            DialogueSections = source.DialogueSections.Select(section => new DialogueSectionDefinition
            {
                Id = UniqueId(section.Id + "-copy"),
                Name = section.Name + " 複本",
                Dialogue = section.Dialogue.Clone(),
            }).ToList(),
            StoryTriggerDialogues = source.StoryTriggerDialogues.Select(section =>
                new DialogueSectionDefinition
                {
                    Id = UniqueId(section.Id + "-copy"),
                    Name = section.Name + " 複本",
                    Dialogue = section.Dialogue.Clone(),
                }).ToList(),
        };
        foreach (var subtitle in copy.SubtitleEvents) subtitle.Id = UniqueId(subtitle.Id + "-copy");
        var index = _document.Chapters.IndexOf(source) + 1;
        _document.Chapters.Insert(index, copy);
        RebuildTabs(index);
        MarkChanged("已複製章節。");
    }

    private void DeleteChapter(ChapterDefinition chapter)
    {
        if (_document.Chapters.Count <= 1)
        {
            MessageBox.Show("至少需要保留一個章節。", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (MessageBox.Show($"確定刪除「{chapter.TabName}」以及其中所有字幕、章節對話與劇情多邊形台詞？", Text,
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var index = _document.Chapters.IndexOf(chapter);
        _document.Chapters.Remove(chapter);
        RebuildTabs(Math.Max(0, index - 1));
        MarkChanged("章節已刪除，尚未寫入 story-content.ts。");
    }

    private void AddSubtitle(ChapterDefinition chapter, DataGridView grid)
    {
        var item = new SubtitleEventDefinition
        {
            Id = UniqueId(chapter.Id + "-subtitle"),
            Name = "新黑幕字幕",
            Text = "請輸入字幕內容",
        };
        using var editor = new SubtitleEventEditorForm(item);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        chapter.SubtitleEvents.Add(editor.Result);
        RefreshSubtitleGrid(chapter, grid, chapter.SubtitleEvents.Count - 1);
        MarkChanged();
    }

    private void EditSubtitle(ChapterDefinition chapter, DataGridView grid)
    {
        var index = SelectedIndex(grid, chapter.SubtitleEvents.Count);
        if (index < 0) return;
        using var editor = new SubtitleEventEditorForm(chapter.SubtitleEvents[index]);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        chapter.SubtitleEvents[index] = editor.Result;
        RefreshSubtitleGrid(chapter, grid, index);
        MarkChanged();
    }

    private void DeleteSubtitle(ChapterDefinition chapter, DataGridView grid)
    {
        var index = SelectedIndex(grid, chapter.SubtitleEvents.Count);
        if (index < 0) return;
        if (MessageBox.Show($"刪除字幕事件「{chapter.SubtitleEvents[index].Name}」？", Text,
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        chapter.SubtitleEvents.RemoveAt(index);
        RefreshSubtitleGrid(chapter, grid, Math.Min(index, chapter.SubtitleEvents.Count - 1));
        MarkChanged();
    }

    private void MoveSubtitle(ChapterDefinition chapter, DataGridView grid, int direction)
    {
        var index = SelectedIndex(grid, chapter.SubtitleEvents.Count);
        var target = index + direction;
        if (index < 0 || target < 0 || target >= chapter.SubtitleEvents.Count) return;
        (chapter.SubtitleEvents[index], chapter.SubtitleEvents[target]) = (chapter.SubtitleEvents[target], chapter.SubtitleEvents[index]);
        RefreshSubtitleGrid(chapter, grid, target);
        MarkChanged();
    }

    private void AddDialogueSection(
        ChapterDefinition chapter,
        List<DialogueSectionDefinition> sections,
        DataGridView grid,
        string areaTitle)
    {
        var result = SectionPrompt.Show(
            this,
            areaTitle,
            $"{chapter.TabName}_Section {sections.Count + 1}",
            initialId: null,
            suggestId: name => UniqueId(Slugify(name)),
            isIdTaken: id => IsIdTaken(id, exceptSection: null));
        if (result is null) return;
        var (name, id) = result.Value;
        var section = new DialogueSectionDefinition
        {
            Name = name,
            Id = id,
            Dialogue = DialogueScript.CreateDefault(),
        };
        using var editor = CreateDialogueEditor(section);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        section.Dialogue = editor.SuccessDialogue;
        sections.Add(section);
        RefreshDialogueGrid(sections, grid, sections.Count - 1);
        MarkChanged();
    }

    private void EditDialogueSection(
        List<DialogueSectionDefinition> sections,
        DataGridView grid)
    {
        var index = SelectedIndex(grid, sections.Count);
        if (index < 0) return;
        var section = sections[index];
        using var editor = CreateDialogueEditor(section);
        if (editor.ShowDialog(this) != DialogResult.OK) return;
        section.Dialogue = editor.SuccessDialogue;
        RefreshDialogueGrid(sections, grid, index);
        MarkChanged();
    }

    private DialogueEditorForm CreateDialogueEditor(DialogueSectionDefinition section) => new(
        section.Dialogue,
        section.Name,
        "本視窗只編輯這個章節段落。每列是一句完整發話；Line ID 為穩定唯讀識別，可供 BGM 等事件精確觸發。",
        section.Id,
        CollectDocumentSpeakers()
    );

    /// <summary>全部章節用過的發話者，讓每個段落的下拉選單都能直接選到同一個名字。</summary>
    internal IReadOnlyList<string> CollectDocumentSpeakers() =>
        DialogueEditorForm.CollectSpeakers(_document.Chapters
            .SelectMany(chapter => chapter.DialogueSections.Concat(chapter.StoryTriggerDialogues))
            .Select(section => (DialogueScript?)section.Dialogue));

    private bool IsIdTaken(string id, DialogueSectionDefinition? exceptSection)
    {
        var ids = _document.Chapters.Select(chapter => chapter.Id)
            .Concat(_document.Chapters.SelectMany(chapter => chapter.SubtitleEvents.Select(item => item.Id)))
            .Concat(_document.Chapters
                .SelectMany(chapter => chapter.DialogueSections.Concat(chapter.StoryTriggerDialogues))
                .Where(section => !ReferenceEquals(section, exceptSection))
                .Select(section => section.Id));
        return ids.Contains(id, StringComparer.OrdinalIgnoreCase);
    }

    private void RenameDialogueSection(
        List<DialogueSectionDefinition> sections,
        DataGridView grid)
    {
        var index = SelectedIndex(grid, sections.Count);
        if (index < 0) return;
        var section = sections[index];
        var result = SectionPrompt.Show(
            this,
            "段落名稱與對話 ID",
            section.Name,
            initialId: section.Id,
            suggestId: name => UniqueId(Slugify(name)),
            isIdTaken: id => IsIdTaken(id, exceptSection: section));
        if (result is null) return;
        var (name, id) = result.Value;
        section.Name = name;
        section.Id = id;
        RefreshDialogueGrid(sections, grid, index);
        MarkChanged();
    }

    private void DuplicateDialogueSection(
        List<DialogueSectionDefinition> sections,
        DataGridView grid)
    {
        var index = SelectedIndex(grid, sections.Count);
        if (index < 0) return;
        var source = sections[index];
        var duplicatedId = UniqueId(source.Id + "-copy");
        var duplicatedDialogue = source.Dialogue.Clone();
        for (var lineIndex = 0; lineIndex < duplicatedDialogue.Lines.Count; lineIndex++)
        {
            duplicatedDialogue.Lines[lineIndex].LineId =
                $"{duplicatedId}-line-{lineIndex + 1:000}";
        }
        sections.Insert(index + 1, new DialogueSectionDefinition
        {
            Id = duplicatedId,
            Name = source.Name + " 複本",
            Dialogue = duplicatedDialogue,
        });
        RefreshDialogueGrid(sections, grid, index + 1);
        MarkChanged();
    }

    private void DeleteDialogueSection(
        List<DialogueSectionDefinition> sections,
        DataGridView grid)
    {
        var index = SelectedIndex(grid, sections.Count);
        if (index < 0) return;
        if (MessageBox.Show($"刪除對話段落「{sections[index].Name}」？", Text,
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        sections.RemoveAt(index);
        RefreshDialogueGrid(sections, grid, Math.Min(index, sections.Count - 1));
        MarkChanged();
    }

    private void MoveDialogueSection(
        List<DialogueSectionDefinition> sections,
        DataGridView grid,
        int direction)
    {
        var index = SelectedIndex(grid, sections.Count);
        var target = index + direction;
        if (index < 0 || target < 0 || target >= sections.Count) return;
        (sections[index], sections[target]) = (sections[target], sections[index]);
        RefreshDialogueGrid(sections, grid, target);
        MarkChanged();
    }

    private static void RefreshSubtitleGrid(ChapterDefinition chapter, DataGridView grid, int selected = 0)
    {
        grid.Rows.Clear();
        foreach (var item in chapter.SubtitleEvents)
        {
            var trigger = TriggerTypeItem.All.FirstOrDefault(type => type.Id == item.TriggerType)?.Label ?? item.TriggerType;
            var duration = (item.DelayBeforeMs + item.FadeInMs + item.HoldMs + item.FadeOutMs + item.DelayAfterMs) / 1000d;
            var preview = item.Text.Replace("\r", " ").Replace("\n", "　");
            grid.Rows.Add(item.Name, $"{trigger} × {item.TriggerCount}", $"{duration:0.##} 秒", preview);
        }
        SelectRow(grid, selected);
    }

    private static void RefreshDialogueGrid(
        IReadOnlyList<DialogueSectionDefinition> sections,
        DataGridView grid,
        int selected = 0)
    {
        grid.Rows.Clear();
        foreach (var section in sections)
        {
            var speakers = section.Dialogue.Lines.Select(line => line.Speaker)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase);
            grid.Rows.Add(section.Name, section.Id, null, section.Dialogue.Lines.Count, string.Join("、", speakers));
        }
        SelectRow(grid, selected);
    }

    private void SaveDocument()
    {
        try
        {
            StoryContentCodec.Save(_storyContentPath, _document);
            SetUnsavedChanges(false);
            _status.Text = $"已儲存：{DateTime.Now:HH:mm:ss} · 已更新 app\\story-content.ts，並建立本機備份";
            _status.ForeColor = Theme.Cyan;
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, "無法儲存章節腳本", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ReloadDocument()
    {
        if (MessageBox.Show("重新讀取會放棄尚未儲存的畫面修改，是否繼續？", Text,
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        _document = StoryContentCodec.Load(_storyContentPath);
        RebuildTabs(FindLatestPopulatedChapterIndex(_document));
        SetUnsavedChanges(false);
        _status.Text = "已重新讀取 story-content.ts";
        _status.ForeColor = Theme.Cyan;
    }

    private void OpenProjectFolder()
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"/select,\"{_storyContentPath}\"",
            UseShellExecute = true,
        });
    }

    private void ConfirmUnsavedClose(object? sender, FormClosingEventArgs e)
    {
        if (!_hasUnsavedChanges) return;
        var result = MessageBox.Show("畫面上還有尚未儲存的修改。\n\n是：儲存後關閉\n否：不儲存直接關閉\n取消：返回編輯器",
            Text, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (result == DialogResult.Cancel) e.Cancel = true;
        else if (result == DialogResult.Yes)
        {
            SaveDocument();
            if (_hasUnsavedChanges) e.Cancel = true;
        }
    }

    private void MarkChanged(string message = "尚未儲存的修改")
    {
        SetUnsavedChanges(true);
        _status.Text = message.StartsWith("尚未儲存", StringComparison.Ordinal) ? message : $"尚未儲存 · {message}";
        _status.ForeColor = Color.FromArgb(245, 192, 93);
    }

    /// <summary>未儲存狀態改用旗標記錄，並在標題列加上「＊」提示。</summary>
    private void SetUnsavedChanges(bool value)
    {
        _hasUnsavedChanges = value;
        Text = value ? "＊ " + WindowTitle : WindowTitle;
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == (Keys.Control | Keys.S))
        {
            Validate(); // 先提交正在編輯的文字方塊
            SaveDocument();
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    private string UniqueId(string preferred)
    {
        var baseId = string.IsNullOrWhiteSpace(preferred) ? "item" : preferred;
        baseId = new string(baseId.Where(character => char.IsLetterOrDigit(character) || character is '-' or '_').ToArray());
        if (string.IsNullOrWhiteSpace(baseId)) baseId = "item";
        var ids = _document.Chapters.Select(chapter => chapter.Id)
            .Concat(_document.Chapters.SelectMany(chapter => chapter.SubtitleEvents.Select(item => item.Id)))
            .Concat(_document.Chapters.SelectMany(chapter => chapter.DialogueSections.Select(item => item.Id)))
            .Concat(_document.Chapters.SelectMany(chapter => chapter.StoryTriggerDialogues.Select(item => item.Id)))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidate = baseId;
        for (var suffix = 2; ids.Contains(candidate); suffix++) candidate = $"{baseId}-{suffix}";
        return candidate;
    }

    /// <summary>
    /// 由段落名稱產生建議 ID：「第N章」（阿拉伯或中文數字）轉成 chapterNN，
    /// 其餘只保留英數字與連字號，避免產生含中文的對話 ID。
    /// </summary>
    internal static string Slugify(string value)
    {
        var normalized = ChapterNamePattern.Replace(
                value.Trim(),
                match => ParseChapterNumber(match.Groups[1].Value) is int number
                    ? $"chapter{number:00}"
                    : match.Value)
            .Replace("序章", "prologue", StringComparison.Ordinal)
            .Replace(" ", "-", StringComparison.Ordinal)
            .Replace("_", "-", StringComparison.Ordinal)
            .ToLowerInvariant();
        var ascii = new string(normalized
            .Where(character => character is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '-')
            .ToArray());
        return Regex.Replace(ascii, "-{2,}", "-").Trim('-');
    }

    internal static int? ParseChapterNumber(string value)
    {
        value = value.Trim();
        if (value.Length == 0) return null;
        var digits = new string(value
            .Select(character => character is >= '０' and <= '９' ? (char)('0' + (character - '０')) : character)
            .ToArray());
        if (int.TryParse(digits, out var parsed)) return parsed;

        var total = 0;
        var current = 0;
        foreach (var character in value)
        {
            switch (character)
            {
                case '百':
                    total += (current == 0 ? 1 : current) * 100;
                    current = 0;
                    break;
                case '十':
                    total += (current == 0 ? 1 : current) * 10;
                    current = 0;
                    break;
                case '零' or '〇':
                    current = 0;
                    break;
                case '兩':
                    current = 2;
                    break;
                default:
                    var digit = "一二三四五六七八九".IndexOf(character);
                    if (digit < 0) return null;
                    current = digit + 1;
                    break;
            }
        }
        return total + current;
    }

    private static int SelectedIndex(DataGridView grid, int count) =>
        grid.SelectedRows.Count == 0 || grid.SelectedRows[0].Index >= count ? -1 : grid.SelectedRows[0].Index;

    private static void SelectRow(DataGridView grid, int index)
    {
        if (grid.Rows.Count == 0 || index < 0) return;
        index = Math.Clamp(index, 0, grid.Rows.Count - 1);
        grid.ClearSelection();
        grid.Rows[index].Selected = true;
        grid.CurrentCell = grid.Rows[index].Cells[0];
    }

    private static Label Caption(string text) => new() { Text = text, AutoSize = true, Anchor = AnchorStyles.Left, ForeColor = Theme.Gold };

    private static TextBox CreateTextBox(string text)
    {
        var textBox = new TextBox { Text = text, Dock = DockStyle.Fill };
        Theme.StyleInput(textBox);
        return textBox;
    }

    private static SubtitleEventDefinition CloneSubtitle(SubtitleEventDefinition source) => new()
    {
        Id = source.Id,
        Name = source.Name,
        Text = source.Text,
        TriggerType = source.TriggerType,
        TriggerValue = source.TriggerValue,
        TriggerCount = source.TriggerCount,
        DelayBeforeMs = source.DelayBeforeMs,
        FadeInMs = source.FadeInMs,
        HoldMs = source.HoldMs,
        FadeOutMs = source.FadeOutMs,
        DelayAfterMs = source.DelayAfterMs,
        KeepBlack = source.KeepBlack,
        LockInput = source.LockInput,
        ChapterStartTimeMode = source.ChapterStartTimeMode,
        ChapterStartElapsedMinutes = source.ChapterStartElapsedMinutes,
        ChapterStartClockMinuteOfDay = source.ChapterStartClockMinuteOfDay,
    };
}

/// <summary>
/// 段落名稱與對話 ID 合併在同一個視窗：新增時 ID 會跟著名稱自動建議，
/// 手動改過 ID 後就不再覆蓋；即時檢查空白、重複與不合法字元。
/// </summary>
internal static class SectionPrompt
{
    private static readonly Regex ValidIdPattern = new("^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant);

    internal static string? ValidateId(string id, Func<string, bool> isIdTaken)
    {
        if (id.Length == 0) return "對話 ID 不可空白。";
        if (!ValidIdPattern.IsMatch(id)) return "對話 ID 只能使用英文字母、數字、- 與 _。";
        if (isIdTaken(id)) return "這個 ID 已被其他章節、字幕或段落使用。";
        return null;
    }

    public static (string Name, string Id)? Show(
        IWin32Window owner,
        string title,
        string initialName,
        string? initialId,
        Func<string, string> suggestId,
        Func<string, bool> isIdTaken)
    {
        using var form = new Form
        {
            Text = title,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(540, 248),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            ShowInTaskbar = false,
            BackColor = Theme.Background,
            ForeColor = Theme.Text,
            Font = new Font("Microsoft JhengHei UI", 10F),
        };
        var nameCaption = new Label { Text = "段落名稱", AutoSize = true, ForeColor = Theme.Gold, Location = new Point(18, 18) };
        var nameInput = new TextBox { Text = initialName, Location = new Point(18, 44), Width = 502 };
        var idCaption = new Label
        {
            Text = "對話 ID（MapEditor 的劇情對話 ID 填寫此值）",
            AutoSize = true,
            ForeColor = Theme.Gold,
            Location = new Point(18, 84),
        };
        var idInput = new TextBox { Location = new Point(18, 110), Width = 502 };
        var feedback = new Label { AutoSize = false, Location = new Point(18, 142), Size = new Size(502, 40) };
        Theme.StyleInput(nameInput);
        Theme.StyleInput(idInput);
        var ok = Theme.Button("確定", 90);
        var cancel = Theme.Button("取消", 90);
        ok.Location = new Point(330, 196);
        cancel.Location = new Point(430, 196);
        cancel.DialogResult = DialogResult.Cancel;
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        // 新增時 ID 跟著名稱自動建議；使用者一旦手動修改 ID 就停止覆蓋。
        var followName = initialId is null;
        var syncing = false;
        void SetId(string value)
        {
            syncing = true;
            idInput.Text = value;
            syncing = false;
        }
        void Refresh()
        {
            var error = ValidateId(idInput.Text.Trim(), isIdTaken);
            if (nameInput.Text.Trim().Length == 0) error = "段落名稱不可空白。";
            ok.Enabled = error is null;
            feedback.ForeColor = error is null ? Theme.Muted : Color.FromArgb(240, 128, 112);
            feedback.Text = error ?? (followName ? "ID 會依名稱自動建議；直接修改 ID 即可自訂。" : "可以使用這個 ID。");
        }
        SetId(initialId ?? suggestId(initialName));
        nameInput.TextChanged += (_, _) =>
        {
            if (followName) SetId(suggestId(nameInput.Text));
            Refresh();
        };
        idInput.TextChanged += (_, _) =>
        {
            if (!syncing) followName = false;
            Refresh();
        };
        ok.Click += (_, _) =>
        {
            Refresh();
            if (ok.Enabled) form.DialogResult = DialogResult.OK;
        };
        form.Controls.AddRange(new Control[] { nameCaption, nameInput, idCaption, idInput, feedback, ok, cancel });
        form.Shown += (_, _) =>
        {
            nameInput.Focus();
            nameInput.SelectAll();
        };
        Refresh();
        if (form.ShowDialog(owner) != DialogResult.OK) return null;
        return (nameInput.Text.Trim(), idInput.Text.Trim());
    }
}
