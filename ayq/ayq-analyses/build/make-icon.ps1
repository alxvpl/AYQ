# AYQ Analyses — derive the Windows icon container from the accepted artwork.
#
# The accepted source is AYQ_ANALYSES.png as identified and hashed in 020
# (flat artwork, 1254 × 1254, RGB). This script does only what Electron and
# NSIS require of it: deterministic resizing to the Windows icon sizes and
# packing into one .ico container, each size as a PNG-compressed entry. It
# does not recolour, redraw, restyle, crop, add transparency or otherwise
# change the mark, and it refuses a source whose bytes are not the accepted
# ones.
#
# Usage, from ayq/ayq-analyses:
#   pwsh -File build/make-icon.ps1 -Source build/AYQ_ANALYSES.png -Out build/icon.ico
param(
  [string] $Source = 'build/AYQ_ANALYSES.png',
  [string] $Out = 'build/icon.ico',
  [string] $ExpectedSha256 = '3f2b6a7705a56bdb93752354fc01f05cde4a5b5eca6e167ca69ca7c4166037dc'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$actual = (Get-FileHash -Path $Source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
  throw "Source $Source has SHA-256 $actual; the accepted artwork is $ExpectedSha256. Stopping."
}

$image = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
if ($image.Width -ne 1254 -or $image.Height -ne 1254) {
  throw "Source is $($image.Width) x $($image.Height); the accepted artwork is 1254 x 1254."
}

# The sizes Windows draws an application icon at: shell small/large, taskbar,
# Start, and the 256 px entry Explorer scales from.
$sizes = 16, 24, 32, 48, 64, 128, 256
$entries = @()
foreach ($size in $sizes) {
  # An opaque 24-bit surface: the source is RGB and no transparency is added.
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($image, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $g.Dispose()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $entries += [pscustomobject]@{ Size = $size; Bytes = $stream.ToArray() }
  $stream.Dispose()
}
$image.Dispose()

# ICO container: ICONDIR, then one ICONDIRENTRY per size, then the PNG data.
$buffer = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $buffer
$writer.Write([uint16]0)                 # reserved
$writer.Write([uint16]1)                 # type: icon
$writer.Write([uint16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($entry in $entries) {
  $dimension = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
  $writer.Write([byte]$dimension)        # width (0 means 256)
  $writer.Write([byte]$dimension)        # height
  $writer.Write([byte]0)                 # colour count
  $writer.Write([byte]0)                 # reserved
  $writer.Write([uint16]1)               # planes
  $writer.Write([uint16]32)              # bits per pixel as declared for PNG entries
  $writer.Write([uint32]$entry.Bytes.Length)
  $writer.Write([uint32]$offset)
  $offset += $entry.Bytes.Length
}
foreach ($entry in $entries) { $writer.Write($entry.Bytes) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path (Get-Location) $Out), $buffer.ToArray())
$writer.Dispose(); $buffer.Dispose()

"source  $Source  sha256 $actual"
"icon    $Out  sizes $($sizes -join ',')  bytes $((Get-Item $Out).Length)  sha256 $((Get-FileHash $Out -Algorithm SHA256).Hash.ToLowerInvariant())"
