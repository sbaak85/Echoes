using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace ImageView
{
    sealed class LoadedImage
    {
        public string Path;
        public BitmapSource[] Frames;   // null when Error is set
        public int[] Delays;            // ms per frame (animated GIF)
        public int Width, Height;       // pixels, after EXIF orientation
        public string Error;
    }

    static class ImageLoader
    {
        const long MaxAnimationBytes = 512L * 1024 * 1024;

        /// <summary>Decodes fully into frozen bitmaps; safe to call on any thread. Never throws.</summary>
        public static LoadedImage Load(string path)
        {
            try
            {
                var bytes = File.ReadAllBytes(path);
                var stream = new MemoryStream(bytes, false);
                var decoder = BitmapDecoder.Create(stream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                if (decoder.Frames.Count == 0) throw new FileFormatException("檔案中沒有影像");

                if (decoder is GifBitmapDecoder && decoder.Frames.Count > 1)
                {
                    var anim = LoadGif(decoder, path);
                    if (anim != null) return anim;
                }

                BitmapFrame frame = decoder.Frames[0];
                if (decoder is IconBitmapDecoder)
                    frame = decoder.Frames.OrderByDescending(f => (long)f.PixelWidth * f.PixelHeight)
                                          .ThenByDescending(f => f.Format.BitsPerPixel).First();

                BitmapSource src = frame;
                int orientation = ReadOrientation(frame);
                if (orientation > 1) src = Orient(src, orientation);

                var cached = new CachedBitmap(src, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                cached.Freeze();
                return new LoadedImage
                {
                    Path = path,
                    Frames = new BitmapSource[] { cached },
                    Delays = new[] { 0 },
                    Width = cached.PixelWidth,
                    Height = cached.PixelHeight,
                };
            }
            catch (Exception ex)
            {
                return new LoadedImage { Path = path, Error = Describe(ex) };
            }
        }

        static string Describe(Exception ex)
        {
            if (ex is OutOfMemoryException || ex is InsufficientMemoryException) return "記憶體不足（圖片過大）";
            if (ex is NotSupportedException || ex is FileFormatException) return "不支援的格式或檔案已損毀";
            if (ex is FileNotFoundException || ex is DirectoryNotFoundException) return "找不到檔案";
            if (ex is UnauthorizedAccessException) return "沒有讀取權限";
            if (ex is IOException) return "無法讀取檔案：" + ex.Message;
            return ex.Message;
        }

        static int ReadOrientation(BitmapFrame frame)
        {
            try
            {
                if (!(frame.Metadata is BitmapMetadata md)) return 1;
                foreach (var q in new[] { "/app1/ifd/{ushort=274}", "/ifd/{ushort=274}" })
                {
                    try
                    {
                        if (!md.ContainsQuery(q)) continue;
                        var v = md.GetQuery(q);
                        if (v != null)
                        {
                            int o = Convert.ToInt32(v);
                            if (o >= 1 && o <= 8) return o;
                        }
                    }
                    catch { }
                }
            }
            catch { }
            return 1;
        }

        static BitmapSource Orient(BitmapSource src, int orientation)
        {
            var g = new TransformGroup();
            switch (orientation)
            {
                case 2: g.Children.Add(new ScaleTransform(-1, 1)); break;
                case 3: g.Children.Add(new RotateTransform(180)); break;
                case 4: g.Children.Add(new ScaleTransform(1, -1)); break;
                case 5: g.Children.Add(new RotateTransform(90)); g.Children.Add(new ScaleTransform(-1, 1)); break;
                case 6: g.Children.Add(new RotateTransform(90)); break;
                case 7: g.Children.Add(new RotateTransform(270)); g.Children.Add(new ScaleTransform(-1, 1)); break;
                case 8: g.Children.Add(new RotateTransform(270)); break;
                default: return src;
            }
            var tb = new TransformedBitmap(src, g);
            tb.Freeze();
            return tb;
        }

        /// <summary>Composites GIF frames (offsets + disposal) into full-canvas bitmaps. Returns null if too large.</summary>
        static LoadedImage LoadGif(BitmapDecoder decoder, string path)
        {
            int cw = 0, ch = 0;
            try
            {
                var md = decoder.Metadata;
                if (md != null)
                {
                    cw = Convert.ToInt32(md.GetQuery("/logscrdesc/Width"));
                    ch = Convert.ToInt32(md.GetQuery("/logscrdesc/Height"));
                }
            }
            catch { }
            if (cw <= 0 || ch <= 0)
            {
                cw = decoder.Frames[0].PixelWidth;
                ch = decoder.Frames[0].PixelHeight;
            }
            int stride = cw * 4;
            if ((long)stride * ch * decoder.Frames.Count > MaxAnimationBytes) return null;

            var canvas = new byte[stride * ch];
            var frames = new List<BitmapSource>();
            var delays = new List<int>();

            foreach (var f in decoder.Frames)
            {
                var md = f.Metadata as BitmapMetadata;
                int left = Query(md, "/imgdesc/Left");
                int top = Query(md, "/imgdesc/Top");
                int disposal = Query(md, "/grctlext/Disposal");
                int delay = Query(md, "/grctlext/Delay");

                var conv = new FormatConvertedBitmap(f, PixelFormats.Bgra32, null, 0);
                int fw = conv.PixelWidth, fh = conv.PixelHeight;
                var px = new byte[fw * fh * 4];
                conv.CopyPixels(px, fw * 4, 0);

                byte[] saved = disposal == 3 ? (byte[])canvas.Clone() : null;

                for (int y = 0; y < fh; y++)
                {
                    int cy = top + y;
                    if (cy < 0 || cy >= ch) continue;
                    for (int x = 0; x < fw; x++)
                    {
                        int cx = left + x;
                        if (cx < 0 || cx >= cw) continue;
                        int si = (y * fw + x) * 4;
                        if (px[si + 3] == 0) continue;
                        int di = cy * stride + cx * 4;
                        canvas[di] = px[si];
                        canvas[di + 1] = px[si + 1];
                        canvas[di + 2] = px[si + 2];
                        canvas[di + 3] = px[si + 3];
                    }
                }

                var bmp = BitmapSource.Create(cw, ch, 96, 96, PixelFormats.Bgra32, null, canvas, stride);
                bmp.Freeze();
                frames.Add(bmp);
                delays.Add(delay < 2 ? 100 : delay * 10);

                if (disposal == 2)
                {
                    for (int y = Math.Max(0, top); y < Math.Min(ch, top + fh); y++)
                        Array.Clear(canvas, y * stride + Math.Max(0, left) * 4, (Math.Min(cw, left + fw) - Math.Max(0, left)) * 4);
                }
                else if (disposal == 3 && saved != null)
                {
                    canvas = saved;
                }
            }

            return new LoadedImage
            {
                Path = path,
                Frames = frames.ToArray(),
                Delays = delays.ToArray(),
                Width = cw,
                Height = ch,
            };
        }

        static int Query(BitmapMetadata md, string q)
        {
            try
            {
                var v = md?.GetQuery(q);
                return v == null ? 0 : Convert.ToInt32(v);
            }
            catch { return 0; }
        }
    }
}
