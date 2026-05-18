// src/types/challenges.ts

export type ChallengeType = 'frequency' | 'streak' | 'custom';
export type ChallengeStatus = 'upcoming' | 'active' | 'completed';
export type RewardType = 'badge' | 'discount' | 'battle_pass' | 'custom';
export type DiscountType = 'percentage' | 'fixed_amount';
export type ChallengeRewardKind = 'badge' | 'discount_code' | 'tier_reward' | 'custom';

export interface BattlePassTier {
  tier: number;
  threshold: number; // percentage of target_value (e.g., 50 = 50%)
  reward_type: 'badge' | 'discount';
  badge_name?: string;
  discount_value?: number;
  discount_type?: DiscountType;
  description: string;
}

export interface Challenge {
  id: string;
  creatorId: string;
  title: string;
  titleBg: string | null;
  description: string | null;
  descriptionBg: string | null;
  challengeType: ChallengeType;
  targetValue: number;
  startDate: string;
  endDate: string;
  status: ChallengeStatus;
  rewardType: RewardType | null;
  rewardDescription: string | null;
  rewardTiers: BattlePassTier[] | null;
  discountValue: number | null;
  discountType: DiscountType | null;
  createdAt: string;
  // Joined
  participantCount?: number;
  creatorName?: string;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  joinedAt: string;
  progress: number;
  rank: number | null;
  invitedByTrainer: boolean;
  // Joined
  userName?: string;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  progress: number;
  target: number;
}

export interface ChallengeReward {
  id: string;
  challengeId: string;
  userId: string;
  rewardType: ChallengeRewardKind;
  badgeName: string | null;
  discountCode: string | null;
  discountValue: number | null;
  discountType: DiscountType | null;
  redeemed: boolean;
  redeemedAt: string | null;
  tierLevel: number | null;
  description: string | null;
  createdAt: string;
  // Joined
  challengeTitle?: string;
}
