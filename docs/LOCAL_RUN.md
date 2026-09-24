# Run Simi Learn on a Galaxy phone

This is the separate mobile project at `F:\simi-learn-mobile`. The older web app stays in its own folder and does not need to run.

## Before you connect the phone

1. In Supabase, open the **simi-learn-mobile** project, then **Authentication → Providers → Anonymous Sign-Ins**. Keep it enabled. Guest sign-in is required for live lesson generation.
2. The file `apps\mobile\.env` already has this project's Supabase public URL and key. Do not paste Groq keys into it. The backend Groq keys belong only in Supabase secrets.
3. RevenueCat, OneSignal, and EAS values in that file are still placeholders. Live lessons can be tested without them. Purchases, push notifications, and cloud builds cannot be accepted as complete until those services are configured and tested.
4. Install a Samsung Galaxy device's Android USB driver if Windows does not recognize the phone. Use a data-capable USB cable.

## Enable USB debugging

On the Galaxy phone, open **Settings → About phone → Software information**. Tap **Build number** seven times and unlock the phone if prompted. Return to **Settings → Developer options**, turn on **USB debugging**, connect the USB cable, and accept the phone's **Allow USB debugging?** prompt. Keep the phone unlocked during installation.

In PowerShell:

```powershell
cd 'F:\simi-learn-mobile'
adb devices
```

The result must show one device with status `device`. If it says `unauthorized`, accept the prompt on the phone and run the command again. If it shows no device, change the cable or USB mode and confirm the Samsung driver.

## Install and run the development app

Open PowerShell in a new window:

```powershell
cd 'F:\simi-learn-mobile'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = 'C:\Users\dhruv\AppData\Local\Android\Sdk'
npm install
npm run validate
cd apps\mobile
npx expo run:android --device
```

Choose the Galaxy device if Expo asks. The first native build can take several minutes. Expo installs the debug app and starts Metro. Keep that terminal open while testing. If the app opens but cannot reach Metro, run `adb reverse tcp:8081 tcp:8081` in a second PowerShell window, then reload the app. If Expo says port 8081 is already busy, stop the older Metro terminal and rerun the command.

For later sessions, you normally do not need another native build. From `F:\simi-learn-mobile\apps\mobile`, run `npx expo start --dev-client`, then open **Simi Learn** on the phone. Rebuild with `npx expo run:android --device` after changing native packages, Expo config, or environment values embedded in the app.

## Manual learning check

1. On **Learn**, tap **Why does inflation happen?**, leave **Middle school** and **60s**, then tap **Create visual lesson**.
2. Confirm that a lesson with three to five actual teaching diagrams opens. Watch every scene and listen for narration that matches the visible elements.
3. Use **Previous**, **Next**, and the narration control. On Android, stopping speech and replaying restarts the current scene's narration because Expo Speech does not support native pause/resume on Android.
4. Finish the two-question check, return to **Library**, and replay the lesson.
5. Turn off Wi-Fi/mobile data and replay that saved lesson. Generation itself still requires a connection.
6. Repeat with a science, mathematics, history, economics, and programming topic. If a lesson fails the quality gate, record its topic, elapsed time, and the error shown. No generic card should be substituted.

## Offline UI demonstration

If Supabase or Groq is unavailable and you only need to inspect the interface, set `EXPO_PUBLIC_USE_FIXTURES=true` in `apps\mobile\.env`, then rebuild or restart Metro. The app clearly labels this as an orbit-only demonstration; it does not generate arbitrary topics. Set it back to `false` for the live test and final submission.

## Current release blockers

- No physical Android device was connected during the automated checks, so install, narration, touch behavior, offline replay, and purchase flows still require manual testing.
- Galaxy RevenueCat key and product configuration are not set. Do not claim a working purchase flow or submit a store build until a physical Galaxy purchase, restore, cancellation, and entitlement expiration test passes.
- OneSignal and EAS project IDs are not set. These are optional for a local Next Gen demo; do not claim the OneSignal category.
- The quality and performance gates in `docs\RELEASE_CHECKLIST.md` still need the full topic corpus and device runs.
