import { View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Моля, попълни всички полета');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signInError } = await signIn(email.trim(), password);

    if (signInError) {
      setError(signInError);
      setLoading(false);
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

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="barbell" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Добре дошъл!</Text>
            <Text style={styles.subtitle}>Влез в своя акаунт</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Имейл"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Парола"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
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

            <Pressable style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>Забравена парола?</Text>
            </Pressable>

            {error !== '' && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Влез</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            style={styles.switchAuth}
            onPress={() => router.replace('/(auth)/signup')}
          >
            <Text style={styles.switchAuthText}>
              Нямаш акаунт?{' '}
              <Text style={styles.switchAuthLink}>Регистрирай се</Text>
            </Text>
          </Pressable>
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
  header: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryDark + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
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
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: Spacing.sm,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
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
});
