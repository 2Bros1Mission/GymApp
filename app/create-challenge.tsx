import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ColorPalette, FontSize, Spacing, BorderRadius } from '../src/constants/theme';
import { useTheme } from '../src/contexts/ThemeContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useAsyncData } from '../src/hooks/useAsyncData';
import { useOfflineGuard } from '../src/hooks/useOfflineGuard';
import { createChallenge } from '../src/lib/challengeService';
import { getTrainerClients } from '../src/lib/trainerService';
import type { ChallengeType, RewardType, DiscountType } from '../src/types';

const CHALLENGE_TYPES: ChallengeType[] = ['frequency', 'streak', 'custom'];
const REWARD_TYPES: RewardType[] = ['badge', 'discount', 'battle_pass', 'custom'];
const DISCOUNT_TYPES: DiscountType[] = ['percentage', 'fixed_amount'];

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: Spacing.md,
      marginBottom: Spacing.lg,
      gap: Spacing.md,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, flex: 1 },

    inputLabel: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
      marginTop: Spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      fontSize: FontSize.md,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    multilineInput: {
      minHeight: 80,
      textAlignVertical: 'top',
    },

    sectionTitle: {
      fontSize: FontSize.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: Spacing.sm,
      marginTop: Spacing.lg,
    },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    chip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: colors.white },

    clientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.sm,
      marginBottom: Spacing.xs,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    clientName: { fontSize: FontSize.md, color: colors.text, flex: 1 },
    clientEmail: { fontSize: FontSize.xs, color: colors.textSecondary },

    formActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
    formBtn: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
    },
    cancelBtn: { backgroundColor: colors.surface },
    cancelBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
    saveBtn: { backgroundColor: colors.primary },
    saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },

    emptyText: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: Spacing.md,
    },
  });

export default function CreateChallengeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { guardAction } = useOfflineGuard();

  // Form state
  const [titleValue, setTitleValue] = useState('');
  const [titleBg, setTitleBg] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionBg, setDescriptionBg] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('frequency');
  const [targetValue, setTargetValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [rewardType, setRewardType] = useState<RewardType | null>(null);
  const [rewardDescription, setRewardDescription] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [battlePassTiers, setBattlePassTiers] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch trainer's clients
  const clientsFetcher = useCallback(async () => {
    if (!user?.id) return [];
    return getTrainerClients(user.id);
  }, [user?.id]);

  const { data: clients, loading: clientsLoading } = useAsyncData({
    fetcher: clientsFetcher,
    defaultValue: [],
    enabled: !!user?.id,
  });

  const toggleClient = useCallback((clientId: string) => {
    setSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user?.id || !titleValue.trim()) {
      Alert.alert(t('common.error'), t('challenges.titleRequired'));
      return;
    }
    const numTarget = parseFloat(targetValue);
    if (isNaN(numTarget) || numTarget <= 0) {
      Alert.alert(t('common.error'), t('challenges.targetRequired'));
      return;
    }
    if (!startDate.trim() || !endDate.trim()) {
      Alert.alert(t('common.error'), t('challenges.datesRequired'));
      return;
    }

    guardAction(async () => {
      setSaving(true);
      try {
        const result = await createChallenge({
          creatorId: user.id,
          title: titleValue.trim(),
          titleBg: titleBg.trim() || undefined,
          description: description.trim() || undefined,
          descriptionBg: descriptionBg.trim() || undefined,
          challengeType,
          targetValue: numTarget,
          startDate: startDate.trim(),
          endDate: endDate.trim(),
          rewardType: rewardType ?? undefined,
          rewardDescription: rewardDescription.trim() || undefined,
          discountValue: rewardType === 'discount' && discountValue ? parseFloat(discountValue) : undefined,
          discountType: rewardType === 'discount' ? discountType : undefined,
          participantIds: selectedClients,
        });
        if (result.error) {
          Alert.alert(t('common.error'), result.error);
        } else {
          router.back();
        }
      } finally {
        setSaving(false);
      }
    });
  }, [
    user?.id,
    titleValue,
    titleBg,
    description,
    descriptionBg,
    challengeType,
    targetValue,
    startDate,
    endDate,
    rewardType,
    rewardDescription,
    discountValue,
    discountType,
    selectedClients,
    guardAction,
    router,
    t,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('challenges.create')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Title */}
        <Text style={styles.inputLabel}>{t('challenges.titleField')}</Text>
        <TextInput
          style={styles.input}
          value={titleValue}
          onChangeText={setTitleValue}
          placeholder={t('challenges.titleField')}
          placeholderTextColor={colors.textMuted}
        />

        {/* Title BG */}
        <Text style={styles.inputLabel}>{t('challenges.titleBg')}</Text>
        <TextInput
          style={styles.input}
          value={titleBg}
          onChangeText={setTitleBg}
          placeholder={t('challenges.titleBgPlaceholder')}
          placeholderTextColor={colors.textMuted}
        />

        {/* Description */}
        <Text style={styles.inputLabel}>{t('challenges.description')}</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('challenges.description')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {/* Description BG */}
        <Text style={styles.inputLabel}>{t('challenges.descriptionBg')}</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={descriptionBg}
          onChangeText={setDescriptionBg}
          placeholder={t('challenges.descriptionBgPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {/* Challenge Type */}
        <Text style={styles.sectionTitle}>{t('challenges.type')}</Text>
        <View style={styles.chipRow}>
          {CHALLENGE_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, challengeType === type && styles.chipActive]}
              onPress={() => setChallengeType(type)}
            >
              <Text style={[styles.chipText, challengeType === type && styles.chipTextActive]}>
                {t(`challenges.${type}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Target Value */}
        <Text style={styles.inputLabel}>{t('challenges.targetValue')}</Text>
        <TextInput
          style={styles.input}
          value={targetValue}
          onChangeText={setTargetValue}
          placeholder={
            challengeType === 'frequency'
              ? '20'
              : challengeType === 'streak'
                ? '14'
                : '0'
          }
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />

        {/* Start Date */}
        <Text style={styles.inputLabel}>{t('challenges.startDate')}</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
        />

        {/* End Date */}
        <Text style={styles.inputLabel}>{t('challenges.endDate')}</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
        />

        {/* Participants */}
        <Text style={styles.sectionTitle}>{t('challenges.participants')}</Text>
        {clientsLoading && <ActivityIndicator color={colors.primary} />}
        {!clientsLoading && clients.length === 0 && (
          <Text style={styles.emptyText}>{t('challenges.noClients')}</Text>
        )}
        {clients.map((client) => {
          const selected = selectedClients.includes(client.clientId);
          return (
            <Pressable
              key={client.clientId}
              style={styles.clientRow}
              onPress={() => toggleClient(client.clientId)}
            >
              <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                {selected && <Ionicons name="checkmark" size={16} color={colors.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{client.clientName ?? client.clientEmail ?? client.clientId}</Text>
                {client.clientEmail && client.clientName && (
                  <Text style={styles.clientEmail}>{client.clientEmail}</Text>
                )}
              </View>
            </Pressable>
          );
        })}

        {/* Reward Type */}
        <Text style={styles.sectionTitle}>{t('challenges.rewardType')}</Text>
        <View style={styles.chipRow}>
          {REWARD_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, rewardType === type && styles.chipActive]}
              onPress={() => setRewardType(rewardType === type ? null : type)}
            >
              <Text style={[styles.chipText, rewardType === type && styles.chipTextActive]}>
                {t(`challenges.reward.${type}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Reward Description (for all reward types) */}
        {rewardType && (
          <>
            <Text style={styles.inputLabel}>{t('challenges.rewardDescription')}</Text>
            <TextInput
              style={styles.input}
              value={rewardDescription}
              onChangeText={setRewardDescription}
              placeholder={t('challenges.rewardDescription')}
              placeholderTextColor={colors.textMuted}
            />
          </>
        )}

        {/* Discount-specific fields */}
        {rewardType === 'discount' && (
          <>
            <Text style={styles.inputLabel}>{t('challenges.discountValue')}</Text>
            <TextInput
              style={styles.input}
              value={discountValue}
              onChangeText={setDiscountValue}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>{t('challenges.discountType')}</Text>
            <View style={styles.chipRow}>
              {DISCOUNT_TYPES.map((dt) => (
                <Pressable
                  key={dt}
                  style={[styles.chip, discountType === dt && styles.chipActive]}
                  onPress={() => setDiscountType(dt)}
                >
                  <Text style={[styles.chipText, discountType === dt && styles.chipTextActive]}>
                    {t(`challenges.discount.${dt}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Battle pass tier config (simplified v1) */}
        {rewardType === 'battle_pass' && (
          <>
            <Text style={styles.inputLabel}>{t('challenges.battlePassTiers')}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={battlePassTiers}
              onChangeText={setBattlePassTiers}
              placeholder={t('challenges.battlePassPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </>
        )}

        {/* Actions */}
        <View style={styles.formActions}>
          <Pressable style={[styles.formBtn, styles.cancelBtn]} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable style={[styles.formBtn, styles.saveBtn]} onPress={handleSubmit} disabled={saving}>
            <Text style={styles.saveBtnText}>
              {saving ? '...' : t('challenges.createBtn')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
