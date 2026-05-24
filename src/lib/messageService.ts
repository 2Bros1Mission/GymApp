import { supabase } from './supabase';
import type { Conversation, Message } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Get or create a conversation with another user.
 */
export async function getOrCreateConversation(otherUserId: string): Promise<{
  success: boolean;
  conversationId?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_other_user_id: otherUserId,
  });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as {
    success?: boolean;
    conversation_id?: string;
    error?: string;
  } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };
  return { success: true, conversationId: result.conversation_id };
}

/**
 * Get all conversations for the current user with last message preview.
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('get_conversations');

  if (error) throw new Error(error.message);

  const rows = data as unknown as {
    id: string;
    trainer_id: string;
    client_id: string;
    last_message_at: string;
    created_at: string;
    trainer_name: string;
    trainer_email: string;
    client_name: string;
    client_email: string;
    last_message_content: string | null;
    unread_count: number;
  }[] ?? [];

  return rows.map((row) => {
    const isTrainer = row.trainer_id === userId;
    return {
      id: row.id,
      trainerId: row.trainer_id,
      clientId: row.client_id,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      otherUserName: isTrainer ? row.client_name : row.trainer_name,
      otherUserEmail: isTrainer ? row.client_email : row.trainer_email,
      lastMessageContent: row.last_message_content ?? undefined,
      unreadCount: row.unread_count,
    };
  });
}

/**
 * Get total unread message count across all conversations.
 */
export async function getTotalUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('*, conversation:conversations!inner(id)', { count: 'exact', head: true })
    .or(`trainer_id.eq.${userId},client_id.eq.${userId}`, { referencedTable: 'conversations' })
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Get messages for a conversation, newest first.
 * Pass `before` (ISO timestamp) to paginate older messages.
 */
export async function getMessages(conversationId: string, limit = 50, before?: string): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/**
 * Send a message via the RPC function.
 */
export async function sendMessage(conversationId: string, content: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_content: content,
  });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as {
    success?: boolean;
    message_id?: string;
    error?: string;
  } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };
  return { success: true, messageId: result.message_id };
}

/**
 * Mark all unread messages in a conversation as read via RPC.
 */
export async function markMessagesRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_messages_read', { p_conversation_id: conversationId });
}

/**
 * Subscribe to new messages in a conversation via Supabase Realtime.
 * Returns the channel so the caller can unsubscribe.
 */
export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (message: Message) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          read_at: string | null;
          created_at: string;
        };
        onNewMessage({
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          content: row.content,
          readAt: row.read_at,
          createdAt: row.created_at,
        });
      },
    )
    .subscribe();

  return channel;
}
