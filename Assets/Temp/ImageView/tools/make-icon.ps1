# Generates ImageView.ico (PNG-compressed, 16-256 px) with System.Drawing.
param([string]$Out = (Join-Path $PSScriptRoot '..\ImageView.ico'))

Add-Type -AssemblyName System.Drawing

function New-IconPng([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $m = [single]($s * 0.06)
    $w = [single]($s - 2 * $m)
    $r = [single]($s * 0.2)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($m, $m, $r, $r, 180, 90)
    $path.AddArc($m + $w - $r, $m, $r, $r, 270, 90)
    $path.AddArc($m + $w - $r, $m + $w - $r, $r, $r, 0, 90)
    $path.AddArc($m, $m + $w - $r, $r, $r, 90, 90)
    $path.CloseFigure()

    $rect = New-Object System.Drawing.RectangleF $m, $m, $w, $w
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 38, 132, 255)), ([System.Drawing.Color]::FromArgb(255, 20, 60, 160)), 90
    $g.FillPath($bg, $path)
    $g.SetClip($path)

    # sun
    $sun = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 214, 90))
    $d = [single]($s * 0.2)
    $g.FillEllipse($sun, [single]($s * 0.62), [single]($s * 0.2), $d, $d)

    # mountains
    $back = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 150, 210, 255))
    $front = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $p1 = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF ([single]($s * 0.30)), ([single]($s * 1.0))),
        (New-Object System.Drawing.PointF ([single]($s * 0.66)), ([single]($s * 0.45))),
        (New-Object System.Drawing.PointF ([single]($s * 1.05)), ([single]($s * 1.0))))
    $g.FillPolygon($back, $p1)
    $p2 = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF ([single]($s * -0.05)), ([single]($s * 1.0))),
        (New-Object System.Drawing.PointF ([single]($s * 0.36)), ([single]($s * 0.38))),
        (New-Object System.Drawing.PointF ([single]($s * 0.78)), ([single]($s * 1.0))))
    $g.FillPolygon($front, $p2)

    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    return , $ms.ToArray()
}

$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$images = foreach ($s in $sizes) { , (New-IconPng $s) }

$fs = [System.IO.File]::Create($Out)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $data = $images[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$data.Length); $bw.Write([uint32]$offset)
    $offset += $data.Length
}
foreach ($data in $images) { $bw.Write($data) }
$bw.Close()
Write-Host "Wrote $Out"
