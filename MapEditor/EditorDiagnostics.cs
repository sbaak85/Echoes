using System.Text;
using System.IO;

namespace Echoes.MapEditor;

internal static class EditorDiagnostics
{
    private static readonly object SyncRoot = new();

    public static string LogPath => Path.Combine(
        AppContext.BaseDirectory,
        "runtime",
        "MapEditor.log");

    public static void Log(string context, Exception exception)
    {
        try
        {
            var builder = new StringBuilder();
            builder.AppendLine($"[{DateTimeOffset.Now:O}] {context}");
            builder.AppendLine(exception.ToString());
            builder.AppendLine();

            lock (SyncRoot)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
                File.AppendAllText(LogPath, builder.ToString(), Encoding.UTF8);
            }
        }
        catch
        {
            // Diagnostics must never become another reason for the editor to close.
        }
    }
}
