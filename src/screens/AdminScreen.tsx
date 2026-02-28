import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getApiUrl } from '../config';

interface AdminStats {
  overview: {
    total_users: string;
    total_points_issued: string;
    total_dollar_headline: string;
    total_freeplay_exposure: string;
    total_real_points: string;
    avg_points: string;
    max_points: string;
    avg_followers: string;
    completed_gold: string;
    active_users: string;
    shared_count: string;
  };
  tierDistribution: {
    tier: string;
    count: string;
    total_pts: string;
    cash_exposure: string;
  }[];
}

interface AdminUser {
  twitterId: string;
  username: string;
  followersCount: number;
  bronzePoints: number;
  silverPoints: number;
  goldPoints: number;
  totalPoints: number;
  realPoints: number;
  cashExposure: number;
  hasShared: boolean;
  sharePostUrl: string | null;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

type Tab = 'overview' | 'users' | 'referrals';

interface AdminReferralOverview {
  total_referrals: string;
  converted_referrals: string;
  total_referrer_bonus_issued: string;
  total_referred_bonus_issued: string;
  unique_referrers: string;
}

interface AdminTopReferrer {
  username: string;
  twitterId: string;
  referralCode: string;
  referralCount: number;
  referralBonusPoints: number;
  totalPoints: number;
  followersCount: number;
}

interface AdminReferral {
  referrerUsername: string;
  referredUsername: string;
  referralCode: string;
  referrerBonus: number;
  referredBonus: number;
  status: string;
  createdAt: string;
  convertedAt: string | null;
}

interface AdminReferralsData {
  overview: AdminReferralOverview;
  topReferrers: AdminTopReferrer[];
  referrals: AdminReferral[];
  total: number;
  limit: number;
  offset: number;
}

function formatDollars(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '$0';
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatNum(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n) : n;
  if (isNaN(num)) return '0';
  return num.toLocaleString();
}

interface AdminScreenProps {
  onBack: () => void;
}

const AdminScreen = ({ onBack }: AdminScreenProps) => {
  const [adminKey, setAdminKey] = useState(() => {
    try { return localStorage.getItem('realbet_admin_key') || ''; }
    catch { return ''; }
  });
  const [authenticated, setAuthenticated] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('total_points');
  const [page, setPage] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [referralsData, setReferralsData] = useState<AdminReferralsData | null>(null);
  const [refSearch, setRefSearch] = useState('');
  const [refPage, setRefPage] = useState(0);

  const headers = { 'x-admin-key': adminKey };

  const authenticate = useCallback(async (key: string) => {
    try {
      const res = await fetch(getApiUrl('/admin/stats'), { headers: { 'x-admin-key': key } });
      if (res.ok) {
        setAdminKey(key);
        setAuthenticated(true);
        localStorage.setItem('realbet_admin_key', key);
        const data = await res.json();
        setStats(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Auto-login with saved key
  useEffect(() => {
    if (adminKey) authenticate(adminKey);
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/admin/stats'), { headers });
      if (!res.ok) throw new Error();
      setStats(await res.json());
      setError(null);
    } catch {
      setError('Failed to load stats');
    }
    setLoading(false);
  }, [adminKey]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: String(page * 50),
        sort,
        order: 'desc',
        ...(search ? { search } : {}),
      });
      const res = await fetch(getApiUrl(`/admin/users?${params}`), { headers });
      if (!res.ok) throw new Error();
      setUsers(await res.json());
      setError(null);
    } catch {
      setError('Failed to load users');
    }
    setLoading(false);
  }, [adminKey, page, sort, search]);

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: String(refPage * 50),
        ...(refSearch ? { search: refSearch } : {}),
      });
      const res = await fetch(getApiUrl(`/admin/referrals?${params}`), { headers });
      if (!res.ok) throw new Error();
      setReferralsData(await res.json());
      setError(null);
    } catch {
      setError('Failed to load referrals');
    }
    setLoading(false);
  }, [adminKey, refPage, refSearch]);

  useEffect(() => {
    if (!authenticated) return;
    if (tab === 'overview') fetchStats();
    else if (tab === 'users') fetchUsers();
    else if (tab === 'referrals') fetchReferrals();
  }, [tab, authenticated, page, sort, refPage]);

  const handleLogin = async () => {
    const ok = await authenticate(keyInput);
    if (!ok) setError('Invalid admin key');
    else setError(null);
  };

  const handleResetDB = async () => {
    setResetting(true);
    try {
      const res = await fetch(getApiUrl('/admin/reset-db'), { method: 'POST', headers });
      if (!res.ok) throw new Error();
      setStats(null);
      setUsers(null);
      setResetConfirm(false);
      setError(null);
      // Refresh current tab
      if (tab === 'overview') fetchStats();
      else fetchUsers();
    } catch {
      setError('Failed to reset database');
    }
    setResetting(false);
  };

  const handleExport = async () => {
    try {
      const res = await fetch(getApiUrl('/admin/export'), { headers });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'realbet-season1-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchUsers();
  };

  // Login screen
  if (!authenticated) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex flex-col items-center justify-center px-6 z-10"
      >
        <div className="w-full max-w-sm">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-rb-muted/50 hover:text-white/80 transition-colors text-sm font-label tracking-wider mb-8"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            BACK
          </button>

          <h2 className="font-display text-3xl font-bold tracking-tight uppercase mb-2">
            Admin <span className="text-brand-red">Panel</span>
          </h2>
          <p className="text-rb-muted/50 text-sm mb-8">Enter admin key to continue.</p>

          <div className="space-y-4">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Admin key..."
              className="w-full px-4 py-3 rounded-xl border border-rb-border text-sm font-label focus:outline-none focus:border-brand-gold/40"
              style={{ color: '#000000', backgroundColor: '#e5e5e5' }}
            />
            {error && <p className="text-brand-red text-xs font-label">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full py-3 rounded-xl bg-brand-red/80 hover:bg-brand-red text-white font-bold text-sm tracking-wider transition-colors"
            >
              LOGIN
            </button>
          </div>
        </div>
      </motion.section>
    );
  }

  // Admin dashboard
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center relative px-4 md:px-6 z-10 overflow-y-auto pb-12"
    >
      <div className="w-full max-w-6xl mx-auto pt-6">
        {/* Nav */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-rb-muted/50 hover:text-white/80 transition-colors text-sm font-label tracking-wider"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              BACK
            </button>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight uppercase">
              Admin <span className="text-brand-red">Panel</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={handleExport} className="px-3 sm:px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs font-bold font-label tracking-wider hover:bg-green-500/30 transition-colors">
              EXPORT
            </button>
            <button
              onClick={() => setResetConfirm(true)}
              className="px-3 sm:px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-bold font-label tracking-wider hover:bg-red-500/30 transition-colors"
            >
              RESET DB
            </button>
            <button onClick={() => { setAuthenticated(false); setAdminKey(''); localStorage.removeItem('realbet_admin_key'); }} className="px-3 sm:px-4 py-2 rounded-lg bg-rb-border/30 text-rb-muted/50 text-xs font-bold font-label tracking-wider hover:bg-rb-border/50 transition-colors">
              LOGOUT
            </button>
          </div>
        </div>

        {/* Reset DB Confirmation Modal */}
        {resetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-sm glass-panel rounded-2xl p-6 space-y-4 border border-red-500/20">
              <h3 className="font-display text-xl font-bold text-white">Reset Database?</h3>
              <p className="text-sm text-rb-muted/60">
                This will <span className="text-red-400 font-bold">permanently delete all users, scores, and wallets</span>. This cannot be undone.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setResetConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-rb-card border border-rb-border text-sm font-bold font-label tracking-wider text-rb-muted/60 hover:text-white transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleResetDB}
                  disabled={resetting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold font-label tracking-wider transition-colors disabled:opacity-50"
                >
                  {resetting ? 'RESETTING...' : 'CONFIRM RESET'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {(['overview', 'users', 'referrals'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold font-label tracking-wider transition-all ${
                tab === t
                  ? 'bg-brand-gold/20 text-brand-gold border border-brand-gold/20'
                  : 'bg-rb-card/30 text-rb-muted/40 hover:text-rb-muted/60 border border-transparent'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-8">
            <svg className="w-6 h-6 animate-spin text-brand-gold/50 mx-auto" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        )}

        {/* ══ OVERVIEW TAB ══ */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Active Users', value: formatNum(stats.overview.active_users), sub: `${formatNum(stats.overview.total_users)} total` },
                { label: 'Completed Gold', value: formatNum(stats.overview.completed_gold), sub: `of ${formatNum(stats.overview.active_users)} active` },
                { label: 'Shared on X', value: formatNum(stats.overview.shared_count), sub: `of ${formatNum(stats.overview.active_users)} active` },
                { label: 'Max Power Points', value: formatNum(stats.overview.max_points), sub: `avg followers ${formatNum(stats.overview.avg_followers)}` },
              ].map((stat) => (
                <div key={stat.label} className="glass-panel rounded-xl p-4">
                  <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold font-label text-white">{stat.value}</p>
                  <p className="text-[10px] text-rb-muted/30 font-label mt-1">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* Exposure cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-panel rounded-xl p-5 border-brand-red/10">
                <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-1">Wager Bonus Exposure</p>
                <p className="text-3xl font-bold font-label text-brand-red">{formatDollars(stats.overview.total_freeplay_exposure)}</p>
                <p className="text-[10px] text-rb-muted/30 font-label mt-1">60% split • 15x wager</p>
              </div>
              <div className="glass-panel rounded-xl p-5 border-brand-gold/10">
                <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-1">REAL Points Issued</p>
                <p className="text-3xl font-bold font-label text-brand-gold">{formatNum(stats.overview.total_real_points)}</p>
                <p className="text-[10px] text-rb-muted/30 font-label mt-1">40% split • leaderboard → airdrop</p>
              </div>
            </div>

            {/* Dollar headline total */}
            <div className="glass-panel rounded-xl p-5 text-center">
              <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-1">Total Dollar Headlines Shown</p>
              <p className="text-4xl font-bold font-label text-white">{formatDollars(stats.overview.total_dollar_headline)}</p>
              <p className="text-[10px] text-rb-muted/30 font-label mt-1">Sum of all "SEASON 1 ALLOCATION" headlines (optics only)</p>
            </div>

            {/* Tier distribution */}
            <div className="glass-panel rounded-xl p-5">
              <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-4">Follower Tier Distribution</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-label tracking-wider text-rb-muted/30 uppercase border-b border-rb-border/30">
                      <th className="text-left py-2 px-3">Tier</th>
                      <th className="text-right py-2 px-3">Users</th>
                      <th className="text-right py-2 px-3">Total Points</th>
                      <th className="text-right py-2 px-3">Cash Exposure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tierDistribution.map((tier) => (
                      <tr key={tier.tier} className="border-b border-rb-border/10 hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 font-label font-bold text-white/80">{tier.tier}</td>
                        <td className="py-2.5 px-3 text-right font-label text-rb-muted/60">{formatNum(tier.count)}</td>
                        <td className="py-2.5 px-3 text-right font-label text-rb-muted/60">{formatNum(tier.total_pts)}</td>
                        <td className="py-2.5 px-3 text-right font-label text-brand-red/80">{formatDollars(tier.cash_exposure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ USERS TAB ══ */}
        {tab === 'users' && (
          <div className="space-y-4">
            {/* Search + Sort */}
            <div className="flex flex-col md:flex-row gap-3">
              <form onSubmit={handleSearchSubmit} className="flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by username..."
                  className="w-full px-4 py-2.5 rounded-xl border border-rb-border text-sm font-label focus:outline-none focus:border-brand-gold/40"
                  style={{ color: '#000000', backgroundColor: '#e5e5e5' }}
                />
              </form>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(0); }}
                className="px-4 py-2.5 rounded-xl bg-rb-card border border-rb-border text-white text-sm font-label focus:outline-none appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="total_points" style={{ background: '#1a1a1a', color: '#fff' }}>Sort: Points</option>
                <option value="followers_count" style={{ background: '#1a1a1a', color: '#fff' }}>Sort: Followers</option>
                <option value="gold_points" style={{ background: '#1a1a1a', color: '#fff' }}>Sort: Gold Points</option>
                <option value="created_at" style={{ background: '#1a1a1a', color: '#fff' }}>Sort: Newest</option>
              </select>
            </div>

            {/* Users table */}
            {users && (
              <>
                <div className="glass-panel rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] font-label tracking-wider text-rb-muted/30 uppercase border-b border-rb-border/30">
                          <th className="text-left py-3 px-4">Username</th>
                          <th className="text-right py-3 px-4">Followers</th>
                          <th className="text-right py-3 px-4">Bronze</th>
                          <th className="text-right py-3 px-4">Silver</th>
                          <th className="text-right py-3 px-4">Gold</th>
                          <th className="text-right py-3 px-4">Power Points</th>
                          <th className="text-right py-3 px-4">REAL Pts</th>
                          <th className="text-right py-3 px-4">Cash $</th>
                          <th className="text-center py-3 px-4">Shared</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.users.map((user) => (
                          <tr key={user.twitterId} className="border-b border-rb-border/10 hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-4">
                              <a href={`https://x.com/${user.username}`} target="_blank" rel="noopener noreferrer" className="text-[#1DA1F2] hover:underline font-label font-bold">
                                @{user.username || user.twitterId}
                              </a>
                            </td>
                            <td className="py-2.5 px-4 text-right font-label text-rb-muted/50">{user.followersCount.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-label text-[#C8956C]/70">{user.bronzePoints.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-label text-[#9CA0A8]/70">{user.silverPoints.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-label text-brand-gold/70">{user.goldPoints.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-label text-white font-bold">{user.totalPoints.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-label text-brand-gold">{user.realPoints.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-label text-brand-red">${user.cashExposure.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-center font-label">
                              {user.hasShared ? (
                                user.sharePostUrl ? (
                                  <a href={user.sharePostUrl} target="_blank" rel="noopener noreferrer" className="text-[#1DA1F2] hover:underline text-xs" title={user.sharePostUrl}>🔗 Post</a>
                                ) : (
                                  <span className="text-green-400 text-xs">✓</span>
                                )
                              ) : (
                                <span className="text-rb-muted/20 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between">
                  <p className="text-rb-muted/30 text-xs font-label">
                    Showing {users.offset + 1}–{Math.min(users.offset + users.limit, users.total)} of {users.total}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-3 py-1.5 rounded-lg bg-rb-card border border-rb-border text-xs font-label text-rb-muted/50 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={users.offset + users.limit >= users.total}
                      className="px-3 py-1.5 rounded-lg bg-rb-card border border-rb-border text-xs font-label text-rb-muted/50 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ REFERRALS TAB ══ */}
        {tab === 'referrals' && (
          <div className="space-y-6">
            {/* Referral overview cards */}
            {referralsData && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: 'Total Referrals', value: formatNum(referralsData.overview.total_referrals), color: 'text-white' },
                    { label: 'Converted', value: formatNum(referralsData.overview.converted_referrals), color: 'text-green-400' },
                    { label: 'Unique Referrers', value: formatNum(referralsData.overview.unique_referrers), color: 'text-purple-400' },
                    { label: 'Referrer Bonus Issued', value: formatNum(referralsData.overview.total_referrer_bonus_issued) + ' pts', color: 'text-brand-gold' },
                    { label: 'Referred Bonus Issued', value: formatNum(referralsData.overview.total_referred_bonus_issued) + ' pts', color: 'text-blue-400' },
                  ].map((stat) => (
                    <div key={stat.label} className="glass-panel rounded-xl p-4">
                      <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-1">{stat.label}</p>
                      <p className={`text-xl font-bold font-label ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Top Referrers */}
                {referralsData.topReferrers.length > 0 && (
                  <div className="glass-panel rounded-xl p-5">
                    <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase mb-4">Top Referrers</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] font-label tracking-wider text-rb-muted/30 uppercase border-b border-rb-border/30">
                            <th className="text-left py-2 px-3">#</th>
                            <th className="text-left py-2 px-3">Username</th>
                            <th className="text-left py-2 px-3">Code</th>
                            <th className="text-right py-2 px-3">Referrals</th>
                            <th className="text-right py-2 px-3">Bonus Pts</th>
                            <th className="text-right py-2 px-3">Total Pts</th>
                            <th className="text-right py-2 px-3">Followers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {referralsData.topReferrers.map((r, i) => (
                            <tr key={r.twitterId} className="border-b border-rb-border/10 hover:bg-white/[0.02] transition-colors">
                              <td className="py-2.5 px-3 font-label text-rb-muted/40">{i + 1}</td>
                              <td className="py-2.5 px-3">
                                <a href={`https://x.com/${r.username}`} target="_blank" rel="noopener noreferrer" className="text-[#1DA1F2] hover:underline font-label font-bold">
                                  @{r.username}
                                </a>
                              </td>
                              <td className="py-2.5 px-3 font-label text-purple-400/70 text-xs">{r.referralCode}</td>
                              <td className="py-2.5 px-3 text-right font-label text-white font-bold">{r.referralCount}</td>
                              <td className="py-2.5 px-3 text-right font-label text-brand-gold">{r.referralBonusPoints.toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right font-label text-rb-muted/60">{r.totalPoints.toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right font-label text-rb-muted/50">{r.followersCount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* All Referrals */}
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row gap-3">
                    <form onSubmit={(e) => { e.preventDefault(); setRefPage(0); fetchReferrals(); }} className="flex-1">
                      <input
                        type="text"
                        value={refSearch}
                        onChange={(e) => setRefSearch(e.target.value)}
                        placeholder="Search by username or code..."
                        className="w-full px-4 py-2.5 rounded-xl border border-rb-border text-sm font-label focus:outline-none focus:border-purple-500/40"
                        style={{ color: '#000000', backgroundColor: '#e5e5e5' }}
                      />
                    </form>
                  </div>

                  <div className="glass-panel rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] font-label tracking-wider text-rb-muted/30 uppercase border-b border-rb-border/30">
                            <th className="text-left py-3 px-4">Referrer</th>
                            <th className="text-left py-3 px-4">Referred</th>
                            <th className="text-left py-3 px-4">Code</th>
                            <th className="text-right py-3 px-4">Referrer Bonus</th>
                            <th className="text-right py-3 px-4">Referred Bonus</th>
                            <th className="text-center py-3 px-4">Status</th>
                            <th className="text-right py-3 px-4">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {referralsData.referrals.map((ref, i) => (
                            <tr key={i} className="border-b border-rb-border/10 hover:bg-white/[0.02] transition-colors">
                              <td className="py-2.5 px-4 font-label font-bold text-[#1DA1F2]">@{ref.referrerUsername}</td>
                              <td className="py-2.5 px-4 font-label text-white/70">@{ref.referredUsername}</td>
                              <td className="py-2.5 px-4 font-label text-purple-400/70 text-xs">{ref.referralCode}</td>
                              <td className="py-2.5 px-4 text-right font-label text-brand-gold">+{ref.referrerBonus}</td>
                              <td className="py-2.5 px-4 text-right font-label text-blue-400">+{ref.referredBonus}</td>
                              <td className="py-2.5 px-4 text-center">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-label tracking-wider ${
                                  ref.status === 'converted' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {ref.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right text-xs text-rb-muted/40 font-label">
                                {new Date(ref.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                          {referralsData.referrals.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-rb-muted/40 text-sm font-label">
                                No referrals yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  {referralsData.total > 0 && (
                    <div className="flex items-center justify-between">
                      <p className="text-rb-muted/30 text-xs font-label">
                        Showing {referralsData.offset + 1}–{Math.min(referralsData.offset + referralsData.limit, referralsData.total)} of {referralsData.total}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRefPage(p => Math.max(0, p - 1))}
                          disabled={refPage === 0}
                          className="px-3 py-1.5 rounded-lg bg-rb-card border border-rb-border text-xs font-label text-rb-muted/50 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          ← Prev
                        </button>
                        <button
                          onClick={() => setRefPage(p => p + 1)}
                          disabled={referralsData.offset + referralsData.limit >= referralsData.total}
                          className="px-3 py-1.5 rounded-lg bg-rb-card border border-rb-border text-xs font-label text-rb-muted/50 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default AdminScreen;
