using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;

namespace ImageView
{
    static class Program
    {
        static readonly string InstanceId = "ImageView-5C8E1F2A-" + Environment.UserName;

        /// <summary>The window the user launched us from (usually the Explorer window), captured before we show anything.</summary>
        public static IntPtr StartupForeground;

        [STAThread]
        static int Main(string[] args)
        {
            StartupForeground = NativeMethods.GetForegroundWindow();

            if (args.Length > 0)
            {
                switch (args[0].ToLowerInvariant())
                {
                    case "/register":
                    case "--register":
                        Registration.Register();
                        return 0;
                    case "/unregister":
                    case "--unregister":
                        Registration.Unregister();
                        return 0;
                    case "--dump-order":
                        return DumpOrder(args);
                }
            }

            string file = null;
            if (args.Length > 0)
            {
                file = FileList.Normalize(args[0]);
            }

            using (var mutex = new Mutex(true, InstanceId, out bool isPrimary))
            {
                if (!isPrimary && SendToPrimary(file)) return 0;

                var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
                app.DispatcherUnhandledException += (s, e) =>
                {
                    MessageBox.Show(e.Exception.Message, "ImageView 發生錯誤", MessageBoxButton.OK, MessageBoxImage.Error);
                    e.Handled = true;
                };

                var window = new MainWindow(file);
                new WindowInteropHelper(window).EnsureHandle();
                if (isPrimary) StartPipeServer(window);
                app.Run(window);

                if (isPrimary) mutex.ReleaseMutex();
            }
            return 0;
        }

        static bool SendToPrimary(string file)
        {
            try
            {
                using (var client = new NamedPipeClientStream(".", InstanceId, PipeDirection.Out))
                {
                    NativeMethods.AllowSetForegroundWindow(-1); // ASFW_ANY: let the primary bring itself to front
                    client.Connect(1500);
                    var bytes = Encoding.UTF8.GetBytes(file ?? "");
                    client.Write(bytes, 0, bytes.Length);
                    client.Flush();
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        static void StartPipeServer(MainWindow window)
        {
            var thread = new Thread(() =>
            {
                while (true)
                {
                    try
                    {
                        using (var server = new NamedPipeServerStream(InstanceId, PipeDirection.In, 1))
                        using (var buffer = new MemoryStream())
                        {
                            server.WaitForConnection();
                            server.CopyTo(buffer);
                            string path = Encoding.UTF8.GetString(buffer.ToArray());
                            window.Dispatcher.BeginInvoke(new Action(() => window.OpenFromExternal(path)));
                        }
                    }
                    catch
                    {
                        Thread.Sleep(300);
                    }
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        /// <summary>Runs <paramref name="func"/> on a fresh STA thread (needed for Shell COM).</summary>
        public static Task<T> RunSta<T>(Func<T> func)
        {
            var tcs = new TaskCompletionSource<T>();
            var thread = new Thread(() =>
            {
                try { tcs.SetResult(func()); }
                catch (Exception ex) { tcs.SetException(ex); }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.IsBackground = true;
            thread.Start();
            return tcs.Task;
        }

        /// <summary>Diagnostics: ImageView.exe --dump-order &lt;image&gt; &lt;output.txt&gt;</summary>
        static int DumpOrder(string[] args)
        {
            if (args.Length < 3) return 2;
            string file = FileList.Normalize(args[1]);
            var sb = new StringBuilder();
            var r = ExplorerOrder.Query(file, StartupForeground);
            if (r == null)
            {
                sb.AppendLine("explorer: none");
            }
            else
            {
                sb.AppendLine($"explorer: prop={r.PropertyName} desc={r.Descending} key={r.Key} label={r.Label}");
                foreach (var p in r.Paths) sb.AppendLine(p);
            }
            File.WriteAllText(args[2], sb.ToString(), Encoding.UTF8);
            return 0;
        }
    }
}
