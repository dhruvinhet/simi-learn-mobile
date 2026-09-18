# Release checklist

## Required automated checks

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Expo public config resolves without placeholders
- [ ] Production build contains no fixture mode or secret keys
- [ ] Supabase migration and all three functions deploy successfully

## Lesson quality

- [ ] Run all topics in `fixtures/evaluation-topics.json`
- [ ] At least 95% pass within one repair
- [ ] No accepted lesson contains a missing visual reference
- [ ] No accepted lesson contains a conceptual gate failure
- [ ] Human reviewers rate narration/visual alignment at least 4/5
- [ ] No generic fallback cards exist in any code path
- [ ] p50 generation under 12 seconds and p95 under 25 seconds

## Galaxy device

- [ ] Install production-like build on the target Galaxy device
- [ ] Complete 30 end-to-end runs without a crash
- [ ] Verify background/resume, Android back and process restart
- [ ] Verify narration stop, pause, replay and scene ordering
- [ ] Verify captions, large font, TalkBack and reduced motion
- [ ] Verify offline replay after a generated lesson
- [ ] Verify purchase, cancellation, restore and expiration
- [ ] Switch Galaxy Billing from TEST to PRODUCTION before store upload

## Store and privacy

- [ ] Replace placeholder support contact and URLs
- [ ] Complete data-safety answers from actual behavior
- [ ] Provide reviewer account and instructions
- [ ] Capture 1024×1024 icon and 1179×2556 frameless screenshot
- [ ] Test deletion request process
- [ ] Confirm Student Pro regional pricing and allowance wording

## Shipaton

- [ ] Public repository includes source, assets, MIT license and setup steps
- [ ] RevenueCat project ID is recorded privately for the submission form
- [ ] Demo is under two minutes and uses real Galaxy device footage
- [ ] Devpost description and category answers are complete
- [ ] Build-in-public post index links to real published posts
- [ ] Claims use measured data only
