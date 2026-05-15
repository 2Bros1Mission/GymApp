import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useOfflineGuard } from '../src/hooks/useOfflineGuard';
import { ErrorCard } from '../src/components/ErrorCard';
import {
  getMessages,
  sendMessage,
  markMessagesRead,
  subscribeToMessages,
} from '../src/lib/messageService';
import { supabase } from '../src/lib/supabase';
import type { Message } from '../src/types';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centeredPanel: { maxWidth: 600, width: '100%', alignSelf: 'center', flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  headerAvatarText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
  headerName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text, flex: 1 },
  messageList: { flex: 1, paddingHorizontal: Spacing.md },
  messageListContent: { paddingVertical: Spacing.md },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.lg,
    borderBottomRightRadius: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    maxWidth: '78%',
  },
  myMessageText: { fontSize: FontSize.md, color: colors.white, lineHeight: 22 },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    maxWidth: '78%',
  },
  otherMessageText: { fontSize: FontSize.md, color: colors.text, lineHeight: 22 },
  messageTime: { fontSize: FontSize.xs, marginTop: 2, opacity: 0.6 },
  myMessageTime: { color: colors.white, textAlign: 'right' },
  otherMessageTime: { color: colors.textMuted },
  dateSeparator: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginVertical: Spacing.md,
  },
  dateSeparatorText: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '600' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    color: colors.text,
    maxHeight: 100,
    marginRight: Spacing.sm,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.surfaceLight },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyChatText: {
    fontSize: FontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shouldShowDate(current: Message, previous: Message | undefined): boolean {
  if (!previous) return true;
  const a = new Date(current.createdAt).toDateString();
  const b = new Date(previous.createdAt).toDateString();
  return a !== b;
}

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';
  const { guardAction } = useOfflineGuard();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUserName, setOtherUserName] = useState<string>('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // Load messages and other user info
  const loadMessages = useCallback(async () => {
    if (!conversationId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
      setHasMore(msgs.length >= 50);

      // Mark messages as read
      await markMessagesRead(conversationId);

      // Get conversation info for the header
      const { data: conv } = await supabase
        .from('conversations')
        .select(`
          trainer_id,
          client_id,
          trainer:profiles!conversations_trainer_id_fkey ( name ),
          client:profiles!conversations_client_id_fkey ( name )
        `)
        .eq('id', conversationId)
        .single();

      if (conv) {
        const isTrainer = conv.trainer_id === user.id;
        const otherProfile = isTrainer
          ? (conv.client as unknown as { name: string } | null)
          : (conv.trainer as unknown as { name: string } | null);
        setOtherUserName(otherProfile?.name ?? '--');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[messages.length - 1].createdAt;
      const older = await getMessages(conversationId, 50, oldest);
      if (older.length < 50) setHasMore(false);
      if (older.length > 0) {
        setMessages((prev) => [...prev, ...older]);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore, hasMore, messages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = subscribeToMessages(conversationId, (newMsg) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [newMsg, ...prev];
      });

      // Mark as read if the message is from the other person
      if (newMsg.senderId !== user.id) {
        markMessagesRead(conversationId);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending || !conversationId) return;

    guardAction(async () => {
      setSending(true);
      const result = await sendMessage(conversationId, trimmed);
      setSending(false);

      if (result.success) {
        setInputText('');
        // The real-time subscription will add the message,
        // but also add it optimistically for instant feedback
        if (result.messageId && user) {
          const optimisticMsg: Message = {
            id: result.messageId,
            conversationId,
            senderId: user.id,
            content: trimmed,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === optimisticMsg.id)) return prev;
            return [optimisticMsg, ...prev];
          });
        }
      }
    });
  };

  // Messages are newest-first from the API, FlatList is inverted
  const reversedMessages = messages;

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.senderId === user?.id;
    // In inverted list, previous = index+1 (older message)
    const olderMsg = reversedMessages[index + 1];
    const showDate = shouldShowDate(item, olderMsg);

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>
              {formatMessageDate(item.createdAt)}
            </Text>
          </View>
        )}
        <View style={isMe ? styles.myMessage : styles.otherMessage}>
          <Text style={isMe ? styles.myMessageText : styles.otherMessageText}>
            {item.content}
          </Text>
          <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.otherMessageTime]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  const canSend = inputText.trim().length > 0 && !sending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={[{ flex: 1 }, isWide && styles.centeredPanel]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {(otherUserName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerName} numberOfLines={1}>{otherUserName || '...'}</Text>
        </View>

        {/* Messages */}
        {error && (
          <View style={{ padding: Spacing.md }}>
            <ErrorCard message={error} onRetry={loadMessages} loading={loading} />
          </View>
        )}

        {loading ? (
          <View style={styles.emptyChat}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyChatText}>{t('messages.startConversation')}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={reversedMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            inverted
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            showsVerticalScrollIndicator={false}
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: Spacing.md }} /> : null}
          />
        )}

        {/* Input Bar */}
        <SafeAreaView edges={['bottom']} style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('messages.placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Ionicons
              name="send"
              size={20}
              color={canSend ? colors.white : colors.textMuted}
            />
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
