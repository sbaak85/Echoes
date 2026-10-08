using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Echoes.QuestEditor;

// Headless diagnostics used by Program's --layout-benchmark / --render-preview modes.
internal sealed partial class MainForm
{
    private const uint RedrawUpdateNow = 0x0100, RedrawAllChildren = 0x0080, RedrawInvalidate = 0x0001;

    [DllImport("user32.dll")]
    private static extern bool RedrawWindow(IntPtr window, IntPtr rect, IntPtr region, uint flags);

    private bool _closeWithoutPrompts;

    /// <summary>Closes without the unsaved/validation prompts (no one can answer them in hidden modes).</summary>
    internal void CloseWithoutPrompts()
    {
        _closeWithoutPrompts = true;
        Close();
    }

    /// <summary>
    /// Times window resizing, splitter dragging and selection changes, each step flushed
    /// through a synchronous repaint of the whole window tree.
    /// </summary>
    internal string RunLayoutBenchmark()
    {
        // Populate every panel so the property grid and objective grid have real content.
        var quest = _document.Quests.FirstOrDefault(candidate => candidate.Stages.Any(stage => stage.Objectives.Count > 1));
        if (quest is null) return "no quest with objectives to benchmark";
        RebuildTree(quest);
        var stage = quest.Stages.First(candidate => candidate.Objectives.Count > 1);
        _stageList.SelectedItem = stage;
        _objectiveGrid.CurrentCell = _objectiveGrid.Rows[0].Cells[0];
        Flush();

        var report = new List<string> { $"window {Width}x{Height}, objectives {stage.Objectives.Count}" };
        var baseSize = Size;
        report.Add(Measure("window resize", 80, step =>
        {
            var offset = (step < 40 ? step : 80 - step) * 8;
            Size = new Size(baseSize.Width - offset, baseSize.Height - offset / 2);
        }));
        Size = baseSize;
        Flush();
        var middle = _middleSplit.SplitterDistance;
        report.Add(Measure("middle splitter drag", 60, step =>
            _middleSplit.SplitterDistance = middle + (step < 30 ? step : 60 - step) * 5));
        var left = _leftSplit.SplitterDistance;
        report.Add(Measure("left splitter drag", 60, step =>
            _leftSplit.SplitterDistance = left + (step < 30 ? step : 60 - step) * 4));
        var root = _rootSplit.SplitterDistance;
        report.Add(Measure("bottom splitter drag", 40, step =>
            _rootSplit.SplitterDistance = root - (step < 20 ? step : 40 - step) * 5));
        report.Add(Measure("objective selection", 40, step =>
            _objectiveGrid.CurrentCell = _objectiveGrid.Rows[step % stage.Objectives.Count].Cells[0]));
        // Breakdown: where a selection change spends its time.
        report.Add(Measure("full repaint only", 20, _ => { }));
        report.Add(MeasureLogic("property grid select", 20, step =>
            _propertyGrid.SelectedObject = stage.Objectives[step % stage.Objectives.Count]));
        report.Add(MeasureLogic("reference list update", 20, _ => UpdateReferenceList()));
        report.Add(MeasureLogic("validation", 20, _ => QuestValidator.Validate(_document, _references)));
        return string.Join(Environment.NewLine, report);
    }

    private string Measure(string label, int steps, Action<int> step)
    {
        var times = new List<double>(steps);
        var watch = new Stopwatch();
        for (var index = 0; index < steps; index++)
        {
            watch.Restart();
            step(index);
            Flush();
            times.Add(watch.Elapsed.TotalMilliseconds);
        }
        times.Sort();
        return $"{label,-22} avg {times.Average(),6:0.00} ms   p95 {times[(int)(times.Count * .95)],6:0.00} ms   max {times[^1],6:0.00} ms";
    }

    // Same as Measure, but without the repaint: pure UI-thread logic cost.
    private static string MeasureLogic(string label, int steps, Action<int> step)
    {
        var times = new List<double>(steps);
        var watch = new Stopwatch();
        for (var index = 0; index < steps; index++)
        {
            watch.Restart();
            step(index);
            times.Add(watch.Elapsed.TotalMilliseconds);
        }
        times.Sort();
        return $"{label,-22} avg {times.Average(),6:0.00} ms   p95 {times[(int)(times.Count * .95)],6:0.00} ms   max {times[^1],6:0.00} ms  (no repaint)";
    }

    private void Flush()
    {
        Application.DoEvents();
        RedrawWindow(Handle, IntPtr.Zero, IntPtr.Zero, RedrawInvalidate | RedrawAllChildren | RedrawUpdateNow);
    }
}
