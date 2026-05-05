# my-todo

Cross-platform todo app. Web (Vite + React) and mobile (Expo + React Native) share business logic via a sibling `core/` package, with Firebase auth + Firestore sync.

## Layout

```
my-todo/
├── core/      Pure TypeScript: types, persistence, derive, i18n, profile, categories
├── web/       Vite + React 18 + TypeScript
└── mobile/    Expo SDK 54 + React Native 0.81 + TypeScript
```

Both `web/` and `mobile/` import core via relative paths (e.g. `'../../core/src/types'`). No path aliases, no monorepo tooling — just relative imports from sibling subfolders.

## Develop

```sh
# Web
cd web && npm install && npm run dev

# Mobile (iOS dev client)
cd mobile && npm install && npx expo run:ios

# Mobile (Android dev client)
cd mobile && npm install && npx expo run:android
```

See `web/CLAUDE.md` for the detailed architecture guide.
