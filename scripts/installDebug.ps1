# Simple script to uninstall old version and install new debug APK
param(
    [string]$PackageId = 'com.club.medlems.debug'
)

$ErrorActionPreference = 'Stop'

# Find Android SDK
$sdkRoot = $env:ANDROID_SDK_ROOT
if (-not $sdkRoot -or -not (Test-Path $sdkRoot)) {
    $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

if (-not (Test-Path $sdkRoot)) {
    throw "Android SDK not found. Set ANDROID_SDK_ROOT environment variable."
}

$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
    throw "adb.exe not found at $adb"
}

# Find the debug APK
$apkPattern = "ISS-Skydning-Registrering-v*-debug.apk"
$apk = Get-ChildItem ".\app\build\outputs\apk\debug" -Filter $apkPattern -File | Select-Object -First 1 -ExpandProperty FullName

if (-not $apk) {
    throw "Debug APK not found. Run .\gradlew.bat assembleDebug first."
}

Write-Host "Using APK: $apk"

# Check for connected devices
Write-Host "Checking for connected devices..."
& $adb devices

# Uninstall old version (ignore errors if not installed)
Write-Host "`nUninstalling old version of $PackageId..."
& $adb uninstall $PackageId 2>$null
Start-Sleep -Seconds 1

# Install new version
Write-Host "`nInstalling new version..."
& $adb install -r $apk

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nInstallation successful!"
    Write-Host "To view logcat for crashes, run:"
    Write-Host "  & '$adb' logcat -s AndroidRuntime:E"
} else {
    throw "Installation failed with exit code $LASTEXITCODE"
}
