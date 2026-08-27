using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Echoes.AudioEventTools;

internal sealed class AudioEventEditorForm : Form
{
    private readonly string _projectRoot;
    private readonly AudioEventConfigDocument _document;
    private readonly BgmConfigEditorControl _bgmConfigEditor;
    private readonly System.Windows.Media.MediaPlayer _previewPlayer = new();
    private readonly ToolTip _toolTip = new();
    private readonly ListBox _eventList = new();
    private readonly TextBox _eventIdText = CreateTextBox();
    private readonly TextBox _labelText = CreateTextBox();
    private readonly TextBox _triggerText = CreateMultilineTextBox();
    private readonly TextBox _sourceAssetPathsText = CreateMultilineTextBox();
    private readonly TextBox _sourcesText = CreateMultilineTextBox();
    private readonly Button _sourceOpenFolderButton = CreateButton("📂", 40);
    private readonly Button _openFolderButton = CreateButton("📂", 40);
    private readonly Button _sourcePreviewButton = CreateButton("▶", 44);
    private readonly Button _previewButton = CreateButton("▶", 44);
    private readonly NumericUpDown _volumeInput = new()
    {
        Minimum = 0,
        Maximum = 100,
        DecimalPlaces = 0,
        Increment = 1,
        Dock = DockStyle.Left,
        Width = 110,
    };
    private readonly NumericUpDown _delayInput = new()
    {
        Minimum = 0,
        Maximum = 3600,
        DecimalPlaces = 2,
        Increment = 0.1m,
        Dock = DockStyle.Left,
        Width = 110,
    };
    private readonly NumericUpDown _fadeInInput = CreatePercentageInput();
    private readonly NumericUpDown _fadeOutInput = CreatePercentageInput();
    private readonly CheckBox _loopCheck = new()
    {
        AutoSize = true,
        Text = "持續循環播放",
        Margin = new Padding(3, 7, 3, 3),
    };
    private readonly Label _statusLabel = new()
    {
        AutoSize = true,
        ForeColor = Color.FromArgb(150, 211, 199),
        Text = "選擇左側事件後即可修改。",
        TextAlign = ContentAlignment.MiddleLeft,
    };

    private string? _currentEventId;
    private bool _loading;
    private bool _dirty;
    private bool _previewPlaying;
    private Button? _activePreviewButton;

    public AudioEventEditorForm(string projectRoot)
    {
        _projectRoot = projectRoot;
        var configPath = Path.Combine(projectRoot, "app", "audio-event-manager.ts");
        var backupPath = Path.Combine(
            projectRoot,
            "AudioEventManager",
            "runtime",
            "audio-event-manager.ts.bak");
        _document = AudioEventConfigDocument.Load(configPath, backupPath);
        _bgmConfigEditor = new BgmConfigEditorControl(_document, MarkDirty);

        Text = "Audio Event 音效管理";
        StartPosition = FormStartPosition.CenterParent;
        MinimumSize = new Size(900, 620);
        ClientSize = new Size(1040, 720);
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        Font = new Font("Microsoft JhengHei UI", 9F);
        KeyPreview = true;

        _eventIdText.ReadOnly = true;
        _eventIdText.BackColor = Color.FromArgb(45, 49, 58);
        _triggerText.MinimumSize = new Size(100, 76);
        _sourceAssetPathsText.MinimumSize = new Size(100, 92);
        _sourcesText.MinimumSize = new Size(100, 92);
        ConfigurePathButton(
            _sourceOpenFolderButton,
            "在檔案總管中選取第一個原始素材 MP3");
        _sourceOpenFolderButton.Enabled = false;
        _sourceOpenFolderButton.Click += (_, _) => OpenInFileExplorer(useOriginalSource: true);
        ConfigurePreviewButton(
            _sourcePreviewButton,
            "預覽第一個原始素材 MP3");
        _sourcePreviewButton.Enabled = false;
        _sourcePreviewButton.Click += (_, _) => TogglePreview(useOriginalSource: true);
        ConfigurePathButton(
            _openFolderButton,
            "在檔案總管中選取第一個遊戲 MP3");
        _openFolderButton.Enabled = false;
        _openFolderButton.Click += (_, _) => OpenInFileExplorer(useOriginalSource: false);
        ConfigurePreviewButton(
            _previewButton,
            "立即預覽第一個遊戲 MP3；播放中再按一次可停止");
        _previewButton.AccessibleName = "預覽目前遊戲 MP3";
        _previewButton.Click += (_, _) => TogglePreview(useOriginalSource: false);
        _previewPlayer.MediaEnded += (_, _) => StopPreview();
        _previewPlayer.MediaFailed += (_, eventArgs) =>
        {
            StopPreview();
            MessageBox.Show(
                this,
                eventArgs.ErrorException?.Message ?? "無法播放這個 MP3。",
                "MP3 預覽失敗",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        };

        Controls.Add(BuildLayout());
        PopulateEvents();
        AttachChangeHandlers();

        _eventList.SelectedIndexChanged += EventListOnSelectedIndexChanged;
        FormClosing += OnFormClosing;
        KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.Control && eventArgs.KeyCode == Keys.S)
            {
                SaveChanges();
                eventArgs.Handled = true;
                eventArgs.SuppressKeyPress = true;
            }
        };

        if (_eventList.Items.Count > 0) _eventList.SelectedIndex = 0;
    }

    private Control BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(16),
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var introduction = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(980, 0),
            Text = "集中調整遊戲音效事件。原始素材路徑可留空；遊戲 MP3 每行一個，儲存後會安全寫入 TypeScript 設定區。",
            ForeColor = Color.FromArgb(194, 201, 209),
            Margin = new Padding(0, 0, 0, 12),
        };
        root.Controls.Add(introduction, 0, 0);

        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            FixedPanel = FixedPanel.Panel1,
            SplitterDistance = 300,
            SplitterWidth = 6,
            BackColor = Color.FromArgb(48, 53, 62),
        };
        split.Panel1.Padding = new Padding(0, 0, 8, 0);
        split.Panel2.Padding = new Padding(10, 0, 0, 0);

        _eventList.Dock = DockStyle.Fill;
        _eventList.BorderStyle = BorderStyle.FixedSingle;
        _eventList.BackColor = Color.FromArgb(34, 38, 46);
        _eventList.ForeColor = Color.FromArgb(232, 235, 238);
        _eventList.IntegralHeight = false;
        _eventList.ItemHeight = 28;
        _eventList.HorizontalScrollbar = true;
        split.Panel1.Controls.Add(_eventList);
        split.Panel2.Controls.Add(BuildEditorFields());
        var tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(18, 6),
        };
        var audioEventsPage = new TabPage("Audio Event")
        {
            BackColor = Color.FromArgb(25, 28, 34),
            ForeColor = ForeColor,
            Padding = new Padding(8),
        };
        audioEventsPage.Controls.Add(split);
        var bgmPage = new TabPage("BGM 管理")
        {
            BackColor = Color.FromArgb(25, 28, 34),
            ForeColor = ForeColor,
            Padding = new Padding(8),
        };
        bgmPage.Controls.Add(_bgmConfigEditor);
        tabs.TabPages.Add(audioEventsPage);
        tabs.TabPages.Add(bgmPage);
        root.Controls.Add(tabs, 0, 1);

        var footer = new TableLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            Margin = new Padding(0, 14, 0, 0),
        };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        footer.Controls.Add(_statusLabel, 0, 0);

        var saveButton = CreateButton("儲存到 TS", 118);
        saveButton.Click += (_, _) => SaveChanges();
        footer.Controls.Add(saveButton, 1, 0);

        var closeButton = CreateButton("關閉", 88);
        closeButton.Click += (_, _) => Close();
        footer.Controls.Add(closeButton, 2, 0);
        root.Controls.Add(footer, 0, 2);
        return root;
    }

    private Control BuildEditorFields()
    {
        var fields = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            ColumnCount = 2,
            RowCount = 10,
            Padding = new Padding(0, 0, 8, 0),
        };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddField(fields, 0, "Event ID", _eventIdText, 42);
        AddField(fields, 1, "顯示名稱", _labelText, 42);
        AddField(fields, 2, "觸發時機", _triggerText, 92);
        var sourceAssetsPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            Margin = Padding.Empty,
        };
        sourceAssetsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        sourceAssetsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 48));
        sourceAssetsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52));
        _sourceAssetPathsText.Margin = new Padding(0, 0, 0, 7);
        sourceAssetsPanel.Controls.Add(_sourceAssetPathsText, 0, 0);
        sourceAssetsPanel.Controls.Add(_sourceOpenFolderButton, 1, 0);
        sourceAssetsPanel.Controls.Add(_sourcePreviewButton, 2, 0);
        AddField(fields, 3, "原始素材（選填）", sourceAssetsPanel, 112);

        var sourcesPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            Margin = Padding.Empty,
        };
        sourcesPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        sourcesPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 48));
        sourcesPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52));
        _sourcesText.Margin = new Padding(0, 0, 0, 7);
        sourcesPanel.Controls.Add(_sourcesText, 0, 0);
        sourcesPanel.Controls.Add(_openFolderButton, 1, 0);
        sourcesPanel.Controls.Add(_previewButton, 2, 0);
        AddField(fields, 4, "遊戲 MP3 路徑", sourcesPanel, 112);

        var volumePanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
        };
        volumePanel.Controls.Add(_volumeInput);
        volumePanel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "%（0～100）",
            Margin = new Padding(8, 7, 0, 0),
            ForeColor = Color.FromArgb(194, 201, 209),
        });
        AddField(fields, 5, "音量", volumePanel, 42);

        var delayPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
        };
        delayPanel.Controls.Add(_delayInput);
        delayPanel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "秒",
            Margin = new Padding(8, 7, 0, 0),
            ForeColor = Color.FromArgb(194, 201, 209),
        });
        AddField(fields, 6, "播放延遲", delayPanel, 42);
        AddField(fields, 7, "Loop", _loopCheck, 42);
        AddField(fields, 8, "FadeIn", BuildPercentagePanel(_fadeInInput), 42);
        AddField(fields, 9, "FadeOut", BuildPercentagePanel(_fadeOutInput), 42);
        return fields;
    }

    private static NumericUpDown CreatePercentageInput()
    {
        return new NumericUpDown
        {
            Minimum = 0,
            Maximum = 100,
            DecimalPlaces = 0,
            Increment = 1,
            Dock = DockStyle.Left,
            Width = 110,
        };
    }

    private static Control BuildPercentagePanel(NumericUpDown input)
    {
        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
        };
        panel.Controls.Add(input);
        panel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "%（音檔總長）",
            Margin = new Padding(8, 7, 0, 0),
            ForeColor = Color.FromArgb(194, 201, 209),
        });
        return panel;
    }

    private static void AddField(
        TableLayoutPanel fields,
        int row,
        string labelText,
        Control control,
        int height)
    {
        fields.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        var label = new Label
        {
            AutoSize = true,
            Text = labelText,
            ForeColor = Color.FromArgb(194, 201, 209),
            Margin = new Padding(0, 8, 8, 0),
        };
        control.Margin = new Padding(0, 3, 0, 7);
        fields.Controls.Add(label, 0, row);
        fields.Controls.Add(control, 1, row);
    }

    private void PopulateEvents()
    {
        _loading = true;
        try
        {
            _eventList.Items.Clear();
            foreach (var pair in _document.Events)
            {
                _eventList.Items.Add(new AudioEventListItem(pair.Key, pair.Value.Label));
            }
        }
        finally
        {
            _loading = false;
        }
    }

    private void AttachChangeHandlers()
    {
        _labelText.TextChanged += (_, _) => MarkDirty();
        _triggerText.TextChanged += (_, _) => MarkDirty();
        _sourceAssetPathsText.TextChanged += (_, _) =>
        {
            StopPreview();
            var hasSourceAsset = SplitLines(_sourceAssetPathsText.Text).Count > 0;
            _sourceOpenFolderButton.Enabled = hasSourceAsset;
            _sourcePreviewButton.Enabled = hasSourceAsset;
            MarkDirty();
        };
        _sourcesText.TextChanged += (_, _) =>
        {
            StopPreview();
            _openFolderButton.Enabled = SplitLines(_sourcesText.Text).Count > 0;
            MarkDirty();
        };
        _volumeInput.ValueChanged += (_, _) =>
        {
            _previewPlayer.Volume = decimal.ToDouble(_volumeInput.Value / 100m);
            MarkDirty();
        };
        _delayInput.ValueChanged += (_, _) => MarkDirty();
        _loopCheck.CheckedChanged += (_, _) => MarkDirty();
        _fadeInInput.ValueChanged += (_, _) => MarkDirty();
        _fadeOutInput.ValueChanged += (_, _) => MarkDirty();
    }

    private void EventListOnSelectedIndexChanged(object? sender, EventArgs eventArgs)
    {
        if (_loading || _eventList.SelectedItem is not AudioEventListItem selected) return;
        StopPreview();
        CommitCurrentEditor();
        LoadEditor(selected.EventId);
    }

    private void LoadEditor(string eventId)
    {
        var definition = _document.Events[eventId];
        _loading = true;
        try
        {
            _currentEventId = eventId;
            _eventIdText.Text = eventId;
            _labelText.Text = definition.Label;
            _triggerText.Text = definition.Trigger;
            _sourceAssetPathsText.Text = JoinLines(definition.SourceAssetPaths);
            _sourcesText.Text = JoinLines(definition.Sources);
            _volumeInput.Value = Math.Clamp(
                (decimal)definition.Volume * 100m,
                _volumeInput.Minimum,
                _volumeInput.Maximum);
            _delayInput.Value = Math.Clamp(
                (decimal)definition.DelaySeconds,
                _delayInput.Minimum,
                _delayInput.Maximum);
            _loopCheck.Checked = definition.Loop ?? false;
            _fadeInInput.Value = Math.Clamp(
                (decimal)(definition.FadeInPercent ?? 0),
                _fadeInInput.Minimum,
                _fadeInInput.Maximum);
            _fadeOutInput.Value = Math.Clamp(
                (decimal)(definition.FadeOutPercent ?? 0),
                _fadeOutInput.Minimum,
                _fadeOutInput.Maximum);
        }
        finally
        {
            _loading = false;
        }
    }

    private void CommitCurrentEditor()
    {
        if (_currentEventId is null) return;
        var definition = _document.Events[_currentEventId];
        definition.Label = _labelText.Text.Trim();
        definition.Trigger = _triggerText.Text.Trim();
        definition.SourceAssetPaths = SplitLines(_sourceAssetPathsText.Text);
        definition.Sources = SplitLines(_sourcesText.Text);
        definition.Volume = decimal.ToDouble(_volumeInput.Value / 100m);
        definition.DelaySeconds = decimal.ToDouble(_delayInput.Value);
        definition.Loop = _loopCheck.Checked ? true : null;
        definition.FadeInPercent = decimal.ToDouble(_fadeInInput.Value);
        definition.FadeOutPercent = decimal.ToDouble(_fadeOutInput.Value);

        var listItem = _eventList.Items
            .Cast<AudioEventListItem>()
            .FirstOrDefault(item => item.EventId == _currentEventId);
        if (listItem is not null)
        {
            listItem.Label = definition.Label;
            _eventList.Refresh();
        }
    }

    private void SaveChanges()
    {
        try
        {
            CommitCurrentEditor();
            _bgmConfigEditor.Commit();
            _document.Save();
            _dirty = false;
            _statusLabel.Text = "已儲存。遊戲下次重新整理時會套用新設定。";
            _statusLabel.ForeColor = Color.FromArgb(150, 211, 199);
        }
        catch (Exception exception)
        {
            _statusLabel.Text = "尚未儲存，請修正提示內容。";
            _statusLabel.ForeColor = Color.FromArgb(255, 166, 166);
            MessageBox.Show(
                this,
                exception.Message,
                "Audio Event 無法儲存",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void MarkDirty()
    {
        if (_loading) return;
        _dirty = true;
        _statusLabel.Text = "有尚未儲存的修改。";
        _statusLabel.ForeColor = Color.FromArgb(244, 205, 126);
    }

    private void TogglePreview(bool useOriginalSource)
    {
        var previewButton = useOriginalSource
            ? _sourcePreviewButton
            : _previewButton;
        if (_previewPlaying)
        {
            var wasSamePreview = ReferenceEquals(
                _activePreviewButton,
                previewButton);
            StopPreview();
            if (wasSamePreview) return;
        }

        var sourceText = useOriginalSource
            ? _sourceAssetPathsText.Text
            : _sourcesText.Text;
        var source = SplitLines(sourceText).FirstOrDefault();
        if (source is null)
        {
            MessageBox.Show(
                this,
                useOriginalSource
                    ? "這個 Event 沒有填寫原始素材路徑。"
                    : "請先在「遊戲 MP3 路徑」填入至少一個檔案。",
                "沒有可預覽的 MP3",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            var previewPath = useOriginalSource
                ? ResolveOriginalPreviewPath(_projectRoot, source)
                : ResolvePreviewPath(_projectRoot, source);
            if (!File.Exists(previewPath))
            {
                throw new FileNotFoundException(
                    useOriginalSource
                        ? "找不到原始素材 MP3。它可能已被刪除或路徑已變更。"
                        : "找不到遊戲 MP3。請確認它已放入 public 資料夾，且路徑拼寫正確。",
                    previewPath);
            }

            _previewPlayer.Close();
            _previewPlayer.Open(new Uri(previewPath, UriKind.Absolute));
            _previewPlayer.Volume = decimal.ToDouble(_volumeInput.Value / 100m);
            _previewPlayer.Play();
            _previewPlaying = true;
            _activePreviewButton = previewButton;
            previewButton.Text = "■";
            _statusLabel.Text = $"正在預覽：{Path.GetFileName(previewPath)}";
            _statusLabel.ForeColor = Color.FromArgb(150, 211, 199);
        }
        catch (Exception exception)
        {
            StopPreview();
            MessageBox.Show(
                this,
                exception.Message,
                "MP3 預覽失敗",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void OpenInFileExplorer(bool useOriginalSource)
    {
        var sourceText = useOriginalSource
            ? _sourceAssetPathsText.Text
            : _sourcesText.Text;
        var source = SplitLines(sourceText).FirstOrDefault();
        if (source is null)
        {
            MessageBox.Show(
                this,
                useOriginalSource
                    ? "這個 Event 沒有填寫原始素材路徑。"
                    : "請先在「遊戲 MP3 路徑」填入至少一個檔案。",
                "沒有可開啟的 MP3",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            var audioPath = useOriginalSource
                ? ResolveOriginalPreviewPath(_projectRoot, source)
                : ResolvePreviewPath(_projectRoot, source);
            if (!File.Exists(audioPath))
            {
                throw new FileNotFoundException(
                    useOriginalSource
                        ? "找不到原始素材 MP3。它可能已被刪除或路徑已變更。"
                        : "找不到遊戲 MP3。請確認它已放入 public 資料夾，且路徑拼寫正確。",
                    audioPath);
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"/select,\"{audioPath}\"",
                UseShellExecute = true,
            });
            _statusLabel.Text = $"已在檔案總管中選取：{Path.GetFileName(audioPath)}";
            _statusLabel.ForeColor = Color.FromArgb(150, 211, 199);
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                this,
                exception.Message,
                "無法開啟檔案位置",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    internal void RunPreviewSmokeTest()
    {
        _bgmConfigEditor.RunUiSmokeTest();
        if (!_sourceOpenFolderButton.Enabled || !_openFolderButton.Enabled)
        {
            throw new InvalidOperationException("音檔路徑的檔案總管按鈕未正確啟用。");
        }
        TogglePreview(useOriginalSource: true);
        if (!_previewPlaying)
        {
            throw new InvalidOperationException("原始素材 MP3 預覽未能開始播放。");
        }
        StopPreview();
        TogglePreview(useOriginalSource: false);
        if (!_previewPlaying)
        {
            throw new InvalidOperationException("遊戲 MP3 預覽未能開始播放。");
        }
        StopPreview();
    }

    internal static string ResolveOriginalPreviewPath(
        string projectRoot,
        string source)
    {
        var trimmedSource = source.Trim();
        if (Path.IsPathFullyQualified(trimmedSource))
        {
            return Path.GetFullPath(trimmedSource);
        }
        if (
            trimmedSource.StartsWith("./", StringComparison.Ordinal) ||
            trimmedSource.StartsWith(".\\", StringComparison.Ordinal)
        )
        {
            trimmedSource = trimmedSource[2..];
        }
        else
        {
            trimmedSource = trimmedSource.TrimStart('/', '\\');
        }

        var relativePath = trimmedSource.Replace(
            '/',
            Path.DirectorySeparatorChar);
        return Path.GetFullPath(Path.Combine(projectRoot, relativePath));
    }

    internal static string ResolvePreviewPath(string projectRoot, string source)
    {
        var trimmedSource = source.Trim();
        if (
            trimmedSource.StartsWith("./", StringComparison.Ordinal) ||
            trimmedSource.StartsWith(".\\", StringComparison.Ordinal)
        )
        {
            trimmedSource = trimmedSource[2..];
        }
        else
        {
            trimmedSource = trimmedSource.TrimStart('/', '\\');
        }

        var relativePath = trimmedSource.Replace(
            '/',
            Path.DirectorySeparatorChar);
        return Path.GetFullPath(Path.Combine(projectRoot, "public", relativePath));
    }

    private void StopPreview()
    {
        _previewPlayer.Stop();
        _previewPlayer.Close();
        _previewPlaying = false;
        _activePreviewButton = null;
        _sourcePreviewButton.Text = "▶";
        _previewButton.Text = "▶";
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        StopPreview();
        if (!_dirty) return;
        var result = MessageBox.Show(
            this,
            "Audio Event 還有尚未儲存的修改，要直接關閉嗎？",
            "尚未儲存",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (result == DialogResult.No) eventArgs.Cancel = true;
    }

    private static string JoinLines(IEnumerable<string> values)
    {
        return string.Join(Environment.NewLine, values);
    }

    private static List<string> SplitLines(string text)
    {
        return text
            .Split(new[] { "\r\n", "\n", "\r" }, StringSplitOptions.None)
            .Select(value => value.Trim())
            .Where(value => value.Length > 0)
            .ToList();
    }

    private static TextBox CreateTextBox()
    {
        return new TextBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.FromArgb(38, 42, 50),
            ForeColor = Color.FromArgb(232, 235, 238),
        };
    }

    private static TextBox CreateMultilineTextBox()
    {
        var textBox = CreateTextBox();
        textBox.Multiline = true;
        textBox.AcceptsReturn = true;
        textBox.ScrollBars = ScrollBars.Vertical;
        return textBox;
    }

    private static Button CreateButton(string text, int width)
    {
        return new Button
        {
            Text = text,
            AutoSize = false,
            Width = width,
            Height = 34,
            Margin = new Padding(8, 0, 0, 0),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 129, 119),
            ForeColor = Color.White,
            UseVisualStyleBackColor = false,
        };
    }

    private void ConfigurePreviewButton(Button button, string toolTip)
    {
        button.Margin = new Padding(8, 3, 0, 7);
        button.Dock = DockStyle.Fill;
        button.AccessibleName = toolTip;
        _toolTip.SetToolTip(button, toolTip);
    }

    private void ConfigurePathButton(Button button, string toolTip)
    {
        button.Margin = new Padding(8, 3, 0, 7);
        button.Dock = DockStyle.Fill;
        button.BackColor = Color.FromArgb(62, 70, 82);
        button.AccessibleName = toolTip;
        _toolTip.SetToolTip(button, toolTip);
    }

    private sealed class AudioEventListItem
    {
        public AudioEventListItem(string eventId, string label)
        {
            EventId = eventId;
            Label = label;
        }

        public string EventId { get; }
        public string Label { get; set; }

        public override string ToString()
        {
            return $"{Label}  [{EventId}]";
        }
    }
}

internal sealed class AudioEventConfigDocument
{
    internal const string StartMarker = "/* AUDIO_EVENT_CONFIG_START */";
    internal const string EndMarker = "/* AUDIO_EVENT_CONFIG_END */";
    internal const string BgmTrackStartMarker = "/* BGM_TRACK_CONFIG_START */";
    internal const string BgmTrackEndMarker = "/* BGM_TRACK_CONFIG_END */";
    internal const string BgmRuleStartMarker = "/* BGM_CONTROL_RULES_START */";
    internal const string BgmRuleEndMarker = "/* BGM_CONTROL_RULES_END */";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private string _sourceText;

    private AudioEventConfigDocument(
        string configPath,
        string backupPath,
        string sourceText,
        Dictionary<string, AudioEventEditableDefinition> events,
        Dictionary<string, BgmTrackEditableDefinition> bgmTracks,
        List<BgmControlRuleEditableDefinition> bgmRules)
    {
        ConfigPath = configPath;
        BackupPath = backupPath;
        _sourceText = sourceText;
        Events = events;
        BgmTracks = bgmTracks;
        BgmRules = bgmRules;
    }

    public string ConfigPath { get; }
    public string BackupPath { get; }
    public Dictionary<string, AudioEventEditableDefinition> Events { get; }
    public Dictionary<string, BgmTrackEditableDefinition> BgmTracks { get; }
    public List<BgmControlRuleEditableDefinition> BgmRules { get; }

    public static AudioEventConfigDocument Load(string configPath, string backupPath)
    {
        if (!File.Exists(configPath))
        {
            throw new FileNotFoundException("找不到 Audio Event 設定檔。", configPath);
        }

        var sourceText = File.ReadAllText(configPath, Encoding.UTF8);
        var events = ParseEvents(sourceText);
        var bgmTracks = ParseBgmTracks(sourceText);
        var bgmRules = ParseBgmRules(sourceText);
        ValidateBgmConfiguration(bgmTracks, bgmRules);
        return new AudioEventConfigDocument(
            configPath,
            backupPath,
            sourceText,
            events,
            bgmTracks,
            bgmRules);
    }

    internal static Dictionary<string, AudioEventEditableDefinition> ParseEvents(
        string sourceText)
    {
        var configJson = ExtractConfigJson(sourceText, StartMarker, EndMarker);
        var events = JsonSerializer.Deserialize<
            Dictionary<string, AudioEventEditableDefinition>>(configJson, JsonOptions);
        if (events is null || events.Count == 0)
        {
            throw new InvalidDataException("Audio Event 設定區沒有任何事件。");
        }

        Validate(events);
        return events;
    }

    internal static Dictionary<string, BgmTrackEditableDefinition> ParseBgmTracks(
        string sourceText)
    {
        var json = ExtractConfigJson(
            sourceText,
            BgmTrackStartMarker,
            BgmTrackEndMarker);
        var tracks = JsonSerializer.Deserialize<
            Dictionary<string, BgmTrackEditableDefinition>>(json, JsonOptions);
        if (tracks is null || tracks.Count == 0)
        {
            throw new InvalidDataException("BGM 素材庫至少需要 default Track。");
        }
        ValidateBgmTracks(tracks);
        return tracks;
    }

    internal static List<BgmControlRuleEditableDefinition> ParseBgmRules(
        string sourceText)
    {
        var json = ExtractConfigJson(
            sourceText,
            BgmRuleStartMarker,
            BgmRuleEndMarker);
        var rules = JsonSerializer.Deserialize<List<BgmControlRuleEditableDefinition>>(
            json,
            JsonOptions) ?? new List<BgmControlRuleEditableDefinition>();
        return rules;
    }

    internal static string RewriteSource(
        string sourceText,
        Dictionary<string, AudioEventEditableDefinition> events)
    {
        Validate(events);
        var json = JsonSerializer.Serialize(events, JsonOptions);
        return ReplaceMarkedJson(sourceText, StartMarker, EndMarker, json);
    }

    internal static string RewriteSource(
        string sourceText,
        Dictionary<string, AudioEventEditableDefinition> events,
        Dictionary<string, BgmTrackEditableDefinition> bgmTracks,
        List<BgmControlRuleEditableDefinition> bgmRules)
    {
        Validate(events);
        ValidateBgmConfiguration(bgmTracks, bgmRules);
        var rewritten = ReplaceMarkedJson(
            sourceText,
            StartMarker,
            EndMarker,
            JsonSerializer.Serialize(events, JsonOptions));
        rewritten = ReplaceMarkedJson(
            rewritten,
            BgmTrackStartMarker,
            BgmTrackEndMarker,
            JsonSerializer.Serialize(bgmTracks, JsonOptions));
        return ReplaceMarkedJson(
            rewritten,
            BgmRuleStartMarker,
            BgmRuleEndMarker,
            JsonSerializer.Serialize(bgmRules, JsonOptions));
    }

    private static string ReplaceMarkedJson(
        string sourceText,
        string startMarker,
        string endMarker,
        string json)
    {
        var startIndex = FindMarker(sourceText, startMarker);
        var contentStart = startIndex + startMarker.Length;
        var endIndex = FindMarker(sourceText, endMarker);
        if (endIndex <= contentStart)
        {
            throw new InvalidDataException($"設定標記順序不正確：{startMarker}");
        }
        return sourceText[..contentStart] +
            Environment.NewLine +
            Indent(json, 2) +
            Environment.NewLine +
            "  " +
            sourceText[endIndex..];
    }

    public void Save()
    {
        Validate(Events);
        ValidateBgmConfiguration(BgmTracks, BgmRules);
        var currentSourceText = File.ReadAllText(ConfigPath, Encoding.UTF8);
        if (!string.Equals(currentSourceText, _sourceText, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "audio-event-manager.ts 已在視窗開啟後被其他程式修改。請關閉本視窗後重新開啟，以免覆蓋較新的內容。");
        }

        var rewrittenSource = RewriteSource(
            _sourceText,
            Events,
            BgmTracks,
            BgmRules);
        Directory.CreateDirectory(Path.GetDirectoryName(BackupPath)!);
        File.Copy(ConfigPath, BackupPath, overwrite: true);

        var temporaryPath = ConfigPath + ".tmp";
        try
        {
            File.WriteAllText(temporaryPath, rewrittenSource, new UTF8Encoding(false));
            File.Move(temporaryPath, ConfigPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }

        _sourceText = rewrittenSource;
    }

    private static string ExtractConfigJson(
        string sourceText,
        string startMarker,
        string endMarker)
    {
        var startIndex = FindMarker(sourceText, startMarker) + startMarker.Length;
        var endIndex = FindMarker(sourceText, endMarker);
        if (endIndex <= startIndex)
        {
            throw new InvalidDataException($"設定標記順序不正確：{startMarker}");
        }
        return sourceText[startIndex..endIndex].Trim();
    }

    private static int FindMarker(string sourceText, string marker)
    {
        var firstIndex = sourceText.IndexOf(marker, StringComparison.Ordinal);
        if (firstIndex < 0)
        {
            throw new InvalidDataException($"找不到 Audio Event 設定標記：{marker}");
        }
        if (sourceText.IndexOf(marker, firstIndex + marker.Length, StringComparison.Ordinal) >= 0)
        {
            throw new InvalidDataException($"Audio Event 設定標記重複：{marker}");
        }
        return firstIndex;
    }

    private static void Validate(
        Dictionary<string, AudioEventEditableDefinition> events)
    {
        if (events.Count == 0)
        {
            throw new InvalidDataException("至少需要保留一個 Audio Event。");
        }

        foreach (var pair in events)
        {
            var eventId = pair.Key;
            var definition = pair.Value;
            if (string.IsNullOrWhiteSpace(eventId))
            {
                throw new InvalidDataException("Audio Event ID 不可空白。");
            }
            if (string.IsNullOrWhiteSpace(definition.Label))
            {
                throw new InvalidDataException($"{eventId}：顯示名稱不可空白。");
            }
            if (string.IsNullOrWhiteSpace(definition.Trigger))
            {
                throw new InvalidDataException($"{eventId}：觸發時機不可空白。");
            }
            if (definition.Sources.Count == 0)
            {
                throw new InvalidDataException($"{eventId}：至少要填一個遊戲 MP3 路徑。");
            }
            if (definition.Volume is < 0 or > 1)
            {
                throw new InvalidDataException($"{eventId}：音量必須介於 0～100%。");
            }
            if (definition.DelaySeconds < 0)
            {
                throw new InvalidDataException($"{eventId}：播放延遲不可小於 0 秒。");
            }
            if (definition.FadeInPercent is < 0 or > 100)
            {
                throw new InvalidDataException($"{eventId}：FadeIn 必須介於 0～100%。");
            }
            if (definition.FadeOutPercent is < 0 or > 100)
            {
                throw new InvalidDataException($"{eventId}：FadeOut 必須介於 0～100%。");
            }
        }
    }

    private static void ValidateBgmConfiguration(
        Dictionary<string, BgmTrackEditableDefinition> tracks,
        List<BgmControlRuleEditableDefinition> rules)
    {
        ValidateBgmTracks(tracks);
        var ruleIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rule in rules)
        {
            rule.Id = rule.Id.Trim();
            rule.Label = rule.Label.Trim();
            rule.TargetId = rule.TargetId.Trim();
            rule.State = rule.State.Trim();
            rule.TrackId = string.IsNullOrWhiteSpace(rule.TrackId)
                ? null
                : rule.TrackId.Trim();
            if (rule.Id.Length == 0 || !ruleIds.Add(rule.Id))
            {
                throw new InvalidDataException("BGM 規則 ID 不可空白或重複。");
            }
            if (rule.Label.Length == 0 || rule.TargetId.Length == 0 || rule.State.Length == 0)
            {
                throw new InvalidDataException($"{rule.Id}：名稱、目標 ID 與狀態不可空白。");
            }
            if (!BgmControlRuleEditableDefinition.TriggerTypes.Contains(rule.TriggerType))
            {
                throw new InvalidDataException($"{rule.Id}：未知的觸發類型 {rule.TriggerType}。");
            }
            if (!BgmControlRuleEditableDefinition.Actions.Contains(rule.Action))
            {
                throw new InvalidDataException($"{rule.Id}：未知的 BGM 操作 {rule.Action}。");
            }
            if (!BgmControlRuleEditableDefinition.RestoreModes.Contains(rule.RestoreMode))
            {
                throw new InvalidDataException($"{rule.Id}：未知的恢復方式 {rule.RestoreMode}。");
            }
            if ((rule.Action == "switch" || rule.Action == "fade") &&
                (rule.TrackId is null || !tracks.ContainsKey(rule.TrackId)))
            {
                throw new InvalidDataException($"{rule.Id}：換歌或 Fade 操作必須指定有效 Track ID。");
            }
            if (rule.TargetVolume is < 0 or > 1 ||
                rule.FadeOutSeconds is < 0 or > 60 ||
                rule.FadeInSeconds is < 0 or > 60 ||
                rule.DurationSeconds is < 0 or > 86400)
            {
                throw new InvalidDataException($"{rule.Id}：音量或時間欄位超出允許範圍。");
            }
        }
    }

    private static void ValidateBgmTracks(
        Dictionary<string, BgmTrackEditableDefinition> tracks)
    {
        if (!tracks.ContainsKey("default"))
        {
            throw new InvalidDataException("BGM 素材庫必須保留 default Track。");
        }
        foreach (var pair in tracks)
        {
            if (string.IsNullOrWhiteSpace(pair.Key) || string.IsNullOrWhiteSpace(pair.Value.Label))
            {
                throw new InvalidDataException("BGM Track ID 與名稱不可空白。");
            }
            if (pair.Value.Sources.Count == 0)
            {
                throw new InvalidDataException($"{pair.Key}：至少需要一個遊戲 MP3 路徑。");
            }
            if (pair.Value.Volume is < 0 or > 1)
            {
                throw new InvalidDataException($"{pair.Key}：基礎音量必須介於 0～100%。");
            }
        }
    }

    private static string Indent(string text, int spaces)
    {
        var indentation = new string(' ', spaces);
        return indentation + text.Replace(
            Environment.NewLine,
            Environment.NewLine + indentation,
            StringComparison.Ordinal);
    }
}

internal sealed class AudioEventEditableDefinition
{
    public string Label { get; set; } = "";
    public string Trigger { get; set; } = "";
    public List<string> SourceAssetPaths { get; set; } = new();
    public List<string> Sources { get; set; } = new();
    public double Volume { get; set; }
    public double DelaySeconds { get; set; }
    public bool? Loop { get; set; }
    public double? FadeInPercent { get; set; }
    public double? FadeOutPercent { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalProperties { get; set; }
}

internal sealed class BgmTrackEditableDefinition
{
    public string Label { get; set; } = "";
    public List<string> SourceAssetPaths { get; set; } = new();
    public List<string> Sources { get; set; } = new();
    public double Volume { get; set; } = 1;
    public bool Loop { get; set; } = true;
    public bool RememberPosition { get; set; } = true;
}

internal sealed class BgmControlRuleEditableDefinition
{
    internal static readonly string[] TriggerTypes =
    {
        "quest",
        "questStage",
        "objective",
        "minigame",
        "chapter",
        "scene",
        "dialogueLine",
        "event",
    };

    internal static readonly string[] Actions = { "volume", "mute", "switch", "fade" };
    internal static readonly string[] RestoreModes = { "resume", "restart", "default" };

    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public string TriggerType { get; set; } = "event";
    public string TargetId { get; set; } = "";
    public string State { get; set; } = "active";
    public string Action { get; set; } = "volume";
    public string? TrackId { get; set; }
    public double TargetVolume { get; set; } = 1;
    public double FadeOutSeconds { get; set; } = 1;
    public double FadeInSeconds { get; set; } = 1;
    public int Priority { get; set; }
    public double DurationSeconds { get; set; }
    public string RestoreMode { get; set; } = "resume";
}
