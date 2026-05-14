import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useAsyncData } from '../src/hooks/useAsyncData';
import { ErrorCard } from '../src/components/ErrorCard';
import { confirmAction } from '../src/lib/confirm';
import { useOfflineGuard } from '../src/hooks/useOfflineGuard';
import { redeemInviteCode, getClientTrainer, removeConnection, confirmConnection } from '../src/lib/trainerService';
import type { TrainerClient } from '../src/types';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md, marginTop: Spacing.lg },
  inputRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  codeInput: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: FontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center', letterSpacing: 4, borderWidth: 1, borderColor: colors.border, textTransform: 'uppercase' },
  connectBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  connectBtnDisabled: { opacity: 0.5 },
  connectBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  trainerCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: colors.primary + '30' },
  trainerAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  trainerAvatarText: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.white },
  trainerName: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  trainerEmail: { fontSize: FontSize.sm, color: colors.textSecondary },
  trainerDate: { fontSize: FontSize.xs, color: colors.textMuted },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.error + '15', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.sm },
  disconnectBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.error },
  emptyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.success + '15', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  successText: { fontSize: FontSize.sm, color: colors.success, flex: 1 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.error + '15', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { fontSize: FontSize.sm, color: colors.error, flex: 1 },
  pendingCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: colors.warning + '40' },
  pendingBadge: { backgroundColor: colors.warning + '20', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  pendingBadgeText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.warning },
  rejectedCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: colors.error + '40' },
  rejectedBadge: { backgroundColor: colors.error + '20', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  rejectedBadgeText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.error },
  rejectedMessage: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  confirmPromptText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
  tryAnotherBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  tryAnotherBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
  confirmCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: colors.primary + '40' },
  confirmBtnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  confirmBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, alignItems: 'center' },
  confirmBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  cancelBtn: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
});

interface PendingConfirmation {
  connectionId: string;
  trainerName: string;
  trainerEmail: string;
}

export default function MyTrainerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';
  const { guardAction } = useOfflineGuard();

  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const fetcher = useCallback(async (): Promise<TrainerClient | null> => {
    if (!user) return null;
    return getClientTrainer(user.id);
  }, [user]);

  const { data: trainer, loading, error, retry } = useAsyncData({
    fetcher,
    defaultValue: null as TrainerClient | null,
    enabled: !!user,
  });

  const handleConnect = () => {
    guardAction(async () => {
      if (!code.trim() || code.trim().length < 6) return;
      setConnecting(true);
      setFormError('');
      setSuccess('');

      const result = await redeemInviteCode(code.trim());
      setConnecting(false);

      if (result.success) {
        setPendingConfirmation({
          connectionId: result.connectionId!,
          trainerName: result.trainerName ?? '--',
          trainerEmail: result.trainerEmail ?? '',
        });
        setCode('');
      } else {
        const errorKey = result.error === 'invalid_code' ? 'client.errorInvalidCode'
          : result.error === 'already_connected' ? 'client.errorAlreadyConnected'
          : result.error === 'only_clients' ? 'client.errorOnlyClients'
          : 'client.errorUnknown';
        setFormError(t(errorKey));
      }
    });
  };

  const handleConfirm = () => {
    guardAction(async () => {
      if (!pendingConfirmation) return;
      setConfirming(true);

      const result = await confirmConnection(pendingConfirmation.connectionId);
      setConfirming(false);

      if (result.success) {
        setPendingConfirmation(null);
        setSuccess(t('client.pendingApproval'));
        retry();
      } else {
        setFormError(result.error ?? t('client.errorUnknown'));
      }
    });
  };

  const handleCancelConfirmation = () => {
    guardAction(async () => {
      if (!pendingConfirmation) return;
      await removeConnection(pendingConfirmation.connectionId);
      setPendingConfirmation(null);
      retry();
    });
  };

  const handleDisconnect = () => {
    if (!trainer) return;

    guardAction(() => {
      const doDisconnect = async () => {
        const result = await removeConnection(trainer.id);
        if (result.error) {
          Alert.alert(t('common.error'), result.error);
          return;
        }
        setSuccess(t('client.disconnected'));
        retry();
      };

      confirmAction(
        t('client.disconnect'),
        t('client.disconnectConfirm'),
        t('client.disconnect'),
        t('common.cancel'),
        doDisconnect,
      );
    });
  };

  const handleDismissRejection = () => {
    guardAction(async () => {
      if (!trainer) return;
      const result = await removeConnection(trainer.id);
      if (result.error) {
        Alert.alert(t('common.error'), result.error);
        return;
      }
      retry();
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  };

  const renderTrainerContent = () => {
    if (loading) {
      return <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />;
    }

    if (error) {
      return <ErrorCard message={error} onRetry={retry} loading={loading} />;
    }

    // Show confirmation card if user just entered a code
    if (pendingConfirmation) {
      return (
        <>
          <Text style={styles.sectionTitle}>{t('client.confirmConnection')}</Text>
          <View style={styles.confirmCard}>
            <View style={styles.trainerAvatar}>
              <Text style={styles.trainerAvatarText}>
                {pendingConfirmation.trainerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.trainerName}>{pendingConfirmation.trainerName}</Text>
            <Text style={styles.trainerEmail}>{pendingConfirmation.trainerEmail}</Text>
            <Text style={styles.confirmPromptText}>
              {t('client.confirmPrompt', { name: pendingConfirmation.trainerName })}
            </Text>
            <View style={styles.confirmBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={handleCancelConfirmation}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.confirmBtn, confirming && styles.connectBtnDisabled]} onPress={handleConfirm} disabled={confirming}>
                {confirming ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.confirmBtnText}>{t('client.confirm')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </>
      );
    }

    // Active connection
    if (trainer && trainer.status === 'active') {
      return (
        <>
          <Text style={styles.sectionTitle}>{t('client.myTrainer')}</Text>
          <View style={styles.trainerCard}>
            <View style={styles.trainerAvatar}>
              <Text style={styles.trainerAvatarText}>
                {(trainer.trainerName ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.trainerName}>{trainer.trainerName ?? '--'}</Text>
            <Text style={styles.trainerEmail}>{trainer.trainerEmail ?? ''}</Text>
            <Text style={styles.trainerDate}>
              {t('trainer.connectedSince')} {formatDate(trainer.connectedAt)}
            </Text>
            <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Ionicons name="close-circle-outline" size={18} color={colors.error} />
              <Text style={styles.disconnectBtnText}>{t('client.disconnect')}</Text>
            </Pressable>
          </View>
        </>
      );
    }

    // Pending connection (client confirmed, waiting on trainer)
    if (trainer && trainer.status === 'pending' && trainer.clientConfirmed) {
      return (
        <>
          <Text style={styles.sectionTitle}>{t('client.myTrainer')}</Text>
          <View style={styles.pendingCard}>
            <View style={styles.trainerAvatar}>
              <Text style={styles.trainerAvatarText}>
                {(trainer.trainerName ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.trainerName}>{trainer.trainerName ?? '--'}</Text>
            <Text style={styles.trainerEmail}>{trainer.trainerEmail ?? ''}</Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{t('client.pendingApproval')}</Text>
            </View>
            <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Ionicons name="close-circle-outline" size={18} color={colors.error} />
              <Text style={styles.disconnectBtnText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </>
      );
    }

    // Pending connection (code entered but not yet confirmed by client — edge case)
    if (trainer && trainer.status === 'pending' && !trainer.clientConfirmed) {
      setPendingConfirmation({
        connectionId: trainer.id,
        trainerName: trainer.trainerName ?? '--',
        trainerEmail: trainer.trainerEmail ?? '',
      });
      return null;
    }

    // Rejected connection
    if (trainer && trainer.status === 'rejected') {
      return (
        <>
          <Text style={styles.sectionTitle}>{t('client.myTrainer')}</Text>
          <View style={styles.rejectedCard}>
            <Ionicons name="close-circle" size={48} color={colors.error} />
            <View style={styles.rejectedBadge}>
              <Text style={styles.rejectedBadgeText}>{t('client.rejected')}</Text>
            </View>
            <Text style={styles.rejectedMessage}>
              {t('client.rejectedMessage', { name: trainer.trainerName ?? '--' })}
            </Text>
            <Pressable style={styles.tryAnotherBtn} onPress={handleDismissRejection}>
              <Ionicons name="refresh" size={18} color={colors.white} />
              <Text style={styles.tryAnotherBtnText}>{t('client.tryAnotherCode')}</Text>
            </Pressable>
          </View>
        </>
      );
    }

    // No trainer — show code entry
    return (
      <>
        <View style={styles.emptyCard}>
          <Ionicons name="person-add-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('client.noTrainer')}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('client.enterCode')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(v) => { setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setFormError(''); setSuccess(''); }}
            placeholder={t('client.codePlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={6}
          />
          <Pressable
            style={[styles.connectBtn, (connecting || code.length < 6) && styles.connectBtnDisabled]}
            onPress={handleConnect}
            disabled={connecting || code.length < 6}
          >
            {connecting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.connectBtnText}>{t('client.connect')}</Text>
            )}
          </Pressable>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('client.myTrainer')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {success !== '' && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.successText}>{success}</Text>
          </View>
        )}

        {formError !== '' && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        )}

        {renderTrainerContent()}
      </ScrollView>
    </SafeAreaView>
  );
}
