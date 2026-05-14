# ADR-001: Supabase BaaS Over Custom Backend

## Status

Accepted

## Date

2025-01-15

## Context

GymApp needs a backend to handle authentication, data storage, and authorization. The team considered building a custom REST/GraphQL API server versus using Supabase as a Backend-as-a-Service (BaaS).

Key constraints:
- Small team (2 developers) with limited backend experience
- Need to move fast from idea to MVP
- Mobile-first app with secondary web support
- Authorization rules are per-user (my data vs. your data) with cross-user trainer access

## Decision

Use **Supabase** as the sole backend, communicating directly from the React Native client via the Supabase JavaScript SDK. No custom API server.

The architecture relies on:
- **Supabase Auth** for email/password authentication
- **PostgreSQL with Row Level Security (RLS)** for authorization at the database level
- **RPC functions** (PL/pgSQL) for complex multi-table atomic writes
- **Supabase client SDK** for all data operations

## Consequences

### What becomes easier
- Zero server infrastructure to manage, deploy, or scale
- Auth, database, and real-time capabilities out of the box
- RLS ensures security is enforced at the lowest level — no middleware to bypass
- Instant CRUD operations without writing API routes
- Free tier sufficient for MVP/development
- Auto-generated TypeScript types from database schema

### What becomes harder
- Complex business logic must live in PostgreSQL functions (less familiar than JS/TS)
- Vendor lock-in: migrating away from Supabase requires rewriting the data layer
- Cross-user access patterns (trainer reads client data) require complex RLS policies with JOIN conditions
- No server-side middleware for rate limiting, request validation, or logging
- Testing requires a real Supabase instance (no easy local mocking of RLS)

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Express/NestJS REST API | Significant additional infrastructure, deployment complexity, and maintenance burden for a 2-person team |
| Firebase | Less SQL-friendly, Firestore security rules are harder to debug than RLS, no native PostgreSQL |
| Prisma + serverless functions | Added complexity of a separate ORM layer without meaningful benefit given Supabase's built-in query builder |
| Hasura (auto-generated GraphQL) | Additional infrastructure component, GraphQL adds complexity for simple CRUD operations |
