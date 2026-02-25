// ── Season 1 Follower-Tier Configuration ──
// Fred-approved Hybrid model (Feb 20 call)
// Power Score = Bronze + Silver + Gold box points
// Dollar headline = (60% of Power Score) / 20
// Split: 30% Free Play (15x) / 30% Deposit Match (20x) / 40% REAL Points

export interface FollowerTier {
  minFollowers: number;
  maxFollowers: number; // exclusive; Infinity for last tier
  label: string;
  goldPointsMin: number;
  goldPointsMax: number;
  maxPowerScore: number;
  maxFreePlay: number;       // $ cap
  maxDepositMatch: number;   // $ cap
  maxCashAllocation: number; // $ cap (free play + deposit match)
  maxRealPoints: number;
}

export const FOLLOWER_TIERS: FollowerTier[] = [
  { minFollowers: 0,      maxFollowers: 1000,    label: '<1K',       goldPointsMin: 0,     goldPointsMax: 1000,  maxPowerScore: 2100,  maxFreePlay: 31.50,   maxDepositMatch: 31.50,   maxCashAllocation: 63.00,    maxRealPoints: 840 },
  { minFollowers: 1000,   maxFollowers: 2000,    label: '1K–2K',     goldPointsMin: 1001,  goldPointsMax: 1800,  maxPowerScore: 2900,  maxFreePlay: 43.50,   maxDepositMatch: 43.50,   maxCashAllocation: 87.00,    maxRealPoints: 1160 },
  { minFollowers: 2000,   maxFollowers: 3000,    label: '2K–3K',     goldPointsMin: 1801,  goldPointsMax: 2400,  maxPowerScore: 3500,  maxFreePlay: 52.50,   maxDepositMatch: 52.50,   maxCashAllocation: 105.00,   maxRealPoints: 1400 },
  { minFollowers: 3000,   maxFollowers: 5000,    label: '3K–5K',     goldPointsMin: 2401,  goldPointsMax: 3000,  maxPowerScore: 4100,  maxFreePlay: 61.50,   maxDepositMatch: 61.50,   maxCashAllocation: 123.00,   maxRealPoints: 1640 },
  { minFollowers: 5000,   maxFollowers: 7500,    label: '5K–7.5K',   goldPointsMin: 3001,  goldPointsMax: 4500,  maxPowerScore: 5600,  maxFreePlay: 84.00,   maxDepositMatch: 84.00,   maxCashAllocation: 168.00,   maxRealPoints: 2240 },
  { minFollowers: 7500,   maxFollowers: 10000,   label: '7.5K–10K',  goldPointsMin: 4501,  goldPointsMax: 6000,  maxPowerScore: 7100,  maxFreePlay: 106.50,  maxDepositMatch: 106.50,  maxCashAllocation: 213.00,   maxRealPoints: 2840 },
  { minFollowers: 10000,  maxFollowers: 15000,   label: '10K–15K',   goldPointsMin: 6001,  goldPointsMax: 8500,  maxPowerScore: 9600,  maxFreePlay: 144.00,  maxDepositMatch: 144.00,  maxCashAllocation: 288.00,   maxRealPoints: 3840 },
  { minFollowers: 15000,  maxFollowers: 20000,   label: '15K–20K',   goldPointsMin: 8501,  goldPointsMax: 11000, maxPowerScore: 12100, maxFreePlay: 181.50,  maxDepositMatch: 181.50,  maxCashAllocation: 363.00,   maxRealPoints: 4840 },
  { minFollowers: 20000,  maxFollowers: 25000,   label: '20K–25K',   goldPointsMin: 11001, goldPointsMax: 13000, maxPowerScore: 14100, maxFreePlay: 211.50,  maxDepositMatch: 211.50,  maxCashAllocation: 423.00,   maxRealPoints: 5640 },
  { minFollowers: 25000,  maxFollowers: 30000,   label: '25K–30K',   goldPointsMin: 13001, goldPointsMax: 14500, maxPowerScore: 15600, maxFreePlay: 234.00,  maxDepositMatch: 234.00,  maxCashAllocation: 468.00,   maxRealPoints: 6240 },
  { minFollowers: 30000,  maxFollowers: 35000,   label: '30K–35K',   goldPointsMin: 14501, goldPointsMax: 16000, maxPowerScore: 17100, maxFreePlay: 256.50,  maxDepositMatch: 256.50,  maxCashAllocation: 513.00,   maxRealPoints: 6840 },
  { minFollowers: 35000,  maxFollowers: 40000,   label: '35K–40K',   goldPointsMin: 16001, goldPointsMax: 18000, maxPowerScore: 19100, maxFreePlay: 286.50,  maxDepositMatch: 286.50,  maxCashAllocation: 573.00,   maxRealPoints: 7640 },
  { minFollowers: 40000,  maxFollowers: 45000,   label: '40K–45K',   goldPointsMin: 18001, goldPointsMax: 20000, maxPowerScore: 21100, maxFreePlay: 316.50,  maxDepositMatch: 316.50,  maxCashAllocation: 633.00,   maxRealPoints: 8440 },
  { minFollowers: 45000,  maxFollowers: 50000,   label: '45K–50K',   goldPointsMin: 20001, goldPointsMax: 22000, maxPowerScore: 23100, maxFreePlay: 346.50,  maxDepositMatch: 346.50,  maxCashAllocation: 693.00,   maxRealPoints: 9240 },
  { minFollowers: 50000,  maxFollowers: 60000,   label: '50K–60K',   goldPointsMin: 22001, goldPointsMax: 25000, maxPowerScore: 26100, maxFreePlay: 391.50,  maxDepositMatch: 391.50,  maxCashAllocation: 783.00,   maxRealPoints: 10440 },
  { minFollowers: 60000,  maxFollowers: 70000,   label: '60K–70K',   goldPointsMin: 25001, goldPointsMax: 28000, maxPowerScore: 29100, maxFreePlay: 436.50,  maxDepositMatch: 436.50,  maxCashAllocation: 873.00,   maxRealPoints: 11640 },
  { minFollowers: 70000,  maxFollowers: 80000,   label: '70K–80K',   goldPointsMin: 28001, goldPointsMax: 31000, maxPowerScore: 32100, maxFreePlay: 481.50,  maxDepositMatch: 481.50,  maxCashAllocation: 963.00,   maxRealPoints: 12840 },
  { minFollowers: 80000,  maxFollowers: 90000,   label: '80K–90K',   goldPointsMin: 31001, goldPointsMax: 34000, maxPowerScore: 35100, maxFreePlay: 526.50,  maxDepositMatch: 526.50,  maxCashAllocation: 1053.00,  maxRealPoints: 14040 },
  { minFollowers: 90000,  maxFollowers: 100000,  label: '90K–100K',  goldPointsMin: 34001, goldPointsMax: 37000, maxPowerScore: 38100, maxFreePlay: 571.50,  maxDepositMatch: 571.50,  maxCashAllocation: 1143.00,  maxRealPoints: 15240 },
  { minFollowers: 100000, maxFollowers: 125000,  label: '100K–125K', goldPointsMin: 37001, goldPointsMax: 42000, maxPowerScore: 43100, maxFreePlay: 646.50,  maxDepositMatch: 646.50,  maxCashAllocation: 1293.00,  maxRealPoints: 17240 },
  { minFollowers: 125000, maxFollowers: 150000,  label: '125K–150K', goldPointsMin: 42001, goldPointsMax: 47000, maxPowerScore: 48100, maxFreePlay: 721.50,  maxDepositMatch: 721.50,  maxCashAllocation: 1443.00,  maxRealPoints: 19240 },
  { minFollowers: 150000, maxFollowers: 200000,  label: '150K–200K', goldPointsMin: 47001, goldPointsMax: 53000, maxPowerScore: 54100, maxFreePlay: 811.50,  maxDepositMatch: 811.50,  maxCashAllocation: 1623.00,  maxRealPoints: 21640 },
  { minFollowers: 200000, maxFollowers: 250000,  label: '200K–250K', goldPointsMin: 53001, goldPointsMax: 60000, maxPowerScore: 61100, maxFreePlay: 916.50,  maxDepositMatch: 916.50,  maxCashAllocation: 1833.00,  maxRealPoints: 24440 },
  { minFollowers: 250000, maxFollowers: Infinity, label: '250K+',    goldPointsMin: 60001, goldPointsMax: 70000, maxPowerScore: 71100, maxFreePlay: 1066.50, maxDepositMatch: 1066.50, maxCashAllocation: 2133.00,  maxRealPoints: 28440 },
];

/** Look up the tier for a given follower count */
export function getTierForFollowers(followers: number): FollowerTier {
  return FOLLOWER_TIERS.find(t => followers >= t.minFollowers && followers < t.maxFollowers) || FOLLOWER_TIERS[0];
}

/** Dollar headline: (60% of Power Score) ÷ 20 = powerScore × 0.03 */
export function calculateAllocationDollars(powerScore: number): number {
  return Math.round(powerScore * 0.03 * 100) / 100;
}

/** Calculate the 30/30/40 reward split with tier caps applied */
export function calculateRewardSplit(powerScore: number, tier: FollowerTier) {
  const freePlayPts  = Math.floor(powerScore * 0.30);
  const depositPts   = Math.floor(powerScore * 0.30);
  const realPoints   = Math.floor(powerScore * 0.40);

  // Cash portions: pts ÷ 20, capped per tier
  const freePlayDollars   = Math.min(freePlayPts / 20, tier.maxFreePlay);
  const depositDollars    = Math.min(depositPts / 20, tier.maxDepositMatch);

  return {
    freePlay:     { dollars: Math.round(freePlayDollars * 100) / 100, wager: 15 },
    depositMatch: { dollars: Math.round(depositDollars * 100) / 100, wager: 20 },
    realPoints,
    totalCash:    Math.round((freePlayDollars + depositDollars) * 100) / 100,
  };
}
