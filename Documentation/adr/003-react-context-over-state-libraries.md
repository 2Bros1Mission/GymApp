# ADR-003: React Context Over State Libraries

## Status

Accepted

## Date

2025-01-15

## Context

The app needs global state for:
- Authentication (session, user profile, auth methods)
- Language/i18n (reactive translations)
- Network connectivity (online/offline status)
- Theme (dark/light mode, color tokens)

The question is whether to use React Context, Redux, Zustand, Jotai, or another state management library.

## Decision

Use **React Context** with 4 focused providers. No external state management library.

Provider hierarchy (outermost → innermost):
```
ThemeProvider → NetworkProvider → AuthProvider → LanguageProvider → App
```

Each context is small, focused, and independent. Screen-level state uses `useState` + `useCallback`.

## Consequences

### What becomes easier
- Zero additional dependencies for state management
- Each context is self-contained and easy to understand
- No boilerplate (actions, reducers, slices, stores)
- No context switching between "framework state" patterns
- Easy to test — just wrap components in providers with known values
- Bundle size stays minimal

### What becomes harder
- No built-in devtools for inspecting state changes
- No middleware concept (logging, persistence, undo)
- No derived/computed selectors — each consumer re-renders on any context change
- If global state grows significantly, may need to split contexts further or migrate
- No built-in caching/memoization for API responses (each mount re-fetches)

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Redux Toolkit | Significant boilerplate (slices, actions, selectors) for 4 simple state shapes. Overkill for this app size. |
| Zustand | Lighter than Redux but still an additional dependency. React Context is sufficient for 4 focused concerns. |
| Jotai / Recoil | Atom-based model adds conceptual overhead without clear benefit for this use case. |
| TanStack Query | Would solve the caching/refetch problem but the app deliberately refetches on focus for data freshness. May revisit if performance becomes an issue. |
