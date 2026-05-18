// src/lib/challengeService.ts
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Challenge,
  ChallengeParticipant,
  LeaderboardEntry,
  ChallengeReward,
  ChallengeType,
  RewardType,
  DiscountType,
  BattlePassTier,
} from '../types';


// ─── Mappers ────────────────────────────────────────────────────────────────

function mapRowToChallenge(row: Record<string, unknown>): Challenge {
  return {
    id: row.id as string,
    creatorId: row.creator_id as string,
    title: row.title as string,
    titleBg: row.title_bg as string | null,
    description: row.description as string | null,
    descriptionBg: row.description_bg as string | null,
    challengeType: row.challenge_type as ChallengeType,
    targetValue: row.target_value as number,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    status: row.status as Challenge['status'],
    rewardType: row.reward_type as RewardType | null,
    rewardDescription: row.reward_description as string | null,
    rewardTiers: row.reward_tiers as BattlePassTier[] | null,
    discountValue: row.discount_value as number | null,
    discountType: row.discount_type as DiscountType | null,
    createdAt: row.created_at as string,
    participantCount: (row.participant_count as number) ?? undefined,
    creatorName: (row.creator as { name: string } | null)?.name ?? undefined,
  };
}

function mapRowToReward(row: Record<string, unknown>): ChallengeReward {
  const challenge = row.challenge as { title: string } | null;
  return {
    id: row.id as string,
    challengeId: row.challenge_id as string,
    userId: row.user_id as string,
    rewardType: row.reward_type as ChallengeReward['rewardType'],
    badgeName: row.badge_name as string | null,
    discountCode: row.discount_code as string | null,
    discountValue: row.discount_value as number | null,
    discountType: row.discount_type as DiscountType | null,
    redeemed: row.redeemed as boolean,
    redeemedAt: row.redeemed_at as string | null,
    tierLevel: row.tier_level as number | null,
    description: row.description as string | null,
    createdAt: row.created_at as string,
    challengeTitle: challenge?.title,
  };
}

// ─── Challenge CRUD ─────────────────────────────────────────────────────────

export async function getChallenges(userId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*, creator:profiles!creator_id(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToChallenge(row as unknown as Record<string, unknown>));
}

export async function getChallengeDetail(challengeId: string): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*, creator:profiles!creator_id(name)')
    .eq('id', challengeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowToChallenge(data as unknown as Record<string, unknown>);
}

export async function createChallenge(params: {
  creatorId: string;
  title: string;
  titleBg?: string;
  description?: string;
  descriptionBg?: string;
  challengeType: ChallengeType;
  targetValue: number;
  startDate: string;
  endDate: string;
  rewardType?: RewardType;
  rewardDescription?: string;
  rewardTiers?: BattlePassTier[];
  discountValue?: number;
  discountType?: DiscountType;
  participantIds: string[];
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_title: params.title,
    p_title_bg: params.titleBg ?? null,
    p_description: params.description ?? null,
    p_description_bg: params.descriptionBg ?? null,
    p_challenge_type: params.challengeType,
    p_target_value: params.targetValue,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_reward_type: params.rewardType ?? null,
    p_reward_description: params.rewardDescription ?? null,
    p_reward_tiers: (params.rewardTiers ?? null) as unknown as undefined,
    p_discount_value: params.discountValue ?? null,
    p_discount_type: params.discountType ?? null,
    p_participant_ids: params.participantIds,
  });

  if (error) return { error: error.message };
  const result = data as unknown as { success: boolean; id?: string; error?: string };
  if (!result?.success) return { error: result?.error ?? 'create_failed' };
  return { id: result.id };
}

export async function deleteChallenge(challengeId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('challenges')
    .delete()
    .eq('id', challengeId);
  if (error) return { error: error.message };
  return {};
}

// ─── Participation ──────────────────────────────────────────────────────────

export async function joinChallenge(challengeId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('challenge_participants')
    .insert({
      challenge_id: challengeId,
      user_id: userId,
      invited_by_trainer: false,
    });
  if (error) return { error: error.message };
  return {};
}

export async function getParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('*, user:profiles!user_id(name)')
    .eq('challenge_id', challengeId)
    .order('rank', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    challengeId: row.challenge_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    progress: row.progress,
    rank: row.rank,
    invitedByTrainer: row.invited_by_trainer,
    userName: (row.user as unknown as { name: string } | null)?.name ?? undefined,
  }));
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export async function getChallengeLeaderboard(challengeId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_leaderboard', {
    p_challenge_id: challengeId,
  });

  if (error) throw new Error(error.message);
  const result = data as unknown as {
    success: boolean;
    leaderboard?: {
      user_id: string;
      user_name: string;
      progress: number;
      target: number;
    }[];
    error?: string;
  };
  if (!result?.success) throw new Error(result?.error ?? 'leaderboard_failed');
  return (result.leaderboard ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    progress: r.progress,
    target: r.target,
  }));
}

// ─── Custom Progress ────────────────────────────────────────────────────────

export async function updateCustomProgress(
  participantId: string,
  progress: number,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_custom_progress', {
    p_participant_id: participantId,
    p_progress: progress,
  });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success: boolean; error?: string };
  if (!result?.success) return { success: false, error: result?.error ?? 'update_failed' };
  return { success: true };
}

// ─── Challenge Completion ───────────────────────────────────────────────────

export async function completeChallenge(challengeId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('complete_challenge', {
    p_challenge_id: challengeId,
  });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success: boolean; error?: string };
  if (!result?.success) return { success: false, error: result?.error ?? 'complete_failed' };
  return { success: true };
}

// ─── Rewards ────────────────────────────────────────────────────────────────

export async function getEarnedRewards(userId: string): Promise<ChallengeReward[]> {
  const { data, error } = await supabase
    .from('challenge_rewards')
    .select('*, challenge:challenges!challenge_id(title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToReward(row as unknown as Record<string, unknown>));
}

export async function getIssuedDiscountCodes(challengeId: string): Promise<ChallengeReward[]> {
  const { data, error } = await supabase
    .from('challenge_rewards')
    .select('*, challenge:challenges!challenge_id(title)')
    .eq('challenge_id', challengeId)
    .in('reward_type', ['discount_code', 'tier_reward'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToReward(row as unknown as Record<string, unknown>));
}

export async function redeemDiscountCode(rewardId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('redeem_discount_code', {
    p_reward_id: rewardId,
  });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success: boolean; error?: string };
  if (!result?.success) return { success: false, error: result?.error ?? 'redeem_failed' };
  return { success: true };
}

// ─── Realtime ───────────────────────────────────────────────────────────────

export function subscribeToChallengeUpdates(
  challengeId: string,
  onUpdate: () => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`challenge:${challengeId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'workout_logs',
      },
      () => {
        // Any new workout log triggers a leaderboard refresh
        onUpdate();
      },
    )
    .subscribe();

  return channel;
}

export function unsubscribeFromChannel(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}
