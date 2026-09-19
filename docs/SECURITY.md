# Security and dependency status

## Application boundaries

- Mobile and web deployments use separate repositories, package IDs, cloud projects, credentials, and release workflows.
- Groq keys, the Supabase service-role key, and the RevenueCat webhook token stay in Edge Function secrets.
- Generation and feedback require a valid Supabase JWT. Guest users receive an anonymous Supabase session.
- The RevenueCat webhook verifies a high-entropy bearer token and rejects duplicate event IDs.
- Lesson plans pass schema, geometry, semantic-reference, and conceptual checks before storage or playback.

## npm audit status

The September 19, 2026 lockfile reports moderate advisories in transitive Expo/React Native build dependencies. npm proposes `audit fix --force`, which would replace the pinned Expo toolchain with incompatible major versions. The app does not call the affected build-time utilities with untrusted input. Keep the pinned, Expo Doctor-approved dependency matrix for this release and re-run `npm audit` when Expo publishes compatible patched versions.

Do not use `npm audit fix --force` on the release branch without repeating Expo Doctor, TypeScript checks, tests, Android prebuild, and a physical-device billing build.
