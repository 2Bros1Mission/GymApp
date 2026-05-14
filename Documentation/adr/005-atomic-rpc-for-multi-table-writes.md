# ADR-005: Atomic RPC Transactions for Multi-Table Writes

## Status

Accepted

## Date

2025-02-01

## Context

Saving a completed workout requires inserting into 3 tables atomically:
1. `workout_logs` — the top-level workout record
2. `exercise_logs` — one row per exercise performed
3. `set_logs` — one row per set within each exercise

A typical workout produces 1 + 4 + 16 = 21 rows across 3 tables. If any insert fails mid-way, the data is inconsistent (orphaned exercise logs without a parent, or partial set data).

The Supabase client SDK does not provide client-side transactions.

## Decision

Use **PostgreSQL RPC functions** (`CREATE FUNCTION ... LANGUAGE plpgsql`) for all multi-table write operations. The function runs as a single database transaction — if any statement fails, the entire operation rolls back.

Current RPC functions:
- `save_workout` — atomically inserts workout + exercises + sets
- `redeem_invite_code` — validates code, creates connection, marks invite used
- `confirm_connection` / `approve_connection` / `reject_connection` — state transitions with authorization checks

Called from the client via `supabase.rpc('function_name', { params })`.

## Consequences

### What becomes easier
- Guaranteed atomicity — no partial/corrupt data states
- Server-side authorization (functions use `SECURITY DEFINER` + `auth.uid()`)
- Single network round-trip for complex operations (better performance on mobile)
- Business logic validation happens at the database level (e.g., "only clients can redeem codes")
- Returns structured JSONB with success/error information

### What becomes harder
- Business logic lives in SQL rather than TypeScript — less familiar for the team
- Testing requires a running PostgreSQL instance (can't unit test in isolation)
- Migrations must be managed carefully — function signature changes need coordinated client updates
- Debugging is harder (no breakpoints, limited logging within PL/pgSQL)
- Functions use `SECURITY DEFINER` which runs as the function creator — must be careful not to expose unintended access

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Multiple sequential client-side inserts | No atomicity guarantee. If the app crashes or network drops mid-sequence, data is corrupted. |
| Supabase Edge Functions (Deno) | Adds a serverless function layer. The operations are simple enough for PL/pgSQL, and they benefit from running inside the database (no network hop to reach the data). |
| Client-side retry with cleanup | Complex error handling, race conditions, and still no true atomicity. |
