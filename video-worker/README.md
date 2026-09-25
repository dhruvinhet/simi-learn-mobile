# Simi MP4 renderer

The mobile app now requests one validated lesson plan, asks this isolated worker to render it, downloads a complete H.264/AAC MP4, and plays that local file. The web application and its deployment are untouched.

## Local Galaxy test

1. In one PowerShell window: `cd F:\simi-learn-mobile; $env:SIMI_LOCAL_DEMO='1'; $env:SIMI_PIPER_MODEL=(Resolve-Path 'video-worker/voices/en_US-kristin-medium.onnx').Path; python video-worker/app.py`
2. In another: `adb reverse tcp:8787 tcp:8787` and `adb reverse tcp:8081 tcp:8081`.
3. Set `EXPO_PUBLIC_VIDEO_WORKER_URL=http://127.0.0.1:8787` in `apps/mobile/.env`, restart Metro, and install the freshly built debug APK.
4. Open Simi and create a lesson. The worker renders locally and the phone saves the finished MP4.

`SIMI_LOCAL_DEMO=1` accepts local loopback requests for device testing. It must never be used on a public host.

## Container deployment

Build `video-worker/Dockerfile` on a host that provides HTTPS, a persistent volume mounted at `/data/videos`, and at least 2 CPU cores/2 GB RAM. Set the three Supabase variables in `.env.example` as server-only secrets. The service role key must not appear in the mobile app, repository, logs or screenshots. Set the public HTTPS worker URL as `EXPO_PUBLIC_VIDEO_WORKER_URL` in the mobile build.

The worker checks the caller's Supabase JWT, fetches the completed lesson directly from the isolated mobile project's database with an owner filter, limits concurrent renders to two, and ties each job and download to the owner. A completed MP4 survives a worker restart when the volume persists. The mobile app keeps a separate offline copy.

The container downloads the [Piper Kristin medium voice](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/kristin/medium) at build time and uses it for offline neural narration. The [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/kristin/medium/MODEL_CARD) cites public-domain source recordings. [Piper](https://github.com/OHF-Voice/piper1-gpl) itself is GPL-3.0. On Windows, set `SIMI_PIPER_MODEL` to a downloaded model path; otherwise SAPI is used. No narration is sent to a third-party TTS endpoint.

The current implementation generates complete videos before playback. It does not stream partial scenes. This gives uninterrupted viewing and a real downloadable file, with a longer initial wait than native SVG playback. Measure p50/p95 render time on the chosen host before release.

Operational needs before public launch: HTTPS, persistent storage with retention policy, worker health checks, resource limits, Supabase service key configuration, and a production voice quality check. The local Flask server is only for device testing; the Dockerfile runs Gunicorn.
