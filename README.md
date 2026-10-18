# Sagely

A calm to-do app with Mochi, a quiet AI companion — iOS-first, built with
Expo / React Native, Firebase, and Claude.

## Layout

```
core/        Pure TypeScript domain logic (+ its tests in core/test)
mobile/      Expo SDK 54 + React Native 0.81 app
functions/   Firebase Cloud Functions backend (Mochi agent, AI, billing webhook, erasure, metrics)
docs/        Architecture, privacy policy (GitHub Pages), strategy + release docs
```

## Develop

```sh
npm install && npm test                    # core tests (repo root)
cd mobile && npm install && npx expo run:ios   # iOS dev client
cd functions && npm install && npm test    # backend tests
```

Gates (also run in CI): `npm run lint:arch`, `npm run typecheck:core`,
`npm run test:coverage`. Guides: `CLAUDE.md` (repo) and `mobile/CLAUDE.md`;
architecture: `docs/ARCHITECTURE.md`.
