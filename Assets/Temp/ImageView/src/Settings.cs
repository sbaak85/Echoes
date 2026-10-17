using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace ImageView
{
    /// <summary>Tiny key=value settings file. Prefers the exe folder (portable), falls back to %APPDATA%.</summary>
    sealed class Settings
    {
        const string FileName = "ImageView.ini";

        public bool HasRect;
        public int Left, Top, Width, Height; // normal-window rect, physical pixels
        public string Background = "dark";

        static string PortablePath => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, FileName);
        static string AppDataPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ImageView", FileName);

        public static Settings Load()
        {
            var s = new Settings();
            string path = File.Exists(PortablePath) ? PortablePath : File.Exists(AppDataPath) ? AppDataPath : null;
            if (path == null) return s;
            try
            {
                var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var line in File.ReadAllLines(path))
                {
                    int eq = line.IndexOf('=');
                    if (eq > 0) map[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
                }
                if (TryInt(map, "Left", out s.Left) & TryInt(map, "Top", out s.Top) &
                    TryInt(map, "Width", out s.Width) & TryInt(map, "Height", out s.Height))
                    s.HasRect = s.Width > 0 && s.Height > 0;
                if (map.TryGetValue("Background", out var bg) && bg.Length > 0) s.Background = bg;
            }
            catch { }
            return s;
        }

        public void Save()
        {
            var lines = new List<string> { "[ImageView]" };
            if (HasRect)
            {
                lines.Add("Left=" + Left.ToString(CultureInfo.InvariantCulture));
                lines.Add("Top=" + Top.ToString(CultureInfo.InvariantCulture));
                lines.Add("Width=" + Width.ToString(CultureInfo.InvariantCulture));
                lines.Add("Height=" + Height.ToString(CultureInfo.InvariantCulture));
            }
            lines.Add("Background=" + Background);

            foreach (var path in new[] { PortablePath, AppDataPath })
            {
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    File.WriteAllLines(path, lines);
                    return;
                }
                catch { }
            }
        }

        static bool TryInt(Dictionary<string, string> map, string key, out int value)
        {
            value = 0;
            return map.TryGetValue(key, out var s) && int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
        }
    }
}
