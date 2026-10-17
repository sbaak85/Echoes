using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using static ImageView.NativeMethods;

namespace ImageView
{
    [StructLayout(LayoutKind.Sequential)]
    struct PROPERTYKEY
    {
        public Guid fmtid;
        public uint pid;
    }

    /// <summary>
    /// Reads the item order and sort column of the Explorer window that shows the image's folder
    /// (ShellWindows → IShellBrowser → active IShellView → IFolderView2). Must run on an STA thread.
    /// </summary>
    static class ExplorerOrder
    {
        public sealed class Result
        {
            public List<string> Paths;      // file-system paths in on-screen order, same folder only
            public string PropertyName;     // canonical name of the primary sort column, e.g. System.DateModified
            public bool Descending;
            public SortKey? Key;            // mapped to our own sort keys when possible
            public string Label;            // display name of the sort column
        }

        sealed class View
        {
            public IFolderView2 FolderView;
            public string Folder;
            public IntPtr TopWindow;
            public bool Visible;
            public int Rank;
        }

        static readonly Guid CLSID_ShellWindows = new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39");
        static readonly Guid SID_STopLevelBrowser = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
        static readonly Guid IID_IShellBrowser = new Guid("000214E2-0000-0000-C000-000000000046");
        static readonly Guid IID_IPersistFolder2 = new Guid("1AC3D9F0-175C-11d1-95BE-00609797EA4F");
        static readonly Guid IID_IShellItemArray = new Guid("b63ea76d-1f85-456f-a19c-48159efa858b");

        const int CSIDL_DESKTOP = 0;
        const int SWC_DESKTOP = 8;
        const int SWFO_NEEDDISPATCH = 1;
        const uint SVGIO_ALLVIEW = 0x2;
        const uint SVGIO_FLAG_VIEWORDER = 0x80000000;
        const uint SIGDN_FILESYSPATH = 0x80058000;

        public static Result Query(string filePath, IntPtr foregroundHint)
        {
            string dir = NormalizeDir(Path.GetDirectoryName(filePath));
            var views = new List<View>();
            var comObjects = new List<object>();
            IShellWindows shellWindows;
            try
            {
                shellWindows = (IShellWindows)Activator.CreateInstance(Type.GetTypeFromCLSID(CLSID_ShellWindows));
                comObjects.Add(shellWindows);
            }
            catch
            {
                return null;
            }

            try
            {
                int count = 0;
                try { count = shellWindows.Count; } catch { }
                for (int i = 0; i < count; i++)
                {
                    object w = null;
                    try { w = shellWindows.Item(i); } catch { }
                    if (w == null) continue;
                    comObjects.Add(w);
                    AddView(w, views, comObjects);
                }

                try
                {
                    object loc = CSIDL_DESKTOP;
                    object root = null;
                    object desktop = shellWindows.FindWindowSW(ref loc, ref root, SWC_DESKTOP, out _, SWFO_NEEDDISPATCH);
                    if (desktop != null)
                    {
                        comObjects.Add(desktop);
                        AddView(desktop, views, comObjects);
                    }
                }
                catch { }

                if (views.Count == 0) return null;

                // Prefer: the window the user launched us from, then visible views (active tab), then z-order.
                var z = ZOrder();
                foreach (var v in views)
                {
                    int zr = z.TryGetValue(v.TopWindow, out int r) ? r : 50000;
                    v.Rank = (v.TopWindow == foregroundHint && foregroundHint != IntPtr.Zero ? 0 : 1000000)
                           + (v.Visible ? 0 : 100000) + zr;
                }
                views.Sort((a, b) => a.Rank.CompareTo(b.Rank));

                View best = views.FirstOrDefault(v => v.Folder != null && string.Equals(NormalizeDir(v.Folder), dir, StringComparison.OrdinalIgnoreCase));
                List<string> paths = null;
                if (best != null)
                {
                    paths = GetPaths(best.FolderView);
                }
                else
                {
                    // Libraries, search results, the merged desktop: look for a view that contains the file.
                    foreach (var v in views)
                    {
                        var p = GetPaths(v.FolderView);
                        if (p != null && p.Any(x => FileList.SamePath(x, filePath)))
                        {
                            best = v;
                            paths = p;
                            break;
                        }
                    }
                }
                if (best == null || paths == null) return null;

                var result = new Result { Paths = paths.Where(p => SameDir(p, dir)).ToList() };
                ReadSort(best.FolderView, result);
                return result;
            }
            finally
            {
                // views[].FolderView are the same RCWs as the shell-view objects collected here
                foreach (var o in comObjects) Release(o);
            }
        }

        static void AddView(object window, List<View> views, List<object> comObjects)
        {
            try
            {
                if (!(window is IOleServiceProvider sp)) return;
                Guid sid = SID_STopLevelBrowser, iid = IID_IShellBrowser;
                if (sp.QueryService(ref sid, ref iid, out object browserObj) != 0 || browserObj == null) return;
                comObjects.Add(browserObj);
                if (!(browserObj is IShellBrowser browser)) return;
                if (browser.QueryActiveShellView(out object viewObj) != 0 || viewObj == null) return;
                comObjects.Add(viewObj);
                if (!(viewObj is IFolderView2 folderView)) return;

                IntPtr viewHwnd = IntPtr.Zero;
                if (viewObj is IOleWindow ow) ow.GetWindow(out viewHwnd);

                views.Add(new View
                {
                    FolderView = folderView,
                    Folder = GetFolderPath(folderView),
                    TopWindow = viewHwnd != IntPtr.Zero ? GetAncestor(viewHwnd, GA_ROOT) : IntPtr.Zero,
                    Visible = viewHwnd != IntPtr.Zero && IsWindowVisible(viewHwnd),
                });
            }
            catch { }
        }

        static string GetFolderPath(IFolderView2 fv)
        {
            try
            {
                Guid iid = IID_IPersistFolder2;
                if (fv.GetFolder(ref iid, out object pfObj) != 0 || pfObj == null) return null;
                try
                {
                    if (!(pfObj is IPersistFolder2 pf) || pf.GetCurFolder(out IntPtr pidl) != 0 || pidl == IntPtr.Zero) return null;
                    try
                    {
                        if (SHGetNameFromIDList(pidl, SIGDN_FILESYSPATH, out IntPtr name) != 0 || name == IntPtr.Zero) return null;
                        try { return Marshal.PtrToStringUni(name); }
                        finally { Marshal.FreeCoTaskMem(name); }
                    }
                    finally { Marshal.FreeCoTaskMem(pidl); }
                }
                finally { Release(pfObj); }
            }
            catch { return null; }
        }

        static List<string> GetPaths(IFolderView2 fv)
        {
            try
            {
                Guid iid = IID_IShellItemArray;
                if (fv.Items(SVGIO_ALLVIEW | SVGIO_FLAG_VIEWORDER, ref iid, out object arrObj) != 0 || arrObj == null) return null;
                try
                {
                    if (!(arrObj is IShellItemArray arr) || arr.GetCount(out uint n) != 0) return null;
                    var list = new List<string>((int)n);
                    for (uint i = 0; i < n; i++)
                    {
                        if (arr.GetItemAt(i, out IShellItem item) != 0 || item == null) continue;
                        try
                        {
                            if (item.GetDisplayName(SIGDN_FILESYSPATH, out IntPtr p) == 0 && p != IntPtr.Zero)
                            {
                                list.Add(Marshal.PtrToStringUni(p));
                                Marshal.FreeCoTaskMem(p);
                            }
                        }
                        finally { Release(item); }
                    }
                    return list;
                }
                finally { Release(arrObj); }
            }
            catch { return null; }
        }

        static void ReadSort(IFolderView2 fv, Result result)
        {
            try
            {
                if (fv.GetSortColumnCount(out int n) != 0 || n <= 0) return;
                var cols = new SORTCOLUMN[n];
                if (fv.GetSortColumns(cols, n) != 0) return;
                var key = cols[0].propkey;
                result.Descending = cols[0].direction < 0;
                if (PSGetNameFromPropertyKey(ref key, out IntPtr p) == 0 && p != IntPtr.Zero)
                {
                    result.PropertyName = Marshal.PtrToStringUni(p);
                    Marshal.FreeCoTaskMem(p);
                }
            }
            catch { }

            switch (result.PropertyName)
            {
                case "System.ItemNameDisplay":
                case "System.ItemNameDisplayWithoutExtension":
                case "System.FileName":
                    result.Key = SortKey.Name; result.Label = "名稱"; break;
                case "System.DateModified":
                    result.Key = SortKey.DateModified; result.Label = "修改日期"; break;
                case "System.DateCreated":
                    result.Key = SortKey.DateCreated; result.Label = "建立日期"; break;
                case "System.Size":
                    result.Key = SortKey.Size; result.Label = "大小"; break;
                case "System.ItemTypeText":
                case "System.ItemType":
                case "System.FileExtension":
                    result.Key = SortKey.Type; result.Label = "類型"; break;
                case "System.ItemDate": result.Label = "日期"; break;
                case "System.Photo.DateTaken": result.Label = "拍攝日期"; break;
                case "System.Image.Dimensions": result.Label = "尺寸"; break;
                case "System.DateAccessed": result.Label = "存取日期"; break;
                case null: break;
                default:
                    result.Label = result.PropertyName.StartsWith("System.") ? result.PropertyName.Substring(7) : result.PropertyName;
                    break;
            }
        }

        static Dictionary<IntPtr, int> ZOrder()
        {
            var map = new Dictionary<IntPtr, int>();
            int i = 0;
            EnumWindows((h, l) => { map[h] = i++; return true; }, IntPtr.Zero);
            return map;
        }

        static bool SameDir(string path, string dir)
        {
            try { return string.Equals(NormalizeDir(Path.GetDirectoryName(path)), dir, StringComparison.OrdinalIgnoreCase); }
            catch { return false; }
        }

        static string NormalizeDir(string dir) => dir?.TrimEnd('\\', '/');

        static void Release(object o)
        {
            try { if (o != null && Marshal.IsComObject(o)) Marshal.ReleaseComObject(o); } catch { }
        }
    }

    // ------------------------------------------------------------------------
    // COM interop (only the vtable prefix that is actually used is declared)
    // ------------------------------------------------------------------------

    [StructLayout(LayoutKind.Sequential)]
    struct SORTCOLUMN
    {
        public PROPERTYKEY propkey;
        public int direction;
    }

    [ComImport, Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
    interface IShellWindows
    {
        int Count { get; }
        [return: MarshalAs(UnmanagedType.IDispatch)]
        object Item([In, MarshalAs(UnmanagedType.Struct)] object index);
        [return: MarshalAs(UnmanagedType.IUnknown)]
        object _NewEnum();
        void _Register();
        void _RegisterPending();
        void _Revoke();
        void _OnNavigate();
        void _OnActivated();
        [return: MarshalAs(UnmanagedType.IDispatch)]
        object FindWindowSW([In, MarshalAs(UnmanagedType.Struct)] ref object pvarloc,
                            [In, MarshalAs(UnmanagedType.Struct)] ref object pvarlocRoot,
                            int swClass, out int pHWND, int swfwOptions);
    }

    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IOleServiceProvider
    {
        [PreserveSig]
        int QueryService(ref Guid guidService, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppvObject);
    }

    [ComImport, Guid("00000114-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IOleWindow
    {
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(int fEnterMode);
    }

    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellBrowser
    {
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(int fEnterMode);
        [PreserveSig] int InsertMenusSB(IntPtr hmenuShared, IntPtr lpMenuWidths);
        [PreserveSig] int SetMenuSB(IntPtr hmenuShared, IntPtr holemenuRes, IntPtr hwndActiveObject);
        [PreserveSig] int RemoveMenusSB(IntPtr hmenuShared);
        [PreserveSig] int SetStatusTextSB(IntPtr pszStatusText);
        [PreserveSig] int EnableModelessSB(int fEnable);
        [PreserveSig] int TranslateAcceleratorSB(IntPtr pmsg, ushort wID);
        [PreserveSig] int BrowseObject(IntPtr pidl, uint wFlags);
        [PreserveSig] int GetViewStateStream(uint grfMode, out IntPtr ppStrm);
        [PreserveSig] int GetControlWindow(uint id, out IntPtr phwnd);
        [PreserveSig] int SendControlMsg(uint id, uint uMsg, IntPtr wParam, IntPtr lParam, out IntPtr pret);
        [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object ppshv);
    }

    [ComImport, Guid("1af3a467-214f-4298-908e-06b03e0b39f9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFolderView2
    {
        // IFolderView
        [PreserveSig] int GetCurrentViewMode(out uint pViewMode);
        [PreserveSig] int SetCurrentViewMode(uint viewMode);
        [PreserveSig] int GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int Item(int iItemIndex, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint uFlags, out int pcItems);
        [PreserveSig] int Items(uint uFlags, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int piItem);
        [PreserveSig] int GetFocusedItem(out int piItem);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT ppt);
        [PreserveSig] int GetSpacing(IntPtr ppt);
        [PreserveSig] int GetDefaultSpacing(out POINT ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int iItem, uint dwFlags);
        [PreserveSig] int SelectAndPositionItems(uint cidl, IntPtr apidl, IntPtr apt, uint dwFlags);
        // IFolderView2
        [PreserveSig] int SetGroupBy(ref PROPERTYKEY key, int fAscending);
        [PreserveSig] int GetGroupBy(out PROPERTYKEY pkey, out int pfAscending);
        [PreserveSig] int SetViewProperty(IntPtr pidl, ref PROPERTYKEY propkey, IntPtr propvar);
        [PreserveSig] int GetViewProperty(IntPtr pidl, ref PROPERTYKEY propkey, IntPtr ppropvar);
        [PreserveSig] int SetTileViewProperties(IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string pszPropList);
        [PreserveSig] int SetExtendedTileViewProperties(IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string pszPropList);
        [PreserveSig] int SetText(int iType, [MarshalAs(UnmanagedType.LPWStr)] string pwszText);
        [PreserveSig] int SetCurrentFolderFlags(uint dwMask, uint dwFlags);
        [PreserveSig] int GetCurrentFolderFlags(out uint pdwFlags);
        [PreserveSig] int GetSortColumnCount(out int pcColumns);
        [PreserveSig] int SetSortColumns(IntPtr rgSortColumns, int cColumns);
        [PreserveSig] int GetSortColumns([Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] SORTCOLUMN[] rgSortColumns, int cColumns);
    }

    [ComImport, Guid("1AC3D9F0-175C-11d1-95BE-00609797EA4F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPersistFolder2
    {
        [PreserveSig] int GetClassID(out Guid pClassID);
        [PreserveSig] int Initialize(IntPtr pidl);
        [PreserveSig] int GetCurFolder(out IntPtr ppidl);
    }

    [ComImport, Guid("b63ea76d-1f85-456f-a19c-48159efa858b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemArray
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppvOut);
        [PreserveSig] int GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetAttributes(int attribFlags, uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int GetCount(out uint pdwNumItems);
        [PreserveSig] int GetItemAt(uint dwIndex, out IShellItem ppsi);
        [PreserveSig] int EnumItems(out IntPtr ppenumShellItems);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IShellItem ppsi);
        [PreserveSig] int GetDisplayName(uint sigdnName, out IntPtr ppszName);
        [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int Compare(IShellItem psi, uint hint, out int piOrder);
    }
}
