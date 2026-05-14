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
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      trainer_id,
      client_id,
      last_message_at,
      created_at,
      trainer:profiles!conversations_trainer_id_fkey ( name, email ),
      client:profiles!conversations_client_id_fkey ( name, email )
    `)
    .or(`trainer_id.eq.${userId},client_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error) throw new Error(error.message);

  // For each conversation, get the last message and unread count
  const conversations = await Promise.all(
    (data ?? []).map(async (row) => {
      const isTrainer = row.trainer_id === userId;
      const otherUser = isTrainer
        ? (row.client as unknown as { name: string; email: string } | null)
        : (row.trainer as unknown as { name: string; email: string } | null);

      // Get last message
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Get unread count (messages sent by the other person that I haven't read)
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', row.id)
        .neq('sender_id', userId)
        .is('read_at', null);

      return {
        id: row.id,
        trainerId: row.trainer_id,
        clientId: row.client_id,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        otherUserName: otherUser?.name,
        otherUserEmail: otherUser?.email,
        lastMessageContent: lastMsg?.content ?? undefined,
        unreadCount: count ?? 0,
      };
    }),
  );

  return conversations;
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
 */
export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

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
 * Mark all unread messages in a conversation as read (messages not sent by me).
 */
export async function markMessagesRead(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null);
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
