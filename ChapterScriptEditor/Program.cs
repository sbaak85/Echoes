using System.Text;
using Echoes.MapEditor;

namespace Echoes.ChapterScriptEditor;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

        try
        {
            var projectRoot = FindProjectRoot(args.Length > 1 ? args[1] : null);
            var storyContentPath = Path.Combine(projectRoot, "app", "story-content.ts");

            if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
            {
                RunSelfTest(storyContentPath);
                return 0;
            }

            if (args.Contains("--initialize", StringComparer.OrdinalIgnoreCase))
            {
                StoryContentCodec.Save(storyContentPath, StoryContentCodec.Load(storyContentPath));
                Console.WriteLine(storyContentPath);
                return 0;
            }

            if (args.Contains("--ui-smoke-test", StringComparer.OrdinalIgnoreCase))
            {
                RunUiSmokeTest(projectRoot, storyContentPath);
                return 0;
            }

            Application.Run(new MainForm(projectRoot, storyContentPath));
            return 0;
        }
        catch (Exception exception)
        {
            if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--initialize", StringComparer.OrdinalIgnoreCase) ||
                args.Contains("--ui-smoke-test", StringComparer.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine(exception);
                return 1;
            }
            MessageBox.Show(
                exception.Message,
                "章節腳本編輯器",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string FindProjectRoot(string? requestedRoot)
    {
        var candidates = new[]
        {
            requestedRoot,
            AppContext.BaseDirectory,
            Environment.CurrentDirectory,
        };

        foreach (var candidate in candidates.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            var directory = new DirectoryInfo(Path.GetFullPath(candidate!));
            for (var depth = 0; directory is not null && depth < 8; depth++, directory = directory.Parent)
            {
                if (File.Exists(Path.Combine(directory.FullName, "app", "story-content.ts")))
                {
                    return directory.FullName;
                }
            }
        }

        throw new DirectoryNotFoundException(
            "找不到 Echoes 專案。請把 ChapterScriptEditor.exe 放在專案的 ChapterScriptEditor 資料夾中。\n" +
            "程式需要找到 app\\story-content.ts 才能啟動。");
    }

    private static void RunUiSmokeTest(string projectRoot, string storyContentPath)
    {
        using var mainForm = new MainForm(projectRoot, storyContentPath);
        mainForm.CreateControl();

        var document = StoryContentCodec.Load(storyContentPath);
        var subtitle = document.Chapters
            .SelectMany(chapter => chapter.SubtitleEvents)
            .FirstOrDefault(item => item.Id == "chapter03-End")
            ?? throw new InvalidDataException("UI smoke test 找不到 chapter03-End。");
        using var subtitleForm = new SubtitleEventEditorForm(subtitle);
        subtitleForm.CreateControl();
        subtitleForm.PerformLayout();
        var lineGrid = Descendants(subtitleForm)
            .OfType<DataGridView>()
            .FirstOrDefault(grid => grid.Columns.Contains("fontSizePx"))
            ?? throw new InvalidDataException("逐句字幕編輯表格尚未建立。");
        lineGrid.Parent?.PerformLayout();
        if (lineGrid.Rows.Count != subtitle.Lines.Count ||
            lineGrid.Dock != DockStyle.Fill ||
            lineGrid.ReadOnly ||
            lineGrid.Width < 500 ||
            lineGrid.Height < 150 ||
            !lineGrid.Columns.Contains("text") ||
            !lineGrid.Columns.Contains("moveUp") ||
            !lineGrid.Columns.Contains("moveDown") ||
            !lineGrid.Columns.Contains("delete"))
        {
            throw new InvalidDataException("逐句字幕編輯表格的資料列或操作欄位不完整。");
        }
        if (lineGrid.Columns["text"].AutoSizeMode != DataGridViewAutoSizeColumnMode.Fill ||
            lineGrid.Columns["fontSizePx"].AutoSizeMode != DataGridViewAutoSizeColumnMode.None ||
            lineGrid.Columns["text"].DefaultCellStyle.WrapMode != DataGridViewTriState.True ||
            lineGrid.AutoSizeRowsMode != DataGridViewAutoSizeRowsMode.AllCellsExceptHeaders)
        {
            throw new InvalidDataException("逐句字幕編輯表格的欄寬配置不正確。");
        }
        var textCell = lineGrid.Rows[0].Cells["text"];
        lineGrid.CurrentCell = textCell;
        if (textCell.ReadOnly || !lineGrid.BeginEdit(false) ||
            lineGrid.EditingControl is not TextBox textEditor ||
            !textEditor.Multiline ||
            !textEditor.AcceptsReturn)
        {
            throw new InvalidDataException("逐句字幕內容欄位不支援 Shift+Enter 手動換行。");
        }
        lineGrid.CancelEdit();

        using var manualBreakEditor = new TextBox { Text = "前後" };
        manualBreakEditor.SelectionStart = 1;
        SubtitleEventEditorForm.InsertManualLineBreak(manualBreakEditor);
        if (manualBreakEditor.Text != $"前{Environment.NewLine}後" ||
            manualBreakEditor.SelectionStart != 1 + Environment.NewLine.Length)
        {
            throw new InvalidDataException("Shift+Enter 手動換行未插入至游標位置。");
        }

        var fontSizeCell = lineGrid.Rows[0].Cells["fontSizePx"];
        lineGrid.CurrentCell = fontSizeCell;
        if (fontSizeCell.ReadOnly || !lineGrid.BeginEdit(false))
        {
            throw new InvalidDataException("逐句字幕的字級欄位無法進入編輯狀態。");
        }
        lineGrid.CancelEdit();
        lineGrid.EndEdit();
        lineGrid.CurrentCell = null;

        var sectionNine = document.Chapters
            .SelectMany(chapter => chapter.DialogueSections)
            .Single(section => section.Id == "chapter03-section-9");
        using var dialogueForm = new DialogueEditorForm(
            sectionNine.Dialogue,
            sectionNine.Name,
            "Line ID UI smoke test",
            sectionNine.Id);
        dialogueForm.CreateControl();
        dialogueForm.PerformLayout();
        var dialogueGrid = Descendants(dialogueForm)
            .OfType<DataGridView>()
            .FirstOrDefault(grid => grid.Columns.Contains("lineId"))
            ?? throw new InvalidDataException("對話表格尚未顯示 Line ID 欄位。");
        if (!dialogueGrid.Columns["lineId"].ReadOnly ||
            dialogueGrid.Rows.Count != sectionNine.Dialogue.Lines.Count ||
            Convert.ToString(dialogueGrid.Rows[9].Cells["lineId"].Value) !=
                "chapter03-section-9-line-010")
        {
            throw new InvalidDataException("對話 Line ID 欄位不是穩定唯讀資料。");
        }
        dialogueForm.RunLineIdUiSelfTest();

        Console.WriteLine("ChapterScriptEditor UI smoke test passed.");
    }

    private static IEnumerable<Control> Descendants(Control root)
    {
        foreach (Control child in root.Controls)
        {
            yield return child;
            foreach (var descendant in Descendants(child)) yield return descendant;
        }
    }

    private static void RunSelfTest(string storyContentPath)
    {
        var document = StoryContentCodec.Load(storyContentPath);
        StoryContentCodec.Validate(document);

        if (document.Chapters.Count < 3 ||
            document.Chapters[0].TabName != "序章" ||
            document.Chapters[1].TabName != "第二章" ||
            document.Chapters[2].TabName != "第三章" ||
            document.Chapters[2].Title != "存活的準備")
        {
            throw new InvalidDataException("預設章節頁籤或第三章標題不正確。");
        }

        var thirdChapter = document.Chapters[2];
        var start = thirdChapter.DialogueSections.FirstOrDefault(section => section.Name == "第三章_Start")
            ?? throw new InvalidDataException("找不到第三章_Start。");
        if (start.Dialogue.Lines.Count != 9)
        {
            throw new InvalidDataException("第三章_Start 應包含 9 句對話。");
        }
        if (start.Dialogue.Lines[0].Speaker != "")
        {
            throw new InvalidDataException("第三章_Start 第一行應保留為無發話者旁白。");
        }
        var storyTriggerDialogue = thirdChapter.StoryTriggerDialogues.FirstOrDefault(section =>
            section.Id == "chapter03-lower-left-not-ready")
            ?? throw new InvalidDataException("既有的第三章劇情多邊形台詞未成功遷移。");
        if (storyTriggerDialogue.Dialogue.Lines.FirstOrDefault()?.Text != "現在我還沒準備好。")
        {
            throw new InvalidDataException("第三章劇情多邊形台詞內容不正確。");
        }
        var allDialogueLineIds = document.Chapters
            .SelectMany(chapter => chapter.DialogueSections.Concat(chapter.StoryTriggerDialogues))
            .SelectMany(section => section.Dialogue.Lines)
            .Select(line => line.LineId)
            .ToList();
        if (allDialogueLineIds.Any(string.IsNullOrWhiteSpace) ||
            allDialogueLineIds.Distinct(StringComparer.OrdinalIgnoreCase).Count() !=
                allDialogueLineIds.Count)
        {
            throw new InvalidDataException("對話 Line ID 必須存在且在章節腳本中保持唯一。");
        }
        var sectionNine = thirdChapter.DialogueSections.Single(section =>
            section.Id == "chapter03-section-9");
        if (sectionNine.Dialogue.Lines[9].LineId != "chapter03-section-9-line-010" ||
            sectionNine.Dialogue.Lines[9].Text != "警告——偵測到非預期訊號來源。")
        {
            throw new InvalidDataException("Section 9 的警告台詞 Line ID 不正確。");
        }
        var endSubtitle = thirdChapter.SubtitleEvents.FirstOrDefault(subtitle =>
            subtitle.Id == "chapter03-End")
            ?? throw new InvalidDataException("找不到 chapter03-End 黑幕字幕事件。");
        if (endSubtitle.Lines.Count != 1 ||
            endSubtitle.Lines[0].Text != "第三章結束" ||
            endSubtitle.Lines[0].FontSizePx is < 8 or > 120)
        {
            throw new InvalidDataException("chapter03-End 的逐句字幕資料不正確。");
        }
        endSubtitle.Lines = new List<SubtitleLineDefinition>
        {
            new() { Text = "第三章結束\n手動換行測試", FontSizePx = 42 },
            new() { Text = "逐句字級往返測試", FontSizePx = 21 },
        };
        endSubtitle.Text = string.Join("\n", endSubtitle.Lines.Select(line => line.Text));

        var source = File.ReadAllText(storyContentPath, Encoding.UTF8);
        var generated = StoryContentCodec.GenerateSource(source, document);
        if (!generated.Contains("STORY_DIALOGUES", StringComparison.Ordinal) ||
            !generated.Contains("chapter03-start", StringComparison.Ordinal) ||
            !generated.Contains("CHAPTER_3_SECTION_1_DIALOGUE_ID", StringComparison.Ordinal) ||
            !generated.Contains("STORY_EVENT_FLOWS", StringComparison.Ordinal) ||
            !generated.Contains("fontSizesPx", StringComparison.Ordinal) ||
            !generated.Contains("chapter03-section-9-line-010", StringComparison.Ordinal) ||
            !generated.Contains("durationMs: 1500", StringComparison.Ordinal) ||
            !generated.Contains("chapter03-lower-left-not-ready", StringComparison.Ordinal) ||
            generated.Contains("LOWER_LEFT_STORY_ZONE_DIALOGUE_ID", StringComparison.Ordinal))
        {
            throw new InvalidDataException("輸出的 story-content.ts 缺少必要內容。");
        }

        var temporaryDirectory = Path.Combine(Path.GetTempPath(), "EchoesChapterScriptEditor");
        Directory.CreateDirectory(temporaryDirectory);
        var temporaryPath = Path.Combine(temporaryDirectory, "story-content.ts");
        File.WriteAllText(temporaryPath, generated, new UTF8Encoding(false));
        var reloaded = StoryContentCodec.Load(temporaryPath);
        StoryContentCodec.Validate(reloaded);
        if (reloaded.Chapters[2].DialogueSections[0].Dialogue.Lines.Count != 9)
        {
            throw new InvalidDataException("儲存後重新讀取的對話句數不正確。");
        }
        if (reloaded.Chapters[2].StoryTriggerDialogues.SingleOrDefault(section =>
                section.Id == "chapter03-lower-left-not-ready") is null)
        {
            throw new InvalidDataException("劇情多邊形台詞未通過儲存與重新讀取測試。");
        }
        var reloadedEndSubtitle = reloaded.Chapters[2].SubtitleEvents.Single(subtitle =>
            subtitle.Id == "chapter03-End");
        if (reloadedEndSubtitle.Lines.Count != 2 ||
            reloadedEndSubtitle.Lines[0].Text != "第三章結束\n手動換行測試" ||
            reloadedEndSubtitle.Lines[0].FontSizePx != 42 ||
            reloadedEndSubtitle.Lines[1].Text != "逐句字級往返測試" ||
            reloadedEndSubtitle.Lines[1].FontSizePx != 21)
        {
            throw new InvalidDataException("逐句字幕文字與字級未通過儲存與重新讀取測試。");
        }

        Console.WriteLine("ChapterScriptEditor self-test passed.");
    }
}
