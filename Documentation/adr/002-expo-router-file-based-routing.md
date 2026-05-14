# ADR-002: expo-router File-Based Routing Over React Navigation

## Status

Accepted

## Date

2025-01-15

## Context

The app needs a navigation system that supports:
- Authentication flow separation (login vs. main app)
- Tab-based navigation for the main experience
- Modal screens (workout detail, active workout session)
- Deep linking for future sharing features
- Web export capability (PWA)

## Decision

Use **expo-router v6** with file-based routing instead of React Navigation's imperative API.

Route structure uses layout groups:
- `(auth)/` — unauthenticated screens (welcome, login, signup)
- `(tabs)/` — authenticated tab bar screens
- Top-level screens for modals and detail views

## Consequences

### What becomes easier
- Routes are immediately discoverable from the filesystem
- Deep linking works automatically (URL = file path)
- Web export produces proper URLs without additional configuration
- Layout groups provide clean auth guard boundaries
- TypeScript route params are type-safe via generated types
- No need to maintain a separate navigation configuration file

### What becomes harder
- Less escape-hatch flexibility than React Navigation's imperative API
- Dynamic route changes (like role-based tab swapping) require layout group tricks
- Debugging navigation state is less transparent than React Navigation's devtools
- Some React Navigation plugins/libraries aren't directly compatible with expo-router

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| React Navigation (imperative) | Requires manual route registration, no built-in web URLs, more boilerplate for auth guards |
| Next.js-style routing (custom) | Reinventing expo-router without the Expo ecosystem integration |
| Single SPA / micro-frontend router | Overkill for a mobile app with ~15 screens |
