# Start the local MP4 worker and restore the phone's USB tunnels.
$ErrorActionPreference = 'Stop'
$workerUp = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $workerUp) {
    $env:SIMI_LOCAL_DEMO = '1'
    $voice = Join-Path $PSScriptRoot 'video-worker\voices\en_US-kristin-medium.onnx'
    if (Test-Path -LiteralPath $voice) { $env:SIMI_PIPER_MODEL = $voice }
    Start-Process python -ArgumentList 'video-worker/app.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
}
$health = $null
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 2
        if ($health.ok -and $health.ffmpeg) { break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not ($health.ok -and $health.ffmpeg)) {
    throw 'Video worker is unavailable or FFmpeg is missing. Run python video-worker/app.py to inspect the error.'
}
Write-Host 'Video worker healthy on :8787' -ForegroundColor Green
$device = (adb get-state 2>$null | Select-Object -First 1)
if ($device -ne 'device') {
    Write-Warning 'No authorized Android device. Reconnect USB, unlock the phone, enable USB debugging, then rerun this script.'
    return
}
foreach ($port in @(8081, 8787)) {
    adb reverse tcp:$port tcp:$port | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not forward port $port to the phone." }
}
Write-Host 'USB tunnels ready (8081 Metro, 8787 Video worker).' -ForegroundColor Green
Write-Host 'Open Simi Learn and tap Retry rendering.' -ForegroundColor Yellow
