import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import LoginScreen from '../app/(auth)/login';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignIn = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
  }),
}));

jest.mock('../src/contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'auth.loginTitle': 'Login',
        'auth.loginSubtitle': 'Welcome back',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.login': 'Log in',
        'auth.forgotPassword': 'Forgot password?',
        'auth.noAccount': "Don't have an account?",
        'auth.signup': 'Sign up',
        'auth.invalidEmail': 'Invalid email',
        'auth.passwordRequired': 'Password required',
        'auth.passwordMinLength': 'Password too short',
        'auth.resetEmailSent': 'Reset email sent',
        'common.loading': 'Loading...',
      };
      return map[key] ?? key;
    },
  }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      surface: '#111',
      text: '#fff',
      textSecondary: '#aaa',
      textMuted: '#666',
      primary: '#6C63FF',
      primaryDark: '#5A52D5',
      error: '#FF6B6B',
      success: '#4CAF50',
      white: '#fff',
      border: '#333',
    },
  }),
}));

jest.mock('../src/hooks/useBreakpoint', () => ({
  useBreakpoint: () => 'sm',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockRouterBack,
    replace: mockRouterReplace,
  }),
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoginScreen', () => {
  it('renders email and password inputs and submit button', () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Log in')).toBeTruthy();
  });

  it('renders forgot password and sign up links', () => {
    const { getByText } = render(<LoginScreen />);

    expect(getByText('Forgot password?')).toBeTruthy();
    expect(getByText('Sign up')).toBeTruthy();
  });

  it('disables submit button when fields are empty', () => {
    const { getByText } = render(<LoginScreen />);

    const button = getByText('Log in');
    fireEvent.press(button);

    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('calls signIn with email and password on valid submit', async () => {
    mockSignIn.mockResolvedValue({ error: null });

    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Log in'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('displays error message on sign-in failure', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid credentials' });

    const { getByPlaceholderText, getByText, findByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Log in'));

    const errorMsg = await findByText('Invalid credentials');
    expect(errorMsg).toBeTruthy();
  });

  it('navigates to signup when link is pressed', () => {
    const { getByText } = render(<LoginScreen />);

    fireEvent.press(getByText('Sign up'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/signup');
  });
});
