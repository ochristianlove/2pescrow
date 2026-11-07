# Point Docker web + Expo mobile shell at this PC's Wi‑Fi IP so phones on the same network can test.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$wifi = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -eq "Wi-Fi" -and $_.IPAddress -notlike "169.254*" } |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $wifi) {
  $wifi = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback|WSL|Hyper-V" -and $_.IPAddress -notlike "169.254*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $wifi) {
  Write-Error "Could not detect a LAN IPv4 address. Connect to Wi‑Fi and run again."
}

Write-Host "Using LAN IP: $wifi"

$envFile = Join-Path $Root ".env"
$mobileEnv = Join-Path $Root "apps\mobile\.env"
$apiUrl = "http://${wifi}:3002"
$webUrl = "http://${wifi}:3003"

function Set-EnvLine($path, $key, $value) {
  $lines = @()
  if (Test-Path $path) { $lines = Get-Content $path -ErrorAction SilentlyContinue }
  $filtered = @($lines | Where-Object { $_ -notmatch "^\s*$([regex]::Escape($key))=" })
  $filtered += "$key=$value"
  Set-Content -Path $path -Value $filtered -Encoding utf8
}

Set-EnvLine $envFile "API_PUBLIC_URL" $apiUrl
Set-EnvLine $envFile "WEB_ORIGIN" $webUrl
Set-EnvLine $mobileEnv "EXPO_PUBLIC_WEB_ORIGIN" $webUrl

Write-Host "Updated API_PUBLIC_URL -> $apiUrl"
Write-Host "Updated WEB_ORIGIN -> $webUrl (magic-link emails)"
Write-Host "Updated EXPO_PUBLIC_WEB_ORIGIN -> $webUrl"

Push-Location $Root
try {
  docker compose up -d api web
  Start-Sleep -Seconds 2
  $cfg = Invoke-WebRequest -Uri "$webUrl/config.js" -UseBasicParsing
  Write-Host "config.js:`n$($cfg.Content)"
} finally {
  Pop-Location
}

Write-Host @"

Next:
  1. Allow Windows Firewall inbound TCP 3002 and 3003 on Private networks (if the phone cannot connect).
  2. From repo root: npm install -w @2pescrow/mobile
     (If npm SSL errors on your network: `$env:npm_config_strict_ssl='false'` for that command only.)
  3. cd apps/mobile; npx expo start
     (If Expo fetch fails: npx expo start --offline)
  4. Install Expo Go on your phone, scan the QR code (same Wi‑Fi).
  5. Optional Android APK on this PC: npx expo run:android (Android Studio required).
  iOS native build requires a Mac; Expo Go on iPhone works without one.

"@
