import { supabase } from './supabase';
import type { TrainerInvite, TrainerClient } from '../types';

/**
 * Generate a random 6-character alphanumeric invite code.
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new invite code for a trainer. Expires in 7 days.
 */
export async function createInviteCode(trainerId: string): Promise<{ code?: string; error?: string }> {
  const code = generateCode();

  const { error } = await supabase
    .from('trainer_invites')
    .insert({ trainer_id: trainerId, code });

  if (error) {
    // Unique constraint collision — extremely rare, retry once
    if (error.code === '23505') {
      const retryCode = generateCode();
      const { error: retryError } = await supabase
        .from('trainer_invites')
        .insert({ trainer_id: trainerId, code: retryCode });
      if (retryError) return { error: retryError.message };
      return { code: retryCode };
    }
    return { error: error.message };
  }

  return { code };
}

/**
 * Get the trainer's active (unused, non-expired) invite codes.
 */
export async function getActiveInvites(trainerId: string): Promise<TrainerInvite[]> {
  const { data } = await supabase
    .from('trainer_invites')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return (data ?? []).map((row: any) => ({
    id: row.id,
    trainerId: row.trainer_id,
    code: row.code,
    expiresAt: row.expires_at,
    used: row.used,
    usedBy: row.used_by,
    createdAt: row.created_at,
  }));
}

/**
 * Client redeems an invite code via the RPC function.
 */
export async function redeemInviteCode(code: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('redeem_invite_code', { p_code: code.toUpperCase() });

  if (error) return { success: false, error: error.message };
  if (!data?.success) return { success: false, error: data?.error ?? 'unknown' };

  return { success: true };
}

/**
 * Get the trainer's connected clients (active only).
 */
export async function getTrainerClients(trainerId: string): Promise<TrainerClient[]> {
  const { data } = await supabase
    .from('trainer_clients')
    .select(`
      id,
      trainer_id,
      client_id,
      status,
      connected_at,
      client:profiles!trainer_clients_client_id_fkey ( name, email )
    `)
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('connected_at', { ascending: false });

  return (data ?? []).map((row: any) => ({
    id: row.id,
    trainerId: row.trainer_id,
    clientId: row.client_id,
    status: row.status,
    connectedAt: row.connected_at,
    clientName: row.client?.name,
    clientEmail: row.client?.email,
  }));
}

/**
 * Get the client's trainer (if connected).
 */
export async function getClientTrainer(clientId: string): Promise<TrainerClient | null> {
  const { data } = await supabase
    .from('trainer_clients')
    .select(`
      id,
      trainer_id,
      client_id,
      status,
      connected_at,
      trainer:profiles!trainer_clients_trainer_id_fkey ( name, email )
    `)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    trainerId: data.trainer_id,
    clientId: data.client_id,
    status: data.status,
    connectedAt: data.connected_at,
    trainerName: (data as any).trainer?.name,
    trainerEmail: (data as any).trainer?.email,
  };
}

/**
 * Remove a client-trainer connection (either party can do this).
 */
export async function removeConnection(connectionId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('trainer_clients')
    .update({ status: 'removed' })
    .eq('id', connectionId);

  if (error) return { error: error.message };
  return {};
}
