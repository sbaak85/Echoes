using System.IO;
using System.Text.Json;
using System.Drawing.Drawing2D;

namespace Echoes.MapEditor;

public sealed class SceneNpc : ScenePoint
{
    public string CharacterId { get; set; } = "";
    public string Facing { get; set; } = "S";
    public float Scale { get; set; } = 1;
    public SceneNpc Copy() => new() { CharacterId = CharacterId, Facing = Facing, X = X, Y = Y, Scale = Scale };
}

internal sealed class NpcCharacter
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public Dictionary<string, NpcSprite> Sprites { get; set; } = new();
}

internal sealed class NpcSprite
{
    public string File { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public float AnchorX { get; set; }
    public float AnchorY { get; set; }
    public float BodyHeight { get; set; }
    public NpcBodyBounds? BodyBounds { get; set; }
}

internal sealed class NpcBodyBounds
{
    public float X { get; set; }
    public float Y { get; set; }
    public float Width { get; set; }
    public float Height { get; set; }
}

// Shared by the native editor and browser runtime. The JSON remains the sole
// authority for characters, PNG paths, visible height, and foot anchors.
internal sealed class NpcCatalog : IDisposable
{
    public static readonly string[] Directions = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
    public int Version { get; set; }
    public float DefaultHeight { get; set; }
    public List<NpcCharacter> Characters { get; set; } = new();
    private string _publicRoot = "";
    private readonly Dictionary<string, Bitmap> _images = new(StringComparer.OrdinalIgnoreCase);

    public static NpcCatalog Load(string projectRoot)
    {
        var publicRoot = Path.GetFullPath(Path.Combine(projectRoot, "public"));
        var catalog = JsonSerializer.Deserialize<NpcCatalog>(
            System.IO.File.ReadAllText(Path.Combine(publicRoot, "characters", "npc-catalog.json")), SceneJson.Options)
            ?? throw new InvalidDataException("NPC 角色目錄沒有有效內容。");
        catalog._publicRoot = publicRoot;
        if (catalog.Version != 1 || !float.IsFinite(catalog.DefaultHeight) || catalog.DefaultHeight <= 0 ||
            catalog.Characters.Count == 0 || catalog.Characters.Select(c => c.Id).Distinct().Count() != catalog.Characters.Count)
            throw new InvalidDataException("NPC 角色目錄版本或內容無效。");
        foreach (var character in catalog.Characters)
        foreach (var facing in Directions)
        {
            if (string.IsNullOrWhiteSpace(character.Id) || !character.Sprites.TryGetValue(facing, out var sprite) ||
                sprite.Width <= 0 || sprite.Height <= 0 || !float.IsFinite(sprite.BodyHeight) || sprite.BodyHeight <= 0 ||
                !float.IsFinite(sprite.AnchorX) || !float.IsFinite(sprite.AnchorY))
                throw new InvalidDataException($"NPC {character.Id} 的 {facing} 圖片資料不完整。");
            catalog.ResolvePath(sprite);
        }
        return catalog;
    }

    public NpcCharacter? Find(string id) => Characters.FirstOrDefault(c => c.Id == id);
    public NpcSprite? Sprite(SceneNpc npc) => Find(npc.CharacterId)?.Sprites.GetValueOrDefault(npc.Facing);
    public float Factor(SceneNpc npc, NpcSprite sprite) => DefaultHeight / sprite.BodyHeight * npc.Scale;

    public RectangleF ImageRectangle(SceneNpc npc, NpcSprite sprite)
    {
        var factor = Factor(npc, sprite);
        return new(npc.X - sprite.AnchorX * factor, npc.Y - sprite.AnchorY * factor,
            sprite.Width * factor, sprite.Height * factor);
    }

    public RectangleF BodyRectangle(SceneNpc npc)
    {
        var sprite = Sprite(npc);
        if (sprite is null) return new(npc.X - 24 * npc.Scale, npc.Y - DefaultHeight * npc.Scale, 48 * npc.Scale, DefaultHeight * npc.Scale);
        var imageRect = ImageRectangle(npc, sprite);
        var factor = Factor(npc, sprite);
        var body = sprite.BodyBounds;
        return body is null ? imageRect : new(imageRect.X + body.X * factor,
            imageRect.Y + body.Y * factor, body.Width * factor, body.Height * factor);
    }

    private string ResolvePath(NpcSprite sprite)
    {
        var path = Path.GetFullPath(Path.Combine(_publicRoot, sprite.File.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(_publicRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("NPC 圖片路徑必須在 public 目錄內。");
        if (!System.IO.File.Exists(path)) throw new FileNotFoundException("找不到 NPC 圖片。", path);
        return path;
    }

    public Bitmap Image(NpcSprite sprite)
    {
        if (!_images.TryGetValue(sprite.File, out var image))
        {
            image = ImageLoader.Load(ResolvePath(sprite));
            _images.Add(sprite.File, image);
        }
        return image;
    }

    public void DrawPreview(Graphics graphics, Rectangle bounds, string characterId, string facing)
    {
        var npc = new SceneNpc { CharacterId = characterId, Facing = facing };
        var sprite = Sprite(npc);
        if (sprite is null) return;
        var source = sprite.BodyBounds is { } body
            ? new RectangleF(body.X - 5, body.Y - 5, body.Width + 10, body.Height + 10)
            : new RectangleF(0, 0, sprite.Width, sprite.Height);
        var ratio = Math.Min(bounds.Width / source.Width, bounds.Height / source.Height);
        var target = new RectangleF(bounds.X + (bounds.Width - source.Width * ratio) / 2,
            bounds.Y + (bounds.Height - source.Height * ratio) / 2, source.Width * ratio, source.Height * ratio);
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.DrawImage(Image(sprite), target, source, GraphicsUnit.Pixel);
    }

    public void Dispose()
    {
        foreach (var image in _images.Values) image.Dispose();
        _images.Clear();
    }
}
