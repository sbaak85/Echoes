using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace ImageView
{
    enum SortKey { Name, DateModified, DateCreated, Size, Type }

    sealed class FileEntry
    {
        public string Path;
        public string Name;
        public string Ext;
        public long Size;
        public DateTime Modified;
        public DateTime Created;

        public static FileEntry From(FileInfo fi)
        {
            var e = new FileEntry { Path = fi.FullName, Name = fi.Name, Ext = fi.Extension };
            try
            {
                e.Size = fi.Length;
                e.Modified = fi.LastWriteTimeUtc;
                e.Created = fi.CreationTimeUtc;
            }
            catch { }
            return e;
        }
    }

    static class FileList
    {
        public static readonly string[] Extensions =
            { ".png", ".jpg", ".jpeg", ".jpe", ".jfif", ".bmp", ".dib", ".gif", ".tif", ".tiff", ".ico" };

        static readonly HashSet<string> ExtSet = new HashSet<string>(Extensions, StringComparer.OrdinalIgnoreCase);

        public static bool IsSupported(string path)
        {
            try { return ExtSet.Contains(System.IO.Path.GetExtension(path)); }
            catch { return false; }
        }

        public static bool SamePath(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

        /// <summary>Full path with 8.3 short names expanded, so it matches the paths Explorer reports.</summary>
        public static string Normalize(string path)
        {
            try
            {
                path = System.IO.Path.GetFullPath(path);
                var sb = new System.Text.StringBuilder(1024);
                int n = NativeMethods.GetLongPathName(path, sb, sb.Capacity);
                if (n > sb.Capacity)
                {
                    sb.Capacity = n;
                    n = NativeMethods.GetLongPathName(path, sb, sb.Capacity);
                }
                return n > 0 ? sb.ToString() : path;
            }
            catch { return path; }
        }

        /// <summary>All supported, non-hidden images in the folder. <paramref name="mustInclude"/> is always included.</summary>
        public static List<FileEntry> Enumerate(string dir, string mustInclude)
        {
            var list = new List<FileEntry>();
            try
            {
                foreach (var fi in new DirectoryInfo(dir).EnumerateFiles())
                {
                    if (!IsSupported(fi.Name)) continue;
                    bool hidden = (fi.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0;
                    if (hidden && !SamePath(fi.FullName, mustInclude)) continue;
                    list.Add(FileEntry.From(fi));
                }
            }
            catch { }
            if (mustInclude != null && !list.Any(e => SamePath(e.Path, mustInclude)))
            {
                try { list.Add(FileEntry.From(new FileInfo(mustInclude))); } catch { }
            }
            return list;
        }

        public static List<string> Sort(List<FileEntry> entries, SortKey key, bool desc)
        {
            Comparison<FileEntry> byName = (a, b) => NativeMethods.StrCmpLogicalW(a.Name, b.Name);
            Comparison<FileEntry> cmp;
            switch (key)
            {
                case SortKey.DateModified: cmp = (a, b) => Then(a.Modified.CompareTo(b.Modified), a, b, byName); break;
                case SortKey.DateCreated: cmp = (a, b) => Then(a.Created.CompareTo(b.Created), a, b, byName); break;
                case SortKey.Size: cmp = (a, b) => Then(a.Size.CompareTo(b.Size), a, b, byName); break;
                case SortKey.Type: cmp = (a, b) => Then(string.Compare(a.Ext, b.Ext, StringComparison.OrdinalIgnoreCase), a, b, byName); break;
                default: cmp = byName; break;
            }
            var sorted = entries.ToList();
            sorted.Sort(cmp);
            if (desc) sorted.Reverse();
            return sorted.Select(e => e.Path).ToList();
        }

        /// <summary>Use Explorer's on-screen order; images Explorer did not list are appended by name.</summary>
        public static List<string> ApplyOrder(List<FileEntry> entries, List<string> explorerPaths, string dir)
        {
            var byPath = new Dictionary<string, FileEntry>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in entries) byPath[e.Path] = e;

            var result = new List<string>();
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in explorerPaths)
            {
                if (!IsSupported(p) || used.Contains(p)) continue;
                if (byPath.TryGetValue(p, out var e))
                {
                    result.Add(e.Path);
                    used.Add(p);
                }
                else if (File.Exists(p))
                {
                    // e.g. a hidden file that Explorer is configured to show
                    var fe = FileEntry.From(new FileInfo(p));
                    entries.Add(fe);
                    result.Add(fe.Path);
                    used.Add(p);
                }
            }
            var rest = entries.Where(e => !used.Contains(e.Path)).ToList();
            if (rest.Count > 0) result.AddRange(Sort(rest, SortKey.Name, false));
            return result;
        }

        static int Then(int c, FileEntry a, FileEntry b, Comparison<FileEntry> next) => c != 0 ? c : next(a, b);
    }
}
