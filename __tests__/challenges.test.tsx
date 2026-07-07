import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

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
