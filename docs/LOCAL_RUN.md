# Run Simi Learn on the Galaxy

The mobile repository is `F:\simi-learn-mobile`. The deployed web app is separate and does not need to run.

1. Keep **Anonymous Sign-Ins** enabled in the separate mobile Supabase project.
2. Confirm `adb devices` shows `RZCW4141SHX device`.
3. Run `.\dev-start.ps1` from `F:\simi-learn-mobile` after connecting the phone. It checks the worker health and restores the USB tunnels. To restore tunnels automatically after USB reconnects, keep `.\dev-tunnel-watch.ps1` running in a separate PowerShell window. The manual worker commands below are for troubleshooting only. In PowerShell window 1, run:
   ```powershell
   cd F:\simi-learn-mobile
   $env:SIMI_LOCAL_DEMO='1'
   $env:SIMI_PIPER_MODEL=(Resolve-Path 'video-worker/voices/en_US-kristin-medium.onnx').Path
   python video-worker/app.py
   ```
   This offline-speech worker must remain open. If the local model is absent, run `python -m piper.download_voices --data-dir video-worker/voices en_US-kristin-medium` first.
4. In window 2, run:
   ```powershell
   cd F:\simi-learn-mobile
   adb reverse tcp:8787 tcp:8787
   adb reverse tcp:8081 tcp:8081
   adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
   cd apps/mobile
   npx expo start --dev-client --localhost
   ```
5. Launch Simi Learn on the phone. If it does not connect automatically, run:
   ```powershell
   adb shell am start -a android.intent.action.VIEW -d 'exp+simi-learn://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.simi.visuallearn
   ```
6. Enter a topic and tap **Create my video**. Wait for the finished MP4, watch it without scene controls, tap **Download or share MP4**, then replay it offline from **Library**.

The public build variable `EXPO_PUBLIC_VIDEO_WORKER_URL` is `http://127.0.0.1:8787` for this USB test. Production needs the worker's HTTPS URL. The `SIMI_LOCAL_DEMO` bypass is loopback-only and must never be set on a public host.

For a native rebuild, set `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`, then run `cd apps/mobile/android; .\gradlew.bat app:assembleDebug --no-daemon`. The development APK needs Metro; it is not a standalone store build.

RevenueCat, OneSignal and EAS IDs remain unconfigured. A Galaxy purchase/restore test and full cross-topic visual review remain required before any store claim.
