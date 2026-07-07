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
