import React, { useState, useEffect } from 'react';
import { Search, User, TrendingUp, BarChart2, X, ChevronRight, Calendar, Zap, RotateCw, RefreshCw, Trophy } from 'lucide-react';
import { Player, PlayerStats } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

interface PlayerSearchProps {
  onClose: () => void;
}

export default function PlayerSearch({ onClose }: PlayerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const selectedLevel = 1; // Hardcoded to MLB
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const defaultSeason = (currentMonth < 4 ? currentYear - 1 : currentYear).toString();
  const [selectedSeason, setSelectedSeason] = useState(defaultSeason);

  const searchPlayers = async (name: string) => {
    if (!name.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/player/search?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) searchPlayers(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchPlayerStats = async (playerId: number, season?: string) => {
    setStatsLoading(true);
    try {
      const url = season 
        ? `/api/player/${playerId}/stats?season=${season}`
        : `/api/player/${playerId}/stats`;
        
      console.log(`[PlayerSearch] Fetching stats for player ${playerId} ${season ? `in season ${season}` : '(auto-detecting season)'}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Stats fetch failed');
      const data = await res.json();
      console.log(`[PlayerSearch] Stats received for ${playerId}:`, data);
      
      setPlayerStats(data);
      if (data.season) {
        setSelectedSeason(data.season);
      }
    } catch (err) {
      console.error('[PlayerSearch] Error fetching player stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const handlePlayerSelect = async (player: Player) => {
    // Clear previous stats and set loading
    setPlayerStats(null);
    setStatsLoading(true);
    
    try {
      // Fetch full player details to get accurate team info
      const res = await fetch(`/api/player/${player.id}`);
      if (res.ok) {
        const fullPlayer = await res.json();
        setSelectedPlayer(fullPlayer);
      } else {
        setSelectedPlayer(player);
      }
    } catch (err) {
      console.error("Error fetching player details:", err);
      setSelectedPlayer(player);
    }
    
    // Fetch stats for the selected player - let the server decide the best season initially
    fetchPlayerStats(player.id);
  };

  const handleSeasonChange = (season: string) => {
    setSelectedSeason(season);
    if (selectedPlayer) {
      fetchPlayerStats(selectedPlayer.id, season);
    }
  };

  const seasons = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const getStatValue = (stat: any, keys: string[]) => {
    const findInObj = (obj: any, targetKeys: string[]): any => {
      if (!obj || typeof obj !== 'object') return null;
      
      for (const key of targetKeys) {
        const val = obj[key];
        if (val !== undefined && val !== null) {
          // Handle strings like ".309"
          if (typeof val === 'string' && val.startsWith('.') && !isNaN(parseFloat('0' + val))) return parseFloat('0' + val);
          if (typeof val === 'number') return val;
          if (typeof val === 'string' && !isNaN(parseFloat(val))) return parseFloat(val);
          if (typeof val === 'object') {
            // Check common sub-keys used by MLB API for Statcast
            if (val.average !== undefined && val.average !== null) return val.average;
            if (val.value !== undefined && val.value !== null) return val.value;
            if (val.max !== undefined && val.max !== null) return val.max;
            if (val.total !== undefined && val.total !== null) return val.total;
            if (val.pct !== undefined && val.pct !== null) return val.pct;
          }
        }
      }
      
      // Try snake_case versions
      for (const key of targetKeys) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const val = obj[snakeKey];
        if (val !== undefined && val !== null) {
          if (typeof val === 'number') return val;
          if (typeof val === 'object') {
            if (val.average !== undefined && val.average !== null) return val.average;
            if (val.value !== undefined && val.value !== null) return val.value;
          }
        }
      }
      
      return null;
    };

    // 1. Check top level
    let result = findInObj(stat, keys);
    if (result !== null) {
      console.log(`Found ${keys[0]} at top level:`, result);
      return result;
    }

    // 2. Check one level deep (common for 'stat' wrapper)
    for (const k in stat) {
      if (typeof stat[k] === 'object' && stat[k] !== null) {
        // Special check for 'stat' or 'statcastMetrics' sub-objects
        result = findInObj(stat[k], keys);
        if (result !== null) {
          console.log(`Found ${keys[0]} in ${k}:`, result);
          return result;
        }
        
        // Check one more level deep for 'stat' inside 'stat' (happens sometimes)
        if (k === 'stat' || k === 'statcastMetrics') {
          for (const subK in stat[k]) {
            if (typeof stat[k][subK] === 'object' && stat[k][subK] !== null) {
              result = findInObj(stat[k][subK], keys);
              if (result !== null) return result;
            }
          }
        }
      }
    }
    
    return null;
  };

  const formatValue = (val: any, precision: number = 1, stripLeadingZero: boolean = false) => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val.toString();
    
    let formatted = num.toFixed(precision);
    if (stripLeadingZero && formatted.startsWith('0.')) {
      formatted = formatted.substring(1);
    }
    return formatted;
  };

  const getSportName = (sportId: number) => {
    const sports: Record<number, string> = {
      1: 'MLB',
      11: 'Triple-A',
      12: 'Double-A',
      13: 'High-A',
      14: 'Single-A',
      15: 'Short-Season A',
      16: 'Rookie',
      17: 'Winter League',
      21: 'Minors',
      22: 'College',
      23: 'High School',
      51: 'International',
      508: 'Spring Training'
    };
    return sports[sportId] || `Level ${sportId}`;
  };

  const filteredHitting = playerStats?.hitting?.filter(s => Number(s.sport?.id) === selectedLevel) || [];
  const filteredPitching = playerStats?.pitching?.filter(s => Number(s.sport?.id) === selectedLevel) || [];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600/20 p-2 rounded-lg">
              <Search className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">MLB Player Stats Search</h2>
              <p className="text-sm text-slate-400">Search for any MLB player and view their performance metrics</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-hidden flex flex-col md:flex-row">
          {/* Search & Results Side */}
          <div className={`w-full md:w-1/3 border-r border-slate-800 flex flex-col bg-slate-900/30 ${selectedPlayer ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Type player name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <RotateCw className="w-6 h-6 text-indigo-500 animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">Searching MLB database...</p>
                </div>
              ) : results.length > 0 ? (
                results.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handlePlayerSelect(player)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                      selectedPlayer?.id === player.id 
                        ? 'bg-indigo-600/20 border border-indigo-500/30 shadow-lg shadow-indigo-500/10' 
                        : 'hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                        <img 
                          src={`https://www.mlbstatic.com/team-logos/${player.currentTeam?.id || player.team?.id || 1}.svg`}
                          alt="Team"
                          className="w-full h-full object-contain p-1.5"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-logos/1.svg';
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white truncate">{player.fullName}</p>
                        {!player.active && (
                          <span className="text-[8px] bg-slate-800 text-slate-500 px-1 rounded border border-slate-700">Inactive</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        {player.currentTeam?.name || player.team?.name || 'Free Agent'} • {player.primaryPosition?.abbreviation}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedPlayer?.id === player.id ? 'text-indigo-400 translate-x-1' : 'text-slate-600'}`} />
                  </button>
                ))
              ) : query && !loading ? (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-500">No players found for "{query}"</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <User className="w-12 h-12 text-slate-800 mb-4" />
                  <p className="text-sm text-slate-500">Enter a player name to see their Statcast performance metrics</p>
                </div>
              )}
            </div>
          </div>

          {/* Stats Display Side */}
          <div className={`flex-grow overflow-y-auto bg-slate-950/50 p-6 ${!selectedPlayer ? 'hidden md:block' : 'block'}`}>
            <AnimatePresence mode="wait">
              {selectedPlayer ? (
                <motion.div
                  key={selectedPlayer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  {/* Mobile Back Button */}
                  <button 
                    onClick={() => setSelectedPlayer(null)}
                    className="md:hidden flex items-center gap-2 text-indigo-400 font-bold text-sm mb-4"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Back to Search
                  </button>

                  {/* Player Hero */}
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                    <div className="w-32 h-32 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl relative group flex items-center justify-center">
                      <img 
                        src={`https://www.mlbstatic.com/team-logos/${selectedPlayer.currentTeam?.id || selectedPlayer.team?.id || 1}.svg`}
                        alt="Team Logo"
                        className="w-24 h-24 object-contain"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-logos/1.svg';
                        }}
                      />
                    </div>
                    <div className="text-center md:text-left space-y-2">
                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                        <h3 className="text-3xl font-black text-white tracking-tight">{selectedPlayer.fullName}</h3>
                        <span className="bg-indigo-600 text-white text-xs font-black px-2 py-1 rounded uppercase tracking-widest">
                          #{selectedPlayer.primaryNumber || '--'}
                        </span>
                      </div>
                      <p className="text-lg text-slate-400 font-medium">
                        {selectedPlayer.currentTeam?.name || selectedPlayer.team?.name || 'Free Agent'} • {selectedPlayer.primaryPosition?.name}
                      </p>

                      {playerStats && (
                        <div className="flex flex-col items-center md:items-start gap-2 pt-1">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 rounded-full border border-slate-800">
                            <div className={cn("w-1.5 h-1.5 rounded-full", (playerStats.hitting.length + playerStats.pitching.length) > 0 ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                              {playerStats.hitting.length + playerStats.pitching.length} Data Points Found for {selectedSeason}
                            </span>
                          </div>
                          {(playerStats.hitting.length + playerStats.pitching.length) === 0 && !statsLoading && (
                            <p className="text-[10px] text-rose-400 font-medium italic">
                              No stats found for this season. Try selecting a different year.
                            </p>
                          )}
                        </div>
                      )}
                      
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500/50 transition-all group relative">
                            <Calendar className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                            <div className="flex flex-col items-start">
                              <span className="text-[8px] font-bold text-slate-500 uppercase leading-none mb-0.5">Season</span>
                              <select 
                                value={selectedSeason}
                                onChange={(e) => handleSeasonChange(e.target.value)}
                                className="bg-transparent text-sm font-bold text-slate-200 focus:outline-none cursor-pointer appearance-none pr-4"
                              >
                                {seasons.map(s => (
                                  <option key={s} value={s} className="bg-slate-900">{s}</option>
                                ))}
                              </select>
                            </div>
                            <ChevronRight className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                          </div>

                          <button 
                            onClick={() => fetchPlayerStats(selectedPlayer.id, selectedSeason)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors text-slate-400 hover:text-indigo-400"
                            title="Refresh Stats"
                          >
                            <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="min-h-[400px] space-y-8">
                    {statsLoading ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="relative">
                          <BarChart2 className="w-12 h-12 text-indigo-500/20" />
                          <RotateCw className="absolute inset-0 w-12 h-12 text-indigo-500 animate-spin" />
                        </div>
                        <p className="text-sm text-slate-400 font-medium">Analyzing performance data for {selectedSeason}...</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest animate-pulse">Fetching from MLB Stats API</p>
                      </div>
                    ) : playerStats && (filteredHitting.length > 0 || filteredPitching.length > 0) ? (
                      <div className="space-y-8">
                      {/* Hitting Stats */}
                      {filteredHitting.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            {getSportName(selectedLevel)} Hitting Metrics
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <StatCard 
                              label="AVG" 
                              value={formatValue(filteredHitting.map(s => getStatValue(s.stat || s, ['avg', 'battingAverage'])).find(v => v !== null), 3, true)} 
                              unit="" 
                              color="emerald"
                            />
                            <StatCard 
                              label="OBP" 
                              value={formatValue(filteredHitting.map(s => getStatValue(s.stat || s, ['obp', 'onBasePercentage'])).find(v => v !== null), 3, true)} 
                              unit="" 
                              color="indigo"
                            />
                            <StatCard 
                              label="SLG" 
                              value={formatValue(filteredHitting.map(s => getStatValue(s.stat || s, ['slg', 'sluggingPercentage'])).find(v => v !== null), 3, true)} 
                              unit="" 
                              color="rose"
                            />
                            <StatCard 
                              label="OPS" 
                              value={formatValue(filteredHitting.map(s => getStatValue(s.stat || s, ['ops', 'onBasePlusSlugging'])).find(v => v !== null), 3, true)} 
                              unit="" 
                              color="amber"
                            />
                            <StatCard 
                              label="Home Runs" 
                              value={formatValue(filteredHitting.map(s => getStatValue(s.stat || s, ['homeRuns', 'hr'])).find(v => v !== null), 0)} 
                              unit="" 
                              color="rose"
                            />
                            <StatCard 
                              label="RBI" 
                              value={formatValue(filteredHitting.map(s => getStatValue(s.stat || s, ['rbi', 'runsBattedIn'])).find(v => v !== null), 0)} 
                              unit="" 
                              color="emerald"
                            />
                          </div>
                        </div>
                      )}


                      {/* Pitching Stats */}
                      {filteredPitching.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Zap className="w-4 h-4 text-indigo-400" />
                            {getSportName(selectedLevel)} Pitching Metrics
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <StatCard 
                              label="ERA" 
                              value={formatValue(filteredPitching.map(s => getStatValue(s.stat || s, ['era', 'earnedRunAverage'])).find(v => v !== null), 2)} 
                              unit="" 
                              color="rose"
                            />
                            <StatCard 
                              label="WHIP" 
                              value={formatValue(filteredPitching.map(s => getStatValue(s.stat || s, ['whip'])).find(v => v !== null), 2)} 
                              unit="" 
                              color="indigo"
                            />
                            <StatCard 
                              label="Strikeouts" 
                              value={formatValue(filteredPitching.map(s => getStatValue(s.stat || s, ['strikeOuts', 'so', 'k'])).find(v => v !== null), 0)} 
                              unit="" 
                              color="emerald"
                            />
                            <StatCard 
                              label="Wins" 
                              value={formatValue(filteredPitching.map(s => getStatValue(s.stat || s, ['wins', 'w'])).find(v => v !== null), 0)} 
                              unit="" 
                              color="sky"
                            />
                            <StatCard 
                              label="Opp. AVG" 
                              value={formatValue(filteredPitching.map(s => getStatValue(s.stat || s, ['avg', 'opponentBattingAverage'])).find(v => v !== null), 3, true)} 
                              unit="" 
                              color="amber"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : playerStats ? (
                    <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
                      <BarChart2 className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                      <p className="text-slate-400 font-medium">No metrics could be extracted for {getSportName(selectedLevel)} in the {selectedSeason} season.</p>
                      <p className="text-xs text-slate-500 mt-1">Try selecting a different level or season.</p>
                    </div>
                  ) : null}
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                  <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                    <User className="w-10 h-10 text-slate-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-300">Select a Player</h3>
                    <p className="text-sm text-slate-500 max-w-xs">Choose a player from the search results to view their detailed performance metrics.</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: any; unit: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    indigo: 'text-indigo-400 bg-indigo-400/10 border-indigo-500/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    violet: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
    sky: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    rose: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 p-5 rounded-2xl shadow-xl backdrop-blur-sm group hover:border-slate-700 transition-all">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 group-hover:text-slate-400 transition-colors">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-black tabular-nums tracking-tight ${colorMap[color].split(' ')[0]}`}>
          {(value !== null && value !== undefined) ? value : '--'}
        </span>
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{unit}</span>
      </div>
      <div className={`mt-4 h-1 w-full rounded-full overflow-hidden bg-slate-800/50`}>
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: value && value !== '--' ? '100%' : '0%' }}
          className={`h-full rounded-full ${colorMap[color].split(' ')[1].replace('/10', '')} opacity-40`}
        />
      </div>
    </div>
  );
}

