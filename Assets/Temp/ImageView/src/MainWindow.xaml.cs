using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shell;
using System.Windows.Threading;
using Microsoft.VisualBasic.FileIO;
using static ImageView.NativeMethods;

namespace ImageView
{
    enum FitMode { Actual, FitHeight, FitWidth }

    public partial class MainWindow : Window
    {
        const double ZoomStep = 1.1;
        const double PanStep = 0.1;
        const double MinScale = 0.01, MaxScale = 50;

        readonly Settings settings = Settings.Load();
        readonly string startupFile;
        IntPtr hwnd;
        double dpiX = 1, dpiY = 1;

        // ---- file list ----
        List<FileEntry> entries = new List<FileEntry>();
        List<string> files = new List<string>();
        int index = -1;
        string currentPath;
        SortKey sortKey = SortKey.Name;
        bool sortDesc;
        ExplorerOrder.Result explorer;      // non-null while the order follows Explorer
        int listGen;

        // ---- images ----
        readonly Dictionary<string, Task<LoadedImage>> loads = new Dictionary<string, Task<LoadedImage>>(StringComparer.OrdinalIgnoreCase);
        LoadedImage current;
        int showGen;
        readonly DispatcherTimer animTimer = new DispatcherTimer();
        int animFrame;

        // ---- view state: kept when switching images (except dragPan) ----
        FitMode mode = FitMode.Actual;
        double zoom = 1;
        int rotation;
        Vector kbPan;       // physical px, numpad moves
        Vector dragPan;     // physical px, mouse drag / cursor zoom; reset per image
        double scale = 1;   // effective scale of the current layout
        bool overflow;      // image larger than the viewport

        // ---- window state ----
        bool fullscreen;
        bool fsWasMaximized;
        WINDOWPLACEMENT fsPlacement;
        RECT normalRect;
        WINDOWPLACEMENT initialPlacement;
        bool? chromeResizable;

        // ---- mouse ----
        bool leftDown, dragging, swallowUp;
        Point downPos;
        Vector downPan;
        readonly DispatcherTimer clickTimer = new DispatcherTimer();
        int wheelAcc;

        // ---- toolbar ----
        readonly DispatcherTimer toolbarTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
        bool toolbarShown, toolbarMenuOpen;

        public MainWindow(string file)
        {
            InitializeComponent();
            startupFile = file;

            clickTimer.Interval = TimeSpan.FromMilliseconds(GetDoubleClickTime());
            clickTimer.Tick += (s, e) => { clickTimer.Stop(); Recenter(); };
            toolbarTimer.Tick += (s, e) => { if (!toolbarMenuOpen && !Toolbar.IsMouseOver) HideToolbar(); };
            animTimer.Tick += OnAnimTick;

            ApplyBackground(settings.Background);

            SourceInitialized += OnSourceInitialized;
            Loaded += OnLoaded;
            Closing += OnClosing;
            Root.SizeChanged += (s, e) => Layout();
            DpiChanged += (s, e) => { UpdateDpi(); Layout(); };
            StateChanged += OnStateChanged;
            LocationChanged += (s, e) => TrackNormalRect();
            SizeChanged += (s, e) => TrackNormalRect();
            ComponentDispatcher.ThreadPreprocessMessage += OnThreadPreprocessMessage;
        }

        // =====================================================================
        // Startup / window placement
        // =====================================================================

        void OnSourceInitialized(object sender, EventArgs e)
        {
            hwnd = new WindowInteropHelper(this).Handle;
            HwndSource.FromHwnd(hwnd).AddHook(WndProc);
            int pref = DWMWCP_DONOTROUND;
            DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int)); // Win11: square corners
            PlaceInitialWindow();
        }

        /// <summary>Sets the restore (normal) rect on the monitor under the cursor; the window then shows maximized there.</summary>
        void PlaceInitialWindow()
        {
            GetCursorPos(out POINT pt);
            IntPtr mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
            RECT wa = GetMonitor(mon).rcWork;
            int w, h, x, y;
            if (settings.HasRect && settings.Width >= 200 && settings.Height >= 150)
            {
                w = Math.Min(settings.Width, wa.Width);
                h = Math.Min(settings.Height, wa.Height);
                x = settings.Left;
                y = settings.Top;
                var center = new POINT { X = x + w / 2, Y = y + h / 2 };
                if (MonitorFromPoint(center, MONITOR_DEFAULTTONULL) != mon)
                {
                    x = wa.Left + (wa.Width - w) / 2;
                    y = wa.Top + (wa.Height - h) / 2;
                }
            }
            else
            {
                w = (int)(wa.Width * 0.8);
                h = (int)(wa.Height * 0.8);
                x = wa.Left + (wa.Width - w) / 2;
                y = wa.Top + (wa.Height - h) / 2;
            }
            // twice: the first move may change DPI and WPF rescales the size
            for (int i = 0; i < 2; i++)
                SetWindowPos(hwnd, IntPtr.Zero, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
            // WPF re-applies its default size when it shows the window maximized, so remember this
            // placement (in the workspace coordinates SetWindowPlacement expects) and re-apply it in OnLoaded.
            initialPlacement = new WINDOWPLACEMENT { length = Marshal.SizeOf(typeof(WINDOWPLACEMENT)) };
            GetWindowPlacement(hwnd, ref initialPlacement);
            normalRect = new RECT { Left = x, Top = y, Right = x + w, Bottom = y + h };
            WindowState = WindowState.Maximized; // applied when the window is shown
        }

        void OnLoaded(object sender, RoutedEventArgs e)
        {
            if (IsZoomed(hwnd) && initialPlacement.length != 0)
            {
                var wp = new WINDOWPLACEMENT { length = Marshal.SizeOf(typeof(WINDOWPLACEMENT)) };
                GetWindowPlacement(hwnd, ref wp);
                wp.rcNormalPosition = initialPlacement.rcNormalPosition;
                wp.showCmd = SW_SHOWMAXIMIZED;
                wp.flags = 0;
                SetWindowPlacement(hwnd, ref wp);
            }
            UpdateDpi();
            if (startupFile != null) Open(startupFile, Program.StartupForeground);
            else ShowMessage("ImageView\n\n將圖片拖曳到這裡，或按 Ctrl+O 開啟檔案\n右鍵開啟選單");
        }

        void OnClosing(object sender, CancelEventArgs e)
        {
            ComponentDispatcher.ThreadPreprocessMessage -= OnThreadPreprocessMessage;
            if (normalRect.Width > 0 && normalRect.Height > 0)
            {
                settings.HasRect = true;
                settings.Left = normalRect.Left;
                settings.Top = normalRect.Top;
                settings.Width = normalRect.Width;
                settings.Height = normalRect.Height;
            }
            settings.Save();
        }

        void TrackNormalRect()
        {
            // IsZoomed/IsIconic reflect the Win32 state immediately (WPF's WindowState lags behind during a maximize)
            if (hwnd == IntPtr.Zero || fullscreen || WindowState != WindowState.Normal || IsZoomed(hwnd) || IsIconic(hwnd) || !IsWindowVisible(hwnd)) return;
            if (GetWindowRect(hwnd, out RECT r) && r.Width > 0) normalRect = r;
        }

        void UpdateDpi()
        {
            var d = VisualTreeHelper.GetDpi(this);
            dpiX = d.DpiScaleX;
            dpiY = d.DpiScaleY;
            UpdateChrome();
        }

        void UpdateChrome()
        {
            bool resizable = WindowState == WindowState.Normal && !fullscreen;
            if (chromeResizable != resizable)
            {
                chromeResizable = resizable;
                WindowChrome.SetWindowChrome(this, new WindowChrome
                {
                    CaptionHeight = 0,
                    GlassFrameThickness = new Thickness(0),
                    CornerRadius = new CornerRadius(0),
                    UseAeroCaptionButtons = false,
                    ResizeBorderThickness = resizable ? new Thickness(6) : new Thickness(0),
                });
            }
            // exactly one physical pixel
            Frame.BorderThickness = fullscreen ? new Thickness(0) : new Thickness(1 / dpiX, 1 / dpiY, 1 / dpiX, 1 / dpiY);
            FullscreenButton.Content = fullscreen ? "" : "";
            MaxButton.Content = WindowState == WindowState.Maximized ? "" : "";
        }

        void OnStateChanged(object sender, EventArgs e)
        {
            UpdateChrome();
            // e.g. restored from the taskbar while in fullscreen: re-cover the monitor
            if (fullscreen && WindowState != WindowState.Minimized)
                Dispatcher.BeginInvoke(new Action(ApplyFullscreenRect), DispatcherPriority.Background);
        }

        IntPtr WndProc(IntPtr h, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == WM_GETMINMAXINFO)
            {
                // Maximize to the work area of the current monitor (borderless windows would otherwise overhang / cover the taskbar).
                var mmi = (MINMAXINFO)Marshal.PtrToStructure(lParam, typeof(MINMAXINFO));
                var mi = GetMonitor(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST));
                mmi.ptMaxPosition.X = mi.rcWork.Left - mi.rcMonitor.Left;
                mmi.ptMaxPosition.Y = mi.rcWork.Top - mi.rcMonitor.Top;
                mmi.ptMaxSize.X = mi.rcWork.Width;
                mmi.ptMaxSize.Y = mi.rcWork.Height;
                mmi.ptMinTrackSize.X = (int)(MinWidth * dpiX);
                mmi.ptMinTrackSize.Y = (int)(MinHeight * dpiY);
                Marshal.StructureToPtr(mmi, lParam, true);
                handled = true;
            }
            return IntPtr.Zero;
        }

        // =====================================================================
        // Fullscreen
        // =====================================================================

        void EnterFullscreen()
        {
            if (fullscreen) return;
            // Remember the exact placement (normal rect + maximized flag) to restore on exit.
            fsPlacement = new WINDOWPLACEMENT { length = Marshal.SizeOf(typeof(WINDOWPLACEMENT)) };
            GetWindowPlacement(hwnd, ref fsPlacement);
            fsWasMaximized = WindowState == WindowState.Maximized;
            IntPtr monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            fullscreen = true;
            // The taskbar only steps aside for a normal (non-maximized), frameless window covering the whole monitor.
            if (WindowState != WindowState.Normal) WindowState = WindowState.Normal;
            ResizeMode = ResizeMode.NoResize;
            UpdateChrome();
            ApplyFullscreenRect(monitor);
        }

        void ApplyFullscreenRect() => ApplyFullscreenRect(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST));

        void ApplyFullscreenRect(IntPtr monitor)
        {
            if (!fullscreen) return;
            var m = GetMonitor(monitor).rcMonitor;
            SetWindowPos(hwnd, IntPtr.Zero, m.Left, m.Top, m.Width, m.Height, SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
        }

        void ExitFullscreen()
        {
            if (!fullscreen) return;
            fullscreen = false;
            ResizeMode = ResizeMode.CanResize;
            var wp = fsPlacement;
            wp.showCmd = fsWasMaximized ? SW_SHOWMAXIMIZED : SW_SHOWNORMAL;
            wp.flags = 0;
            SetWindowPlacement(hwnd, ref wp);
            UpdateChrome();
        }

        void ToggleFullscreen()
        {
            if (fullscreen) ExitFullscreen();
            else EnterFullscreen();
        }

        void ToggleMaximize()
        {
            if (fullscreen) ExitFullscreen();
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        }

        bool CanMoveWindow => WindowState == WindowState.Normal && !fullscreen;

        // =====================================================================
        // Opening files / building the list
        // =====================================================================

        public void OpenFromExternal(string path)
        {
            IntPtr fg = GetForegroundWindow();
            if (WindowState == WindowState.Minimized) ShowWindow(hwnd, SW_RESTORE);
            Activate();
            SetForegroundWindow(hwnd);
            if (!string.IsNullOrWhiteSpace(path)) Open(path, fg);
        }

        void Open(string path, IntPtr foregroundHint)
        {
            if (string.IsNullOrEmpty(path)) return;
            path = FileList.Normalize(path);
            if (!File.Exists(path))
            {
                ShowMessage("找不到檔案\n" + path);
                return;
            }
            loads.Clear();
            var fi = new FileInfo(path);
            entries = new List<FileEntry> { FileEntry.From(fi) };
            files = new List<string> { fi.FullName };
            explorer = null;
            sortKey = SortKey.Name;
            sortDesc = false;
            ShowAt(0);
            BuildList(fi.FullName, foregroundHint, true);
        }

        async void BuildList(string path, IntPtr foregroundHint, bool queryExplorer, bool announce = false)
        {
            int gen = ++listGen;
            string dir = Path.GetDirectoryName(path);
            var listTask = Task.Run(() => FileList.Enumerate(dir, path));
            Task<ExplorerOrder.Result> explorerTask = queryExplorer
                ? Program.RunSta(() => ExplorerOrder.Query(path, foregroundHint))
                : Task.FromResult<ExplorerOrder.Result>(null);

            var list = await listTask;
            ExplorerOrder.Result exp = null;
            try
            {
                if (await Task.WhenAny(explorerTask, Task.Delay(4000)) == explorerTask) exp = explorerTask.Result;
            }
            catch { }
            if (gen != listGen || currentPath == null) return;

            entries = list;
            if (exp != null && exp.Paths.Count > 0)
            {
                explorer = exp;
                files = FileList.ApplyOrder(entries, exp.Paths, dir);
                if (exp.Key.HasValue) sortKey = exp.Key.Value;
                sortDesc = exp.Descending;
            }
            else
            {
                explorer = null;
                files = FileList.Sort(entries, sortKey, sortDesc);
                if (announce) Toast("找不到開著此資料夾的檔案總管視窗");
            }
            SyncIndex();
            UpdateInfo();
            Prefetch();
            if (announce && explorer != null) Toast("排序：" + SortLabel());
        }

        /// <summary>Re-locates the current file in <see cref="files"/> after the list changed.</summary>
        void SyncIndex()
        {
            int i = files.FindIndex(p => FileList.SamePath(p, currentPath));
            if (i < 0)
            {
                files.Insert(0, currentPath);
                i = 0;
            }
            index = i;
            currentPath = files[i];
        }

        void SetSort(SortKey key, bool desc)
        {
            explorer = null;
            sortKey = key;
            sortDesc = desc;
            if (currentPath == null) return;
            files = FileList.Sort(entries, key, desc);
            SyncIndex();
            UpdateInfo();
            Prefetch();
            Toast("排序：" + SortLabel());
        }

        void ReloadFolder()
        {
            if (currentPath == null) return;
            loads.Clear();
            if (explorer != null) BuildList(currentPath, IntPtr.Zero, true);
            else BuildList(currentPath, IntPtr.Zero, false);
            ShowAt(index);
        }

        static string SortKeyLabel(SortKey k)
        {
            switch (k)
            {
                case SortKey.DateModified: return "修改日期";
                case SortKey.DateCreated: return "建立日期";
                case SortKey.Size: return "大小";
                case SortKey.Type: return "類型";
                default: return "名稱";
            }
        }

        string SortLabel()
        {
            string arrow = sortDesc ? "↓" : "↑";
            if (explorer != null)
                return explorer.Label == null ? "檔案總管順序" : $"檔案總管・{explorer.Label} {arrow}";
            return $"{SortKeyLabel(sortKey)} {arrow}";
        }

        // =====================================================================
        // Navigation
        // =====================================================================

        void Go(int delta)
        {
            for (int guard = 0; guard < 100000 && files.Count > 1; guard++)
            {
                int n = files.Count;
                int i = index + delta;
                bool wrapped = false;
                if (i >= n) { i = 0; wrapped = true; }
                else if (i < 0) { i = n - 1; wrapped = true; }
                if (i == index) return;
                if (!File.Exists(files[i]))
                {
                    RemoveFromList(files[i]);
                    continue;
                }
                if (wrapped) Toast(delta > 0 ? "已回到第一張" : "已跳到最後一張");
                ShowAt(i);
                return;
            }
        }

        void GoTo(int i)
        {
            if (files.Count == 0) return;
            ShowAt(Math.Max(0, Math.Min(files.Count - 1, i)));
        }

        void RemoveFromList(string path)
        {
            int i = files.FindIndex(p => FileList.SamePath(p, path));
            if (i < 0) return;
            files.RemoveAt(i);
            entries.RemoveAll(e => FileList.SamePath(e.Path, path));
            loads.Remove(path);
            if (i < index) index--;
        }

        static int Mod(int a, int n) => ((a % n) + n) % n;

        Task<LoadedImage> GetLoad(string path)
        {
            if (!loads.TryGetValue(path, out var t))
            {
                t = Task.Run(() => ImageLoader.Load(path));
                loads[path] = t;
            }
            return t;
        }

        async void ShowAt(int i)
        {
            if (files.Count == 0) return;
            index = i;
            currentPath = files[i];
            dragPan = new Vector();
            string name = Path.GetFileName(currentPath);
            Title = name + " - ImageView";
            ShowNameOsd(name);
            UpdateInfo();
            Evict();

            int gen = ++showGen;
            var task = GetLoad(currentPath);
            var img = task.IsCompleted ? task.Result : await task;
            if (gen != showGen) return;
            Display(img);
            Prefetch();
        }

        void Evict()
        {
            if (files.Count == 0) return;
            var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int d = -2; d <= 2; d++) keep.Add(files[Mod(index + d, files.Count)]);
            foreach (var k in loads.Keys.ToList())
                if (!keep.Contains(k)) loads.Remove(k);
        }

        void Prefetch()
        {
            if (files.Count < 2 || index < 0) return;
            Evict();
            GetLoad(files[Mod(index + 1, files.Count)]);
            GetLoad(files[Mod(index - 1, files.Count)]);
        }

        void Display(LoadedImage img)
        {
            animTimer.Stop();
            current = img;
            if (img.Error != null)
            {
                Img.Source = null;
                ShowMessage("無法開啟此圖片\n\n" + Path.GetFileName(img.Path) + "\n" + img.Error);
                Layout();
                return;
            }
            HideMessage();
            animFrame = 0;
            Img.Source = img.Frames[0];
            if (img.Frames.Length > 1)
            {
                animTimer.Interval = TimeSpan.FromMilliseconds(img.Delays[0]);
                animTimer.Start();
            }
            Layout();
        }

        void OnAnimTick(object sender, EventArgs e)
        {
            if (current?.Frames == null || current.Frames.Length < 2)
            {
                animTimer.Stop();
                return;
            }
            animFrame = (animFrame + 1) % current.Frames.Length;
            Img.Source = current.Frames[animFrame];
            animTimer.Interval = TimeSpan.FromMilliseconds(current.Delays[animFrame]);
        }

        // =====================================================================
        // Layout / view transforms
        // =====================================================================

        double ViewW => Root.ActualWidth * dpiX;
        double ViewH => Root.ActualHeight * dpiY;

        void Layout()
        {
            if (current?.Frames == null)
            {
                Img.Visibility = Visibility.Collapsed;
                overflow = false;
                UpdateInfo();
                return;
            }
            double vw = ViewW, vh = ViewH;
            if (vw <= 0 || vh <= 0) return;

            double w = current.Width, h = current.Height;
            bool swap = rotation % 180 != 0;
            double rw = swap ? h : w, rh = swap ? w : h;
            double baseScale = mode == FitMode.FitHeight ? vh / rh : mode == FitMode.FitWidth ? vw / rw : 1.0;
            scale = baseScale * zoom;

            double dw = w * scale, dh = h * scale;
            var pan = kbPan + dragPan;
            double left = Math.Round(vw / 2 + pan.X - dw / 2);
            double top = Math.Round(vh / 2 + pan.Y - dh / 2);

            Img.Width = dw / dpiX;
            Img.Height = dh / dpiY;
            Canvas.SetLeft(Img, left / dpiX);
            Canvas.SetTop(Img, top / dpiY);
            Img.RenderTransform = rotation == 0 ? Transform.Identity : new RotateTransform(rotation);
            RenderOptions.SetBitmapScalingMode(Img, Math.Abs(scale - 1) < 1e-9 ? BitmapScalingMode.NearestNeighbor : BitmapScalingMode.HighQuality);
            Img.Visibility = Visibility.Visible;

            overflow = rw * scale > vw + 0.5 || rh * scale > vh + 0.5;
            if (!dragging) Stage.Cursor = overflow ? Cursors.Hand : null;
            UpdateInfo();
        }

        void SetMode(FitMode m)
        {
            mode = m;
            zoom = 1;
            kbPan = dragPan = new Vector();
            Layout();
        }

        void ZoomBy(double f, Vector? anchor = null)
        {
            if (current?.Frames == null) return;
            double ns = scale * f;
            if (ns < MinScale || ns > MaxScale) return;
            zoom *= f;
            // keep the anchor point (relative to the viewport center) fixed
            var a = anchor ?? new Vector();
            var total = kbPan + dragPan;
            var newTotal = a + (total - a) * f;
            kbPan *= f;
            dragPan = newTotal - kbPan;
            Layout();
            Toast($"{Math.Round(scale * 100)}%");
        }

        void Pan(int dx, int dy)
        {
            if (current?.Frames == null) return;
            kbPan += new Vector(dx * PanStep * ViewW, dy * PanStep * ViewH);
            Layout();
        }

        void Rotate(int delta)
        {
            rotation = Mod(rotation + delta, 360);
            Layout();
            Toast(rotation == 0 ? "旋轉 0°" : $"旋轉 {rotation}°");
        }

        void ResetAll()
        {
            mode = FitMode.Actual;
            zoom = 1;
            rotation = 0;
            kbPan = dragPan = new Vector();
            Layout();
            Toast("已重設");
        }

        void Recenter()
        {
            if (kbPan.LengthSquared < 0.25 && dragPan.LengthSquared < 0.25) return;
            kbPan = dragPan = new Vector();
            Layout();
        }

        void FullscreenFitHeight()
        {
            EnterFullscreen();
            SetMode(FitMode.FitHeight);
        }

        void WindowedActualSize()
        {
            ExitFullscreen();
            SetMode(FitMode.Actual);
        }

        // =====================================================================
        // Keyboard
        // =====================================================================

        void OnThreadPreprocessMessage(ref MSG msg, ref bool handled)
        {
            if (handled || msg.message != WM_KEYDOWN || msg.hwnd != hwnd) return;
            if (OnKey(msg.wParam.ToInt32(), msg.lParam.ToInt64())) handled = true;
        }

        bool OnKey(int vk, long lParam)
        {
            int scan = (int)((lParam >> 16) & 0xFF);
            bool ext = ((lParam >> 24) & 1) != 0;
            bool ctrl = (Keyboard.Modifiers & ModifierKeys.Control) != 0;

            // Numpad keys work regardless of NumLock: with NumLock off they arrive as
            // navigation keys without the "extended" flag, unlike the dedicated arrow keys.
            bool Num(int vkNum, int vkNav, int sc) => vk == vkNum || (vk == vkNav && !ext && scan == sc);

            if (Num(VK_NUMPAD8, VK_UP, 0x48)) { Pan(0, -1); return true; }
            if (Num(VK_NUMPAD2, VK_DOWN, 0x50)) { Pan(0, 1); return true; }
            if (Num(VK_NUMPAD4, VK_LEFT, 0x4B)) { Pan(-1, 0); return true; }
            if (Num(VK_NUMPAD6, VK_RIGHT, 0x4D)) { Pan(1, 0); return true; }
            if (Num(VK_NUMPAD5, VK_CLEAR, 0x4C)) { ResetAll(); return true; }
            if (Num(VK_NUMPAD1, VK_END, 0x4F)) { Rotate(90); return true; }
            if (Num(VK_NUMPAD3, VK_NEXT, 0x51)) { Rotate(-90); return true; }

            switch (vk)
            {
                case VK_ADD:
                case VK_OEM_PLUS: ZoomBy(ZoomStep); return true;
                case VK_SUBTRACT:
                case VK_OEM_MINUS: ZoomBy(1 / ZoomStep); return true;
                case VK_RIGHT:
                case VK_NEXT:
                case VK_SPACE: Go(1); return true;
                case VK_LEFT:
                case VK_PRIOR:
                case VK_BACK: Go(-1); return true;
                case VK_HOME: GoTo(0); return true;
                case VK_END: GoTo(files.Count - 1); return true;
                case VK_UP: FullscreenFitHeight(); return true;
                case VK_DOWN: WindowedActualSize(); return true;
                case VK_ESCAPE:
                    if (fullscreen) ExitFullscreen();
                    else Close();
                    return true;
                case VK_F11: ToggleFullscreen(); return true;
                case VK_DELETE: DeleteCurrent(); return true;
                case VK_F5: ReloadFolder(); return true;
                case VK_APPS: OpenContextMenu(PlacementMode.Center); return true;
                case 'C' when ctrl: CopyImage(); return true;
                case 'O' when ctrl: OpenDialog(); return true;
                case 'W' when ctrl: Close(); return true;
            }
            return false;
        }

        // =====================================================================
        // Mouse
        // =====================================================================

        void Stage_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            if (e.ClickCount >= 2)
            {
                clickTimer.Stop();
                EndDrag();
                swallowUp = true;
                ToggleFullscreen();
                return;
            }
            if ((Keyboard.Modifiers & ModifierKeys.Alt) != 0 && CanMoveWindow)
            {
                DragMove();
                return;
            }
            leftDown = true;
            dragging = false;
            swallowUp = false;
            downPos = e.GetPosition(this);
            downPan = dragPan;
            Stage.CaptureMouse();
        }

        void Stage_MouseMove(object sender, MouseEventArgs e)
        {
            if (!leftDown) return;
            var d = e.GetPosition(this) - downPos;
            if (!dragging)
            {
                if (Math.Abs(d.X) < SystemParameters.MinimumHorizontalDragDistance &&
                    Math.Abs(d.Y) < SystemParameters.MinimumVerticalDragDistance) return;
                clickTimer.Stop();
                if (overflow)
                {
                    dragging = true;
                    Stage.Cursor = Cursors.SizeAll;
                }
                else
                {
                    EndDrag();
                    if (CanMoveWindow && Mouse.LeftButton == MouseButtonState.Pressed) DragMove();
                    return;
                }
            }
            dragPan = downPan + new Vector(d.X * dpiX, d.Y * dpiY);
            Layout();
        }

        void Stage_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (swallowUp)
            {
                swallowUp = false;
                return;
            }
            if (!leftDown) return;
            bool wasDragging = dragging;
            EndDrag();
            if (!wasDragging)
            {
                // single click: wait out the double-click time before re-centering
                clickTimer.Stop();
                clickTimer.Start();
            }
        }

        void Stage_LostMouseCapture(object sender, MouseEventArgs e)
        {
            if (leftDown) EndDrag();
        }

        void EndDrag()
        {
            leftDown = false;
            dragging = false;
            if (Stage.IsMouseCaptured) Stage.ReleaseMouseCapture();
            Stage.Cursor = overflow ? Cursors.Hand : null;
        }

        protected override void OnPreviewMouseWheel(MouseWheelEventArgs e)
        {
            base.OnPreviewMouseWheel(e);
            e.Handled = true;
            if ((Keyboard.Modifiers & ModifierKeys.Control) != 0)
            {
                var p = e.GetPosition(Root);
                var anchor = new Vector(p.X * dpiX - ViewW / 2, p.Y * dpiY - ViewH / 2);
                ZoomBy(e.Delta > 0 ? ZoomStep : 1 / ZoomStep, anchor);
                return;
            }
            if (Math.Sign(e.Delta) != Math.Sign(wheelAcc)) wheelAcc = 0;
            wheelAcc += e.Delta;
            while (wheelAcc >= 120) { wheelAcc -= 120; Go(-1); }
            while (wheelAcc <= -120) { wheelAcc += 120; Go(1); }
        }

        void Root_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            OpenContextMenu(PlacementMode.MousePoint);
        }

        protected override void OnDragOver(DragEventArgs e)
        {
            e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None;
            e.Handled = true;
        }

        protected override void OnDrop(DragEventArgs e)
        {
            if (e.Data.GetData(DataFormats.FileDrop) is string[] dropped && dropped.Length > 0)
                Open(dropped[0], IntPtr.Zero);
        }

        // =====================================================================
        // Context menu
        // =====================================================================

        static MenuItem Item(string header, Action action, string gesture = null, bool? isChecked = null, bool enabled = true)
        {
            var mi = new MenuItem { Header = header, InputGestureText = gesture ?? "", IsEnabled = enabled };
            if (isChecked.HasValue) mi.IsChecked = isChecked.Value;
            mi.Click += (s, e) => action();
            return mi;
        }

        void OpenContextMenu(PlacementMode placement)
        {
            bool hasImage = current?.Frames != null && currentPath != null;
            var m = new ContextMenu();

            m.Items.Add(Item(toolbarShown ? "隱藏功能列" : "顯示功能列", () => { if (toolbarShown) HideToolbar(); else ShowToolbar(); }));
            m.Items.Add(new Separator());
            m.Items.Add(Item("圖片符合視窗高度", () => SetMode(FitMode.FitHeight), null, mode == FitMode.FitHeight));
            m.Items.Add(Item("圖片符合視窗寬度", () => SetMode(FitMode.FitWidth), null, mode == FitMode.FitWidth));
            m.Items.Add(Item("還原圖片大小 (1:1)", () => SetMode(FitMode.Actual), "↓", mode == FitMode.Actual && Math.Abs(zoom - 1) < 1e-9));
            m.Items.Add(new Separator());
            var sort = new MenuItem { Header = "瀏覽排序依據" };
            FillSortItems(sort.Items);
            m.Items.Add(sort);
            m.Items.Add(new Separator());
            m.Items.Add(Item("強制全螢幕最大化", ToggleFullscreen, "F11 / 雙擊", fullscreen));
            m.Items.Add(Item(WindowState == WindowState.Maximized && !fullscreen ? "還原視窗大小" : "視窗最大化", ToggleMaximize));
            m.Items.Add(new Separator());
            m.Items.Add(Item("順時鐘旋轉 90°", () => Rotate(90), "Num 1"));
            m.Items.Add(Item("逆時鐘旋轉 90°", () => Rotate(-90), "Num 3"));
            m.Items.Add(Item("重設所有調整", ResetAll, "Num 5"));
            m.Items.Add(new Separator());
            var bg = new MenuItem { Header = "背景" };
            foreach (var (key, label) in new[] { ("dark", "深灰"), ("black", "黑色"), ("white", "白色"), ("checker", "棋盤格") })
                bg.Items.Add(Item(label, () => ApplyBackground(key), null, settings.Background == key));
            m.Items.Add(bg);
            m.Items.Add(new Separator());
            m.Items.Add(Item("開啟檔案…", OpenDialog, "Ctrl+O"));
            m.Items.Add(Item("複製圖片", CopyImage, "Ctrl+C", null, hasImage));
            m.Items.Add(Item("在檔案總管中顯示", RevealInExplorer, null, null, currentPath != null));
            m.Items.Add(Item("刪除（移到資源回收筒）", DeleteCurrent, "Del", null, currentPath != null));
            m.Items.Add(new Separator());
            var assoc = new MenuItem { Header = "檔案關聯" };
            assoc.Items.Add(Item("註冊到「開啟檔案」清單…", RegisterAssociations));
            assoc.Items.Add(Item("開啟 Windows 預設應用程式設定", Registration.OpenDefaultAppsSettings));
            assoc.Items.Add(Item("移除註冊", UnregisterAssociations));
            m.Items.Add(assoc);
            m.Items.Add(new Separator());
            m.Items.Add(Item("關閉", Close, "Esc"));

            m.PlacementTarget = Root;
            m.Placement = placement;
            m.IsOpen = true;
        }

        void FillSortItems(ItemCollection items)
        {
            string follow = "跟隨檔案總管";
            if (explorer != null) follow += "（" + SortLabel().Replace("檔案總管・", "") + "）";
            items.Add(Item(follow, () => { if (currentPath != null) BuildList(currentPath, IntPtr.Zero, true, true); }, null, explorer != null));
            items.Add(new Separator());
            foreach (SortKey k in Enum.GetValues(typeof(SortKey)))
            {
                var key = k;
                items.Add(Item(SortKeyLabel(key), () => SetSort(key, sortDesc), null, explorer == null && sortKey == key));
            }
            items.Add(new Separator());
            items.Add(Item("遞增", () => SetSort(sortKey, false), null, !sortDesc));
            items.Add(Item("遞減", () => SetSort(sortKey, true), null, sortDesc));
        }

        // =====================================================================
        // Toolbar
        // =====================================================================

        void ShowToolbar()
        {
            toolbarShown = true;
            Toolbar.Visibility = Visibility.Visible;
            ToolbarShift.BeginAnimation(TranslateTransform.YProperty,
                new DoubleAnimation(0, TimeSpan.FromMilliseconds(180)) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
            RestartToolbarTimer();
            UpdateInfo();
        }

        void HideToolbar()
        {
            toolbarShown = false;
            toolbarTimer.Stop();
            var a = new DoubleAnimation(-Toolbar.Height, TimeSpan.FromMilliseconds(180)) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn } };
            a.Completed += (s, e) => { if (!toolbarShown) Toolbar.Visibility = Visibility.Collapsed; };
            ToolbarShift.BeginAnimation(TranslateTransform.YProperty, a);
        }

        void RestartToolbarTimer()
        {
            if (!toolbarShown) return;
            toolbarTimer.Stop();
            toolbarTimer.Start();
        }

        void Toolbar_Activity(object sender, MouseEventArgs e) => RestartToolbarTimer();

        void Toolbar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // empty toolbar area behaves like a title bar
            if (e.ClickCount == 2) ToggleMaximize();
            else if (CanMoveWindow) DragMove();
        }

        void BtnPrev(object s, RoutedEventArgs e) => Go(-1);
        void BtnNext(object s, RoutedEventArgs e) => Go(1);
        void BtnZoomOut(object s, RoutedEventArgs e) => ZoomBy(1 / ZoomStep);
        void BtnZoomIn(object s, RoutedEventArgs e) => ZoomBy(ZoomStep);
        void BtnActual(object s, RoutedEventArgs e) => SetMode(FitMode.Actual);
        void BtnFitHeight(object s, RoutedEventArgs e) => SetMode(FitMode.FitHeight);
        void BtnFitWidth(object s, RoutedEventArgs e) => SetMode(FitMode.FitWidth);
        void BtnRotateLeft(object s, RoutedEventArgs e) => Rotate(-90);
        void BtnRotateRight(object s, RoutedEventArgs e) => Rotate(90);
        void BtnReset(object s, RoutedEventArgs e) => ResetAll();
        void BtnCopy(object s, RoutedEventArgs e) => CopyImage();
        void BtnReveal(object s, RoutedEventArgs e) => RevealInExplorer();
        void BtnDelete(object s, RoutedEventArgs e) => DeleteCurrent();
        void BtnFullscreen(object s, RoutedEventArgs e) => ToggleFullscreen();
        void BtnMinimize(object s, RoutedEventArgs e) => WindowState = WindowState.Minimized;
        void BtnMaximize(object s, RoutedEventArgs e) => ToggleMaximize();
        void BtnClose(object s, RoutedEventArgs e) => Close();

        void BtnSort(object s, RoutedEventArgs e)
        {
            var m = new ContextMenu();
            FillSortItems(m.Items);
            m.PlacementTarget = SortButton;
            m.Placement = PlacementMode.Bottom;
            m.Opened += (_, __) => toolbarMenuOpen = true;
            m.Closed += (_, __) => { toolbarMenuOpen = false; RestartToolbarTimer(); };
            m.IsOpen = true;
        }

        string ModeLabel()
        {
            switch (mode)
            {
                case FitMode.FitHeight: return "符合高度";
                case FitMode.FitWidth: return "符合寬度";
                default: return "原始大小";
            }
        }

        void UpdateInfo()
        {
            SortButton.Content = "排序：" + SortLabel();
            if (!toolbarShown) return;
            if (currentPath == null)
            {
                InfoText.Text = "";
                return;
            }
            var sb = new StringBuilder();
            sb.Append(index + 1).Append(" / ").Append(files.Count).Append("     ").Append(Path.GetFileName(currentPath));
            if (current?.Frames != null && FileList.SamePath(current.Path, currentPath))
            {
                sb.Append($"     {current.Width} × {current.Height}     {Math.Round(scale * 100)}%");
                if (rotation != 0) sb.Append($"     ↻{rotation}°");
            }
            sb.Append("     ").Append(ModeLabel());
            InfoText.Text = sb.ToString();
        }

        // =====================================================================
        // Overlays
        // =====================================================================

        void ShowNameOsd(string name)
        {
            NameText.Text = name;
            NameOsd.BeginAnimation(OpacityProperty, ShowThenFade(3000, 400));
        }

        void Toast(string text)
        {
            ToastText.Text = text;
            ToastBox.BeginAnimation(OpacityProperty, ShowThenFade(900, 300));
        }

        /// <summary>Fully visible for <paramref name="holdMs"/>, then fades out.</summary>
        static AnimationTimeline ShowThenFade(int holdMs, int fadeMs)
        {
            var a = new DoubleAnimationUsingKeyFrames();
            a.KeyFrames.Add(new DiscreteDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.Zero)));
            a.KeyFrames.Add(new DiscreteDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(holdMs))));
            a.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(holdMs + fadeMs))));
            return a;
        }

        void ShowMessage(string text)
        {
            MessageText.Text = text;
            MessageText.Visibility = Visibility.Visible;
        }

        void HideMessage() => MessageText.Visibility = Visibility.Collapsed;

        void ApplyBackground(string key)
        {
            Brush brush;
            Brush text = new SolidColorBrush(Color.FromRgb(0x9A, 0x9A, 0x9A));
            switch (key)
            {
                case "black": brush = Brushes.Black; break;
                case "white": brush = Brushes.White; text = Brushes.DimGray; break;
                case "checker": brush = CheckerBrush(); text = Brushes.DimGray; break;
                default: key = "dark"; brush = new SolidColorBrush(Color.FromRgb(0x1C, 0x1C, 0x1C)); break;
            }
            settings.Background = key;
            Stage.Background = brush;
            Background = brush is SolidColorBrush ? brush : Brushes.White;
            MessageText.Foreground = text;
        }

        static Brush CheckerBrush()
        {
            var light = new SolidColorBrush(Color.FromRgb(0xFF, 0xFF, 0xFF));
            var dark = new SolidColorBrush(Color.FromRgb(0xCC, 0xCC, 0xCC));
            var group = new DrawingGroup();
            group.Children.Add(new GeometryDrawing(light, null, new RectangleGeometry(new Rect(0, 0, 16, 16))));
            var squares = new GeometryGroup();
            squares.Children.Add(new RectangleGeometry(new Rect(0, 0, 8, 8)));
            squares.Children.Add(new RectangleGeometry(new Rect(8, 8, 8, 8)));
            group.Children.Add(new GeometryDrawing(dark, null, squares));
            var brush = new DrawingBrush(group)
            {
                TileMode = TileMode.Tile,
                Viewport = new Rect(0, 0, 16, 16),
                ViewportUnits = BrushMappingMode.Absolute,
                Stretch = Stretch.None,
            };
            brush.Freeze();
            return brush;
        }

        // =====================================================================
        // File actions
        // =====================================================================

        void OpenDialog()
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Title = "開啟圖片",
                Filter = "圖片檔|" + string.Join(";", FileList.Extensions.Select(x => "*" + x)) + "|所有檔案|*.*",
            };
            if (currentPath != null) dlg.InitialDirectory = Path.GetDirectoryName(currentPath);
            if (dlg.ShowDialog(this) == true) Open(dlg.FileName, IntPtr.Zero);
        }

        void CopyImage()
        {
            if (!(Img.Source is BitmapSource bmp)) return;
            try
            {
                Clipboard.SetImage(bmp);
                Toast("已複製圖片");
            }
            catch (Exception ex)
            {
                Toast("複製失敗：" + ex.Message);
            }
        }

        void RevealInExplorer()
        {
            if (currentPath == null) return;
            try { Process.Start("explorer.exe", $"/select,\"{currentPath}\""); } catch { }
        }

        void DeleteCurrent()
        {
            if (currentPath == null || !File.Exists(currentPath)) return;
            string path = currentPath;
            var answer = MessageBox.Show(this, $"要將「{Path.GetFileName(path)}」移到資源回收筒嗎？", "刪除檔案",
                MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
            if (answer != MessageBoxResult.Yes) return;
            try
            {
                FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "無法刪除", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            int i = index;
            RemoveFromList(path);
            if (files.Count == 0)
            {
                animTimer.Stop();
                current = null;
                currentPath = null;
                index = -1;
                Img.Source = null;
                Title = "ImageView";
                Layout();
                ShowMessage("資料夾中已經沒有圖片");
                return;
            }
            ShowAt(Math.Min(i, files.Count - 1));
        }

        void RegisterAssociations()
        {
            try
            {
                Registration.Register();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "註冊失敗", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            var answer = MessageBox.Show(this,
                "已註冊（只寫入目前使用者，不影響其他帳號）。\n\n" +
                "Windows 規定預設程式必須由你自己確認：\n" +
                "• 在圖片上按右鍵 →「開啟檔案」→ 選 ImageView，勾選「一律使用」；或\n" +
                "• 到 Windows「預設應用程式」設定中把各種圖片格式設給 ImageView。\n\n" +
                "現在要開啟「預設應用程式」設定嗎？",
                "檔案關聯", MessageBoxButton.YesNo, MessageBoxImage.Information);
            if (answer == MessageBoxResult.Yes) Registration.OpenDefaultAppsSettings();
        }

        void UnregisterAssociations()
        {
            try
            {
                Registration.Unregister();
                Toast("已移除註冊");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "移除失敗", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
    }
}
