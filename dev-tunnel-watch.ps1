# Keep the local MP4 worker and the Galaxy USB tunnels available during development.
$ports = @(8081, 8787)
$lastState = 'unknown'
function Ensure-Worker {
    $worker = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    if ($worker) { return }
    $env:SIMI_LOCAL_DEMO = '1'
    $voice = Join-Path $PSScriptRoot 'video-worker\voices\en_US-kristin-medium.onnx'
    if (Test-Path -LiteralPath $voice) { $env:SIMI_PIPER_MODEL = $voice }
    Start-Process python -ArgumentList 'video-worker/app.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
    Write-Host "$(Get-Date -Format 'HH:mm:ss') Started local video worker"
}
Write-Host 'Watching the local video worker and Android USB connection.'
while ($true) {
    Ensure-Worker
    $status = (adb get-state 2>&1 | Select-Object -First 1)
    if ($status -eq 'device') {
        if ($lastState -ne 'device') { Write-Host "$(Get-Date -Format 'HH:mm:ss') Galaxy connected" }
        $tunnels = (adb reverse --list 2>$null) -join "`n"
        foreach ($port in $ports) {
            if ($tunnels -notmatch "tcp:$port\s+tcp:$port") {
                adb reverse tcp:$port tcp:$port | Out-Null
                if ($LASTEXITCODE -eq 0) { Write-Host "$(Get-Date -Format 'HH:mm:ss') Restored port $port" }
            }
        }
    } elseif ($lastState -eq 'device') {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') Galaxy disconnected; waiting"
    }
    $lastState = if ($status -eq 'device') { 'device' } else { 'offline' }
    Start-Sleep -Seconds 3
}
