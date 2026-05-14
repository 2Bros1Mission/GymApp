import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useAsyncData } from '../src/hooks/useAsyncData';
import { ErrorCard } from '../src/components/ErrorCard';
import { confirmAction } from '../src/lib/confirm';
import { useOfflineGuard } from '../src/hooks/useOfflineGuard';
import {
  getTrainerCode,
  getTrainerClients,
  getPendingRequests,
  removeConnection,
  approveConnection,
  rejectConnection,
} from '../src/lib/trainerService';
import type { TrainerClient } from '../src/types';

interface ClientsData {
  clients: TrainerClient[];
  pendingRequests: TrainerClient[];
  trainerCode: string | null;
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md, marginTop: Spacing.lg },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, marginBottom: Spacing.md },
  generateBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  codeCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.primary + '30' },
  codeLabel: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
  codeText: { fontSize: 32, fontWeight: '800', color: colors.primary, letterSpacing: 6, marginBottom: Spacing.sm },
  codeExpiry: { fontSize: FontSize.xs, color: colors.textMuted },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: colors.primaryDark + '30', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.sm },
  copyBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.primary },
  clientCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  clientAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  clientAvatarText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  clientInfo: { flex: 1 },
  clientName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  clientEmail: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  clientDate: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 2 },
  removeBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  emptyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  inviteItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  inviteCode: { fontSize: FontSize.md, fontWeight: '700', color: colors.primary, letterSpacing: 2 },
  inviteExpiry: { fontSize: FontSize.xs, color: colors.textMuted },
  pendingCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.warning + '30' },
  pendingRow: { flexDirection: 'row', alignItems: 'center' },
  pendingActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, marginLeft: 56 },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: colors.success + '15', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  approveBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.success },
  rejectBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: colors.error + '15', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  rejectBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.error },
  pendingEmpty: { fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
});

export default function TrainerClientsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const { guardAction } = useOfflineGuard();

  const [copied, setCopied] = useState(false);

  const fetcher = useCallback(async (): Promise<ClientsData> => {
    if (!user) return { clients: [], pendingRequests: [], trainerCode: null };
    const [clients, pendingRequests, trainerCode] = await Promise.all([
      getTrainerClients(user.id),
      getPendingRequests(user.id),
      getTrainerCode(user.id),
    ]);
    return { clients, pendingRequests, trainerCode };
  }, [user]);

  const { data, loading, error, retry } = useAsyncData({
    fetcher,
    defaultValue: { clients: [], pendingRequests: [], trainerCode: null } as ClientsData,
    enabled: !!user,
  });

  const { clients, pendingRequests, trainerCode } = data;

  const handleCopyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available on some platforms
    }
  };

  const handleApprove = (connection: TrainerClient) => {
    guardAction(async () => {
      const result = await approveConnection(connection.id);
      if (result.error) {
        Alert.alert(t('common.error'), result.error);
        return;
      }
      retry();
    });
  };

  const handleReject = (connection: TrainerClient) => {
    guardAction(() => {
      confirmAction(
        t('trainer.reject'),
        t('trainer.rejectConfirm'),
        t('trainer.reject'),
        t('common.cancel'),
        async () => {
          const result = await rejectConnection(connection.id);
          if (result.error) {
            Alert.alert(t('common.error'), result.error);
            return;
          }
          retry();
        },
      );
    });
  };

  const handleRemoveClient = (connection: TrainerClient) => {
    guardAction(() => {
      const doRemove = async () => {
        const result = await removeConnection(connection.id);
        if (result.error) {
          Alert.alert(t('common.error'), result.error);
          return;
        }
        retry();
      };

      confirmAction(
        t('trainer.removeClient'),
        t('trainer.removeConfirm'),
        t('trainer.removeClient'),
        t('common.cancel'),
        doRemove,
      );
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('trainer.myClients')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}

        {/* Permanent trainer code */}
        <Text style={styles.sectionTitle}>{t('trainer.yourCode')}</Text>

        {trainerCode ? (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{t('trainer.shareCode')}</Text>
            <Text style={styles.codeText}>{trainerCode}</Text>
            <Text style={styles.codeExpiry}>{t('trainer.yourCodeDescription')}</Text>
            <Pressable style={styles.copyBtn} onPress={() => handleCopyCode(trainerCode)}>
              <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={16} color={colors.primary} />
              <Text style={styles.copyBtnText}>{copied ? t('trainer.codeCopied') : t('trainer.copyCode')}</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.md }} />
        )}

        {/* Pending requests */}
        <Text style={styles.sectionTitle}>{t('trainer.pendingRequests')}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.md }} />
        ) : pendingRequests.length > 0 ? (
          pendingRequests.map((request) => (
            <View key={request.id} style={styles.pendingCard}>
              <View style={styles.pendingRow}>
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientAvatarText}>
                    {(request.clientName ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{request.clientName ?? '--'}</Text>
                  <Text style={styles.clientEmail}>{request.clientEmail ?? ''}</Text>
                </View>
              </View>
              <View style={styles.pendingActions}>
                <Pressable style={styles.approveBtn} onPress={() => handleApprove(request)}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.approveBtnText}>{t('trainer.approve')}</Text>
                </Pressable>
                <Pressable style={styles.rejectBtn} onPress={() => handleReject(request)}>
                  <Ionicons name="close-circle" size={16} color={colors.error} />
                  <Text style={styles.rejectBtnText}>{t('trainer.reject')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.pendingEmpty}>{t('trainer.noPending')}</Text>
        )}

        {/* Connected clients */}
        <Text style={styles.sectionTitle}>{t('trainer.myClients')}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.lg }} />
        ) : !error && clients.length > 0 ? (
          clients.map((client) => (
            <Pressable
              key={client.id}
              style={styles.clientCard}
              onPress={() => router.push(`/client-progress?clientId=${client.clientId}`)}
            >
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>
                  {(client.clientName ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.clientName ?? '--'}</Text>
                <Text style={styles.clientEmail}>{client.clientEmail ?? ''}</Text>
                <Text style={styles.clientDate}>
                  {t('trainer.connectedSince')} {formatDate(client.connectedAt)}
                </Text>
              </View>
              <Pressable
                style={styles.removeBtn}
                onPress={() => handleRemoveClient(client)}
                onStartShouldSetResponder={() => true}
              >
                <Ionicons name="close-circle-outline" size={24} color={colors.error} />
              </Pressable>
            </Pressable>
          ))
        ) : !error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('trainer.noClients')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
