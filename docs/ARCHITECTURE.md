# Architecture

## Isolation

The mobile system does not import, call, deploy, or share secrets with the existing web application.

| Boundary | Mobile value |
|---|---|
| Package ID | `com.simi.visuallearn` |
| Source | Standalone Git repository |
| Backend | Separate Supabase project |
| AI credentials | Separate Groq organization keys |
| Billing | Separate RevenueCat project and Galaxy app |
| Rendering | React Native SVG on-device |
| Narration | Device text-to-speech |
| Storage | AsyncStorage locally; validated plans in Supabase |

## Lesson flow

1. The app establishes a Supabase anonymous or member session.
2. It sends one idempotent request containing topic, level, duration, locale and request ID.
3. The Edge Function checks the stored response and account quota.
4. A single Groq request creates the complete three-to-five-scene plan.
5. Deterministic checks validate structure, geometry, animation references, visual references and known misconceptions.
6. One targeted repair is allowed. A second failure returns HTTP 422.
7. The validated plan is stored and returned.
8. The app stores it locally before opening the player.
9. Playback has no backend dependency, so later scenes cannot buffer or arrive out of order.

## Security

- Groq and Supabase service-role keys exist only in Edge Function secrets.
- Generation and feedback require valid Supabase JWTs, including for guests.
- Database tables deny direct anon and authenticated access; only Edge Functions use the service role.
- RevenueCat webhook traffic must match a separate high-entropy bearer secret.
- Request IDs and RevenueCat event IDs make retries idempotent.
- The app stores no school, age, contact list, camera data or sensitive educational records.
- Prompt text is not stored; only a SHA-256 topic hash is retained for cache and abuse analysis.

## Operational behavior

A Groq 429 or transient server failure moves to the next configured organization key. Keys are ordered deterministically per request so concurrent traffic spreads without firing duplicate calls. Each attempt has a 25-second timeout. A completed request is returned from storage on retry.

The service makes at most two planner calls: initial generation and one targeted repair. It never fans out by scene and never creates generic fallback visuals.
