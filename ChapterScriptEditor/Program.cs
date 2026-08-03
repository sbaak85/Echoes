using System.Text;

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
                using var form = new MainForm(projectRoot, storyContentPath);
                form.CreateControl();
                Console.WriteLine("ChapterScriptEditor UI smoke test passed.");
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

        var source = File.ReadAllText(storyContentPath, Encoding.UTF8);
        var generated = StoryContentCodec.GenerateSource(source, document);
        if (!generated.Contains("STORY_DIALOGUES", StringComparison.Ordinal) ||
            !generated.Contains("chapter03-start", StringComparison.Ordinal) ||
            !generated.Contains("CHAPTER_3_SECTION_1_DIALOGUE_ID", StringComparison.Ordinal) ||
            !generated.Contains("durationMs: 1500", StringComparison.Ordinal) ||
            !generated.Contains("LOWER_LEFT_STORY_ZONE_DIALOGUE_ID", StringComparison.Ordinal))
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

        Console.WriteLine("ChapterScriptEditor self-test passed.");
    }
}
