# ADR-004: Row Level Security for Authorization

## Status

Accepted

## Date

2025-01-15

## Context

The app has two user roles (client, trainer) with distinct data access patterns:
- Users can only read/write their own workout logs, body metrics, and profile
- Trainers can read (but not write) their connected clients' data
- Invite codes are readable by the creating trainer and redeemable by any client
- Custom workouts are readable by their creator and (if public) by connected clients

Without a custom API server, authorization must be enforced at the database level.

## Decision

Use **PostgreSQL Row Level Security (RLS)** on all tables. Every table has:
- `ENABLE ROW LEVEL SECURITY` — no rows visible by default
- Explicit policies per operation (SELECT, INSERT, UPDATE, DELETE)
- `auth.uid()` function to identify the requesting user
- JOIN-based policies for cross-user access (trainer → client data)

Cross-user access pattern (trainer reading client data):
```sql
CREATE POLICY "trainers_read_client_data" ON workout_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM trainer_clients
      WHERE trainer_id = auth.uid()
        AND client_id = workout_logs.user_id
        AND status = 'active'
    )
  );
```

## Consequences

### What becomes easier
- Security is enforced at the lowest possible level — impossible to bypass via client code
- No authorization middleware to write, test, or maintain
- Authorization rules are colocated with the data schema
- Adding new tables automatically requires explicit access grants (secure by default)
- Supabase Dashboard shows policy violations in real-time for debugging

### What becomes harder
- Complex cross-user policies (trainer reads client) require JOIN conditions that can impact query performance
- Debugging policy failures requires understanding PostgreSQL's policy evaluation model
- Policy changes require SQL migrations (not just a code deploy)
- Testing RLS requires multiple authenticated sessions (can't mock at the service layer)
- Error messages from policy violations are generic ("row not found" rather than "access denied")

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Application-level middleware | No custom backend exists (see ADR-001). Even if it did, middleware can be bypassed if someone accesses the DB directly. |
| Supabase Edge Functions as auth proxy | Adds latency and complexity. RLS achieves the same result without an intermediate layer. |
| Client-side filtering only | Insecure — any user with the Supabase anon key could query any data without client-side checks. |
