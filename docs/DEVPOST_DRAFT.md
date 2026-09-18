# Devpost draft

## Elevator pitch

Simi Learn turns one hard question into a short narrated visual lesson that a student can understand and check in under two minutes.

## Inspiration

Students often receive another paragraph when the problem is that they cannot picture the relationship. Our earlier web prototype proved the need, but its browser and video-rendering pipeline was slow and fragile. For Shipaton we rebuilt the learning loop as a native Galaxy experience.

## What it does

A student types a question, chooses a level, and receives a three-to-five-scene lesson. The visuals, narration and captions share semantic references, so Simi can reject explanations that describe objects the student cannot see. A short quiz checks whether the idea landed, and validated lessons replay offline.

## How it was built

The Expo and React Native app draws a constrained lesson language with native SVG and speaks narration on-device. A Supabase Edge Function makes one compact Groq planning call, runs deterministic geometry, semantic-reference and conceptual checks, and permits one targeted repair. RevenueCat Galaxy Billing manages Student Pro. Invalid generations stop with a clear retry instead of becoming generic fallback cards.

## Challenges

The original web pipeline waited for SVG rasterization, audio, FFmpeg and browser workers. It also allowed conceptual-review failures to continue. We removed those entire failure classes by rendering structured scenes on-device and making quality validation a hard gate.

## What we learned

Add measured student outcomes, validated latency percentiles and real build-in-public lessons before submission. Do not replace this section with claims that were not observed.

## Category evidence to complete

- Next Gen: academic email, student status, public source and license
- Design: real screen recording, accessibility checks, visual-system explanation
- Build in Public: link every daily post and show a concrete change caused by feedback
- Galaxy: live listing and Galaxy-specific billing and device evidence if approved
