# ADR-006: Service Layer Between Components and Supabase

## Status

Accepted

## Date

2025-01-15

## Context

Screens need to read and write data. The question is whether components should call the Supabase client directly or go through an intermediate service layer.

Direct usage example:
```typescript
// Inside a screen component
const { data } = await supabase.from('workout_logs').select('*').eq('user_id', userId);
```

Service layer example:
```typescript
// Inside a screen component
const logs = await getWorkoutHistory(userId);
```

## Decision

All data operations go through **service files** in `src/lib/`. Components never import or call `supabase` directly (except `AuthContext` which manages the auth session).

Service files:
- `workoutService.ts` — workout logs, stats, body metrics
- `trainerService.ts` — connections, custom workouts, client progress
- `notificationService.ts` — scheduling, permissions, preferences

Each function:
- Accepts typed parameters
- Returns typed results
- Handles error unwrapping (converts Supabase error objects to strings or throws)
- Encapsulates the specific Supabase query/RPC call

## Consequences

### What becomes easier
- **Decoupling:** Screens don't know about table names, column names, or query structure
- **Refactoring:** Changing a table schema only requires updating the service function, not every screen
- **Testability:** Service functions can be mocked in component tests without mocking Supabase internals
- **Error consistency:** All error handling follows the same pattern per service
- **Discoverability:** Developers find all available operations by reading service files
- **Type safety:** Return types are explicit rather than inferred from Supabase's generic query builder

### What becomes harder
- Thin abstraction layer adds indirection (one more file to maintain per domain)
- For simple CRUD, the service function is just a pass-through with minimal value
- Must remember to add functions here rather than writing inline queries in components

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Direct Supabase calls in components | Scatters query logic across 15+ screen files. Schema changes require touching every component. |
| Repository pattern (class-based) | Over-engineered for this app size. Functional service files achieve the same decoupling with less ceremony. |
| TanStack Query + inline queries | TanStack Query solves caching but doesn't solve decoupling. Would still want service functions underneath. |
| GraphQL layer (Hasura/custom) | Adds infrastructure. The service layer provides the same type-safe interface without a network hop. |
