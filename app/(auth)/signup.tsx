import { View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'trainer'>('client');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Inline validation errors
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateName = (value: string): string => {
    if (!value.trim()) return t('auth.nameRequired');
    if (value.trim().length > 50) return t('auth.nameTooLong');
    return '';
  };

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

  const handleNameChange = (value: string) => {
    setName(value);
    if (nameError) setNameError('');
    if (error) setError('');
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

  const isFormValid = name.trim() !== '' && email.trim() !== '' && password.trim() !== '';

  const handleSignup = async () => {
    const nErr = validateName(name);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setNameError(nErr);
    setEmailError(eErr);
    setPasswordError(pErr);

    if (nErr || eErr || pErr) return;

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(email.trim(), password, name.trim(), role);

    setLoading(false);

    if (signUpError) {
      setError(signUpError);
    } else {
      setSuccess(true);
    }
  };

  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

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
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>

          {success ? (
            <View style={styles.successContainer}>
              <Ionicons name="mail-outline" size={64} color={Colors.success} />
              <Text style={styles.successTitle}>{t('auth.checkEmail')}</Text>
              <Text style={styles.successText}>
                {t('auth.confirmationSent').replace('{email}', email)}
              </Text>
              <Pressable
                style={styles.submitButton}
                onPress={() => router.replace('/(auth)/login')}
              >
                <Text style={styles.submitButtonText}>{t('auth.goToLogin')}</Text>
              </Pressable>
            </View>
          ) : (
          <>
          <Text style={styles.title}>{t('auth.createAccount')}</Text>
          <Text style={styles.subtitle}>{t('auth.signupSubtitle')}</Text>

          <View style={styles.roleSelector}>
            <Pressable
              style={[styles.roleOption, role === 'client' && styles.roleOptionActive]}
              onPress={() => setRole('client')}
            >
              <Ionicons
                name="person"
                size={22}
                color={role === 'client' ? Colors.white : Colors.textMuted}
              />
              <Text style={[styles.roleText, role === 'client' && styles.roleTextActive]}>
                {t('role.client')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.roleOption, role === 'trainer' && styles.roleOptionActive]}
              onPress={() => setRole('trainer')}
            >
              <Ionicons
                name="fitness"
                size={22}
                color={role === 'trainer' ? Colors.white : Colors.textMuted}
              />
              <Text style={[styles.roleText, role === 'trainer' && styles.roleTextActive]}>
                {t('role.trainer')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <View>
              <View style={[styles.inputContainer, nameError ? styles.inputContainerError : undefined]}>
                <Ionicons name="person-outline" size={20} color={nameError ? Colors.error : Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.name')}
                  placeholderTextColor={Colors.textMuted}
                  value={name}
                  onChangeText={handleNameChange}
                  onBlur={() => { if (name.trim()) setNameError(validateName(name)); }}
                  autoCapitalize="words"
                  maxLength={50}
                />
              </View>
              {nameError !== '' && <Text style={styles.fieldError}>{nameError}</Text>}
            </View>

            <View>
              <View style={[styles.inputContainer, emailError ? styles.inputContainerError : undefined]}>
                <Ionicons name="mail-outline" size={20} color={emailError ? Colors.error : Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.email')}
                  placeholderTextColor={Colors.textMuted}
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
                <Ionicons name="lock-closed-outline" size={20} color={passwordError ? Colors.error : Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.password')}
                  placeholderTextColor={Colors.textMuted}
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
                    color={Colors.textMuted}
                  />
                </Pressable>
              </View>
              {passwordError !== '' && <Text style={styles.fieldError}>{passwordError}</Text>}
            </View>

            {error !== '' && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.submitButton, (loading || !isFormValid) && styles.submitButtonDisabled]}
              onPress={handleSignup}
              disabled={loading || !isFormValid}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>{t('auth.signup')}</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            style={styles.switchAuth}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.switchAuthText}>
              {t('auth.hasAccount')}{' '}
              <Text style={styles.switchAuthLink}>{t('auth.login')}</Text>
            </Text>
          </Pressable>
          </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.text,
    marginTop: Spacing.xl,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  roleOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  roleText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  roleTextActive: {
    color: Colors.white,
  },
  form: {
    gap: Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputContainerError: {
    borderColor: Colors.error,
  },
  fieldError: {
    fontSize: FontSize.xs,
    color: Colors.error,
    marginTop: 4,
    marginLeft: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: Spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    flex: 1,
  },
  submitButton: {
    backgroundColor: Colors.primary,
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
    color: Colors.white,
  },
  switchAuth: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  switchAuthText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  switchAuthLink: {
    color: Colors.primary,
    fontWeight: '700',
  },
  successContainer: {
    alignItems: 'center',
    marginTop: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  successText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
});
