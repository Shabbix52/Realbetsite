import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiUrl } from '../config';
import { useCountUp } from '../hooks/useCountUp';

interface LeaderboardUser {
  rank: number;
  username: string;
  followersCount: number;
  totalPoints: number;
  realPoints: number;
}

interface LeaderboardData {
  users: LeaderboardUser[];
  totalUsers: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LeaderboardScreenProps {
  onBack: () => void;
  currentUsername?: string;
}

const LeaderboardScreen = ({ onBack, currentUsername }: LeaderboardScreenProps) => {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalUsers = data?.totalUsers || 0;
  const displayTotalUsers = useCountUp(totalUsers, 800);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/auth/leaderboard?limit=100'));
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center relative px-4 md:px-6 z-10 overflow-y-auto pb-12"
    >
      {/* Header */}
      <div className="w-full max-w-3xl mx-auto pt-6">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-rb-muted/50 hover:text-white/80 transition-colors text-sm font-label tracking-wider"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            BACK
          </button>
          <button
            onClick={fetchLeaderboard}
            disabled={loading}
            className="text-rb-muted/50 hover:text-white/80 transition-colors text-sm font-label tracking-wider"
          >
            {loading ? 'LOADING...' : 'REFRESH'}
          </button>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <p className="font-label text-[10px] tracking-[0.3em] text-rb-muted/40 uppercase mb-3">
            Season 1
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight uppercase mb-2">
            Real Points{' '}
            <span className="text-brand-gold">Leaderboard</span>
          </h2>
          <p className="text-rb-muted/50 text-sm font-label">
            Top performers earn the Season 1 Airdrop
          </p>
          {totalUsers > 0 && (
            <p className="text-rb-muted/30 text-xs font-label mt-2">
              {displayTotalUsers.toLocaleString()} players ranked
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="glass-panel rounded-xl p-4 mb-6 text-center">
            <p className="text-brand-red text-sm">{error}</p>
            <button onClick={fetchLeaderboard} className="text-brand-gold text-xs mt-2 underline">
              Try again
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-3">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="glass-panel rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-rb-border/30 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-rb-border/30 rounded w-32 mb-1" />
                    <div className="h-3 bg-rb-border/20 rounded w-20" />
                  </div>
                  <div className="h-5 bg-rb-border/30 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard table */}
        {data && data.users.length > 0 && (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="flex items-center px-4 py-2 text-[10px] font-label tracking-wider text-rb-muted/30 uppercase">
              <span className="w-12">Rank</span>
              <span className="flex-1">Player</span>
              <span className="w-28 text-right">Followers</span>
              <span className="w-32 text-right">Power Score</span>
              <span className="w-28 text-right">Real Points</span>
            </div>

            <AnimatePresence>
              {data.users.map((user, i) => {
                const isCurrentUser = currentUsername && user.username?.toLowerCase() === currentUsername.toLowerCase();
                const isTop3 = user.rank <= 3;

                return (
                  <motion.div
                    key={user.rank}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.3 }}
                    className={`glass-panel rounded-xl p-4 flex items-center transition-all duration-300 ${
                      isCurrentUser
                        ? 'border-brand-gold/30 bg-brand-gold/[0.03]'
                        : isTop3
                        ? 'border-brand-gold/10'
                        : ''
                    }`}
                    style={isTop3 ? {
                      boxShadow: '0 0 20px rgba(246,196,74,0.05)',
                    } : undefined}
                  >
                    {/* Rank */}
                    <div className="w-12 flex-shrink-0">
                      {isTop3 ? (
                        <span className="text-xl">{MEDALS[user.rank - 1]}</span>
                      ) : (
                        <span className="text-sm font-bold font-label text-rb-muted/40">
                          #{user.rank}
                        </span>
                      )}
                    </div>

                    {/* Player */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold truncate ${isCurrentUser ? 'text-brand-gold' : 'text-white/90'}`}>
                          @{user.username || 'anonymous'}
                        </p>
                        {isCurrentUser && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-gold/20 text-brand-gold font-label tracking-wider flex-shrink-0">
                            YOU
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Followers */}
                    <div className="w-28 text-right flex-shrink-0">
                      <span className="text-xs text-rb-muted/40 font-label">
                        {formatNumber(user.followersCount)}
                      </span>
                    </div>

                    {/* Power Score */}
                    <div className="w-32 text-right flex-shrink-0">
                      <span className={`text-sm font-bold font-label ${isTop3 ? 'text-white' : 'text-white/70'}`}>
                        {user.totalPoints.toLocaleString()}
                      </span>
                    </div>

                    {/* REAL Points */}
                    <div className="w-28 text-right flex-shrink-0">
                      <span className={`text-sm font-bold font-label ${isTop3 ? 'text-brand-gold' : 'text-brand-gold/70'}`}>
                        {user.realPoints.toLocaleString()}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Empty state */}
        {data && data.users.length === 0 && (
          <div className="text-center py-20">
            <p className="text-rb-muted/40 text-sm font-label">No players yet. Be the first!</p>
          </div>
        )}

        {/* Footer note */}
        <div className="text-center mt-8">
          <p className="text-rb-muted/20 text-[10px] font-label tracking-wider">
            REAL Points = 40% of Power Score • Rankings update in real-time • Top players earn the Season 1 Airdrop
          </p>
        </div>
      </div>
    </motion.section>
  );
};

export default LeaderboardScreen;
