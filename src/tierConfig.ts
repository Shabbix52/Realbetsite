// ── Season 1 Follower-Tier Configuration ──
// Spec-aligned model
// Power Score = Bronze + Silver + Gold box points
// Dollar headline = Power Score / 20  (full conversion at 20 pts = $1)
// Split: 60% Free Play (15x wagering) / 40% REAL Points (leaderboard → airdrop)
//
// Core tier data lives in shared/tierData.json (single source of truth for client + server).
// Derived fields (label, maxPowerScore, maxRealPoints) are computed here.

import rawTiers from '../shared/tierData.json';

export interface FollowerTier {
  minFollowers: number;
  maxFollowers: number; // exclusive; Infinity for last tier
  label: string;
  goldPointsMin: number;
  goldPointsMax: number;
  maxPowerScore: number;
  maxFreePlay: number;       // $ cap (60% cash component)
  maxRealPoints: number;
}

function formatLabel(min: number, max: number): string {
  if (max >= 999999999) return `${(min / 1000).toFixed(0)}K+`;
  if (min === 0) return `<${max >= 1000 ? `${(max / 1000).toFixed(0)}K` : max}`;
  const fmt = (n: number) => {
    if (n >= 1000) {
      const k = n / 1000;
      return Number.isInteger(k) ? `${k}K` : `${k}K`;
    }
    return String(n);
  };
  return `${fmt(min)}–${fmt(max)}`;
}

export const FOLLOWER_TIERS: FollowerTier[] = rawTiers.map(t => {
  const maxFollowers = t.maxFollowers >= 999999999 ? Infinity : t.maxFollowers;
  // maxPowerScore = bronze(100) + silver(1000) + goldPointsMax + maxTaskBonus(1000) = goldPointsMax + 2100
  // But original data shows maxPowerScore = goldPointsMax + 1100 (bronze 100 + silver 1000)
  // Actually: original maxPowerScore for tier 0 = 2100 = 1000 + 1100, tier 1 = 2900 = 1800 + 1100
  const maxPowerScore = t.goldPointsMax + 1100;
  const maxRealPoints = Math.floor(maxPowerScore * 0.4);
  return {
    minFollowers: t.minFollowers,
    maxFollowers,
    label: maxFollowers === Infinity ? `${(t.minFollowers / 1000).toFixed(0)}K+` : formatLabel(t.minFollowers, t.maxFollowers),
    goldPointsMin: t.goldPointsMin,
    goldPointsMax: t.goldPointsMax,
    maxPowerScore,
    maxFreePlay: t.maxFreePlay,
    maxRealPoints,
  };
});

/** Look up the tier for a given follower count */
export function getTierForFollowers(followers: number): FollowerTier {
  return FOLLOWER_TIERS.find(t => followers >= t.minFollowers && followers < t.maxFollowers) || FOLLOWER_TIERS[0];
}

/** Dollar headline: Power Score ÷ 20 (full conversion at 20 pts = $1) */
export function calculateAllocationDollars(powerScore: number): number {
  return Math.round((powerScore / 20) * 100) / 100;
}

/** Calculate the 60/40 reward split with tier caps applied */
export function calculateRewardSplit(powerScore: number, tier: FollowerTier) {
  const freePlayPts  = Math.floor(powerScore * 0.60);
  const realPoints   = Math.floor(powerScore * 0.40);

  // Cash portion: 60% of pts ÷ 20, capped per tier
  const freePlayDollars = Math.min(freePlayPts / 20, tier.maxFreePlay);

  return {
    freePlay:  { dollars: Math.round(freePlayDollars * 100) / 100, wager: 15 },
    realPoints,
    totalCash: Math.round(freePlayDollars * 100) / 100,
  };
}
