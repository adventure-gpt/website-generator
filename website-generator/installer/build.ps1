# ============================================================
# Build the Website Generator installer
# Prerequisites: Inno Setup 6+ installed
#   winget install --id JRSoftware.InnoSetup
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Building Website Generator Installer..." -ForegroundColor Cyan
Write-Host ""

# Find Inno Setup compiler
$iscc = $null
$searchPaths = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        $iscc = $path
        break
    }
}

if (-not $iscc) {
    Write-Host "  Inno Setup not found. Installing..." -ForegroundColor Yellow
    winget install --id JRSoftware.InnoSetup --accept-source-agreements --accept-package-agreements
    # Try again after install
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $iscc = $path
            break
        }
    }
    if (-not $iscc) {
        Write-Host "  ERROR: Inno Setup still not found after install." -ForegroundColor Red
        Write-Host "  Install manually and re-run this script." -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Found ISCC: $iscc" -ForegroundColor Green

# Generate a simple .ico file if one doesn't exist
$iconPath = Join-Path $PSScriptRoot "icon.ico"
if (-not (Test-Path $iconPath)) {
    Write-Host "  Generating installer icon..." -ForegroundColor Yellow

    # Create a simple 32x32 ICO file (blue globe icon)
    # ICO header: 0,0 = reserved, 1,0 = ICO type, 1,0 = 1 image
    # Image entry: 32x32, 0 colors, 0 reserved, 1 plane, 32 bpp, size, offset
    # BMP header + pixel data for a simple colored square

    # Use a PowerShell approach to create a minimal .ico
    Add-Type -AssemblyName System.Drawing

    $bmp = New-Object System.Drawing.Bitmap(256, 256)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Background - rounded rect with gradient feel
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(99, 102, 241))  # Indigo
    $g.FillRectangle($bgBrush, 0, 0, 256, 256)

    # Draw a simple "W" for Website
    $font = New-Object System.Drawing.Font("Segoe UI", 140, [System.Drawing.FontStyle]::Bold)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, -10, 256, 256)
    $g.DrawString("W", $font, $whiteBrush, $rect, $sf)

    $g.Dispose()

    # Save as icon
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $ms.ToArray()
    $ms.Dispose()
    $bmp.Dispose()

    # Write ICO format
    $icoStream = [System.IO.File]::Create($iconPath)
    $writer = New-Object System.IO.BinaryWriter($icoStream)

    # ICO header
    $writer.Write([Int16]0)       # Reserved
    $writer.Write([Int16]1)       # Type (1 = ICO)
    $writer.Write([Int16]1)       # Number of images

    # Image directory entry
    $writer.Write([byte]0)        # Width (0 = 256)
    $writer.Write([byte]0)        # Height (0 = 256)
    $writer.Write([byte]0)        # Color palette
    $writer.Write([byte]0)        # Reserved
    $writer.Write([Int16]1)       # Color planes
    $writer.Write([Int16]32)      # Bits per pixel
    $writer.Write([Int32]$pngBytes.Length)  # Size of image data
    $writer.Write([Int32]22)      # Offset to image data

    # Image data (PNG)
    $writer.Write($pngBytes)

    $writer.Close()
    $icoStream.Close()

    Write-Host "  Icon generated: $iconPath" -ForegroundColor Green
}

# Compile
$issPath = Join-Path $PSScriptRoot "setup.iss"
$outputDir = Join-Path $PSScriptRoot "output"

Write-Host "  Compiling installer..." -ForegroundColor Cyan
& $iscc "/O$outputDir" $issPath

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "    Build successful!" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Output: $outputDir\WebsiteGenerator-Setup.exe" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  Build failed. Check the errors above." -ForegroundColor Red
}
