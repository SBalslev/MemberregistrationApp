# Builds the debug APK, ensures an emulator/device is available, installs, and launches the app.
param(
  [string]$PackageId = 'com.club.medlems.debug',
  [string]$MainActivity = 'com.club.medlems.MainActivity',
  [int]$BootTimeoutSec = 180
)

$ErrorActionPreference = 'Stop'

function Get-SdkRoot {
  if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) { return $env:ANDROID_SDK_ROOT }
  $fallback = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $fallback) { return $fallback }
  throw 'Android SDK not found. Set ANDROID_SDK_ROOT or install the SDK.'
}

function Get-ReadyDevice {
  param([string]$Adb)
  $out = & $Adb devices 2>$null
  $lines = @($out) | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
  return $lines
}

function Initialize-Device {
  param([string]$Adb, [string]$EmulatorExe, [int]$TimeoutSec)
  $ready = Get-ReadyDevice -Adb $Adb
  if ($ready -and $ready.Count -gt 0) { return }

  # Try to start an emulator if none is connected
  if (-not (Test-Path $EmulatorExe)) { throw 'No device and emulator.exe not found.' }
  $avds = & $EmulatorExe -list-avds 2>$null
  if (-not $avds) { throw 'No device detected and no AVDs found. Create an AVD first in Android Studio.' }

  $preferred = $env:AVD_NAME
  if ([string]::IsNullOrWhiteSpace($preferred)) { $preferred = ($avds | Select-Object -First 1) }
  Write-Host "Starting emulator: $preferred"
  Start-Process -FilePath $EmulatorExe -ArgumentList @('-avd', "$preferred", '-no-snapshot', '-no-boot-anim', '-netdelay', 'none', '-netspeed', 'full') | Out-Null

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    Start-Sleep -Seconds 2
    $ready = Get-ReadyDevice -Adb $Adb
    if ($ready -and $ready.Count -gt 0) { return }
  } while ((Get-Date) -lt $deadline)

  throw "Emulator did not become ready within $TimeoutSec seconds."
}

function Get-DeviceSerials {
  param([string]$Adb)
  $out = & $Adb devices 2>$null
  return (@($out) | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' } | ForEach-Object { ($_ -split '\s+')[0] })
}

function Get-TargetSerial {
  param([string]$Adb)
  if ($env:ADB_SERIAL) { return $env:ADB_SERIAL }
  $serials = Get-DeviceSerials -Adb $Adb
  if (-not $serials -or $serials.Count -eq 0) { return $null }
  # Prefer emulator devices first
  $emu = $serials | Where-Object { $_ -like 'emulator-*' } | Select-Object -First 1
  if ($emu) { return $emu }
  return ($serials | Select-Object -First 1)
}

Push-Location (Resolve-Path "$PSScriptRoot\..\").Path
try {
  $sdk = Get-SdkRoot
  $adb = Join-Path $sdk 'platform-tools\adb.exe'
  $emulator = Join-Path $sdk 'emulator\emulator.exe'

  if (-not (Test-Path $adb)) { throw "adb not found at $adb" }

  Write-Host '[1/4] Building debug APK...'
  & .\gradlew.bat :app:assembleDebug --stacktrace
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }

  $apk = Join-Path (Get-Location) 'app\build\outputs\apk\debug\app-debug.apk'
  if (-not (Test-Path $apk)) { throw "APK not found at $apk" }

  Write-Host '[2/4] Ensuring adb is running...'
  & $adb start-server | Out-Null

  Write-Host '[3/4] Ensuring a device/emulator is connected...'
  Initialize-Device -Adb $adb -EmulatorExe $emulator -TimeoutSec $BootTimeoutSec

  # Pick a target serial (prefer emulator) and ensure it's ready
  $serial = Get-TargetSerial -Adb $adb
  if (-not $serial) { throw 'No device/emulator available.' }
  Write-Host "Using device: $serial"
  & $adb -s $serial wait-for-device | Out-Null
  # Optional: wait for boot complete on emulators
  if ($serial -like 'emulator-*') {
    $deadline = (Get-Date).AddSeconds(60)
    do {
      $boot = & $adb -s $serial shell getprop sys.boot_completed 2>$null
      if ($boot.Trim() -eq '1') { break }
      Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
  }

  Write-Host '[4/4] Installing and launching app...'
  & $adb -s $serial install -r "$apk"
  if ($LASTEXITCODE -ne 0) { throw "adb install failed ($LASTEXITCODE)" }

  $component = "$PackageId/$MainActivity"
  & $adb -s $serial shell am start -n $component
  if ($LASTEXITCODE -ne 0) {
    & $adb -s $serial shell monkey -p $PackageId -c android.intent.category.LAUNCHER 1
    if ($LASTEXITCODE -ne 0) { throw "adb launch failed ($LASTEXITCODE)" }
  }

  Write-Host 'Done: app launched.'
}
finally {
  Pop-Location
}
