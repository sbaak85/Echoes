using System.IO;

namespace Echoes.MapEditor;

public enum MapPageDirection
{
    Up,
    Right,
    Down,
    Left,
}

public sealed record MapPageRecord(
    string ScenePath,
    SceneDocument Document)
{
    public float Left => Document.WorldLayout.X;
    public float Top => Document.WorldLayout.Y;
    public float Right => Left + Document.World.Width;
    public float Bottom => Top + Document.World.Height;
}

public static class MapPageNavigation
{
    private const float EdgeTolerance = 0.75f;

    public static IReadOnlyList<MapPageRecord> LoadCatalog(string mapsDirectory)
    {
        if (!Directory.Exists(mapsDirectory)) return Array.Empty<MapPageRecord>();

        var records = new List<MapPageRecord>();
        foreach (var scenePath in Directory.EnumerateFiles(
                     mapsDirectory,
                     "*.scene.json",
                     SearchOption.TopDirectoryOnly))
        {
            try
            {
                var document = SceneJson.Load(scenePath);
                document.WorldLayout ??= new WorldLayout();
                if (
                    document.World.Width <= 0 ||
                    document.World.Height <= 0 ||
                    string.IsNullOrWhiteSpace(document.SceneId)
                )
                {
                    continue;
                }
                records.Add(new MapPageRecord(Path.GetFullPath(scenePath), document));
            }
            catch
            {
                // One incomplete scene must not prevent navigation among the
                // remaining valid map pages.
            }
        }
        return records;
    }

    public static MapPageRecord? FindNeighbor(
        SceneDocument current,
        string? currentScenePath,
        MapPageDirection direction,
        IEnumerable<MapPageRecord> catalog)
    {
        current.WorldLayout ??= new WorldLayout();
        var currentLeft = current.WorldLayout.X;
        var currentTop = current.WorldLayout.Y;
        var currentRight = currentLeft + current.World.Width;
        var currentBottom = currentTop + current.World.Height;
        var normalizedCurrentPath = currentScenePath is null
            ? null
            : Path.GetFullPath(currentScenePath);

        return catalog
            .Where(candidate =>
                !string.Equals(
                    candidate.ScenePath,
                    normalizedCurrentPath,
                    StringComparison.OrdinalIgnoreCase) &&
                candidate.Document.WorldLayout.Layer == current.WorldLayout.Layer)
            .Select(candidate => new
            {
                Candidate = candidate,
                Overlap = direction is MapPageDirection.Left or MapPageDirection.Right
                    ? Overlap(currentTop, currentBottom, candidate.Top, candidate.Bottom)
                    : Overlap(currentLeft, currentRight, candidate.Left, candidate.Right),
                Touches = direction switch
                {
                    MapPageDirection.Up =>
                        NearlyEqual(candidate.Bottom, currentTop),
                    MapPageDirection.Right =>
                        NearlyEqual(candidate.Left, currentRight),
                    MapPageDirection.Down =>
                        NearlyEqual(candidate.Top, currentBottom),
                    MapPageDirection.Left =>
                        NearlyEqual(candidate.Right, currentLeft),
                    _ => false,
                },
            })
            .Where(match => match.Touches && match.Overlap > EdgeTolerance)
            .OrderByDescending(match => match.Overlap)
            .ThenBy(match => OrthogonalCenterDistance(
                current,
                match.Candidate.Document,
                direction))
            .Select(match => match.Candidate)
            .FirstOrDefault();
    }

    public static WorldLayout CreateAdjacentLayout(
        SceneDocument current,
        int newMapWidth,
        int newMapHeight,
        MapPageDirection direction)
    {
        current.WorldLayout ??= new WorldLayout();
        var x = current.WorldLayout.X;
        var y = current.WorldLayout.Y;
        switch (direction)
        {
            case MapPageDirection.Up:
                y -= newMapHeight;
                break;
            case MapPageDirection.Right:
                x += current.World.Width;
                break;
            case MapPageDirection.Down:
                y += current.World.Height;
                break;
            case MapPageDirection.Left:
                x -= newMapWidth;
                break;
        }

        return new WorldLayout
        {
            X = x,
            Y = y,
            Layer = current.WorldLayout.Layer,
        };
    }

    public static MapPageDirection Opposite(MapPageDirection direction) =>
        direction switch
        {
            MapPageDirection.Up => MapPageDirection.Down,
            MapPageDirection.Right => MapPageDirection.Left,
            MapPageDirection.Down => MapPageDirection.Up,
            MapPageDirection.Left => MapPageDirection.Right,
            _ => direction,
        };

    public static string GetChineseDirection(MapPageDirection direction) =>
        direction switch
        {
            MapPageDirection.Up => "上方",
            MapPageDirection.Right => "右方",
            MapPageDirection.Down => "下方",
            MapPageDirection.Left => "左方",
            _ => "指定方向",
        };

    private static float Overlap(
        float firstStart,
        float firstEnd,
        float secondStart,
        float secondEnd) =>
        Math.Min(firstEnd, secondEnd) - Math.Max(firstStart, secondStart);

    private static bool NearlyEqual(float first, float second) =>
        Math.Abs(first - second) <= EdgeTolerance;

    private static float OrthogonalCenterDistance(
        SceneDocument first,
        SceneDocument second,
        MapPageDirection direction)
    {
        if (direction is MapPageDirection.Left or MapPageDirection.Right)
        {
            var firstCenter = first.WorldLayout.Y + first.World.Height / 2f;
            var secondCenter = second.WorldLayout.Y + second.World.Height / 2f;
            return Math.Abs(firstCenter - secondCenter);
        }

        var firstHorizontalCenter = first.WorldLayout.X + first.World.Width / 2f;
        var secondHorizontalCenter = second.WorldLayout.X + second.World.Width / 2f;
        return Math.Abs(firstHorizontalCenter - secondHorizontalCenter);
    }
}
