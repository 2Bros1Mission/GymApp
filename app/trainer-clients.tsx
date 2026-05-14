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
import { createInviteCode, getActiveInvites, getTrainerClients, removeConnection } from '../src/lib/trainerService';
import type { TrainerInvite, TrainerClient } from '../src/types';

interface ClientsData {
  clients: TrainerClient[];
  invites: TrainerInvite[];
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

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetcher = useCallback(async (): Promise<ClientsData> => {
    if (!user) return { clients: [], invites: [] };
    const [clients, invites] = await Promise.all([
      getTrainerClients(user.id),
      getActiveInvites(user.id),
    ]);
    return { clients, invites };
  }, [user]);

  const { data, loading, error, retry } = useAsyncData({
    fetcher,
    defaultValue: { clients: [], invites: [] } as ClientsData,
    enabled: !!user,
  });

  const { clients, invites } = data;

  const handleGenerateCode = () => {
    guardAction(async () => {
      if (!user) return;
      setGenerating(true);
      const { code, error: genError } = await createInviteCode(user.id);
      setGenerating(false);
      if (code) {
        setGeneratedCode(code);
        retry();
      } else if (genError) {
        Alert.alert(t('common.error'), genError);
      }
    });
  };

  const handleCopyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
    } catch {
      // Clipboard not available on some platforms
    }
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

        {/* Generate invite code */}
        <Text style={styles.sectionTitle}>{t('trainer.inviteCode')}</Text>

        <Pressable
          style={styles.generateBtn}
          onPress={handleGenerateCode}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="add-circle" size={22} color={colors.white} />
              <Text style={styles.generateBtnText}>{t('trainer.generateCode')}</Text>
            </>
          )}
        </Pressable>

        {generatedCode && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{t('trainer.shareCode')}</Text>
            <Text style={styles.codeText}>{generatedCode}</Text>
            <Text style={styles.codeExpiry}>{t('trainer.codeExpiry')}</Text>
            <Pressable style={styles.copyBtn} onPress={() => handleCopyCode(generatedCode)}>
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
              <Text style={styles.copyBtnText}>{t('trainer.codeCopied')}</Text>
            </Pressable>
          </View>
        )}

        {/* Active invites */}
        {invites.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('trainer.activeInvites')}</Text>
            {invites.map((inv) => (
              <View key={inv.id} style={styles.inviteItem}>
                <Text style={styles.inviteCode}>{inv.code}</Text>
                <Text style={styles.inviteExpiry}>{formatDate(inv.expiresAt)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Connected clients */}
        <Text style={styles.sectionTitle}>{t('trainer.myClients')}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.lg }} />
        ) : !error && clients.length > 0 ? (
          clients.map((client) => (
            <View key={client.id} style={styles.clientCard}>
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
              <Pressable style={styles.removeBtn} onPress={() => handleRemoveClient(client)}>
                <Ionicons name="close-circle-outline" size={24} color={colors.error} />
              </Pressable>
            </View>
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
