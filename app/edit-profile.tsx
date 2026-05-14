import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { supabase } from '../src/lib/supabase';
import { useOfflineGuard } from '../src/hooks/useOfflineGuard';

const GOALS = [
  'lose_weight',
  'build_muscle',
  'get_stronger',
  'stay_healthy',
  'improve_endurance',
] as const;

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  avatarSection: { alignItems: 'center', marginBottom: Spacing.xl },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 36, fontWeight: '700', color: colors.white },
  form: { gap: Spacing.lg },
  fieldGroup: { gap: Spacing.xs },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginLeft: Spacing.sm },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: FontSize.md, color: colors.text, paddingVertical: Spacing.sm },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  goalOption: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  goalOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  goalOptionText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
  goalOptionTextActive: { color: colors.white },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.error + '15', borderRadius: BorderRadius.md, padding: Spacing.md },
  errorText: { fontSize: FontSize.sm, color: colors.error, flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.success + '15', borderRadius: BorderRadius.md, padding: Spacing.md },
  successText: { fontSize: FontSize.sm, color: colors.success, flex: 1 },
  saveButton: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md + 2, alignItems: 'center', marginTop: Spacing.sm },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
});

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { guardAction } = useOfflineGuard();

  const [name, setName] = useState(profile?.name ?? '');
  const [weight, setWeight] = useState(profile?.weight ? String(profile.weight) : '');
  const [height, setHeight] = useState(profile?.height ? String(profile.height) : '');
  const [goal, setGoal] = useState(profile?.goal ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const handleSave = () => {
    guardAction(async () => {
      if (!name.trim()) return;
      if (!profile?.id) return;

      setSaving(true);
      setError('');
      setSuccess(false);

      const updates = {
        name: name.trim(),
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        goal: goal || null,
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      setSaving(false);

      if (updateError) {
        setError(t('profile.saveError'));
      } else {
        setSuccess(true);
        await refreshProfile();
        setTimeout(() => router.back(), 800);
      }
    });
  };

  const hasChanges =
    name.trim() !== (profile?.name ?? '') ||
    (weight ? parseFloat(weight) : null) !== (profile?.weight ?? null) ||
    (height ? parseFloat(height) : null) !== (profile?.height ?? null) ||
    (goal || null) !== (profile?.goal ?? null);

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
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>{t('profile.editProfile')}</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name.trim() ? name.trim().charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('auth.name')}</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={(v) => { setName(v); setError(''); setSuccess(false); }}
                  autoCapitalize="words"
                  maxLength={50}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profile.weightKg')}</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="scale-outline" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={weight}
                  onChangeText={(v) => { setWeight(v.replace(/[^0-9.]/g, '')); setError(''); setSuccess(false); }}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  placeholder="--"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profile.height')}</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="resize-outline" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={height}
                  onChangeText={(v) => { setHeight(v.replace(/[^0-9.]/g, '')); setError(''); setSuccess(false); }}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  placeholder="--"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profile.selectGoal')}</Text>
              <View style={styles.goalGrid}>
                {GOALS.map((g) => (
                  <Pressable
                    key={g}
                    style={[styles.goalOption, goal === g && styles.goalOptionActive]}
                    onPress={() => { setGoal(goal === g ? '' : g); setError(''); setSuccess(false); }}
                  >
                    <Text style={[styles.goalOptionText, goal === g && styles.goalOptionTextActive]}>
                      {t(`goal.${g}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {error !== '' && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {success && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.successText}>{t('profile.saveSuccess')}</Text>
              </View>
            )}

            <Pressable
              style={[styles.saveButton, (!hasChanges || saving || !name.trim()) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving || !name.trim()}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>{t('profile.save')}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
