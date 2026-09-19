# External setup runbook

This runbook configures the isolated mobile project at `F:\simi-learn-mobile`. Complete the sections in order. Keep the existing web application's services and credentials out of this setup.

## Fixed identifiers

| Field | Exact value |
|---|---|
| App name | Simi Learn - Visual Explanations |
| Android package | `com.simi.visuallearn` |
| URL scheme | `similearn` |
| RevenueCat entitlement | `pro` |
| Galaxy subscription product | `simi_student_monthly` |
| Groq model | `openai/gpt-oss-120b` |
| Supabase functions | `generate-lesson`, `lesson-feedback`, `revenuecat-webhook` |

Never paste Groq keys, Supabase secret/service-role keys, Samsung private keys, Firebase service-account JSON, or the RevenueCat webhook token into GitHub, Expo public variables, screenshots, or chat.

## 1. Start Samsung verification first

Samsung approval is the only setup item with an external waiting period.

1. Open [Galaxy Store Seller Portal](https://seller.samsungapps.com/).
2. Click **Sign Up Now**, then **Sign in with Samsung Account**.
3. Create or select the Samsung account that will own the app.
4. Accept the Seller Portal terms and finish the seller profile.
5. Choose the seller type requested by Samsung for commercial distribution. Samsung currently requires Commercial Seller Status even for a free app with in-app purchases.
6. From the Seller Portal home page, click **Request Commercial Seller Status**.
7. Complete D-U-N-S authentication, developer identity, primary contact, and financial information.
8. Submit the request. Save the seller email and application reference.
9. If approval is pending, continue with Supabase, Groq, Expo, and OneSignal. Do not wait before doing those sections.

If you do not have an eligible D-U-N-S number, Galaxy publication may remain blocked. The public Next Gen repository path is still usable for Shipaton, but real Galaxy billing cannot be presented as complete.

## 2. Create the isolated Supabase project

### Dashboard creation

1. Open [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New project**.
3. Select or create an organization owned by this project.
4. Enter project name **simi-learn-mobile**.
5. Generate a strong database password and save it in a password manager.
6. Select the region closest to the expected student testers.
7. Select the Free plan for the initial test and click **Create new project**.
8. Wait until project provisioning finishes.
9. Copy the project reference from the dashboard URL: `/project/PROJECT_REF`.

### Authentication switches

1. In the left sidebar click **Authentication**.
2. Open **Providers**.
3. Find **Anonymous Sign-Ins**, enable it, and save.
4. Keep **Email** enabled for optional magic-link sign-in.
5. Open **URL Configuration**.
6. Under **Redirect URLs**, add `similearn://**`.
7. Keep a normal HTTPS Site URL. Before store submission, replace it with the final support/landing-page domain.
8. Open **Email Templates > Magic Link** and keep Supabase's `{{ .ConfirmationURL }}` link unless we deliberately change the authentication flow later.

### Copy safe client values

1. Click **Project Settings** (gear icon).
2. Open **API Keys**.
3. Copy the **Project URL**.
4. Copy the **Publishable key**. The code's environment variable is named `EXPO_PUBLIC_SUPABASE_ANON_KEY` for compatibility, but the current publishable key is the preferred value.
5. Do not copy a secret key or legacy service-role key into the mobile environment.

### Deploy database and functions

Open PowerShell:

```powershell
cd F:\simi-learn-mobile
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

The link command may request the database password saved during project creation.

Create `F:\simi-learn-mobile\supabase\.env` by copying the template:

```powershell
Copy-Item supabase\.env.example supabase\.env
notepad supabase\.env
```

Do not deploy secrets until the Groq keys and RevenueCat webhook token from later sections are ready. When they are ready:

```powershell
npx supabase@latest secrets set --env-file supabase\.env
npx supabase@latest functions deploy generate-lesson
npx supabase@latest functions deploy lesson-feedback
npx supabase@latest functions deploy revenuecat-webhook --no-verify-jwt
npx supabase@latest functions list
npx supabase@latest secrets list
```

The first two functions require Supabase JWTs. The webhook intentionally disables Supabase JWT verification because it performs its own bearer-token check.

### Supabase verification

1. In the dashboard click **Table Editor**.
2. Confirm these tables exist: `generation_requests`, `lesson_feedback`, `entitlements`, and `revenuecat_events`.
3. Click **Edge Functions** and confirm all three functions show as deployed.
4. Click **Authentication > Users**. It will be empty until the app starts for the first time.
5. Do not add public table policies. Mobile clients intentionally have no direct table access.

## 3. Create isolated Groq projects and keys

Repeat for each independent Groq organization you are allowed to use.

1. Open [Groq Console](https://console.groq.com/).
2. Use the organization/project selector at the top left.
3. Click **Create Project** and name it **simi-learn-mobile-prod**.
4. Select that project.
5. Open **API Keys** and click **Create API Key**.
6. Name it `simi-supabase-generation`.
7. Copy it once into a password manager. Never put it in the mobile `.env`.
8. Open **Settings > Limits** and confirm `openai/gpt-oss-120b` is available.
9. Repeat in each separate organization.

In `supabase/.env`, place the keys on one comma-separated line with no quotes or spaces:

```dotenv
GROQ_API_KEYS=gsk_org1...,gsk_org2...,gsk_org3...
GROQ_MODEL=openai/gpt-oss-120b
```

The backend tries one organization at a time and moves to the next key on rate limiting or provider failure. It does not send uncontrolled parallel requests.

## 4. Create the Samsung app and subscription

Do this after Commercial Seller Status is active.

### Register the application

1. In Seller Portal click **Add New App** in the upper-right area.
2. Choose **Android**.
3. Select **English** as the default language.
4. Set title to **Simi Learn - Visual Explanations**.
5. Use the text from `docs/GALAXY_LISTING.md`.
6. Set category to **Education** if available; otherwise use Samsung's required general category and the closest education subcategory.
7. Set age restriction for students aged 13 and older.
8. Enter the verified support email.
9. Use the public URLs for Privacy Policy, Terms, Account Deletion, and source repository.
10. Save the draft.

### Create the subscription

1. Open the app's **In App Purchase** tab.
2. Click **Add New Product**.
3. Choose **Subscription**.
4. In **Description**, enter:
   - Product ID: `simi_student_monthly`
   - Title: `Student Pro Monthly`
   - Description: `Up to 30 generated visual lessons per billing period.`
5. In **Price**, set approximately INR 199/month in India and USD 2.99/month in the US, then review every automatically converted regional price.
6. In **Subscription**, choose a monthly renewal period.
7. Add a free trial only if the same trial is configured in the submission and reviewer instructions.
8. Review the summary, click **Save**, select the new item, and click **Activate**.
9. Product ID, package ID, and RevenueCat product ID must match exactly; they are case-sensitive.

### Add a license tester

1. Click the profile icon in Seller Portal.
2. Open **License Test**.
3. Add the Samsung-account email used on the physical Galaxy device.
4. Save and allow at least ten minutes for tester changes to propagate.
5. A license test purchase must show the **Sandbox** indicator. Stop if it does not; otherwise a real charge may occur.

## 5. Configure RevenueCat for Galaxy

### Project and Galaxy app

1. Open [RevenueCat Dashboard](https://app.revenuecat.com/).
2. Click **Create project** and name it **Simi Learn Mobile**.
3. Inside the project open **Apps** and click **+ New**.
4. Select **Galaxy Store**.
5. App name: **Simi Learn Galaxy**.
6. Package name: `com.simi.visuallearn`.
7. Save.

### Connect Seller Portal

1. In Samsung Seller Portal sign in as an admin.
2. Click **Assistance > API Service**.
3. Click **Create Service Account**.
4. Select both **Publishing & ITEM** and **GSS**.
5. Click **Create**.
6. Click **Download Key** and copy the **Service Account ID**.
7. Store the downloaded private key securely and never commit it.
8. Return to RevenueCat's Galaxy app settings.
9. Paste the Service Account ID and upload the private-key file.
10. Click **Save changes** and wait for RevenueCat to confirm the connection.

### Product, entitlement, and offering

1. In RevenueCat open **Product catalog > Products**.
2. Click **+ New** or **Import products**.
3. Select the Galaxy app and add `simi_student_monthly`.
4. Open **Entitlements** and click **+ New**.
5. Identifier: `pro`; display name: **Student Pro**.
6. Attach `simi_student_monthly` to `pro`.
7. Open **Offerings** and click **+ New**.
8. Identifier: `default`; description: **Simi Learn default paywall**.
9. Make this offering **Current**.
10. Add the standard **Monthly** package and attach `simi_student_monthly`.
11. The app checks `offerings.current.monthly`, so Current + Monthly must both be present.

### Copy only the public SDK key

1. Open **Project settings > API keys**, or open the Galaxy app's settings.
2. Copy the Galaxy **Public SDK key**.
3. Put it in `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
4. Do not create or embed a RevenueCat secret API key; the current app does not need one.

### Create the webhook

Generate a token in PowerShell and save it in a password manager:

```powershell
$bytes = New-Object byte[] 32
$rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

1. Put that value in `supabase/.env` as `REVENUECAT_WEBHOOK_AUTH_TOKEN`.
2. Redeploy it with `npx supabase@latest secrets set --env-file supabase/.env`.
3. In RevenueCat open **Integrations > Webhooks**.
4. Click **Add new webhook**.
5. Name: **Simi Supabase entitlements**.
6. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook`.
7. Authorization header: `Bearer YOUR_EXACT_TOKEN`.
8. Select both sandbox and production events during testing.
9. Restrict the webhook to the Simi Galaxy app.
10. Save.
11. Use RevenueCat's test delivery if available. A successful request returns HTTP 200.
12. In Supabase Table Editor, confirm a real purchase event later appears in `revenuecat_events` and `entitlements`.

## 6. Create Firebase and OneSignal

OneSignal is optional until the core lesson and purchase path works, but complete it before claiming the OneSignal category.

### Firebase credentials for Android push

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Click **Create a project**.
3. Name it **simi-learn-mobile-push**.
4. Analytics is optional for basic push delivery.
5. Open **Project settings** using the gear icon.
6. Under **Your apps**, click the Android icon.
7. Android package name: `com.simi.visuallearn`.
8. App nickname: **Simi Learn Galaxy**.
9. Register the app.
10. Open **Project settings > Service accounts**.
11. Click **Generate new private key**, confirm, and securely save the JSON file.
12. Do not commit or copy this JSON into the Expo project.

### OneSignal application

1. Open [OneSignal Dashboard](https://dashboard.onesignal.com/).
2. Click **New App/Website**.
3. App name: **Simi Learn Mobile**.
4. Select **Google Android (FCM)**.
5. In the Android configuration upload the Firebase service-account JSON requested by OneSignal.
6. Click **Save & Continue**.
7. Select the React Native/Expo SDK path when prompted. The SDK and Expo plugin are already installed.
8. Finish setup.
9. Open **Settings > Keys & IDs** and copy the **OneSignal App ID**.
10. Put it in `EXPO_PUBLIC_ONESIGNAL_APP_ID`.
11. Do not put the OneSignal REST API key in the app.

After installing the configured build:

1. Open Simi Learn.
2. Go to **Settings > Spaced recall > Enable study reminders**.
3. Accept Android notification permission.
4. In OneSignal open **Audience > Subscriptions** and confirm the Galaxy device appears.
5. Its External ID should be the Supabase user UUID.
6. Send a test push to that subscription before creating a campaign.
7. Only after delivery works, create the next-day recall Journey/campaign and record its evidence for Shipaton.

## 7. Create and link the Expo/EAS project

1. Open [Expo](https://expo.dev/) and create or sign into the account that will own Simi Learn.
2. In PowerShell run:

```powershell
cd F:\simi-learn-mobile\apps\mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

3. Choose **Create a new project** when asked.
4. Use slug/name **simi-learn**.
5. Copy the generated EAS Project ID UUID.
6. Put it in `apps/mobile/.env` as `EXPO_PUBLIC_EAS_PROJECT_ID`.
7. In the Expo dashboard open the project, then **Project settings > Environment variables**.
8. Add the public variables from `apps/mobile/.env` for Development, Preview, and Production as appropriate.
9. Never add Groq keys, the Samsung service-account key, Firebase service-account JSON, or the RevenueCat webhook token as `EXPO_PUBLIC_*` variables.

Build types:

```powershell
# Standalone internal APK with TEST billing
npx eas-cli@latest build --platform android --profile preview

# Signed Galaxy Store APK with PRODUCTION billing
npx eas-cli@latest build --platform android --profile galaxy

# Google Play AAB only, if we later use Google Play
npx eas-cli@latest build --platform android --profile production
```

When EAS asks about Android credentials, choose **Generate new keystore** for this new isolated app. Let EAS manage it, then download and securely back it up from the credentials section. Never reuse the web application's signing or deployment credentials.

## 8. Create the local mobile environment

```powershell
cd F:\simi-learn-mobile
Copy-Item apps\mobile\.env.example apps\mobile\.env
notepad apps\mobile\.env
```

Fill every value:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=YOUR_GALAXY_PUBLIC_SDK_KEY
EXPO_PUBLIC_ONESIGNAL_APP_ID=YOUR_ONESIGNAL_UUID
EXPO_PUBLIC_ONESIGNAL_MODE=development
EXPO_PUBLIC_GALAXY_BILLING_MODE=TEST
EXPO_PUBLIC_EAS_PROJECT_ID=YOUR_EAS_PROJECT_UUID
EXPO_PUBLIC_USE_FIXTURES=false
```

Run:

```powershell
npm install
npm run typecheck
npm test
cd apps\mobile
npx expo config --type public
```

Inspect the output. It must show package `com.simi.visuallearn`, scheme `similearn`, a real EAS project UUID, and no placeholder values.

## 9. First manual end-to-end run

### Prepare the Galaxy device

1. Sign into Galaxy Store with the Samsung license-tester account.
2. Open **Settings > About phone > Software information**.
3. Tap **Build number** seven times.
4. Return to Settings, open **Developer options**, and enable **USB debugging**.
5. Connect the phone by USB.
6. Accept the RSA debugging prompt on the phone.
7. In PowerShell run `adb devices`; the device must say `device`, not `unauthorized`.

### Build and launch locally

Use JDK 17, then launch the development client:

```powershell
cd F:\simi-learn-mobile\apps\mobile
$env:JAVA_HOME='C:\tmp\simi-jdk17\jdk-17.0.20.1+1'
npx expo run:android --device
```

In another PowerShell window, if Metro is not already running:

```powershell
cd F:\simi-learn-mobile
npm run start
```

### Manual acceptance sequence

1. Start the app with Wi-Fi enabled.
2. Confirm Supabase Dashboard **Authentication > Users** gains one anonymous user.
3. Generate **Why do planets orbit the Sun?**, middle-school, 60 seconds.
4. Record total generation time.
5. Watch every scene with captions and narration.
6. Confirm every narrated object exists visually.
7. Pause, replay, change narration speed, and navigate scenes.
8. Complete both quiz questions.
9. Open Library and replay the lesson.
10. Turn on airplane mode and replay it again.
11. Request an email sign-in link and confirm `similearn://auth/callback` returns to the app.
12. Enable spaced-recall notifications and send a OneSignal test notification.
13. Open Student Pro and confirm the monthly package appears.
14. Make a license-test purchase. Continue only if Samsung shows **Sandbox**.
15. Confirm `pro` becomes active.
16. Confirm Supabase `revenuecat_events` and `entitlements` receive the event.
17. Force-stop and reopen the app; Pro must remain active.
18. Use **Restore purchases**.
19. Cancel the test subscription in Galaxy Store under **Menu > Subscriptions** and verify the later entitlement event.
20. Repeat with fixture mode off and record all errors, timings, and screenshots.

## 10. Before store submission

1. Replace every SUPPORT_EMAIL/legal-identity placeholder in Privacy, Terms, Account Deletion, and Galaxy listing documents.
2. Publish those documents at stable HTTPS URLs.
3. Upload the signed `galaxy` profile APK in Seller Portal under **Binary > Upload APK binary > Add Binary**.
4. Complete Country/Region & Price, Publication, Data Safety, reviewer instructions, screenshots, icon, and closed-beta testing.
5. In Data Safety, disclose identifiers needed for authentication, subscription handling, and notifications according to the final enabled configuration.
6. Switch only the Galaxy release build to `EXPO_PUBLIC_GALAXY_BILLING_MODE=PRODUCTION`.
7. Keep internal preview builds on TEST.
8. Run the full release checklist in `docs/RELEASE_CHECKLIST.md`.
