namespace Echoes.MapEditor;

// 各類圖層的「顯示」開關（工具列第二排）：關閉的種類不畫、不能在畫布上點選；
// 從圖層清單選取被隱藏的種類時會自動重新顯示。只影響編輯畫面，不寫入場景。
public sealed partial class EditorCanvas
{
    private readonly HashSet<SceneLayerKind> _hiddenKinds = new();
    private bool _spawnHidden;

    /// <summary>顯示開關改變（含選取隱藏種類時自動打開），工具列據此同步勾選狀態</summary>
    public event EventHandler? LayerVisibilityChanged;

    public bool IsKindVisible(SceneLayerKind kind) => !_hiddenKinds.Contains(kind);

    public bool SpawnVisible
    {
        get => !_spawnHidden;
        set
        {
            if (_spawnHidden == !value) return;
            _spawnHidden = !value;
            RefreshAfterVisibilityChange();
        }
    }

    public void SetKindVisible(SceneLayerKind kind, bool visible)
    {
        if (kind == SceneLayerKind.None) return;
        if (visible ? !_hiddenKinds.Remove(kind) : !_hiddenKinds.Add(kind)) return;
        if (!visible && _selection.Kind == kind)
        {
            _selection = LayerSelection.None;
            _selectedVertex = -1;
            _selectedInteractionPoint = -1;
            SelectionChanged?.Invoke(this, EventArgs.Empty);
        }
        RefreshAfterVisibilityChange();
    }

    private void RefreshAfterVisibilityChange()
    {
        CancelDraft();
        DisposeViewCache();
        Invalidate();
        LayerVisibilityChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>從圖層清單選取被隱藏的種類：自動重新顯示，避免選到看不見的東西</summary>
    private void EnsureSelectionVisible(LayerSelection selection)
    {
        if (selection.Kind != SceneLayerKind.None && _hiddenKinds.Contains(selection.Kind)) SetKindVisible(selection.Kind, true);
    }
}
