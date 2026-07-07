# Issues #140 + #141 — Challenges Tab & Discovery View Design

## Goal

Ship the Challenges tab (5th bottom-nav tab, both roles) together with a fully functional Discovery sub-view in one PR, so the tab launches with real content instead of placeholders. Users can browse the rotating challenge pool grouped by cadence, see card states (available / cooldown / limit-reached), and **pick a challenge inline** via a confirm dialog. My Challenges and Leaderboard segments render minimal placeholders until #143/#144.

## Why bundled

#140 alone would ship a tab whose three sub-views are all placeholder text — a dead click for every user (rejected in the 2026-06-28 session). Bundling #141 gives the tab real content on day one. #142 (detail screen) stays separate: the inline-pick confirm dialog is the interim tap action, replaced by navigation when #142 lands.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Card tap action (this PR) | **Inline pick**: `guardAction` → `confirmAction` → `pickChallenge()` → refetch | #142's detail route doesn't exist; navigating would dead-end. `pickChallenge` (#136 RPC) is shipped and validated. When #142 lands, the tap handler swaps to `router.push('/challenge-detail?...')` — one-line change. |
| Default segment | Hardcoded `'discovery'` | Earlier decision (2026-06-28): the "My Challenges if active participations" smart default belongs to #143, which owns that data dependency. |
| No `already_active` card state | Omitted | Issue #141 lists it, but the shipped `getDiscoveryPool` filters the user's active challenges out of the pool entirely (`DiscoveryCard.state` is only `'available' \| 'cooldown' \| 'limit_reached'`). The issue predates the service implementation. |
| Section header counts | `getUserChallengeState(userId)` | Issue #141's `getCompletionCounts` was never built; `getUserChallengeState` (shipped, #136) returns `completionsThisPeriod`/`maxCompletions`/`activeCount`/`maxActive` per cadence. Headers show `completionsThisPeriod/maxCompletions`. |
| Countdown source | `DiscoveryCard.availableAt` (full ISO timestamptz) | The issue's `cooldownEndsAt` field doesn't exist on the card. `new Date(availableAt)` is SAFE here — the project's no-`new Date` rule targets date-only `'YYYY-MM-DD'` strings (UTC-midnight shift); `availableAt` carries an explicit timezone. Documented in-code. |
| Tab position & icon | Between Progress (client) / Dashboard (trainer) and Profile; always-filled `trophy` in the tab bar, `trophy-outline`/`trophy` pair in the Sidebar | Profile stays last (platform convention); icon treatment matches each surface's existing pattern (tab bar = always-filled color-tinted; sidebar = outline/filled swap). |
| Role visibility | Both roles, no `href` gating | Per issue #140 Step 7. Clients: 5 tabs; trainers: 3. |
| Card layout | Vertical stack per section | Matches dashboard.tsx list patterns; avoids a horizontal-FlatList one-off. `ResponsiveContainer` handles tablet/web width. |
| Sub-view file split | `src/components/challenges/` folder: `DiscoveryView.tsx` + `ChallengeCard.tsx` | Issue #141's prescribed layout. `ChallengeCard` is deliberately reusable — #142 (detail) and #143 (My Challenges) will consume it. |
| Non-available card taps | Pressable; `Alert` with reason (countdown / limit message) | Issue asks for "brief feedback (shake or toast)". `Alert.alert` is the project's established feedback channel (quality standards §7 — no silent failures); no animation dependency added. |
| Live countdown ticking | None — computed at render | Per issue Step 5. Pool refetches on focus and pull-to-refresh; minute-level staleness is acceptable. |

## Component Architecture

```
app/(tabs)/challenges.tsx          ← tab screen: header + segment toggle + sub-view switch
  └── src/components/challenges/DiscoveryView.tsx    ← data + sections + states + pick flow
        └── src/components/challenges/ChallengeCard.tsx  ← presentational card (state-aware)
```

### `challenges.tsx` (tab shell)

```typescript
type ChallengeTab = 'discovery' | 'myChallenges' | 'leaderboard';
const [activeTab, setActiveTab] = useState<ChallengeTab>('discovery');
```

- Standard scaffolding: `SafeAreaView` (flex 1), `ResponsiveContainer`, `useTheme`, `useTranslation`, `useBreakpoint`, `makeStyles(colors)` + `useMemo`.
- Header: screen title (`t('challenges.title')`), no back button (root tab).
- Segment toggle: `View` (pill container, `colors.surfaceLight`, `BorderRadius.full`) with 3 `Pressable`s. Active: `colors.primary` background, white text. Inactive: transparent, `colors.text`.
- Sub-view switch: `{activeTab === 'discovery' && <DiscoveryView />}` etc. My Challenges / Leaderboard: centered `Text` placeholder + i18n "coming soon" string (each replaced by #143/#144).

### `DiscoveryView.tsx`

```typescript
interface DiscoveryData {
  pool: { daily: DiscoveryCard[]; weekly: DiscoveryCard[]; monthly: DiscoveryCard[] };
  state: UserChallengeState[];
}
const { data, loading, error, retry } = useFocusAsyncData<DiscoveryData>({
  fetcher: async () => {
    const [pool, state] = await Promise.all([
      getDiscoveryPool(user!.id),
      getUserChallengeState(user!.id),
    ]);
    return { pool, state };
  },
  defaultValue: { pool: { daily: [], weekly: [], monthly: [] }, state: [] },
  enabled: !!user,
});
```

- Three sections in a `ScrollView` with `RefreshControl` (wired to `retry`).
- Section header: emoji + `t('challenges.section.daily')` + ` (${completionsThisPeriod}/${maxCompletions})` from the matching `UserChallengeState` row (fallback `(0/0)` if the cadence row is missing).
- Pick flow:
  ```typescript
  const handlePick = (card: DiscoveryCard) =>
    guardAction(() =>
      confirmAction(
        t('challenges.pick.title'),
        t('challenges.pick.message', { title: localizedTitle(card.challenge) }),
        t('challenges.pick.confirm'),
        t('common.cancel'),
        async () => {
          const res = await pickChallenge(card.challenge.id);
          if (res.ok) retry();
          else Alert.alert(t('challenges.pick.errorTitle'), t(pickErrorKey(res.error)));
        },
      ));
  ```
  `PickChallengeResult` is `{ ok, error?, participantId?, availableAt? }` (note: `ok`, not `success`). Codes `cooldown`, `limit_reached`, `already_active` get dedicated i18n strings; `unauthenticated` and anything else map to `challenges.pick.error.unknown` via a small `pickErrorKey` helper (guards against missing keys).
- Non-available taps: `Alert.alert` — cooldown: `t('challenges.card.availableIn', { minutes })`; limit: `t('challenges.card.limitReachedMsg')`.
- States: `loading && !data` → centered `ActivityIndicator`; `error` → `ErrorCard(message, onRetry=retry, loading)`; all three arrays empty → empty-state block (trophy icon + `t('challenges.empty')`).

### `ChallengeCard.tsx` (presentational, reusable)

```typescript
interface ChallengeCardProps {
  card: DiscoveryCard;
  onPress: (card: DiscoveryCard) => void;
}
```

- Type icon: `frequency → barbell-outline`, `streak → flame-outline`, `custom_auto`/`custom_self_reported → star-outline`.
- Difficulty badge: `easy → colors.success`, `medium → colors.accent`, `hard → colors.error`; null difficulty → badge hidden.
- Title: `language === 'bg' ? challenge.titleBg ?? challenge.title : challenge.title`.
- Body: target line (`t('challenges.card.target', { value })`), points line (`🏅 {points} t('challenges.card.points')`).
- State treatment:
  - `available`: full opacity, chevron affordance.
  - `cooldown`: `opacity: 0.55`, ribbon `t('challenges.card.availableIn', { minutes })` where `minutes = Math.max(1, Math.ceil((new Date(card.availableAt!).getTime() - Date.now()) / 60000))` — `availableAt` is a full timestamptz ISO string; safe to parse (see Design Decisions).
  - `limit_reached`: `opacity: 0.4`, badge `t('challenges.card.limitReached')`.
- Pure presentational: no service imports, no navigation — the parent owns behavior. This keeps it reusable for #142/#143.

## Navigation changes

- `app/(tabs)/_layout.tsx`: insert between the trainer `dashboard` entry and the shared `profile` entry:
  ```tsx
  {/* Shared */}
  <Tabs.Screen
    name="challenges"
    options={{
      title: t('tab.challenges'),
      tabBarIcon: ({ color, size }: { color: string; size: number }) => (
        <Ionicons name="trophy" size={size} color={color} />
      ),
    }}
  />
  ```
  No `href` gating — both roles see it.
- `src/components/Sidebar.tsx`: add `{ route: '/(tabs)/challenges', segment: 'challenges', labelKey: 'tab.challenges', icon: 'trophy-outline', iconActive: 'trophy' }` to BOTH `CLIENT_NAV_ITEMS` and `TRAINER_NAV_ITEMS`, immediately before their profile entries.

## i18n keys (EN + BG, both blocks in `src/constants/i18n.ts`)

`tab.challenges`, `challenges.title`, `challenges.segment.discovery`, `challenges.segment.myChallenges`, `challenges.segment.leaderboard`, `challenges.section.daily`, `challenges.section.weekly`, `challenges.section.monthly`, `challenges.card.target`, `challenges.card.points`, `challenges.card.availableIn`, `challenges.card.limitReached`, `challenges.card.limitReachedMsg`, `challenges.pick.title`, `challenges.pick.message`, `challenges.pick.confirm`, `challenges.pick.errorTitle`, `challenges.pick.error.cooldown`, `challenges.pick.error.limit_reached`, `challenges.pick.error.already_active`, `challenges.pick.error.unknown`, `challenges.empty`, `challenges.comingSoon`.

Interpolation via `t(key, { param })` — never `.replace()`.

## Error handling

- All data errors surface through `useFocusAsyncData` → `ErrorCard` (generic message from the service layer — services already throw non-leaking strings).
- Pick mutation errors → `Alert.alert` with typed i18n messages; raw codes never shown.
- Offline: `guardAction` blocks the pick with the standard offline UX before any dialog.

## Testing

`__tests__/challenges.test.tsx` (or colocated per existing convention — follow `__tests__/login.test.tsx` placement), mocked services/contexts/router, no real DB. ~18 tests:

| Component | Cases |
|---|---|
| `ChallengeCard` | available renders icon+badge+title+points; BG title when language=bg; cooldown shows computed minutes + dimmed; limit_reached shows badge + dimmed; custom type icon fallback; null difficulty hides badge |
| `DiscoveryView` | loading state; error state renders ErrorCard and retry calls fetcher again; empty pool message; three sections with `(x/y)` counts from state rows; missing state row → `(0/0)`; available tap → confirm → pickChallenge called → refetch on success; pick error → Alert with mapped message; cooldown tap → Alert, no pickChallenge call |
| `challenges.tsx` | default segment Discovery; tapping segments switches sub-view; placeholders render for the other two |

Verification gates before PR: `npx tsc --noEmit`, `npx eslint .`, `npx jest --passWithNoTests`, `npx expo export --platform web`.

## Affected Files

**New**
- `app/(tabs)/challenges.tsx`
- `src/components/challenges/DiscoveryView.tsx`
- `src/components/challenges/ChallengeCard.tsx`
- `__tests__/challenges.test.tsx`
- `docs/superpowers/specs/2026-07-02-challenges-tab-discovery-design.md` (this file)

**Modified**
- `app/(tabs)/_layout.tsx` — 5th tab entry
- `src/components/Sidebar.tsx` — both nav arrays
- `src/constants/i18n.ts` — ~23 keys × 2 languages

No service changes. No migration. No type changes.

## Acceptance Criteria

- [ ] Both roles see the Challenges tab (clients 5 tabs, trainers 3); desktop sidebar shows it too
- [ ] Segment toggle switches sub-views; Discovery is default; other two show "coming soon" placeholders
- [ ] Discovery renders three cadence sections with `(completions/max)` headers from `getUserChallengeState`
- [ ] Cards show type icon, difficulty badge, localized title, target, points
- [ ] Available card tap → confirm dialog → `pickChallenge` → pool refetch on success; typed error Alerts on failure; offline blocked by `guardAction`
- [ ] Cooldown cards dimmed with "Available in Xm"; limit-reached cards dimmed with badge; taps explain instead of navigating
- [ ] Loading / error / empty states handled; pull-to-refresh works
- [ ] Dark + light theme correct; layout responsive (ResponsiveContainer)
- [ ] All i18n keys present in BOTH EN and BG
- [ ] ~18 component tests green; tsc/eslint/jest/expo export clean

## Out of Scope

- #142 Challenge Detail screen (the inline-pick dialog is the interim tap action).
- #143 My Challenges / #144 Leaderboard sub-views (placeholders here).
- #147's full i18n sweep (this PR adds only its own keys).
- Live countdown ticking, card animations (shake), horizontal card carousels.
- Trainer challenge visibility in Discovery — trainer-assigned challenges never appear in the pool (service-level design, #136).

## References

- Issues #140, #141; `Documentation/Gamification.md` §"Discovery View", "Challenge Card States", "Pool Sizes & Limits"
- `src/lib/challengeService.ts` — `getDiscoveryPool`, `getUserChallengeState`, `pickChallenge` (shipped #136)
- `src/types/index.ts` — `DiscoveryCard`, `UserChallengeState` (#131)
- `app/(tabs)/dashboard.tsx` — card/list style reference
- 2026-06-28 session decision — defer #140 until it ships with real content; hardcoded Discovery default
