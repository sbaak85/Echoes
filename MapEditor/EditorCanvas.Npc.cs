using System.Drawing.Drawing2D;

namespace Echoes.MapEditor;

// 場景 NPC（獨立圖層 SceneLayerKind.Npc）：
//   - 角色、腳底位置、面向、大小、出場條件都屬於 NPC 自己，不跟著任何互動區移動或縮放；
//   - 對話互動區以 NpcId 指定「對話對象」，同一個 NPC 可被多段對話共用；
//   - 新增：可走區域右鍵「在此新增 NPC」，或互動區右鍵「NPC ▸ 在此新增並設為對話對象」。
public sealed partial class EditorCanvas
{
    private NpcCatalog? _npcCatalog;
    private string? _npcCatalogError;
    private PointF _npcDragOffset;
    private PointF _npcResizeStartVector;
    private float _npcResizeStartScale;
    private PointF _npcContextWorld;
    private Point _npcContextScreen;
    private readonly ToolStripMenuItem _npcParentMenu = new("NPC");
    private readonly ToolStripMenuItem _npcCreateBoundMenu = new("在此新增 NPC 並設為對話對象");
    private readonly ToolStripMenuItem _npcBindMenu = new("對話對象");
    private readonly ToolStripMenuItem _addNpcWorldContextItem = new("在此新增 NPC");
    private readonly ContextMenuStrip _npcContextMenu = new();
    private readonly ToolStripMenuItem _npcFacingMenu = new("變更面向");
    private readonly ToolStripMenuItem _npcFacePlayerItem = new("對話時轉向主角") { CheckOnClick = false };
    private readonly ToolStripMenuItem _npcBreathingItem = new("待機呼吸") { CheckOnClick = false };
    private readonly ToolStripMenuItem _npcPresenceItem = new("出場條件…");
    private readonly ToolStripMenuItem _npcBoundInteractionsMenu = new("選取引用此 NPC 的對話");
    private readonly ToolStripMenuItem _npcUnderlyingMenuItem = new("開啟下方互動區選單");

    /// <summary>要求編輯選取 NPC 的出場條件（MainForm 負責開啟任務條件視窗）</summary>
    public event EventHandler? NpcPresenceEditRequested;

    public SceneNpc? SelectedNpc => _selection.Kind == SceneLayerKind.Npc && IsValidSelection(_selection)
        ? _document.NpcList[_selection.Index] : null;
    public SceneNpc? FindNpc(string? id) => string.IsNullOrWhiteSpace(id) ? null
        : _document.NpcList.FirstOrDefault(npc => npc.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
    public string NpcCharacterName(SceneNpc npc) => _npcCatalog?.Name(npc.CharacterId) ?? npc.CharacterId;
    public IReadOnlyList<SceneInteractable> InteractionsUsingNpc(SceneNpc npc) => _document.Interactables
        .Where(interactable => npc.Id.Equals(interactable.NpcId, StringComparison.OrdinalIgnoreCase)).ToList();

    public void LoadNpcCatalog(string projectRoot)
    {
        _npcCatalog?.Dispose();
        _npcCatalog = null; _npcCatalogError = null;
        try { _npcCatalog = NpcCatalog.Load(projectRoot); }
        catch (Exception exception) when (exception is System.IO.IOException or System.IO.InvalidDataException or System.Text.Json.JsonException or ArgumentException)
        { _npcCatalogError = exception.Message; }
        RebuildNpcCharacterMenus();
        DisposeViewCache(); Invalidate();
    }

    private void InitializeNpcMenus()
    {
        _nodeContextMenu.Items.Insert(8, _npcParentMenu);
        var preview = new ToolStripMenuItem("角色與方向預覽…（新增並設為對話對象）");
        preview.Click += (_, _) => CreateNpcWithDialog(_contextInteractionPoint, _contextSelection);
        _npcParentMenu.DropDownItems.AddRange(new ToolStripItem[] { _npcBindMenu, _npcCreateBoundMenu, preview });

        _npcContextMenu.BackColor = Color.FromArgb(35, 39, 47);
        _npcContextMenu.ForeColor = Color.WhiteSmoke;
        var edit = new ToolStripMenuItem("編輯 NPC 角色、方向與大小…");
        edit.Click += (_, _) => EditSelectedNpc();
        foreach (var direction in NpcCatalog.Directions)
        {
            var item = new ToolStripMenuItem(direction) { Tag = direction };
            item.Click += (_, _) => SetSelectedNpcFacing(direction);
            _npcFacingMenu.DropDownItems.Add(item);
        }
        _npcFacePlayerItem.Click += (_, _) => { if (SelectedNpc is { } npc) SetSelectedNpcOptions(!npc.FacePlayer, npc.Breathing); };
        _npcBreathingItem.Click += (_, _) => { if (SelectedNpc is { } npc) SetSelectedNpcOptions(npc.FacePlayer, !npc.Breathing); };
        _npcPresenceItem.Click += (_, _) => NpcPresenceEditRequested?.Invoke(this, EventArgs.Empty);
        var remove = new ToolStripMenuItem("移除 NPC");
        remove.Click += (_, _) => DeleteSelectedNpc();
        _npcUnderlyingMenuItem.Click += (_, _) =>
        {
            var interaction = UnderlyingInteraction(_npcContextWorld);
            if (interaction < 0) return;
            SelectLayer(new LayerSelection(SceneLayerKind.Interactable, interaction));
            ShowNodeContextMenu(_npcContextScreen, _npcContextWorld);
        };
        _npcContextMenu.Items.AddRange(new ToolStripItem[] { edit, _npcFacingMenu, _npcPresenceItem,
            _npcFacePlayerItem, _npcBreathingItem, remove, new ToolStripSeparator(), _npcBoundInteractionsMenu, _npcUnderlyingMenuItem });
        _npcContextMenu.Opening += (_, _) => RefreshNpcContextMenu();
        RebuildNpcCharacterMenus();
    }

    private void InitializeNpcWorldMenu()
    {
        _worldPointContextMenu.Items.Insert(2, _addNpcWorldContextItem);
        RebuildNpcCharacterMenus();
    }

    private void RebuildNpcCharacterMenus()
    {
        Populate(_npcCreateBoundMenu, (character, direction) => CreateNpc(character, direction, _contextInteractionPoint, _contextSelection));
        Populate(_addNpcWorldContextItem, (character, direction) => CreateNpc(character, direction, _contextWorldPoint, LayerSelection.None));

        void Populate(ToolStripMenuItem menu, Action<string, string> create)
        {
            while (menu.DropDownItems.Count > 0)
            {
                var item = menu.DropDownItems[0];
                menu.DropDownItems.RemoveAt(0); item.Dispose();
            }
            menu.Enabled = _npcCatalog is not null;
            if (_npcCatalog is null) return;
            foreach (var character in _npcCatalog.Characters)
            {
                var characterItem = new ToolStripMenuItem(character.Name);
                foreach (var direction in NpcCatalog.Directions)
                {
                    var facing = new ToolStripMenuItem(direction);
                    var characterId = character.Id;
                    facing.Click += (_, _) => create(characterId, direction);
                    characterItem.DropDownItems.Add(facing);
                }
                menu.DropDownItems.Add(characterItem);
            }
        }
    }

    /// <summary>互動區右鍵選單：NPC ▸ 對話對象（單選）／在此新增</summary>
    private void PrepareNpcParentMenu(bool interactionSelected)
    {
        _npcParentMenu.Visible = interactionSelected;
        if (!interactionSelected) return;
        var interactable = _document.Interactables[_selection.Index];
        var bound = FindNpc(interactable.NpcId);
        _npcParentMenu.Text = bound is null ? "NPC（未指定對話對象）" : $"NPC（對話對象：{bound.Label}）";
        while (_npcBindMenu.DropDownItems.Count > 0)
        {
            var old = _npcBindMenu.DropDownItems[0];
            _npcBindMenu.DropDownItems.RemoveAt(0); old.Dispose();
        }
        var interactionIndex = _selection.Index;
        var none = new ToolStripMenuItem("（不指定）") { Checked = bound is null };
        none.Click += (_, _) => BindInteractionNpc(interactionIndex, null);
        _npcBindMenu.DropDownItems.Add(none);
        foreach (var npc in _document.NpcList)
        {
            var npcId = npc.Id;
            var item = new ToolStripMenuItem($"{npc.Label}（{NpcCharacterName(npc)}）") { Checked = npc == bound };
            item.Click += (_, _) => BindInteractionNpc(interactionIndex, npcId);
            _npcBindMenu.DropDownItems.Add(item);
        }
    }

    public void BindInteractionNpc(int interactionIndex, string? npcId)
    {
        if (interactionIndex < 0 || interactionIndex >= _document.Interactables.Count) return;
        if (npcId is not null && FindNpc(npcId) is null) return;
        PerformMutation(() => _document.Interactables[interactionIndex].NpcId = npcId);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>新增一個 NPC；bindTo 為互動區時同時設成該互動區的對話對象。回傳新 NPC 的索引。</summary>
    public int CreateNpc(string characterId, string facing, PointF position, LayerSelection bindTo, float scale = 1)
    {
        if (_npcCatalog?.Find(characterId) is not { } character || !NpcCatalog.Directions.Contains(facing) ||
            !IsFinite(position) || !float.IsFinite(scale) || scale <= 0) return -1;
        var bindIndex = bindTo.Kind == SceneLayerKind.Interactable && IsValidSelection(bindTo) ? bindTo.Index : -1;
        var index = -1;
        PerformMutation(() =>
        {
            var npc = new SceneNpc
            {
                Id = SceneJson.UniqueNpcId(_document, $"npc-{characterId}"),
                Label = character.Name, CharacterId = characterId, Facing = facing,
                X = position.X, Y = position.Y, Scale = Math.Clamp(scale, 0.1f, 5f),
            };
            _document.NpcList.Add(npc);
            index = _document.NpcList.Count - 1;
            if (bindIndex >= 0) _document.Interactables[bindIndex].NpcId = npc.Id;
        });
        SelectNpc(index);
        return index;
    }

    private void CreateNpcWithDialog(PointF position, LayerSelection bindTo)
    {
        if (_npcCatalog is null) { ShowCatalogError(); return; }
        using var dialog = new NpcEditorForm(_npcCatalog, new SceneNpc { CharacterId = _npcCatalog.Characters[0].Id, X = position.X, Y = position.Y });
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        var result = dialog.Result;
        CreateNpc(result.CharacterId, result.Facing, position, bindTo, result.Scale);
    }

    /// <summary>以新的角色／方向／大小／位置取代指定 NPC（保留 ID、名稱、出場條件與表現選項）</summary>
    public void SetNpc(int npcIndex, SceneNpc npc)
    {
        if (npcIndex < 0 || npcIndex >= _document.NpcList.Count || _npcCatalog?.Sprite(npc) is null ||
            !float.IsFinite(npc.X) || !float.IsFinite(npc.Y) || !float.IsFinite(npc.Scale) || npc.Scale <= 0) return;
        PerformMutation(() =>
        {
            var target = _document.NpcList[npcIndex];
            target.CharacterId = npc.CharacterId; target.Facing = npc.Facing;
            target.X = npc.X; target.Y = npc.Y; target.Scale = Math.Clamp(npc.Scale, 0.1f, 5f);
        });
        SelectNpc(npcIndex);
    }

    public void EditSelectedNpc()
    {
        if (SelectedNpc is not { } npc) return;
        if (_npcCatalog is null) { ShowCatalogError(); return; }
        var index = _selection.Index;
        using var dialog = new NpcEditorForm(_npcCatalog, npc);
        if (dialog.ShowDialog(this) == DialogResult.OK) SetNpc(index, dialog.Result);
    }

    private void ShowCatalogError() => MessageBox.Show(this, "無法讀取共用 NPC 角色目錄。\n" + _npcCatalogError, "NPC",
        MessageBoxButtons.OK, MessageBoxIcon.Information);

    public void SelectNpc(int index)
    {
        if (index < 0 || index >= _document.NpcList.Count) return;
        _selection = new LayerSelection(SceneLayerKind.Npc, index);
        _selectedVertex = -1; _selectedInteractionPoint = -1;
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, "已選取 NPC；拖曳移動，右上角把手縮放，雙擊或右鍵設定角色／方向／大小／出場條件，Delete 移除。");
        Invalidate();
    }

    /// <summary>移除 NPC，並清除所有引用它的對話對象設定</summary>
    public void DeleteSelectedNpc()
    {
        if (SelectedNpc is not { } npc) return;
        PerformMutation(() =>
        {
            _document.NpcList.Remove(npc);
            foreach (var interactable in _document.Interactables)
                if (npc.Id.Equals(interactable.NpcId, StringComparison.OrdinalIgnoreCase)) interactable.NpcId = null;
            _selection = LayerSelection.None;
        });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetSelectedNpcScale(float scale)
    {
        if (SelectedNpc is not { } npc || !float.IsFinite(scale)) return;
        PerformMutation(() => npc.Scale = Math.Clamp(scale, 0.1f, 5f));
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetSelectedNpcFacing(string facing)
    {
        if (SelectedNpc is not { } npc || !NpcCatalog.Directions.Contains(facing)) return;
        PerformMutation(() => npc.Facing = facing);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetSelectedNpcOptions(bool facePlayer, bool breathing)
    {
        if (SelectedNpc is not { } npc) return;
        PerformMutation(() => { npc.FacePlayer = facePlayer; npc.Breathing = breathing; });
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>設定出場條件；null＝一直在場</summary>
    public void SetSelectedNpcPresence(InteractionUseRequirement? presence)
    {
        if (SelectedNpc is not { } npc) return;
        PerformMutation(() => npc.Presence = presence?.Clone());
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public static string DescribeNpcPresence(SceneNpc npc)
    {
        if (npc.Presence is not { } presence) return "一直在場";
        var mode = presence.StageMode switch
        {
            "CurrentStageOnly" => "只在",
            "UnlockUntilCondition" => "從",
            _ => "從",
        };
        var text = $"{mode} {ShortId(presence.StageId)}{(presence.StageMode == "CurrentStageOnly" ? " 期間" : " 起")}";
        if (!string.IsNullOrWhiteSpace(presence.ObjectiveId)) text += $"（{ShortId(presence.ObjectiveId)}）";
        if (presence.StageMode == "UnlockUntilCondition" && !string.IsNullOrWhiteSpace(presence.DisableStageId))
            text += $"，到 {ShortId(presence.DisableStageId)} 離場";
        if (!string.IsNullOrWhiteSpace(presence.RemoveStageId)) text += $"，{ShortId(presence.RemoveStageId)} 移除";
        return text;

        static string ShortId(string? id) => string.IsNullOrWhiteSpace(id) ? "" :
            id.Replace("QUEST_", "").Replace("_STAGE_", " S").Replace("_OBJ_", " O");
    }

    private RectangleF NpcBodyRectangle(SceneNpc npc) => _npcCatalog?.BodyRectangle(npc) ??
        new RectangleF(npc.X - 24 * npc.Scale, npc.Y - 152 * npc.Scale, 48 * npc.Scale, 152 * npc.Scale);

    private int HitNpc(PointF world)
    {
        if (!IsKindVisible(SceneLayerKind.Npc)) return -1;
        // 與繪製順序一致：腳底越靠下（越前面）越先被點到
        foreach (var item in _document.NpcList.Select((npc, index) => (npc, index))
                     .OrderByDescending(item => item.npc.Y).ThenByDescending(item => item.index))
        {
            var bounds = NpcBodyRectangle(item.npc); bounds.Inflate(3 / _zoom, 3 / _zoom);
            if (bounds.Contains(world)) return item.index;
        }
        return -1;
    }

    private bool TrySelectNpc(PointF world)
    {
        var index = HitNpc(world); if (index < 0) return false;
        SelectNpc(index); return true;
    }

    private int UnderlyingInteraction(PointF world) => GetHitTestCandidates(world)
        .Where(candidate => candidate.Kind == SceneLayerKind.Interactable).Select(candidate => candidate.Index)
        .DefaultIfEmpty(-1).First();

    private bool TryShowNpcContextMenu(Point screen, PointF world)
    {
        var npcIndex = HitNpc(world);
        if (npcIndex < 0) return false;
        SelectNpc(npcIndex);
        _npcContextWorld = ClampToWorld(world);
        _npcContextScreen = screen;
        _npcContextMenu.Show(this, screen);
        return true;
    }

    private void RefreshNpcContextMenu()
    {
        if (SelectedNpc is not { } npc) return;
        foreach (ToolStripMenuItem item in _npcFacingMenu.DropDownItems) item.Checked = (string)item.Tag! == npc.Facing;
        _npcFacePlayerItem.Checked = npc.FacePlayer;
        _npcBreathingItem.Checked = npc.Breathing;
        _npcPresenceItem.Text = $"出場條件…（{DescribeNpcPresence(npc)}）";
        while (_npcBoundInteractionsMenu.DropDownItems.Count > 0)
        {
            var old = _npcBoundInteractionsMenu.DropDownItems[0];
            _npcBoundInteractionsMenu.DropDownItems.RemoveAt(0); old.Dispose();
        }
        var bound = InteractionsUsingNpc(npc);
        _npcBoundInteractionsMenu.Enabled = bound.Count > 0;
        _npcBoundInteractionsMenu.Text = bound.Count > 0 ? $"選取引用此 NPC 的對話（{bound.Count}）" : "沒有對話引用此 NPC";
        foreach (var interactable in bound)
        {
            var index = _document.Interactables.IndexOf(interactable);
            var item = new ToolStripMenuItem($"{interactable.Label} · {interactable.Id}");
            item.Click += (_, _) => SelectLayer(new LayerSelection(SceneLayerKind.Interactable, index));
            _npcBoundInteractionsMenu.DropDownItems.Add(item);
        }
        _npcUnderlyingMenuItem.Visible = UnderlyingInteraction(_npcContextWorld) >= 0;
    }

    private PointF NpcResizeHandle(SceneNpc npc)
    {
        var bounds = NpcBodyRectangle(npc);
        return new(bounds.Right, bounds.Top);
    }

    private bool TryBeginNpcDrag(PointF world)
    {
        if (SelectedNpc is { } selected && Distance(world, NpcResizeHandle(selected)) <= 10f / _zoom)
        {
            _npcResizeStartVector = new PointF(world.X - selected.X, world.Y - selected.Y);
            _npcResizeStartScale = selected.Scale;
            BeginMutation(); _dragMode = DragMode.NpcResize; Capture = true; return true;
        }
        if (!TrySelectNpc(world) || SelectedNpc is not { } npc) return false;
        var snapped = SnapAndClamp(world);
        _npcDragOffset = new PointF(npc.X - snapped.X, npc.Y - snapped.Y);
        BeginMutation(); _dragMode = DragMode.NpcMove; Capture = true; return true;
    }

    private bool UpdateNpcDrag(PointF world)
    {
        if (SelectedNpc is not { } npc) return false;
        if (_dragMode == DragMode.NpcResize)
        {
            var denominator = _npcResizeStartVector.X * _npcResizeStartVector.X + _npcResizeStartVector.Y * _npcResizeStartVector.Y;
            if (denominator < 0.01f) return false;
            var ratio = ((world.X - npc.X) * _npcResizeStartVector.X + (world.Y - npc.Y) * _npcResizeStartVector.Y) / denominator;
            var scale = Math.Clamp(_npcResizeStartScale * ratio, 0.1f, 5f);
            if (Math.Abs(scale - npc.Scale) < 0.0001f) return false;
            npc.Scale = scale;
        }
        else
        {
            var position = ClampToWorld(new PointF(world.X + _npcDragOffset.X, world.Y + _npcDragOffset.Y));
            if (Math.Abs(position.X - npc.X) + Math.Abs(position.Y - npc.Y) < 0.001f) return false;
            npc.X = position.X; npc.Y = position.Y;
        }
        return true;
    }

    private void DrawNpcs(Graphics graphics)
    {
        var selectedInteraction = SelectedInteractable;
        foreach (var item in _document.NpcList.Select((npc, index) => (npc, index)).OrderBy(item => item.npc.Y))
        {
            if (SkipLayer(SceneLayerKind.Npc, item.index)) continue;
            var npc = item.npc;
            var sprite = _npcCatalog?.Sprite(npc);
            if (sprite is not null)
                graphics.DrawImage(_npcCatalog!.Image(sprite), _npcCatalog.ImageRectangle(npc, sprite));
            else
            {
                var rectangle = NpcBodyRectangle(npc);
                using var fill = new SolidBrush(Color.FromArgb(90, 230, 140, 85));
                using var pen = new Pen(Color.Orange, 1 / _zoom);
                graphics.FillRectangle(fill, rectangle); graphics.DrawRectangle(pen, rectangle.X, rectangle.Y, rectangle.Width, rectangle.Height);
                using var font = new Font("Segoe UI", 10 / _zoom);
                graphics.DrawString("NPC: " + npc.CharacterId, font, Brushes.White, rectangle.Location);
            }
            // 選取的互動區若以此 NPC 為對話對象，畫一條虛線連到角色腳底
            if (selectedInteraction is not null && IsKindVisible(SceneLayerKind.Interactable) &&
                npc.Id.Equals(selectedInteraction.NpcId, StringComparison.OrdinalIgnoreCase))
                DrawNpcLink(graphics, npc, selectedInteraction);
        }
    }

    private void DrawNpcLink(Graphics graphics, SceneNpc npc, SceneInteractable interactable)
    {
        if (interactable.Points.Count == 0) return;
        var center = new PointF(interactable.Points.Average(point => point.X), interactable.Points.Average(point => point.Y));
        using var pen = new Pen(Color.FromArgb(210, 120, 230, 255), 1.6f / _zoom) { DashStyle = DashStyle.Dash };
        graphics.DrawLine(pen, center, new PointF(npc.X, npc.Y));
        graphics.FillEllipse(Brushes.DeepSkyBlue, npc.X - 3 / _zoom, npc.Y - 3 / _zoom, 6 / _zoom, 6 / _zoom);
    }

    private void DrawNpcSelection(Graphics graphics)
    {
        if (SelectedNpc is not { } npc) return;
        if (IsKindVisible(SceneLayerKind.Interactable))
            foreach (var interactable in InteractionsUsingNpc(npc)) DrawNpcLink(graphics, npc, interactable);
        var bounds = NpcBodyRectangle(npc);
        using var pen = new Pen(Color.FromArgb(100, 230, 255), 1.4f / _zoom) { DashStyle = DashStyle.Dash };
        graphics.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        DrawVertexHandle(graphics, NpcResizeHandle(npc), Color.FromArgb(82, 229, 255), 6);
        using var footPen = new Pen(Color.FromArgb(255, 215, 72), 2 / _zoom);
        graphics.DrawLine(footPen, npc.X - 8 / _zoom, npc.Y, npc.X + 8 / _zoom, npc.Y);
        graphics.DrawLine(footPen, npc.X, npc.Y - 5 / _zoom, npc.X, npc.Y + 5 / _zoom);
        var title = $"NPC · {npc.Label} · {NpcCharacterName(npc)} · {npc.Facing} · {npc.Scale * 100:0.#}% · {DescribeNpcPresence(npc)}";
        using var font = new Font("Microsoft JhengHei UI", 9 / _zoom, FontStyle.Bold);
        var size = graphics.MeasureString(title, font);
        using var background = new SolidBrush(Color.FromArgb(220, 26, 35, 44));
        graphics.FillRectangle(background, bounds.Left, bounds.Top - size.Height - 5 / _zoom, size.Width + 6 / _zoom, size.Height + 3 / _zoom);
        graphics.DrawString(title, font, Brushes.White, bounds.Left + 3 / _zoom, bounds.Top - size.Height - 4 / _zoom);
    }

    private void DisposeNpcResources() { _npcContextMenu.Dispose(); _npcCatalog?.Dispose(); }
}
