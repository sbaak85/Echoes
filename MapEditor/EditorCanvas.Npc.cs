using System.Drawing.Drawing2D;

namespace Echoes.MapEditor;

public sealed partial class EditorCanvas
{
    private NpcCatalog? _npcCatalog;
    private string? _npcCatalogError;
    private bool _npcSelected;
    private PointF _npcDragOffset;
    private PointF _npcResizeStartVector;
    private float _npcResizeStartScale;
    private readonly ToolStripMenuItem _npcParentMenu = new("新增 NPC");
    private readonly ContextMenuStrip _npcContextMenu = new();
    private readonly ToolStripMenuItem _npcHintPointContextItem = new("移動互動提示點至此");
    public SceneNpc? SelectedNpc => _npcSelected ? SelectedInteractable?.Npc : null;
    public string? AttachedNpcName => SelectedInteractable?.Npc is { } npc
        ? _npcCatalog?.Find(npc.CharacterId)?.Name ?? npc.CharacterId : null;

    public void LoadNpcCatalog(string projectRoot)
    {
        _npcCatalog?.Dispose();
        _npcCatalog = null; _npcCatalogError = null;
        try { _npcCatalog = NpcCatalog.Load(projectRoot); }
        catch (Exception exception) when (exception is System.IO.IOException or System.IO.InvalidDataException or System.Text.Json.JsonException or ArgumentException)
        { _npcCatalogError = exception.Message; }
        RebuildNpcParentMenu();
        DisposeViewCache(); Invalidate();
    }

    private void InitializeNpcMenus()
    {
        _nodeContextMenu.Items.Insert(8, _npcParentMenu);
        _npcContextMenu.BackColor = Color.FromArgb(35, 39, 47);
        _npcContextMenu.ForeColor = Color.WhiteSmoke;
        var edit = new ToolStripMenuItem("編輯 NPC 角色、方向與大小…");
        edit.Click += (_, _) => EditSelectedNpc();
        var facing = new ToolStripMenuItem("變更 NPC 面向");
        foreach (var direction in NpcCatalog.Directions)
        {
            var item = new ToolStripMenuItem(direction) { Tag = direction };
            item.Click += (_, _) =>
            {
                if (SelectedNpc is not { } npc) return;
                PerformMutation(() => npc.Facing = direction);
                SelectionChanged?.Invoke(this, EventArgs.Empty);
            };
            facing.DropDownItems.Add(item);
        }
        var remove = new ToolStripMenuItem("移除 NPC");
        remove.Click += (_, _) => DeleteSelectedNpc();
        var parent = new ToolStripMenuItem("選取所屬互動區");
        parent.Click += (_, _) => SelectLayer(_selection);
        _npcHintPointContextItem.Click += (_, _) => SetInteractionHintPointAtContext();
        _npcContextMenu.Items.AddRange(new ToolStripItem[] { edit, facing, remove, new ToolStripSeparator(),
            _npcHintPointContextItem, parent });
        _npcContextMenu.Opening += (_, _) =>
        {
            foreach (ToolStripMenuItem item in facing.DropDownItems) item.Checked = (string)item.Tag! == SelectedNpc?.Facing;
        };
        RebuildNpcParentMenu();
    }

    private void RebuildNpcParentMenu()
    {
        while (_npcParentMenu.DropDownItems.Count > 0)
        {
            var item = _npcParentMenu.DropDownItems[0];
            _npcParentMenu.DropDownItems.RemoveAt(0); item.Dispose();
        }
        var preview = new ToolStripMenuItem("角色與方向預覽…");
        preview.Click += (_, _) => EditNpcAtContext();
        _npcParentMenu.DropDownItems.Add(preview);
        if (_npcCatalog is null) return;
        _npcParentMenu.DropDownItems.Add(new ToolStripSeparator());
        foreach (var character in _npcCatalog.Characters)
        {
            var characterItem = new ToolStripMenuItem(character.Name);
            foreach (var direction in NpcCatalog.Directions)
            {
                var facing = new ToolStripMenuItem(direction);
                facing.Click += (_, _) => SetNpcAtContext(character.Id, direction);
                characterItem.DropDownItems.Add(facing);
            }
            _npcParentMenu.DropDownItems.Add(characterItem);
        }
    }

    private void PrepareNpcParentMenu(bool visible)
    {
        _npcParentMenu.Visible = visible;
        _npcParentMenu.Text = SelectedInteractable?.Npc is null ? "新增 NPC" : "編輯 NPC";
    }

    private void SetNpcAtContext(string characterId, string facing)
    {
        if (_contextSelection.Kind != SceneLayerKind.Interactable || !IsValidSelection(_contextSelection)) return;
        var parent = _document.Interactables[_contextSelection.Index];
        var npc = parent.Npc?.Copy() ?? new SceneNpc { X = _contextInteractionPoint.X, Y = _contextInteractionPoint.Y };
        npc.CharacterId = characterId; npc.Facing = facing;
        SetNpc(_contextSelection.Index, npc);
    }

    public void SetNpc(int interactionIndex, SceneNpc npc)
    {
        if (_npcCatalog?.Sprite(npc) is null || interactionIndex < 0 || interactionIndex >= _document.Interactables.Count ||
            !float.IsFinite(npc.X) || !float.IsFinite(npc.Y) || !float.IsFinite(npc.Scale) || npc.Scale <= 0) return;
        var copy = npc.Copy(); copy.Scale = Math.Clamp(copy.Scale, 0.1f, 5f);
        PerformMutation(() => _document.Interactables[interactionIndex].Npc = copy);
        SelectNpc(interactionIndex);
    }

    private void EditNpcAtContext()
    {
        if (_contextSelection.Kind != SceneLayerKind.Interactable || !IsValidSelection(_contextSelection)) return;
        EditNpc(_contextSelection.Index, _contextInteractionPoint);
    }

    public void EditSelectedNpc()
    {
        if (SelectedInteractable?.Npc is not { } npc) return;
        EditNpc(_selection.Index, new PointF(npc.X, npc.Y));
    }

    public void SelectAttachedNpc()
    {
        if (SelectedInteractable?.Npc is not null) SelectNpc(_selection.Index);
    }

    private void EditNpc(int index, PointF position)
    {
        if (_npcCatalog is null)
        {
            MessageBox.Show(this, "無法讀取共用 NPC 角色目錄。\n" + _npcCatalogError, "NPC", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        var draft = _document.Interactables[index].Npc?.Copy() ?? new SceneNpc
        { CharacterId = _npcCatalog.Characters[0].Id, X = position.X, Y = position.Y };
        using var dialog = new NpcEditorForm(_npcCatalog, draft);
        if (dialog.ShowDialog(this) == DialogResult.OK) SetNpc(index, dialog.Result);
    }

    private void SelectNpc(int index)
    {
        _selection = new LayerSelection(SceneLayerKind.Interactable, index);
        _npcSelected = true; _selectedVertex = -1; _selectedInteractionPoint = -1;
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        StatusChanged?.Invoke(this, "已選取 NPC；拖曳移動，右上角把手縮放，雙擊或右鍵可設定角色／方向／大小，Delete 移除 NPC。");
        Invalidate();
    }

    public void DeleteSelectedNpc()
    {
        if (SelectedNpc is null) return;
        PerformMutation(() => SelectedInteractable!.Npc = null);
        _npcSelected = false;
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetSelectedNpcScale(float scale)
    {
        if (SelectedNpc is not { } npc || !float.IsFinite(scale)) return;
        PerformMutation(() => npc.Scale = Math.Clamp(scale, 0.1f, 5f));
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private RectangleF NpcBodyRectangle(SceneNpc npc) => _npcCatalog?.BodyRectangle(npc) ??
        new RectangleF(npc.X - 24 * npc.Scale, npc.Y - 152 * npc.Scale, 48 * npc.Scale, 152 * npc.Scale);

    private int HitNpc(PointF world)
    {
        // Match rendering order: the closest foot is drawn and picked last.
        foreach (var item in _document.Interactables.Select((parent, index) => (parent.Npc, index))
                     .Where(item => item.Npc is not null).OrderByDescending(item => item.Npc!.Y).ThenByDescending(item => item.index))
        {
            var bounds = NpcBodyRectangle(item.Npc!); bounds.Inflate(3 / _zoom, 3 / _zoom);
            if (bounds.Contains(world)) return item.index;
        }
        return -1;
    }

    private bool TrySelectNpc(PointF world)
    {
        var index = HitNpc(world); if (index < 0) return false;
        SelectNpc(index); return true;
    }

    private bool TryShowNpcContextMenu(Point screen, PointF world)
    {
        var npcIndex = HitNpc(world);
        if (npcIndex < 0) return false;

        // NPC artwork must not cover the polygon's authoring commands. Keep an
        // explicitly selected overlapping Interaction, otherwise use the topmost one.
        var interactions = GetHitTestCandidates(world)
            .Where(candidate => candidate.Kind == SceneLayerKind.Interactable).ToList();
        if (interactions.Count > 0)
        {
            SelectLayer(interactions.Contains(_selection) ? _selection : interactions[0]);
            ShowNodeContextMenu(screen, world);
            return true;
        }

        // A tall sprite can extend outside its polygon; its own menu still allows
        // placing the parent's hint at the clicked body position (not the feet).
        SelectNpc(npcIndex);
        _contextSelection = _selection;
        _contextInteractionHintPoint = ClampToWorld(world);
        _npcHintPointContextItem.Enabled = IsInsideWorld(world);
        _npcHintPointContextItem.Text = SelectedInteractable!.InteractionHintPoint is null
            ? "新增互動提示點" : "移動互動提示點至此";
        _npcContextMenu.Show(this, screen); return true;
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
        foreach (var item in _document.Interactables.Select((parent, index) => (parent.Npc, index))
                     .Where(item => item.Npc is not null).OrderBy(item => item.Npc!.Y))
        {
            if (SkipLayer(SceneLayerKind.Interactable, item.index)) continue;
            var npc = item.Npc!;
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
        }
    }

    private void DrawNpcSelection(Graphics graphics)
    {
        if (SelectedNpc is not { } npc) return;
        var bounds = NpcBodyRectangle(npc);
        using var pen = new Pen(Color.FromArgb(100, 230, 255), 1.4f / _zoom) { DashStyle = DashStyle.Dash };
        graphics.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        DrawVertexHandle(graphics, NpcResizeHandle(npc), Color.FromArgb(82, 229, 255), 6);
        using var footPen = new Pen(Color.FromArgb(255, 215, 72), 2 / _zoom);
        graphics.DrawLine(footPen, npc.X - 8 / _zoom, npc.Y, npc.X + 8 / _zoom, npc.Y);
        graphics.DrawLine(footPen, npc.X, npc.Y - 5 / _zoom, npc.X, npc.Y + 5 / _zoom);
        var title = $"NPC · {_npcCatalog?.Find(npc.CharacterId)?.Name ?? npc.CharacterId} · {npc.Facing} · {npc.Scale * 100:0.#}%";
        using var font = new Font("Microsoft JhengHei UI", 9 / _zoom, FontStyle.Bold);
        var size = graphics.MeasureString(title, font);
        using var background = new SolidBrush(Color.FromArgb(220, 26, 35, 44));
        graphics.FillRectangle(background, bounds.Left, bounds.Top - size.Height - 5 / _zoom, size.Width + 6 / _zoom, size.Height + 3 / _zoom);
        graphics.DrawString(title, font, Brushes.White, bounds.Left + 3 / _zoom, bounds.Top - size.Height - 4 / _zoom);
    }

    private void DisposeNpcResources() { _npcContextMenu.Dispose(); _npcCatalog?.Dispose(); }
}
