using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Media.Imaging;

namespace Echoes.MapEditor;

public static class ImageLoader
{
    public static readonly string FileDialogFilter =
        "常見圖片|*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif;*.tif;*.tiff|" +
        "PNG 圖片|*.png|JPEG 圖片|*.jpg;*.jpeg|WebP 圖片|*.webp|" +
        "其他圖片|*.bmp;*.gif;*.tif;*.tiff|所有檔案|*.*";

    public static Bitmap Load(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var source = Image.FromStream(stream, useEmbeddedColorManagement: true, validateImageData: true);
            return ToPremultiplied(source);
        }
        catch when (Path.GetExtension(path).Equals(".webp", StringComparison.OrdinalIgnoreCase))
        {
            return LoadWithWindowsImaging(path);
        }
    }

    // GDI+ 繪製預乘 Alpha（PArgb）點陣圖比一般 Argb 快很多，畫布平移與縮放時差異明顯。
    private static Bitmap ToPremultiplied(Image source)
    {
        var bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppPArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CompositingMode = CompositingMode.SourceCopy;
        graphics.DrawImage(source, new Rectangle(0, 0, source.Width, source.Height));
        return bitmap;
    }

    private static Bitmap LoadWithWindowsImaging(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var decoder = BitmapDecoder.Create(
                stream,
                BitmapCreateOptions.PreservePixelFormat,
                BitmapCacheOption.OnLoad);
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(decoder.Frames[0]);

            using var encoded = new MemoryStream();
            encoder.Save(encoded);
            encoded.Position = 0;
            using var image = Image.FromStream(encoded);
            return ToPremultiplied(image);
        }
        catch (Exception exception)
        {
            throw new NotSupportedException(
                "此電腦缺少 WebP 解碼元件。請從 Microsoft Store 安裝 Webp Image Extensions，或先轉成 PNG/JPG。",
                exception);
        }
    }
}
