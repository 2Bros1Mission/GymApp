import { View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useOfflineGuard } from '../../src/hooks/useOfflineGuard';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const { guardAction } = useOfflineGuard();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Inline validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (value: string): string => {
    if (!value.trim()) return t('auth.invalidEmail');
    if (!EMAIL_REGEX.test(value.trim())) return t('auth.invalidEmail');
    return '';
  };

  const validatePassword = (value: string): string => {
    if (!value) return t('auth.passwordRequired');
    if (value.length < 6) return t('auth.passwordMinLength');
    return '';
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError('');
    if (error) setError('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (passwordError) setPasswordError('');
    if (error) setError('');
  };

  const isFormValid = email.trim() !== '' && password.trim() !== '';

  const handleForgotPassword = () => {
    guardAction(async () => {
      const eErr = validateEmail(email);
      if (eErr) {
        setEmailError(eErr);
        return;
      }

      setResetLoading(true);
      setError('');
      setResetSent(false);

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());

      setResetLoading(false);

      if (resetError) {
        setError(resetError.message);
      } else {
        setResetSent(true);
      }
    });
  };

  const handleLogin = () => {
    guardAction(async () => {
      const eErr = validateEmail(email);
      const pErr = validatePassword(password);
      setEmailError(eErr);
      setPasswordError(pErr);

      if (eErr || pErr) return;

      setLoading(true);
      setError('');

      const { error: signInError } = await signIn(email.trim(), password);

      if (signInError) {
        setError(signInError);
        setLoading(false);
      }
    });
  };

  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="barbell" size={40} color={colors.primary} />
            </View>
            <Text style={styles.title}>{t('auth.loginTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
          </View>

          <View style={styles.form}>
            <View>
              <View style={[styles.inputContainer, emailError ? styles.inputContainerError : undefined]}>
                <Ionicons name="mail-outline" size={20} color={emailError ? colors.error : colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.email')}
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={handleEmailChange}
                  onBlur={() => { if (email.trim()) setEmailError(validateEmail(email)); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {emailError !== '' && <Text style={styles.fieldError}>{emailError}</Text>}
            </View>

            <View>
              <View style={[styles.inputContainer, passwordError ? styles.inputContainerError : undefined]}>
                <Ionicons name="lock-closed-outline" size={20} color={passwordError ? colors.error : colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.password')}
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={handlePasswordChange}
                  onBlur={() => { if (password) setPasswordError(validatePassword(password)); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>
              {passwordError !== '' && <Text style={styles.fieldError}>{passwordError}</Text>}
            </View>

            <Pressable style={styles.forgotPassword} onPress={handleForgotPassword} disabled={resetLoading}>
              <Text style={styles.forgotPasswordText}>
                {resetLoading ? t('common.loading') : t('auth.forgotPassword')}
              </Text>
            </Pressable>

            {resetSent && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.successText}>{t('auth.resetEmailSent')}</Text>
              </View>
            )}

            {error !== '' && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.submitButton, (loading || !isFormValid) && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={loading || !isFormValid}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>{t('auth.login')}</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            style={styles.switchAuth}
            onPress={() => router.replace('/(auth)/signup')}
          >
            <Text style={styles.switchAuthText}>
              {t('auth.noAccount')}{' '}
              <Text style={styles.switchAuthLink}>{t('auth.signup')}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  scrollContentWide: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryDark + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: colors.textSecondary,
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputContainerError: {
    borderColor: colors.error,
  },
  fieldError: {
    fontSize: FontSize.xs,
    color: colors.error,
    marginTop: 4,
    marginLeft: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: colors.text,
    paddingVertical: Spacing.sm,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    fontSize: FontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.success + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  successText: {
    fontSize: FontSize.sm,
    color: colors.success,
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.error + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: colors.error,
    flex: 1,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
  switchAuth: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  switchAuthText: {
    fontSize: FontSize.md,
    color: colors.textSecondary,
  },
  switchAuthLink: {
    color: colors.primary,
    fontWeight: '700',
  },
});
