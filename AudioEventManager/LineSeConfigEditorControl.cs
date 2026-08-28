using System.Diagnostics;
using System.IO;

namespace Echoes.AudioEventTools;

internal sealed class LineSeConfigEditorControl : UserControl
{
    private sealed record GridOption(string Value, string Label);

    private static readonly GridOption[] NextLineBehaviorOptions =
    {
        new("finish", "自然播完（預設）"),
        new("stop", "停止"),
    };

    private readonly AudioEventConfigDocument _document;
    private readonly string _projectRoot;
    private readonly Action _markDirty;
    private readonly DataGridView _grid = CreateGrid();
    private readonly System.Windows.Media.MediaPlayer _previewPlayer = new();
    private readonly Button _previewButton = CreateButton("▶ 預覽", 88);
    private bool _previewPlaying;

    public LineSeConfigEditorControl(
        AudioEventConfigDocument document,
        string projectRoot,
        Action markDirty)
    {
        _document = document;
        _projectRoot = projectRoot;
        _markDirty = markDirty;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(25, 28, 34);
        ForeColor = Color.FromArgb(226, 230, 234);
        ConfigureGrid();
        LoadRows();
        Controls.Add(BuildLayout());

        _grid.CellValueChanged += (_, _) => _markDirty();
        _grid.UserDeletedRow += (_, _) => _markDirty();
        _grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (_grid.IsCurrentCellDirty)
            {
                _grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
            }
        };
        _grid.DataError += (_, eventArgs) => eventArgs.ThrowException = false;
        _previewButton.Click += (_, _) => TogglePreview();
        _previewPlayer.MediaEnded += (_, _) => StopPreview();
        _previewPlayer.MediaFailed += (_, eventArgs) =>
        {
            StopPreview();
            MessageBox.Show(
                this,
                eventArgs.ErrorException?.Message ?? "無法播放這個 MP3。",
                "Line SE 預覽失敗",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        };
    }

    public void Commit()
    {
        _grid.EndEdit();
        var entries = new List<LineSeEditableDefinition>();
        foreach (DataGridViewRow row in _grid.Rows)
        {
            if (row.IsNewRow) continue;
            var lineId = CellText(row, "LineId").Trim();
            if (lineId.Length == 0) continue;
            entries.Add(new LineSeEditableDefinition
            {
                LineId = lineId,
                SourceAssetPath = NullIfEmpty(CellText(row, "SourceAssetPath")),
                Source = CellText(row, "Source").Trim(),
                Volume = ParsePercentage(CellText(row, "Volume")),
                DelaySeconds = ParseDouble(CellText(row, "Delay")),
                FadeInSeconds = ParseDouble(CellText(row, "FadeIn")),
                FadeOutSeconds = ParseDouble(CellText(row, "FadeOut")),
                Loop = CellBool(row, "Loop"),
                NextLineBehavior = CellText(row, "NextLineBehavior") is { Length: > 0 } behavior
                    ? behavior
                    : "finish",
            });
        }

        _document.LineSeEntries.Clear();
        _document.LineSeEntries.AddRange(entries);
    }

    internal void RunUiSmokeTest()
    {
        var temporaryRowIndex = _grid.Rows.Add(
            "self-test-line",
            "",
            "./audio/self-test.mp3",
            100,
            0,
            0,
            0,
            false,
            "finish");
        try
        {
            var row = _grid.Rows[temporaryRowIndex];
            var display = Convert.ToString(
                row.Cells["NextLineBehavior"].FormattedValue)?.Trim();
            if (display != "自然播完（預設）")
            {
                throw new InvalidOperationException(
                    $"Line SE 預設切句行為顯示錯誤：{display}");
            }
        }
        finally
        {
            _grid.Rows.RemoveAt(temporaryRowIndex);
        }
    }

    private Control BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(960, 0),
            Text = "每列將一個對話 Line ID 綁定一支音效。切到下一句可選擇自然播完（預設）或立即依 FadeOut 淡出停止；Loop 會在切句時解除循環。所有時間欄位皆以秒計算。",
            ForeColor = Color.FromArgb(194, 201, 209),
            Margin = new Padding(0, 0, 0, 10),
        }, 0, 0);
        root.Controls.Add(_grid, 0, 1);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight,
            Margin = new Padding(0, 10, 0, 0),
        };
        var addButton = CreateButton("新增 Line SE", 118);
        addButton.Click += (_, _) => AddEntry();
        buttons.Controls.Add(addButton);
        var deleteButton = CreateButton("刪除 Line SE", 118);
        deleteButton.Click += (_, _) => DeleteEntry();
        buttons.Controls.Add(deleteButton);
        buttons.Controls.Add(_previewButton);
        var openButton = CreateButton("📂 開啟位置", 112);
        openButton.Click += (_, _) => OpenSelectedFileLocation();
        buttons.Controls.Add(openButton);
        root.Controls.Add(buttons, 0, 2);
        return root;
    }

    private void ConfigureGrid()
    {
        _grid.Columns.Add(TextColumn("LineId", "Line ID", 235));
        _grid.Columns.Add(TextColumn("SourceAssetPath", "原始素材路徑（選填）", 245));
        _grid.Columns.Add(TextColumn("Source", "遊戲 MP3 路徑", 225));
        _grid.Columns.Add(TextColumn("Volume", "音量 %", 72));
        _grid.Columns.Add(TextColumn("Delay", "延遲 秒", 72));
        _grid.Columns.Add(TextColumn("FadeIn", "FadeIn 秒", 82));
        _grid.Columns.Add(TextColumn("FadeOut", "FadeOut 秒", 86));
        _grid.Columns.Add(CheckColumn("Loop", "Loop", 55));
        _grid.Columns.Add(new DataGridViewComboBoxColumn
        {
            Name = "NextLineBehavior",
            HeaderText = "切到下一句",
            Width = 145,
            FlatStyle = FlatStyle.Flat,
            SortMode = DataGridViewColumnSortMode.NotSortable,
            DataSource = NextLineBehaviorOptions,
            DisplayMember = nameof(GridOption.Label),
            ValueMember = nameof(GridOption.Value),
            DisplayStyle = DataGridViewComboBoxDisplayStyle.DropDownButton,
        });
    }

    private void LoadRows()
    {
        foreach (var entry in _document.LineSeEntries)
        {
            _grid.Rows.Add(
                entry.LineId,
                entry.SourceAssetPath ?? "",
                entry.Source,
                Math.Round(entry.Volume * 100),
                entry.DelaySeconds,
                entry.FadeInSeconds,
                entry.FadeOutSeconds,
                entry.Loop,
                string.IsNullOrWhiteSpace(entry.NextLineBehavior)
                    ? "finish"
                    : entry.NextLineBehavior);
        }
    }

    private void AddEntry()
    {
        var sequence = 1;
        string lineId;
        do lineId = $"dialogue-line-{sequence++:000}";
        while (_grid.Rows.Cast<DataGridViewRow>().Any(
            row => CellText(row, "LineId").Equals(
                lineId,
                StringComparison.OrdinalIgnoreCase)));
        var rowIndex = _grid.Rows.Add(
            lineId,
            "",
            "./audio/new-line-se.mp3",
            100,
            0,
            0,
            0,
            false,
            "finish");
        _grid.CurrentCell = _grid.Rows[rowIndex].Cells["LineId"];
        _grid.BeginEdit(true);
        _markDirty();
    }

    private void DeleteEntry()
    {
        if (_grid.CurrentRow is not { IsNewRow: false } row) return;
        StopPreview();
        _grid.Rows.Remove(row);
        _markDirty();
    }

    private void TogglePreview()
    {
        if (_previewPlaying)
        {
            StopPreview();
            return;
        }
        if (_grid.CurrentRow is not { IsNewRow: false } row) return;
        var source = CellText(row, "Source");
        if (source.Length == 0) return;
        try
        {
            var path = AudioEventEditorForm.ResolvePreviewPath(_projectRoot, source);
            if (!File.Exists(path)) throw new FileNotFoundException("找不到遊戲 MP3。", path);
            _previewPlayer.Open(new Uri(path, UriKind.Absolute));
            _previewPlayer.Volume = ParsePercentage(CellText(row, "Volume"));
            _previewPlayer.Play();
            _previewPlaying = true;
            _previewButton.Text = "■ 停止";
        }
        catch (Exception exception)
        {
            StopPreview();
            MessageBox.Show(
                this,
                exception.Message,
                "Line SE 預覽失敗",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void OpenSelectedFileLocation()
    {
        if (_grid.CurrentRow is not { IsNewRow: false } row) return;
        var source = CellText(row, "Source");
        if (source.Length == 0) return;
        try
        {
            var path = AudioEventEditorForm.ResolvePreviewPath(_projectRoot, source);
            if (!File.Exists(path)) throw new FileNotFoundException("找不到遊戲 MP3。", path);
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"/select,\"{path}\"",
                UseShellExecute = true,
            });
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

    private void StopPreview()
    {
        _previewPlayer.Stop();
        _previewPlayer.Close();
        _previewPlaying = false;
        _previewButton.Text = "▶ 預覽";
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            StopPreview();
            _previewPlayer.Close();
        }
        base.Dispose(disposing);
    }

    private static DataGridView CreateGrid() => new()
    {
        Dock = DockStyle.Fill,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AllowUserToResizeRows = false,
        AutoGenerateColumns = false,
        BackgroundColor = Color.FromArgb(25, 28, 34),
        BorderStyle = BorderStyle.FixedSingle,
        GridColor = Color.FromArgb(62, 68, 79),
        ForeColor = Color.FromArgb(226, 230, 234),
        RowHeadersVisible = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = false,
        AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None,
        RowTemplate = { Height = 30 },
        ColumnHeadersHeight = 34,
        EnableHeadersVisualStyles = false,
        ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Color.FromArgb(45, 50, 59),
            ForeColor = Color.FromArgb(234, 237, 240),
            SelectionBackColor = Color.FromArgb(45, 50, 59),
        },
        DefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Color.FromArgb(34, 38, 46),
            ForeColor = Color.FromArgb(226, 230, 234),
            SelectionBackColor = Color.FromArgb(49, 100, 108),
            SelectionForeColor = Color.White,
        },
    };

    private static DataGridViewTextBoxColumn TextColumn(
        string name,
        string header,
        int width) => new()
    {
        Name = name,
        HeaderText = header,
        Width = width,
        SortMode = DataGridViewColumnSortMode.NotSortable,
    };

    private static DataGridViewCheckBoxColumn CheckColumn(
        string name,
        string header,
        int width) => new()
    {
        Name = name,
        HeaderText = header,
        Width = width,
        SortMode = DataGridViewColumnSortMode.NotSortable,
    };

    private static Button CreateButton(string text, int width)
    {
        var button = new Button
        {
            Width = width,
            Height = 34,
            Text = text,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 50, 59),
            ForeColor = Color.FromArgb(230, 234, 238),
            Margin = new Padding(0, 0, 8, 0),
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(85, 94, 108);
        return button;
    }

    private static string CellText(DataGridViewRow row, string columnName) =>
        Convert.ToString(row.Cells[columnName].Value)?.Trim() ?? "";

    private static bool CellBool(DataGridViewRow row, string columnName) =>
        row.Cells[columnName].Value is true;

    private static string? NullIfEmpty(string value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static double ParsePercentage(string value) =>
        Math.Clamp(ParseDouble(value), 0, 100) / 100;

    private static double ParseDouble(string value) =>
        double.TryParse(value, out var parsed) ? Math.Max(0, parsed) : 0;
}
