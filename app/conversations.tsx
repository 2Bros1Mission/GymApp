import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useFocusAsyncData } from '../src/hooks/useAsyncData';
import { ErrorCard } from '../src/components/ErrorCard';
import { getConversations } from '../src/lib/messageService';
import type { Conversation } from '../src/types';
import { formatDate } from '../src/lib/formatDate';
import type { Language } from '../src/contexts/LanguageContext';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  conversationCardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  cardContent: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text, flex: 1 },
  timeText: { fontSize: FontSize.xs, color: colors.textMuted, marginLeft: Spacing.sm },
  lastMessage: {
    fontSize: FontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  lastMessageUnread: { color: colors.text, fontWeight: '600' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: Spacing.sm,
  },
  unreadBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

function formatMessageTime(dateStr: string, language: Language): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return formatDate(date, language, { weekday: 'short' });
  }
  return formatDate(date, language, { month: 'short', day: 'numeric' });
}

export default function ConversationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const fetcher = useCallback(async (): Promise<Conversation[]> => {
    if (!user) return [];
    return getConversations(user.id);
  }, [user]);

  const { data: conversations, loading, error, retry } = useFocusAsyncData({
    fetcher,
    defaultValue: [] as Conversation[],
    enabled: !!user,
  });

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
          <Text style={styles.title}>{t('messages.title')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : conversations.length > 0 ? (
          conversations.map((conv) => {
            const hasUnread = (conv.unreadCount ?? 0) > 0;
            return (
              <Pressable
                key={conv.id}
                style={[styles.conversationCard, hasUnread && styles.conversationCardUnread]}
                onPress={() => router.push(`/chat?conversationId=${conv.id}`)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(conv.otherUserName ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.nameRow}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {conv.otherUserName ?? '--'}
                    </Text>
                    <Text style={styles.timeText}>
                      {formatMessageTime(conv.lastMessageAt, language)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
                      numberOfLines={1}
                    >
                      {conv.lastMessageContent ?? t('messages.noMessages')}
                    </Text>
                    {hasUnread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{conv.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })
        ) : !error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('messages.empty')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
