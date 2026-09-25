# Simi Learn — Visual Explanations

Simi Learn turns a difficult topic into a short narrated visual lesson for students. It turns validated visual lessons into complete narrated MP4 videos, checks understanding with two questions, and saves videos for offline replay and download.

This repository is the public Shipaton 2026 mobile project. It is technically and operationally isolated from the earlier Simi web application: it has its own package ID, Supabase project, RevenueCat project, credentials, deployment steps, and Git history.

## What is implemented

- Guest access backed by Supabase anonymous authentication
- Optional email-link account sign-in
- 45, 60, or 90 second lessons for three learner levels
- Separate Python/FFmpeg worker for continuous H.264/AAC MP4 output
- Offline speech synthesis, captions, video playback and download/share
- Two-question comprehension check
- Local lesson library and offline MP4 replay
- Three-lesson free allowance and Galaxy RevenueCat Student Pro entitlement
- Idempotent Supabase Edge Function with organization-aware Groq key failover
- Hard schema, layout, narration-reference and misconception gates
- One targeted repair attempt; invalid lessons return an error and never become generic cards
- Anonymous product-outcome events and RevenueCat webhook synchronization

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- JDK 17 for local Android builds (JDK 25 is incompatible with the current native Worklets toolchain)
- Expo SDK 57 compatible Android toolchain
- A physical Samsung Galaxy device for Galaxy Billing tests
- Supabase CLI for backend deployment
- Separate Supabase, Groq and RevenueCat projects created for this mobile app

## Local start

```powershell
cd simi-learn-mobile
npm install
Copy-Item apps\mobile\.env.example apps\mobile\.env
npm run typecheck
npm test
npm run start
```

For a no-cloud UI demonstration, set `EXPO_PUBLIC_USE_FIXTURES=true`. Fixture mode uses a validated orbit lesson and never sends a prompt. The MP4 worker still needs to run; see [docs/LOCAL_RUN.md](docs/LOCAL_RUN.md).

RevenueCat and Galaxy Billing require a development build; Expo Go cannot load their native modules:

```powershell
cd apps/mobile
npx expo prebuild --clean
npx expo run:android
```

## Cloud setup

1. Create a new Supabase project and enable **Anonymous Sign-Ins** plus email sign-in.
2. Link the project and apply `supabase/migrations/202609190001_initial.sql`.
3. Set Edge Function secrets:
   ```powershell
   supabase secrets set GROQ_API_KEYS="org1-key,org2-key"
   supabase secrets set GROQ_MODEL="openai/gpt-oss-120b"
   supabase secrets set REVENUECAT_WEBHOOK_AUTH_TOKEN="a-long-random-secret"
   ```
4. Deploy `generate-lesson`, `lesson-feedback`, and `revenuecat-webhook`.
5. Copy only the Supabase URL and anon key into the Expo environment. Never expose Groq, service-role, or RevenueCat secret keys.
6. Configure the RevenueCat webhook URL as `https://PROJECT.supabase.co/functions/v1/revenuecat-webhook` with `Authorization: Bearer YOUR_SECRET`.

Generation and feedback require a valid Supabase member or anonymous JWT. The RevenueCat webhook cannot send a Supabase JWT, so it has a separate required bearer secret and idempotent event IDs.

## Video worker

Run the isolated offline-speech renderer in `video-worker/` locally, or deploy its Dockerfile behind HTTPS with persistent storage and server-only Supabase credentials. Set `EXPO_PUBLIC_VIDEO_WORKER_URL` in the mobile build. See [video-worker/README.md](video-worker/README.md).

## Galaxy Billing

Create a Galaxy RevenueCat app, entitlement `pro`, offering, and monthly product `simi_student_monthly`. Use a Galaxy public SDK key in the Expo environment.

Development and preview builds use `GALAXY_BILLING_MODE.TEST`. Production builds use `PRODUCTION`. Verify purchases only on a physical Galaxy device signed into a Samsung account.

## Spaced-recall notifications

Create a separate OneSignal app for `com.simi.visuallearn` and set `EXPO_PUBLIC_ONESIGNAL_APP_ID`. The OneSignal SDK can identify the signed-in user, but lesson-specific campaigns, permission prompts, and deep links are not implemented yet. Do not claim the OneSignal prize category until a live campaign and navigation have been verified. Development builds use OneSignal development mode; EAS production builds switch to production mode.

## Quality contract

Every accepted lesson has three to five scenes, exactly two questions, bounded coordinates, two to twelve teaching elements per scene, valid semantic IDs, valid animation targets, and explicit narration-to-visual references. Known conceptual misconceptions are rejected. A generation error is intentionally preferred over a misleading visual fallback.

See [docs/LOCAL_RUN.md](docs/LOCAL_RUN.md) for exact Galaxy phone commands and known blockers, [docs/EXTERNAL_SETUP.md](docs/EXTERNAL_SETUP.md) for the dashboard-by-dashboard cloud and store setup, [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) for the release gate, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flow and security boundaries.

## License

MIT
