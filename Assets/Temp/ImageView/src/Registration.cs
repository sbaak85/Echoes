using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace ImageView
{
    /// <summary>
    /// Optional per-user (HKCU) registration so ImageView shows up with a proper name/icon in
    /// "Open with" and in Settings > Default apps. No admin rights; fully removable.
    /// Windows still requires the user to confirm the default themselves.
    /// </summary>
    static class Registration
    {
        public const string AppName = "ImageView";
        const string ProgId = "ImageView.Image";
        const string CapabilitiesKey = @"Software\ImageView\Capabilities";
        const int SHCNE_ASSOCCHANGED = 0x08000000;

        static string ExePath => Process.GetCurrentProcess().MainModule.FileName;
        static string ExeName => Path.GetFileName(ExePath);

        public static void Register()
        {
            string exe = ExePath;
            string command = $"\"{exe}\" \"%1\"";
            string icon = $"\"{exe}\",0";

            using (var app = Registry.CurrentUser.CreateSubKey(@"Software\Classes\Applications\" + ExeName))
            {
                app.SetValue("FriendlyAppName", "ImageView 圖片瀏覽器");
                using (var k = app.CreateSubKey("DefaultIcon")) k.SetValue("", icon);
                using (var k = app.CreateSubKey(@"shell\open\command")) k.SetValue("", command);
                using (var k = app.CreateSubKey("SupportedTypes"))
                    foreach (var ext in FileList.Extensions) k.SetValue(ext, "");
            }

            using (var p = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ProgId))
            {
                p.SetValue("", "ImageView 圖片");
                using (var k = p.CreateSubKey("DefaultIcon")) k.SetValue("", icon);
                using (var k = p.CreateSubKey(@"shell\open\command")) k.SetValue("", command);
            }

            foreach (var ext in FileList.Extensions)
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ext + @"\OpenWithProgids"))
                    k.SetValue(ProgId, new byte[0], RegistryValueKind.None);

            using (var cap = Registry.CurrentUser.CreateSubKey(CapabilitiesKey))
            {
                cap.SetValue("ApplicationName", "ImageView");
                cap.SetValue("ApplicationDescription", "輕量圖片瀏覽器");
                using (var fa = cap.CreateSubKey("FileAssociations"))
                    foreach (var ext in FileList.Extensions) fa.SetValue(ext, ProgId);
            }
            using (var ra = Registry.CurrentUser.CreateSubKey(@"Software\RegisteredApplications"))
                ra.SetValue(AppName, CapabilitiesKey);

            NativeMethods.SHChangeNotify(SHCNE_ASSOCCHANGED, 0, IntPtr.Zero, IntPtr.Zero);
        }

        public static void Unregister()
        {
            var hkcu = Registry.CurrentUser;
            hkcu.DeleteSubKeyTree(@"Software\Classes\Applications\" + ExeName, false);
            hkcu.DeleteSubKeyTree(@"Software\Classes\" + ProgId, false);
            foreach (var ext in FileList.Extensions)
            {
                using (var k = hkcu.OpenSubKey(@"Software\Classes\" + ext + @"\OpenWithProgids", true))
                    k?.DeleteValue(ProgId, false);
            }
            hkcu.DeleteSubKeyTree(@"Software\ImageView", false);
            using (var ra = hkcu.OpenSubKey(@"Software\RegisteredApplications", true))
                ra?.DeleteValue(AppName, false);

            NativeMethods.SHChangeNotify(SHCNE_ASSOCCHANGED, 0, IntPtr.Zero, IntPtr.Zero);
        }

        public static void OpenDefaultAppsSettings()
        {
            try { Process.Start("ms-settings:defaultapps?registeredAppUser=" + AppName); }
            catch
            {
                try { Process.Start("ms-settings:defaultapps"); } catch { }
            }
        }
    }
}
