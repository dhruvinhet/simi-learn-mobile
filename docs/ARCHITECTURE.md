# Architecture

The mobile project is a separate repository, package, Supabase project and render service. The existing web app is never called or changed.

1. The Expo app signs in as a guest or member and requests one validated lesson plan from the Supabase Edge Function.
2. The function checks quota, uses Groq to produce three to five teaching scenes, performs deterministic checks and at most one targeted repair, then stores the plan.
3. The app asks the isolated Python video worker to render the lesson. The worker verifies the Supabase JWT, fetches the canonical completed plan from the mobile project's database with the owner's ID, and limits concurrent encodes.
4. The worker uses offline text-to-speech and FFmpeg to make one H.264/AAC MP4. Frames contain the lesson's actual visual elements, timed reveals, semantic colors, narration and captions.
5. The app downloads the finished MP4 into its document directory, plays it continuously with native controls, and offers system download/share. The saved file replays offline. The two-question check is available after playback.

Server secrets stay on the Edge Function and worker. Production worker hosting requires HTTPS and a persistent video directory. The debug phone can reach a localhost worker through `adb reverse tcp:8787 tcp:8787`.

The full MP4 is ready before playback, so there are no mid-video scene-loading gaps. This introduces an initial render wait; measure and optimize it on the target deployment. See [video-worker/README.md](../video-worker/README.md).
