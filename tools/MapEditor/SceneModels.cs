using System.Text.Json;
using System.Text.Json.Serialization;
using System.IO;

namespace Echoes.MapEditor;

public sealed class SceneDocument
{
    public int SchemaVersion { get; set; } = 1;
    public string SceneId { get; set; } = "new_scene";
    public string DisplayName { get; set; } = "New scene";
    public SceneImage Image { get; set; } = new();
    public SceneWorld World { get; set; } = new();
    public GridSettings Grid { get; set; } = new();
    public PlayerSpawn PlayerSpawn { get; set; } = new();
    public List<NavMeshRegion> NavMesh { get; set; } = new();
    public List<CollisionShape> Collisions { get; set; } = new();
    public List<SceneInteractable> Interactables { get; set; } = new();
    public WorldLayout WorldLayout { get; set; } = new();
    public List<SceneConnection> Connections { get; set; } = new();

    public static SceneDocument CreateForImage(string imagePath, int width, int height)
    {
        var sceneId = Path.GetFileNameWithoutExtension(imagePath);
        return new SceneDocument
        {
            SceneId = sceneId,
            DisplayName = sceneId,
            Image = new SceneImage
            {
                File = Path.GetFileName(imagePath),
                Width = width,
                Height = height,
            },
            World = new SceneWorld { Width = width, Height = height },
            PlayerSpawn = new PlayerSpawn
            {
                X = width / 2f,
                Y = height / 2f,
                Facing = "S",
            },
        };
    }
}

public sealed class SceneImage
{
    public string File { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
}

public sealed class SceneWorld
{
    public float Width { get; set; }
    public float Height { get; set; }
}

public sealed class GridSettings
{
    public int Size { get; set; } = 18;
    public bool Visible { get; set; } = true;
    public bool Snap { get; set; } = true;
}

public sealed class PlayerSpawn
{
    public float X { get; set; }
    public float Y { get; set; }
    public string Facing { get; set; } = "S";
}

public sealed class ScenePoint
{
    public ScenePoint()
    {
    }

    public ScenePoint(float x, float y)
    {
        X = x;
        Y = y;
    }

    public float X { get; set; }
    public float Y { get; set; }

    public ScenePoint Clone() => new(X, Y);
}

public sealed class NavMeshRegion
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "NavMesh";
    public List<ScenePoint> Points { get; set; } = new();
}

public sealed class CollisionShape
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Collision";
    public string Shape { get; set; } = "polygon";

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ScenePoint>? Points { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ScenePoint? Center { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public float Radius { get; set; }
}

public sealed class WorldLayout
{
    public float X { get; set; }
    public float Y { get; set; }
    public int Layer { get; set; }
}

public sealed class SceneInteractable
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Interactable";
    public ScenePoint Position { get; set; } = new();

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ScenePoint? InteractionPoint { get; set; }

    public float PickRadius { get; set; } = 32;
    public float ActivationDistance { get; set; } = 52;
    public string Action { get; set; } = "interact";
}

public sealed class SceneConnection
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "Scene connection";
    public string Type { get; set; } = "exit";
    public List<ScenePoint> Area { get; set; } = new();
    public string TargetSceneId { get; set; } = "";
    public PlayerSpawn TargetSpawn { get; set; } = new();
    public WorldLayout TargetRelativePosition { get; set; } = new();
}

public static class SceneJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static SceneDocument Load(string path)
    {
        return Deserialize(File.ReadAllText(path));
    }

    public static SceneDocument Deserialize(string json)
    {
        return JsonSerializer.Deserialize<SceneDocument>(json, Options)
            ?? throw new InvalidDataException("場景 JSON 沒有有效內容。");
    }

    public static string Serialize(SceneDocument document)
    {
        return JsonSerializer.Serialize(document, Options) + Environment.NewLine;
    }

    public static void Save(string path, SceneDocument document)
    {
        Validate(document);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, Serialize(document));
    }

    public static void Validate(SceneDocument document)
    {
        if (document.SchemaVersion != 1)
        {
            throw new InvalidDataException($"不支援場景格式版本 {document.SchemaVersion}。");
        }

        if (string.IsNullOrWhiteSpace(document.SceneId))
        {
            throw new InvalidDataException("sceneId 不可空白。");
        }

        if (document.World.Width <= 0 || document.World.Height <= 0)
        {
            throw new InvalidDataException("場景寬度與高度必須大於零。");
        }

        if (document.NavMesh.Any(region => region.Points.Count < 3))
        {
            throw new InvalidDataException("每個 NavMesh 至少需要三個頂點。");
        }

        foreach (var collision in document.Collisions)
        {
            if (collision.Shape.Equals("circle", StringComparison.OrdinalIgnoreCase))
            {
                if (collision.Center is null || collision.Radius <= 0)
                {
                    throw new InvalidDataException($"圓形 Collision {collision.Id} 缺少中心或半徑。");
                }
            }
            else if (collision.Points is null || collision.Points.Count < 3)
            {
                throw new InvalidDataException($"Collision {collision.Id} 至少需要三個頂點。");
            }
        }
    }
}

public static class ProjectPaths
{
    public static string? FindProjectRoot(string startPath)
    {
        var directory = new DirectoryInfo(startPath);
        while (directory is not null)
        {
            if (
                File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                Directory.Exists(Path.Combine(directory.FullName, "public", "maps")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        var currentDirectory = Environment.CurrentDirectory;
        if (
            File.Exists(Path.Combine(currentDirectory, "package.json")) &&
            Directory.Exists(Path.Combine(currentDirectory, "public", "maps")))
        {
            return currentDirectory;
        }

        return null;
    }
}
