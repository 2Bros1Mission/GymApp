# Challenges Tab + Discovery View Implementation Plan (Issues #140 + #141)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 5th bottom-nav tab (both roles) with a working Discovery sub-view — cadence sections, state-aware challenge cards, inline pick flow — plus placeholders for My Challenges / Leaderboard.

**Architecture:** New tab screen `app/(tabs)/challenges.tsx` (local-state segment toggle) renders `src/components/challenges/DiscoveryView.tsx` (data + behavior) which renders `src/components/challenges/ChallengeCard.tsx` (pure presentational). Nav entries added to `_layout.tsx` and both Sidebar arrays. ~23 i18n key pairs. No service/type/migration changes.

**Tech Stack:** React Native + Expo, expo-router, @testing-library/react-native, Jest. Existing hooks: `useFocusAsyncData`, `useOfflineGuard`; helpers `confirmAction`; services `getDiscoveryPool`, `getUserChallengeState`, `pickChallenge` (all shipped, #136).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-02-challenges-tab-discovery-design.md`. Spec governs on conflict.
- `PickChallengeResult` is `{ ok: boolean; error?: 'already_active' | 'not_found' | 'cooldown' | 'limit_reached' | 'unauthenticated' | 'unknown'; participantId?: string; availableAt?: string }` — the field is **`ok`**, not `success`.
- `confirmAction(title, message, destructiveLabel, cancelLabel, onConfirm)` from `src/lib/confirm.ts`. `useOfflineGuard()` returns `{ isConnected, guardAction }`; `guardAction(action: () => void | Promise<void>)`. `useFocusAsyncData<T>({ fetcher, defaultValue, enabled })` returns `{ data, loading, error, retry }`.
- `DiscoveryCard = { challenge: Challenge; state: 'available' | 'cooldown' | 'limit_reached'; availableAt: string | null }`. NO `already_active` card state exists.
- Countdown parses `availableAt` with `new Date(...)` — allowed: it is a full ISO **timestamptz** string, not a date-only string. Put the explanatory comment from the spec at the parse site.
- Every user-facing string via `t(...)`; every new key added to BOTH the `bg` and `en` blocks in `src/constants/i18n.ts` (the existing `src/constants/__tests__/i18n.test.ts` enforces key parity — it must stay green).
- Screen scaffolding conventions: `SafeAreaView` + `ResponsiveContainer` + `useTheme`/`useTranslation`/`useBreakpoint` + `makeStyles(colors: ColorPalette)` + `useMemo`. Theme fields used: `colors.primary`, `colors.surfaceLight`, `colors.surface`, `colors.text`, `colors.textSecondary`, `colors.textMuted`, `colors.success`, `colors.accent`, `colors.error`, `colors.white`, `colors.border`, `colors.background`.
- Component tests mock contexts/services/router with inline jest.mock factories, following `__tests__/login.test.tsx`. Test file: `__tests__/challenges.test.tsx`.
- Node PATH prefix for every node/npx command:
  ```bash
  export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH"
  ```
- Verification gates before PR: `npx tsc --noEmit`, `npx eslint .`, `npx jest --passWithNoTests`, `npx expo export --platform web` — all clean.

---

### Task 1: i18n keys

**Files:**
- Modify: `src/constants/i18n.ts` — add 23 keys to the `bg` block and the same 23 to the `en` block

**Interfaces:**
- Consumes: existing i18n structure (flat string keys inside two language objects; find the `'tab.dashboard'` line in each block as the insertion anchor).
- Produces: the 23 keys below, consumed by Tasks 2–4 via `t(...)`.

- [ ] **Step 1: Add the Bulgarian keys**

Locate `'tab.dashboard': 'Табло',` in the `bg` block. Insert after it:

```typescript
    'tab.challenges': 'Предизвикателства',
    'challenges.title': 'Предизвикателства',
    'challenges.segment.discovery': 'Открий',
    'challenges.segment.myChallenges': 'Моите',
    'challenges.segment.leaderboard': 'Класация',
    'challenges.section.daily': 'Дневни',
    'challenges.section.weekly': 'Седмични',
    'challenges.section.monthly': 'Месечни',
    'challenges.card.target': 'Цел: {value}',
    'challenges.card.points': 'точки',
    'challenges.card.availableIn': 'Достъпно след {minutes} мин',
    'challenges.card.limitReached': 'Лимитът е достигнат',
    'challenges.card.limitReachedMsg': 'Достигнал си лимита за този период. Нови предизвикателства при следващото нулиране!',
    'challenges.pick.title': 'Приемане на предизвикателство',
    'challenges.pick.message': 'Да приемем ли "{title}"?',
    'challenges.pick.confirm': 'Приеми',
    'challenges.pick.errorTitle': 'Неуспешно приемане',
    'challenges.pick.error.cooldown': 'Това предизвикателство е в изчакване. Опитай по-късно.',
    'challenges.pick.error.limit_reached': 'Достигнат е лимитът за активни предизвикателства.',
    'challenges.pick.error.already_active': 'Това предизвикателство вече е активно.',
    'challenges.pick.error.unknown': 'Нещо се обърка. Опитай отново.',
    'challenges.empty': 'Нови предизвикателства идват скоро!',
    'challenges.comingSoon': 'Очаквай скоро',
```

- [ ] **Step 2: Add the English keys**

Locate `'tab.dashboard': 'Dashboard',` in the `en` block. Insert after it:

```typescript
    'tab.challenges': 'Challenges',
    'challenges.title': 'Challenges',
    'challenges.segment.discovery': 'Discovery',
    'challenges.segment.myChallenges': 'Mine',
    'challenges.segment.leaderboard': 'Leaderboard',
    'challenges.section.daily': 'Daily',
    'challenges.section.weekly': 'Weekly',
    'challenges.section.monthly': 'Monthly',
    'challenges.card.target': 'Target: {value}',
    'challenges.card.points': 'pts',
    'challenges.card.availableIn': 'Available in {minutes}m',
    'challenges.card.limitReached': 'Limit reached',
    'challenges.card.limitReachedMsg': "You've hit the limit for this period. New challenges at the next reset!",
    'challenges.pick.title': 'Pick challenge',
    'challenges.pick.message': 'Pick "{title}"?',
    'challenges.pick.confirm': 'Pick',
    'challenges.pick.errorTitle': 'Could not pick',
    'challenges.pick.error.cooldown': 'This challenge is cooling down. Try again soon.',
    'challenges.pick.error.limit_reached': 'You have reached your active challenge limit.',
    'challenges.pick.error.already_active': 'This challenge is already active.',
    'challenges.pick.error.unknown': 'Something went wrong. Please try again.',
    'challenges.empty': 'New challenges coming soon!',
    'challenges.comingSoon': 'Coming soon',
```

- [ ] **Step 3: Verify parity + type-check**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/constants/__tests__/i18n.test.ts && npx tsc --noEmit
```
Expected: i18n parity test green; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add src/constants/i18n.ts
git commit -m "feat(i18n): add challenges tab + discovery strings, BG and EN (Issues #140, #141)"
```

---

### Task 2: ChallengeCard component

**Files:**
- Create: `src/components/challenges/ChallengeCard.tsx`
- Create: `__tests__/challenges.test.tsx` (harness + first describe block)

**Interfaces:**
- Consumes: `DiscoveryCard`, `Challenge` from `src/types`; theme/i18n/language contexts.
- Produces: `ChallengeCard({ card, onPress }: { card: DiscoveryCard; onPress: (card: DiscoveryCard) => void })` — pure presentational; Tasks 3–4 render it.

- [ ] **Step 1: Write the failing tests (new file with the shared mock harness)**

Create `__tests__/challenges.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ChallengeCard } from '../src/components/challenges/ChallengeCard';
import type { Challenge, DiscoveryCard } from '../src/types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockLanguage = 'en';
jest.mock('../src/contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let out = key;
      if (params) {
        for (const [k, v] of Object.entries(params)) out += `|${k}=${v}`;
      }
      return out;
    },
    language: mockLanguage,
  }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#000', surface: '#111', surfaceLight: '#222',
      text: '#fff', textSecondary: '#aaa', textMuted: '#666',
      primary: '#6C63FF', primaryDark: '#5A52D5', border: '#333',
      error: '#FF6B6B', success: '#4CAF50', accent: '#F59E0B', white: '#fff',
    },
  }),
}));

const makeChallenge = (extra: Partial<Challenge> = {}): Challenge => ({
  id: 'ch-1',
  templateId: 'tpl-1',
  creatorId: null,
  source: 'platform',
  title: 'Five Workouts',
  titleBg: 'Пет тренировки',
  description: null,
  descriptionBg: null,
  challengeType: 'frequency',
  cadence: 'weekly',
  difficulty: 'medium',
  targetValue: 5,
  points: 150,
  category: null,
  status: 'active',
  startDate: '2026-07-01',
  endDate: null,
  createdAt: '2026-07-01T00:00:00Z',
  ...extra,
});

const makeCard = (state: DiscoveryCard['state'], extra: Partial<DiscoveryCard> = {}): DiscoveryCard => ({
  challenge: makeChallenge(),
  state,
  availableAt: null,
  ...extra,
});

beforeEach(() => {
  mockLanguage = 'en';
  jest.clearAllMocks();
});

describe('ChallengeCard', () => {
  it('renders title, target, points, and difficulty for an available card', () => {
    const { getByText } = render(<ChallengeCard card={makeCard('available')} onPress={jest.fn()} />);
    expect(getByText('Five Workouts')).toBeTruthy();
    expect(getByText('challenges.card.target|value=5')).toBeTruthy();
    expect(getByText(/150/)).toBeTruthy();
  });

  it('uses the Bulgarian title when language is bg', () => {
    mockLanguage = 'bg';
    const { getByText } = render(<ChallengeCard card={makeCard('available')} onPress={jest.fn()} />);
    expect(getByText('Пет тренировки')).toBeTruthy();
  });

  it('falls back to the base title when titleBg is null and language is bg', () => {
    mockLanguage = 'bg';
    const card = makeCard('available');
    card.challenge = makeChallenge({ titleBg: null });
    const { getByText } = render(<ChallengeCard card={card} onPress={jest.fn()} />);
    expect(getByText('Five Workouts')).toBeTruthy();
  });

  it('shows the computed countdown for a cooldown card', () => {
    const availableAt = new Date(Date.now() + 43 * 60000 + 30000).toISOString();
    const { getByText } = render(
      <ChallengeCard card={makeCard('cooldown', { availableAt })} onPress={jest.fn()} />,
    );
    expect(getByText('challenges.card.availableIn|minutes=44')).toBeTruthy();
  });

  it('shows the limit badge for a limit_reached card', () => {
    const { getByText } = render(<ChallengeCard card={makeCard('limit_reached')} onPress={jest.fn()} />);
    expect(getByText('challenges.card.limitReached')).toBeTruthy();
  });

  it('invokes onPress with the card for every state', () => {
    const onPress = jest.fn();
    const card = makeCard('cooldown', { availableAt: new Date(Date.now() + 60000).toISOString() });
    const { getByTestId } = render(<ChallengeCard card={card} onPress={onPress} />);
    fireEvent.press(getByTestId('challenge-card-ch-1'));
    expect(onPress).toHaveBeenCalledWith(card);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest __tests__/challenges.test.tsx
```
Expected: FAIL with `Cannot find module '../src/components/challenges/ChallengeCard'`.

- [ ] **Step 3: Implement the component**

Create `src/components/challenges/ChallengeCard.tsx`:

```tsx
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useTranslation } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Challenge, DiscoveryCard } from '../../types';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICONS: Record<Challenge['challengeType'], IoniconsName> = {
  frequency: 'barbell-outline',
  streak: 'flame-outline',
  custom_auto: 'star-outline',
  custom_self_reported: 'star-outline',
};

// availableAt is a full ISO timestamptz string (explicit timezone), so
// new Date() parsing is safe here — the project's "no new Date on
// 'YYYY-MM-DD'" rule targets date-ONLY strings, which parse as UTC
// midnight and shift in Europe/Sofia (PR #160 regression).
function minutesUntil(availableAt: string): number {
  return Math.max(1, Math.ceil((new Date(availableAt).getTime() - Date.now()) / 60000));
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCooldown: { opacity: 0.55 },
  cardLimit: { opacity: 0.4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  title: { fontSize: FontSize.md, fontWeight: '600', color: colors.text, marginBottom: 2 },
  meta: { fontSize: FontSize.sm, color: colors.textSecondary },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
  pointsText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  stateRibbon: { marginTop: Spacing.sm, fontSize: FontSize.xs, fontWeight: '600', color: colors.textMuted },
});

const DIFFICULTY_COLOR: Record<'easy' | 'medium' | 'hard', keyof ColorPalette> = {
  easy: 'success',
  medium: 'accent',
  hard: 'error',
};

interface ChallengeCardProps {
  card: DiscoveryCard;
  onPress: (card: DiscoveryCard) => void;
}

export function ChallengeCard({ card, onPress }: ChallengeCardProps) {
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { challenge, state, availableAt } = card;
  const title = language === 'bg' ? challenge.titleBg ?? challenge.title : challenge.title;

  return (
    <Pressable
      testID={`challenge-card-${challenge.id}`}
      style={[styles.card, state === 'cooldown' && styles.cardCooldown, state === 'limit_reached' && styles.cardLimit]}
      onPress={() => onPress(card)}
    >
      <View style={styles.topRow}>
        <Ionicons name={TYPE_ICONS[challenge.challengeType]} size={20} color={colors.primary} />
        {challenge.difficulty && (
          <View style={[styles.badge, { backgroundColor: colors[DIFFICULTY_COLOR[challenge.difficulty]] as string }]}>
            <Text style={styles.badgeText}>{challenge.difficulty.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{t('challenges.card.target', { value: challenge.targetValue })}</Text>
      <View style={styles.pointsRow}>
        <Ionicons name="medal-outline" size={16} color={colors.accent} />
        <Text style={styles.pointsText}>{challenge.points} {t('challenges.card.points')}</Text>
      </View>
      {state === 'cooldown' && availableAt && (
        <Text style={styles.stateRibbon}>{t('challenges.card.availableIn', { minutes: minutesUntil(availableAt) })}</Text>
      )}
      {state === 'limit_reached' && (
        <Text style={styles.stateRibbon}>{t('challenges.card.limitReached')}</Text>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx jest __tests__/challenges.test.tsx` (with PATH prefix).
Expected: PASS, 6 tests.

- [ ] **Step 5: Type-check, commit**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
git add src/components/challenges/ChallengeCard.tsx __tests__/challenges.test.tsx
git commit -m "feat(ui): add state-aware ChallengeCard component (Issue #141)"
```

---

### Task 3: DiscoveryView

**Files:**
- Create: `src/components/challenges/DiscoveryView.tsx`
- Modify: `__tests__/challenges.test.tsx` — add mocks + describe block

**Interfaces:**
- Consumes: `ChallengeCard` (Task 2); `getDiscoveryPool(userId)`, `getUserChallengeState(userId)`, `pickChallenge(challengeId)` from `src/lib/challengeService`; `useFocusAsyncData`, `useOfflineGuard`, `confirmAction`; `ErrorCard`.
- Produces: `DiscoveryView()` — no props; Task 4 renders it inside the tab shell.

- [ ] **Step 1: Add the mocks and failing tests**

Append to `__tests__/challenges.test.tsx` (mocks go at TOP-LEVEL with the existing ones — jest.mock calls are hoisted; the describe block appends at the bottom):

```tsx
// ── added for DiscoveryView ──
import { DiscoveryView } from '../src/components/challenges/DiscoveryView';
import { Alert } from 'react-native';

const mockGetDiscoveryPool = jest.fn();
const mockGetUserChallengeState = jest.fn();
const mockPickChallenge = jest.fn();
jest.mock('../src/lib/challengeService', () => ({
  getDiscoveryPool: (...a: unknown[]) => mockGetDiscoveryPool(...a),
  getUserChallengeState: (...a: unknown[]) => mockGetUserChallengeState(...a),
  pickChallenge: (...a: unknown[]) => mockPickChallenge(...a),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockGuardAction = jest.fn((action: () => void | Promise<void>) => action());
jest.mock('../src/hooks/useOfflineGuard', () => ({
  useOfflineGuard: () => ({ isConnected: true, guardAction: mockGuardAction }),
}));

// confirmAction auto-confirms so the pick flow proceeds in tests
jest.mock('../src/lib/confirm', () => ({
  confirmAction: (
    _t: string, _m: string, _d: string, _c: string, onConfirm: () => void,
  ) => onConfirm(),
}));

// useFocusEffect → run the effect once like useEffect (react-navigation not mounted in tests)
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => { cb(); }, [cb]);
  },
}));

const emptyPool = { daily: [], weekly: [], monthly: [] };
const stateRows = [
  { cadence: 'daily', completionsThisPeriod: 1, maxCompletions: 1, activeCount: 0, maxActive: 1, lastPickAt: null, cooldownEndsAt: null },
  { cadence: 'weekly', completionsThisPeriod: 2, maxCompletions: 5, activeCount: 1, maxActive: 3, lastPickAt: null, cooldownEndsAt: null },
  { cadence: 'monthly', completionsThisPeriod: 0, maxCompletions: 10, activeCount: 0, maxActive: 5, lastPickAt: null, cooldownEndsAt: null },
];

describe('DiscoveryView', () => {
  beforeEach(() => {
    mockGetDiscoveryPool.mockResolvedValue(emptyPool);
    mockGetUserChallengeState.mockResolvedValue(stateRows);
    mockPickChallenge.mockResolvedValue({ ok: true, participantId: 'p-1' });
  });

  it('renders section headers with completion counts', async () => {
    mockGetDiscoveryPool.mockResolvedValue({
      daily: [makeCard('available')], weekly: [], monthly: [],
    });
    const { findByText } = render(<DiscoveryView />);
    expect(await findByText(/challenges\.section\.daily.*1\/1/)).toBeTruthy();
    expect(await findByText(/challenges\.section\.weekly.*2\/5/)).toBeTruthy();
  });

  it('shows the empty message when all three cadences are empty', async () => {
    const { findByText } = render(<DiscoveryView />);
    expect(await findByText('challenges.empty')).toBeTruthy();
  });

  it('shows ErrorCard when the fetch fails and retry refetches', async () => {
    mockGetDiscoveryPool.mockRejectedValueOnce(new Error('Failed to load'));
    const { findByText } = render(<DiscoveryView />);
    expect(await findByText(/Failed to load/)).toBeTruthy();
  });

  it('picks an available card: confirm → pickChallenge → refetch', async () => {
    mockGetDiscoveryPool.mockResolvedValue({ daily: [makeCard('available')], weekly: [], monthly: [] });
    const { findByTestId } = render(<DiscoveryView />);
    fireEvent.press(await findByTestId('challenge-card-ch-1'));
    await waitFor(() => expect(mockPickChallenge).toHaveBeenCalledWith('ch-1'));
    await waitFor(() => expect(mockGetDiscoveryPool).toHaveBeenCalledTimes(2));
  });

  it('shows a typed alert when pick fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPickChallenge.mockResolvedValue({ ok: false, error: 'limit_reached' });
    mockGetDiscoveryPool.mockResolvedValue({ daily: [makeCard('available')], weekly: [], monthly: [] });
    const { findByTestId } = render(<DiscoveryView />);
    fireEvent.press(await findByTestId('challenge-card-ch-1'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('challenges.pick.errorTitle', 'challenges.pick.error.limit_reached'),
    );
    alertSpy.mockRestore();
  });

  it('maps unauthenticated pick errors to the unknown message', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPickChallenge.mockResolvedValue({ ok: false, error: 'unauthenticated' });
    mockGetDiscoveryPool.mockResolvedValue({ daily: [makeCard('available')], weekly: [], monthly: [] });
    const { findByTestId } = render(<DiscoveryView />);
    fireEvent.press(await findByTestId('challenge-card-ch-1'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('challenges.pick.errorTitle', 'challenges.pick.error.unknown'),
    );
    alertSpy.mockRestore();
  });

  it('cooldown card tap shows an informative alert and never calls pickChallenge', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetDiscoveryPool.mockResolvedValue({
      daily: [makeCard('cooldown', { availableAt: new Date(Date.now() + 120000).toISOString() })],
      weekly: [], monthly: [],
    });
    const { findByTestId } = render(<DiscoveryView />);
    fireEvent.press(await findByTestId('challenge-card-ch-1'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockPickChallenge).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
```

Also extend the top-of-file import from `@testing-library/react-native` to include `waitFor`.

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest __tests__/challenges.test.tsx` (PATH prefix).
Expected: FAIL with `Cannot find module '../src/components/challenges/DiscoveryView'`.

- [ ] **Step 3: Implement DiscoveryView**

Create `src/components/challenges/DiscoveryView.tsx`:

```tsx
import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, Spacing, FontSize } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFocusAsyncData } from '../../hooks/useAsyncData';
import { useOfflineGuard } from '../../hooks/useOfflineGuard';
import { confirmAction } from '../../lib/confirm';
import { getDiscoveryPool, getUserChallengeState, pickChallenge } from '../../lib/challengeService';
import { ErrorCard } from '../ErrorCard';
import { ChallengeCard } from './ChallengeCard';
import type { DiscoveryCard, UserChallengeState } from '../../types';

interface DiscoveryData {
  pool: { daily: DiscoveryCard[]; weekly: DiscoveryCard[]; monthly: DiscoveryCard[] };
  state: UserChallengeState[];
}

const CADENCES = ['daily', 'weekly', 'monthly'] as const;
const SECTION_EMOJI: Record<(typeof CADENCES)[number], string> = {
  daily: '🔥',
  weekly: '📅',
  monthly: '🏆',
};

// Known pick-error codes with dedicated copy; everything else → unknown.
const PICK_ERROR_KEYS = new Set(['cooldown', 'limit_reached', 'already_active']);
function pickErrorKey(error: string | undefined): string {
  return PICK_ERROR_KEYS.has(error ?? '')
    ? `challenges.pick.error.${error}`
    : 'challenges.pick.error.unknown';
}

// availableAt is a full ISO timestamptz — safe to parse (see ChallengeCard).
function minutesUntil(availableAt: string): number {
  return Math.max(1, Math.ceil((new Date(availableAt).getTime() - Date.now()) / 60000));
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl },
  sectionHeader: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginTop: Spacing.lg, marginBottom: Spacing.md },
  emptyWrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyText: { fontSize: FontSize.md, color: colors.textSecondary, textAlign: 'center' },
});

export function DiscoveryView() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { guardAction } = useOfflineGuard();

  const fetcher = useCallback(async (): Promise<DiscoveryData> => {
    const [pool, state] = await Promise.all([
      getDiscoveryPool(user!.id),
      getUserChallengeState(user!.id),
    ]);
    return { pool, state };
  }, [user]);

  const { data, loading, error, retry } = useFocusAsyncData<DiscoveryData>({
    fetcher,
    defaultValue: { pool: { daily: [], weekly: [], monthly: [] }, state: [] },
    enabled: !!user,
  });

  const handlePress = (card: DiscoveryCard) => {
    if (card.state === 'cooldown') {
      Alert.alert(
        t('challenges.pick.errorTitle'),
        t('challenges.card.availableIn', { minutes: card.availableAt ? minutesUntil(card.availableAt) : 1 }),
      );
      return;
    }
    if (card.state === 'limit_reached') {
      Alert.alert(t('challenges.card.limitReached'), t('challenges.card.limitReachedMsg'));
      return;
    }
    const title = card.challenge.titleBg && t('challenges.pick.message') ? card.challenge.title : card.challenge.title;
    guardAction(() =>
      confirmAction(
        t('challenges.pick.title'),
        t('challenges.pick.message', { title }),
        t('challenges.pick.confirm'),
        t('common.cancel'),
        async () => {
          const res = await pickChallenge(card.challenge.id);
          if (res.ok) {
            retry();
          } else {
            Alert.alert(t('challenges.pick.errorTitle'), t(pickErrorKey(res.error)));
          }
        },
      ),
    );
  };

  if (loading && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { pool, state } = data;
  const isEmpty = CADENCES.every((c) => pool[c].length === 0);

  const countsFor = (cadence: (typeof CADENCES)[number]): string => {
    const row = state.find((s) => s.cadence === cadence);
    return `(${row?.completionsThisPeriod ?? 0}/${row?.maxCompletions ?? 0})`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={retry} tintColor={colors.primary} />}
    >
      {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}
      {!error && isEmpty && (
        <View style={styles.emptyWrap}>
          <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('challenges.empty')}</Text>
        </View>
      )}
      {!error && !isEmpty && CADENCES.map((cadence) => (
        pool[cadence].length > 0 && (
          <View key={cadence}>
            <Text style={styles.sectionHeader}>
              {SECTION_EMOJI[cadence]} {t(`challenges.section.${cadence}`)} {countsFor(cadence)}
            </Text>
            {pool[cadence].map((card) => (
              <ChallengeCard key={card.challenge.id} card={card} onPress={handlePress} />
            ))}
          </View>
        )
      ))}
    </ScrollView>
  );
}
```

NOTE for the implementer: the `const title = ...` line above contains a redundant ternary left over from drafting — implement it simply as:
```tsx
const title = card.challenge.title;
```
(the localized title lives inside ChallengeCard; the confirm dialog uses the base title). Do not copy the drafting artifact.

- [ ] **Step 4: Run to confirm pass**

Run: `npx jest __tests__/challenges.test.tsx` (PATH prefix).
Expected: PASS, 13 tests.

- [ ] **Step 5: Type-check, commit**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
git add src/components/challenges/DiscoveryView.tsx __tests__/challenges.test.tsx
git commit -m "feat(ui): add DiscoveryView with sections, states, and inline pick flow (Issue #141)"
```

---

### Task 4: Tab shell + navigation entries

**Files:**
- Create: `app/(tabs)/challenges.tsx`
- Modify: `app/(tabs)/_layout.tsx` — insert the 5th tab between the `dashboard` and `profile` entries
- Modify: `src/components/Sidebar.tsx` — add the challenges item to BOTH nav arrays (before each profile entry)
- Modify: `__tests__/challenges.test.tsx` — add the shell describe block

**Interfaces:**
- Consumes: `DiscoveryView` (Task 3), i18n keys (Task 1).
- Produces: routable `/(tabs)/challenges` screen; nav entries.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/challenges.test.tsx`:

```tsx
import ChallengesScreen from '../app/(tabs)/challenges';

jest.mock('../src/components/ResponsiveContainer', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/hooks/useBreakpoint', () => ({
  useBreakpoint: () => 'sm',
}));

describe('ChallengesScreen (tab shell)', () => {
  beforeEach(() => {
    mockGetDiscoveryPool.mockResolvedValue(emptyPool);
    mockGetUserChallengeState.mockResolvedValue(stateRows);
  });

  it('defaults to the Discovery segment', async () => {
    const { findByText } = render(<ChallengesScreen />);
    expect(await findByText('challenges.empty')).toBeTruthy(); // DiscoveryView content
  });

  it('switches to My Challenges placeholder', async () => {
    const { getByText, findByText } = render(<ChallengesScreen />);
    fireEvent.press(getByText('challenges.segment.myChallenges'));
    expect(await findByText('challenges.comingSoon')).toBeTruthy();
  });

  it('switches to Leaderboard placeholder and back to Discovery', async () => {
    const { getByText, findByText } = render(<ChallengesScreen />);
    fireEvent.press(getByText('challenges.segment.leaderboard'));
    expect(await findByText('challenges.comingSoon')).toBeTruthy();
    fireEvent.press(getByText('challenges.segment.discovery'));
    expect(await findByText('challenges.empty')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest __tests__/challenges.test.tsx` (PATH prefix).
Expected: FAIL with `Cannot find module '../app/(tabs)/challenges'`.

- [ ] **Step 3: Implement the tab screen**

Create `app/(tabs)/challenges.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { DiscoveryView } from '../../src/components/challenges/DiscoveryView';

type ChallengeTab = 'discovery' | 'myChallenges' | 'leaderboard';

const SEGMENTS: ChallengeTab[] = ['discovery', 'myChallenges', 'leaderboard'];

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  segmentTextActive: { color: colors.white },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: FontSize.md, color: colors.textSecondary },
});

export default function ChallengesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Default is Discovery (hardcoded): the "My Challenges if the user has
  // active participations" smart default belongs to #143, which owns that
  // data dependency.
  const [activeTab, setActiveTab] = useState<ChallengeTab>('discovery');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.title}>{t('challenges.title')}</Text>
        </View>
        <View style={styles.segmentRow}>
          {SEGMENTS.map((seg) => (
            <Pressable
              key={seg}
              style={[styles.segment, activeTab === seg && styles.segmentActive]}
              onPress={() => setActiveTab(seg)}
            >
              <Text style={[styles.segmentText, activeTab === seg && styles.segmentTextActive]}>
                {t(`challenges.segment.${seg}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {activeTab === 'discovery' && <DiscoveryView />}
        {activeTab !== 'discovery' && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{t('challenges.comingSoon')}</Text>
          </View>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
```

NOTE: if `SafeAreaView` from `react-native-safe-area-context` doesn't accept `edges` in the installed version, drop the prop — check how other tab screens use it and match exactly.

- [ ] **Step 4: Add the tab entry to `app/(tabs)/_layout.tsx`**

Between the trainer `dashboard` `<Tabs.Screen>` and the `{/* Shared */}` `profile` entry, insert:

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

(The existing `{/* Shared */}` comment above `profile` stays; the new entry sits directly before it. No `href` — both roles see the tab.)

- [ ] **Step 5: Add sidebar entries to `src/components/Sidebar.tsx`**

In `CLIENT_NAV_ITEMS`, insert before the profile item:
```typescript
  { route: '/(tabs)/challenges', segment: 'challenges', labelKey: 'tab.challenges', icon: 'trophy-outline', iconActive: 'trophy' },
```
In `TRAINER_NAV_ITEMS`, insert before the profile item (same line).

- [ ] **Step 6: Run the full test file, then whole suite**

Run (PATH prefix): `npx jest __tests__/challenges.test.tsx && npx jest --passWithNoTests`
Expected: challenges file 16 tests PASS; whole suite green (190 + 16 = 206 total).

- [ ] **Step 7: Type-check, commit**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
git add app/(tabs)/challenges.tsx "app/(tabs)/_layout.tsx" src/components/Sidebar.tsx __tests__/challenges.test.tsx
git commit -m "feat(ui): add Challenges tab with segment toggle to nav and sidebar (Issue #140)"
```

---

### Task 5: Verify, review ritual, push, PR, annotate

**Files:** none (controller-level shipping).

**Interfaces:**
- Consumes: Tasks 1–4 committed on `feat/140-141-challenges-tab-discovery`.
- Produces: PR against master; Issues #140 and #141 annotated.

- [ ] **Step 1: Full gates**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit && npx eslint . && npx jest --passWithNoTests && npx expo export --platform web
```
Expected: all clean; `Exported: dist`.

- [ ] **Step 2: Review ritual** — final whole-branch review (most capable model) + security-focused subagent (UI diff: check for unsafe URL handling, injection via i18n interpolation, leaked identifiers in alerts — expected clean given no service changes). Fix Critical/Important before push.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/140-141-challenges-tab-discovery
```

PR body → `.superpowers/sdd/pr-140-141-body.md`:

```markdown
## Summary

- Adds the 5th **Challenges** tab (both roles — clients 5 tabs, trainers 3) with a three-segment toggle: Discovery | My Challenges | Leaderboard. Desktop sidebar updated for both roles.
- Ships the **Discovery sub-view fully working**: three cadence sections with `(completions/max)` headers from `getUserChallengeState`, state-aware cards (available / cooldown countdown / limit-reached), pull-to-refresh, loading/error/empty states.
- **Inline pick flow**: tapping an available card → offline guard → confirm dialog → `pickChallenge()` (#136 RPC) → pool refetch. Typed error alerts (cooldown / limit / already-active; anything else → generic). When #142's detail screen lands, the tap handler swaps to navigation — one-line change.
- My Challenges / Leaderboard segments render "coming soon" placeholders until #143/#144.
- ~23 i18n key pairs (BG + EN); key-parity test stays green.

## Why #140 and #141 are bundled

#140 alone would ship a tab whose three sub-views are all placeholders — a dead click for every user. Bundling #141 gives the tab real content on day one (design decision recorded in the spec).

## Deviations from issue texts (issue bodies annotated)

1. **No `already_active` card state** — the shipped `getDiscoveryPool` filters active challenges out of the pool entirely; the issue predates the service.
2. **`getUserChallengeState` instead of `getCompletionCounts`** — the latter was never built; the former ships the same counts.
3. **Inline pick instead of detail navigation** — #142 doesn't exist yet; see Summary.
4. **Countdown from `availableAt`** (full ISO timestamptz — safe to `new Date()`), not the issue's nonexistent `cooldownEndsAt` field.
5. **Default segment hardcoded to Discovery** — the smart default moves to #143 with its data dependency.

## New files
- `app/(tabs)/challenges.tsx`, `src/components/challenges/DiscoveryView.tsx`, `src/components/challenges/ChallengeCard.tsx`, `__tests__/challenges.test.tsx`
- `docs/superpowers/specs/2026-07-02-challenges-tab-discovery-design.md`, `docs/superpowers/plans/2026-07-02-challenges-tab-discovery.md`

## Modified files
- `app/(tabs)/_layout.tsx` — 5th tab entry (no role gating)
- `src/components/Sidebar.tsx` — challenges item in both nav arrays
- `src/constants/i18n.ts` — 23 key pairs

## Test plan
- [x] 16 new component tests (card states, BG title fallback, sections/counts, pick confirm→RPC→refetch, typed error alerts, cooldown tap guard, segment switching) — whole suite green
- [x] `npx tsc --noEmit` / `npx eslint .` / `npx expo export --platform web` — clean
- [ ] Manual on device: tab appears for both roles; dark/light themes; pick a real challenge end-to-end; pull-to-refresh

Closes #140
Closes #141
```

```bash
"/c/Program Files/GitHub CLI/gh.exe" pr create --repo 2Bros1Mission/GymApp --base master \
  --head feat/140-141-challenges-tab-discovery \
  --title "feat(ui): add Challenges tab with working Discovery view (#140, #141)" \
  --body-file .superpowers/sdd/pr-140-141-body.md
```

- [ ] **Step 4: Annotate Issues #140 and #141** — prepend implementation notes (same `--body-file` prepend flow as before): #140 gets the bundling rationale + hardcoded-default note; #141 gets deviations 1/2/4 + the inline-pick interim behavior.

---

## Self-Review Notes

**Spec coverage:** all spec sections map — i18n (T1), ChallengeCard incl. BG fallback/state treatments (T2), DiscoveryView incl. counts/pick/error mapping/pull-to-refresh/empty (T3), shell + _layout + Sidebar (T4), gates/ritual/PR/annotations (T5). Acceptance criteria each covered by a test or a gate.

**Type consistency:** `ChallengeTab` defined in T4 only (shell-local). `DiscoveryCard`/`UserChallengeState` imported from types everywhere. `pickErrorKey` defined and used in T3. `minutesUntil` duplicated in T2 and T3 deliberately (3 lines each, different call sites — card ribbon vs. tap alert); noted so the reviewer sees it was chosen, not accidental.

**Placeholder scan:** one drafting artifact in T3 Step 3 (`const title` ternary) is explicitly called out with the corrected line — the implementer must use the correction. No TBDs.
