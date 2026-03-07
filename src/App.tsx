import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  ChevronRight, 
  Database, 
  RefreshCw, 
  Search, 
  Calendar,
  Wind,
  RotateCw,
  Target,
  ArrowLeft,
  Info,
  Users,
  Trophy,
  Zap,
  BarChart3
} from 'lucide-react';
import { Game, GameDetail, Play, Pitch } from './types';
import StrikeZone from './components/StrikeZone';
import PlayerSearch from './components/PlayerSearch';
import PlayerPerformanceCharts from './components/PlayerPerformanceCharts';
import { cn } from './lib/utils';
import { format } from 'date-fns';

const PitchIndicator = ({ pitch, index, size = "md", active = false }: { pitch: any, index: number, size?: "sm" | "md", active?: boolean, key?: any }) => {
  const result = (pitch.result || pitch.details?.description || '').toLowerCase();
  const typeCode = (pitch.pitch_type || pitch.details?.type?.code || '').toLowerCase();
  const typeDesc = (pitch.pitch_type || pitch.details?.type?.description || '').toLowerCase();
  
  const isStrike = result.includes('strike') || result.includes('foul') || result.includes('swinging');
  const isBall = result.includes('ball');
  const isInPlay = result.includes('in play');

  // Color based on result
  const colorClass = isStrike ? "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20" :
                     isBall ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20" :
                     isInPlay ? "bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20" :
                     "bg-slate-700 border-slate-600 text-slate-300";

  // Shape based on pitch type
  // Fastballs: Circle (default)
  // Breaking Balls: Diamond (rotate-45)
  // Offspeed: Square
  let shapeClass = "rounded-full"; 
  const isBreaking = typeCode.includes('cu') || typeCode.includes('kc') || typeCode.includes('sl') || typeCode.includes('st') || typeCode.includes('sv') || typeDesc.includes('curve') || typeDesc.includes('slider');
  const isOffspeed = typeCode.includes('ch') || typeCode.includes('fs') || typeCode.includes('sc') || typeDesc.includes('change') || typeDesc.includes('splitter');

  if (isBreaking) {
    shapeClass = "rotate-45 rounded-sm"; 
  } else if (isOffspeed) {
    shapeClass = "rounded-sm"; 
  }

  const sizeClasses = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[10px]";

  return (
    <div 
      className={cn(
        "flex-shrink-0 flex items-center justify-center font-black border shadow-sm transition-all hover:scale-110",
        shapeClass,
        colorClass,
        sizeClasses,
        active && "ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-110 z-10"
      )} 
      title={`${pitch.pitch_type || pitch.details?.type?.description || 'Unknown'} - ${pitch.result || pitch.details?.description || 'Unknown'}`}
    >
      <span className={cn(isBreaking ? "-rotate-45" : "")}>
        {index}
      </span>
    </div>
  );
};

const PitchLegend = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Strike</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Ball</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">In Play</span>
    </div>
    <div className="w-px h-3 bg-slate-800 mx-1" />
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Fastball</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-sm rotate-45 bg-slate-600" />
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Breaking</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Offspeed</span>
    </div>
  </div>
);

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [selectedSportId, setSelectedSportId] = useState<number>(1); // Default to MLB
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null);
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [gamePlayerStats, setGamePlayerStats] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [selectedPitchId, setSelectedPitchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'roster' | 'analytics'>('live');
  const [rosterTeamFilter, setRosterTeamFilter] = useState<'away' | 'home'>('away');
  const [searchQuery, setSearchQuery] = useState('');
  const [batterSearch, setBatterSearch] = useState('');
  const [pitcherSearch, setPitcherSearch] = useState('');
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);

  useEffect(() => {
    fetchGames(selectedDate, selectedSportId);
    const interval = setInterval(() => {
      if (selectedGamePk) {
        syncGame(selectedGamePk);
      } else {
        fetchGames(selectedDate, selectedSportId);
      }
    }, selectedGamePk ? 5000 : 60000); // Poll every 5s for active game, 60s for list
    return () => clearInterval(interval);
  }, [selectedGamePk, selectedDate, selectedSportId]);

  const fetchGames = async (date: string, sportId: number = 1) => {
    try {
      const res = await fetch(`/api/games?date=${date}&sportId=${sportId}`);
      if (!res.ok) {
        const text = await res.text();
        console.error(`Server error ${res.status}:`, text);
        throw new Error(`Server error: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Expected JSON but got:", {
          status: res.status,
          contentType,
          headers: Object.fromEntries(res.headers.entries()),
          body: text.substring(0, 500)
        });
        throw new Error("Expected JSON response but got something else");
      }
      const data = await res.json();
      setGames(data);
    } catch (err) {
      console.error("fetchGames error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGameDetail = async (pk: number) => {
    try {
      const res = await fetch(`/api/game/${pk}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Expected JSON response but got something else");
      }
      const data = await res.json();
      setGameDetail(data);
      fetchGamePlayerStats(pk);
    } catch (err) {
      console.error("fetchGameDetail error:", err);
    }
  };

  const fetchGamePlayerStats = async (pk: number) => {
    try {
      const res = await fetch(`/api/game/${pk}/player-stats`);
      if (res.ok) {
        const data = await res.json();
        setGamePlayerStats(data);
      }
    } catch (err) {
      console.error("fetchGamePlayerStats error:", err);
    }
  };

  const syncGame = async (pk: number) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sync/${pk}`);
      if (!res.ok) throw new Error(`Sync error: ${res.status}`);
      const data = await res.json();
      if (data.game_pk) {
        setGameDetail(data);
        fetchGamePlayerStats(pk);
      } else {
        await fetchGameDetail(pk);
      }
    } catch (err) {
      console.error("syncGame error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const syncDate = async (date: string, sportId: number = 1) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sync-date?date=${date}&sportId=${sportId}`);
      if (!res.ok) throw new Error(`Sync date error: ${res.status}`);
      await fetchGames(date, sportId);
    } catch (err) {
      console.error("syncDate error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleGameSelect = (pk: number) => {
    setSelectedGamePk(pk);
    setSearchQuery('');
    syncGame(pk);
  };

  const selectedPlay = gameDetail?.plays.find(p => p.play_id === selectedPlayId);

  // Calculate Game Stats
  const formatPlayerName = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return `${firstName.charAt(0)}. ${lastName}`;
  };

  const calculateStats = () => {
    if (!gameDetail) return { batters: [], pitchers: [] };

    const batters: any[] = [];
    const pitchers: any[] = [];

    const getSeasonStat = (playerId: number, group: string, statName: string) => {
      const stats = gamePlayerStats[playerId];
      if (!stats) return null;
      const groupStats = stats.find((s: any) => s.group.displayName.toLowerCase() === group);
      if (!groupStats || !groupStats.splits || groupStats.splits.length === 0) return null;
      // Find the split for the current season (or the most recent one)
      const split = groupStats.splits[0]; // The API call already filtered for season if we wanted, but here we just take the first
      return split.stat[statName];
    };

    // If boxscore is available, use it for official stats
    if (gameDetail.boxscore && gameDetail.boxscore.teams) {
      ['home', 'away'].forEach(side => {
        const team = gameDetail.boxscore.teams[side];
        if (!team || !team.players) return;

        const teamId = team.team?.id;
        
        Object.values(team.players).forEach((player: any) => {
          const stats = player.stats;
          if (!stats) return;

          const playerId = player.person?.id;
          const seasonAvg = getSeasonStat(playerId, 'hitting', 'avg');
          const seasonHr = getSeasonStat(playerId, 'hitting', 'homeRuns');
          const seasonEra = getSeasonStat(playerId, 'pitching', 'era');

          // Support both 'batting' and 'hitting' keys
          const batting = stats.batting || stats.hitting;
          
          if (batting && (
            (batting.atBats !== undefined && batting.atBats > 0) || 
            (batting.plateAppearances !== undefined && batting.plateAppearances > 0) || 
            (batting.hits !== undefined && batting.hits > 0) ||
            (batting.rbi !== undefined && batting.rbi > 0)
          )) {
            batters.push({
              name: player.person?.fullName || "Unknown",
              id: playerId,
              teamId,
              ab: batting.atBats || 0,
              h: batting.hits || 0,
              hr: batting.homeRuns || 0,
              k: batting.strikeOuts || 0,
              bb: batting.baseOnBalls || 0,
              rbi: batting.rbi || 0,
              avg: batting.atBats > 0 ? (batting.hits / batting.atBats).toFixed(3).replace(/^0/, '') : '.000',
              seasonAvg: seasonAvg ? seasonAvg.replace(/^0/, '') : null,
              seasonHr: seasonHr
            });
          }
          
          const pitching = stats.pitching;
          if (pitching && (
            (pitching.inningsPitched !== undefined && pitching.inningsPitched !== "0.0") || 
            (pitching.battersFaced !== undefined && pitching.battersFaced > 0) ||
            (pitching.outs !== undefined && pitching.outs > 0) ||
            (pitching.strikeOuts !== undefined && pitching.strikeOuts > 0)
          )) {
            pitchers.push({
              name: player.person?.fullName || "Unknown",
              id: playerId,
              teamId,
              ip: pitching.inningsPitched || "0.0",
              h: pitching.hits || 0,
              r: pitching.runs || 0,
              er: pitching.earnedRuns || 0,
              k: pitching.strikeOuts || 0,
              bb: pitching.baseOnBalls || 0,
              era: pitching.era || '0.00',
              seasonEra: seasonEra
            });
          }
        });
      });
    }

    // If we have no batters or pitchers from boxscore, try manual calculation from plays
    if (batters.length === 0 && pitchers.length === 0 && gameDetail.plays) {
      const batterStats: Record<string, any> = {};
      const pitcherStats: Record<string, any> = {};

      gameDetail.plays.forEach(play => {
        const event = play.event?.toLowerCase() || '';
        
        // Batter Stats
        if (!batterStats[play.batter_name]) {
          batterStats[play.batter_name] = { id: play.batter_id, teamId: play.batter_team_id, ab: 0, h: 0, hr: 0, k: 0, bb: 0, rbi: 0 };
        }
        const b = batterStats[play.batter_name];
        
        const isHit = play.is_hit || 
                      ['single', 'double', 'triple', 'home_run', 'home run'].includes(event) || 
                      event.includes('home_run') || 
                      event.includes('home run');
                      
        const isWalk = event.includes('walk') || event.includes('hit_by_pitch');
        const isSac = event.includes('sac_fly') || event.includes('sac_bunt');
        
        const isAtBat = play.is_at_bat || (isHit || (!isWalk && !isSac && event !== '' && !event.includes('interference')));

        if (isAtBat) b.ab += 1;
        if (isHit) b.h += 1;
        if (event.includes('home_run') || event.includes('home run')) b.hr += 1;
        if (event.includes('strikeout')) b.k += 1;
        if (isWalk) b.bb += 1;
        b.rbi += (play.rbi || 0);

        // Pitcher Stats
        if (!pitcherStats[play.pitcher_name]) {
          pitcherStats[play.pitcher_name] = { id: play.pitcher_id, teamId: play.pitcher_team_id, outs: 0, h: 0, r: 0, er: 0, k: 0, bb: 0 };
        }
        const p = pitcherStats[play.pitcher_name];
        if (isHit) p.h += 1;
        if (event.includes('strikeout')) p.k += 1;
        if (isWalk) p.bb += 1;
        
        let outsOnPlay = play.outs_recorded || 0;
        if (outsOnPlay === 0) {
          if (event.includes('triple_play')) outsOnPlay = 3;
          else if (event.includes('double_play')) outsOnPlay = 2;
          else if (event.includes('out') || event.includes('strikeout') || event.includes('caught_stealing') || event.includes('pickoff')) {
            if (!isHit && !isWalk) outsOnPlay = 1;
          }
        }
        p.outs += outsOnPlay;
        p.r += (play.rbi || 0);
        p.er = p.r;
      });

      Object.entries(batterStats).forEach(([name, s]) => {
        if (s.ab > 0 || s.h > 0 || s.bb > 0) {
          batters.push({
            name,
            ...s,
            avg: s.ab > 0 ? (s.h / s.ab).toFixed(3).replace(/^0/, '') : '.000'
          });
        }
      });

      Object.entries(pitcherStats).forEach(([name, s]) => {
        if (s.outs > 0 || s.h > 0 || s.k > 0) {
          pitchers.push({
            name,
            ...s,
            ip: `${Math.floor(s.outs / 3)}.${s.outs % 3}`,
            era: s.outs > 0 ? ((s.er * 27) / s.outs).toFixed(2) : '0.00'
          });
        }
      });
    }

    return {
      batters: batters.sort((a, b) => b.h - a.h || b.rbi - a.rbi),
      pitchers: pitchers.sort((a, b) => b.k - a.k || a.er - b.er)
    };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-slate-400 font-medium">Loading MLB Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
            setSelectedGamePk(null);
            setSearchQuery('');
          }}>
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Statcast Live</h1>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <div className="flex flex-wrap gap-2 justify-end">
              <div 
                className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 w-full md:w-auto cursor-pointer hover:border-indigo-500/50 transition-colors"
                onClick={() => {
                  if (dateInputRef.current) {
                    if ('showPicker' in dateInputRef.current) {
                      try {
                        (dateInputRef.current as any).showPicker();
                      } catch (e) {
                        dateInputRef.current.focus();
                      }
                    } else {
                      dateInputRef.current.focus();
                    }
                  }
                }}
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                <input 
                  ref={dateInputRef}
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent text-sm font-semibold text-slate-200 outline-none cursor-pointer w-full"
                />
              </div>
            </div>
            <button 
              onClick={() => syncDate(selectedDate, selectedSportId)}
              disabled={syncing}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 w-full"
            >
              <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
              Sync Games
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!selectedGamePk ? (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button 
                onClick={() => setShowPlayerSearch(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all group"
              >
                <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="font-bold">Search Player Statcast</span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-100">Games for {format(new Date(selectedDate + 'T12:00:00'), 'MMMM do, yyyy')}</h2>
              <div className="text-sm text-slate-400 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {format(new Date(selectedDate + 'T12:00:00'), 'EEEE')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.length > 0 ? [...games].sort((a, b) => {
                const getPriority = (status: string) => {
                  const s = status.toLowerCase();
                  if (s.includes('progress') || s.includes('warmup') || s.includes('delayed')) return 0;
                  if (s.includes('pre-game') || s.includes('scheduled')) return 1;
                  if (s.includes('final') || s.includes('completed') || s.includes('over')) return 2;
                  return 3;
                };
                return getPriority(a.status) - getPriority(b.status);
              }).map((game) => (
                <motion.div
                  key={game.game_pk}
                  whileHover={{ y: -4 }}
                  onClick={() => handleGameSelect(game.game_pk)}
                  className="bg-slate-900 p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                      game.status === 'Final' ? "bg-slate-800 text-slate-400" : "bg-emerald-900/30 text-emerald-400"
                    )}>
                      {game.status}
                    </span>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-bold text-base text-slate-100">{game.away_team}</span>
                        <span className="text-2xl font-black text-indigo-400">{game.away_score}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-base text-slate-100">{game.home_team}</span>
                        <span className="text-2xl font-black text-indigo-400">{game.home_score}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-full py-20 text-center bg-slate-900 rounded-2xl border border-dashed border-slate-800">
                  <p className="text-slate-500">No games found. Click "Sync Games" to fetch the schedule.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Game Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <button 
                onClick={() => {
                  setSelectedGamePk(null);
                  setSearchQuery('');
                }}
                className="flex items-center gap-2 text-slate-400 hover:text-indigo-400 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Games
              </button>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="flex items-center justify-end gap-2 mb-2">
                    {gameDetail?.status.toLowerCase().includes('progress') && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">Live</span>
                      </div>
                    )}
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-white uppercase flex items-center gap-3 md:gap-6">
                    <div className="flex items-center gap-2 md:gap-4">
                      <div className="w-10 h-10 md:w-14 md:h-14 bg-slate-900 rounded-xl p-1.5 flex items-center justify-center border border-slate-800 shadow-xl">
                        <img 
                          src={`https://www.mlbstatic.com/team-logos/${gameDetail?.away_team_id || 1}.svg`}
                          alt={gameDetail?.away_team}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-xs md:text-sm font-bold">{gameDetail?.away_team}</span>
                        <span className="text-2xl md:text-3xl text-indigo-400">{gameDetail?.away_score}</span>
                      </div>
                    </div>
                    <span className="text-slate-700 text-xs md:text-sm">VS</span>
                    <div className="flex items-center gap-2 md:gap-4">
                      <div className="flex flex-col items-end text-right">
                        <span className="text-xs md:text-sm font-bold">{gameDetail?.home_team}</span>
                        <span className="text-2xl md:text-3xl text-indigo-400">{gameDetail?.home_score}</span>
                      </div>
                      <div className="w-10 h-10 md:w-14 md:h-14 bg-slate-900 rounded-xl p-1.5 flex items-center justify-center border border-slate-800 shadow-xl">
                        <img 
                          src={`https://www.mlbstatic.com/team-logos/${gameDetail?.home_team_id || 1}.svg`}
                          alt={gameDetail?.home_team}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  </h2>
                  <p className="text-xs md:text-sm text-slate-400 font-medium">{gameDetail?.status}</p>
                </div>
              </div>
            </div>

            {/* Live Game State Card */}
            {gameDetail?.linescore && (
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Target className="w-32 h-32" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center relative z-10">
                  {/* Inning & Outs */}
                  <div className="flex flex-col items-center md:items-start gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-white">
                        {gameDetail.linescore.inningHalf === 'Top' ? '▲' : '▼'} {gameDetail.linescore.currentInningOrdinal}
                      </span>
                      <span className="text-slate-500 font-bold">Inning</span>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {[1, 2, 3].map((i) => (
                        <div 
                          key={i}
                          className={cn(
                            "w-3 h-3 rounded-full border transition-all duration-500",
                            (gameDetail.linescore.outs || 0) >= i 
                              ? "bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                              : "bg-slate-800 border-slate-700"
                          )}
                        />
                      ))}
                      <span className="ml-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Outs</span>
                    </div>
                  </div>

                  {/* Count & Runners */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-8">
                      <div className="flex flex-col items-center">
                        <span className="text-3xl font-black text-indigo-400 font-mono">
                          {gameDetail.linescore.balls || 0}-{gameDetail.linescore.strikes || 0}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Count</span>
                      </div>
                      
                      {/* Diamond */}
                      <div className="relative w-16 h-16 rotate-45 border-2 border-slate-800/50 rounded-sm">
                        {/* 1st Base */}
                        <div className={cn(
                          "absolute -top-1 -right-1 w-5 h-5 border border-slate-700 transition-all duration-500",
                          gameDetail.linescore.offense?.first ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)] border-amber-300" : "bg-slate-900"
                        )} />
                        {/* 2nd Base */}
                        <div className={cn(
                          "absolute -top-1 -left-1 w-5 h-5 border border-slate-700 transition-all duration-500",
                          gameDetail.linescore.offense?.second ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)] border-amber-300" : "bg-slate-900"
                        )} />
                        {/* 3rd Base */}
                        <div className={cn(
                          "absolute -bottom-1 -left-1 w-5 h-5 border border-slate-700 transition-all duration-500",
                          gameDetail.linescore.offense?.third ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)] border-amber-300" : "bg-slate-900"
                        )} />
                      </div>
                    </div>
                  </div>

                  {/* Current Matchup */}
                  <div className="flex flex-col items-center md:items-end gap-2">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Batter</p>
                      <p className="text-sm font-black text-white">{gameDetail.linescore.offense?.batter?.fullName || 'Waiting...'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Pitcher</p>
                      <p className="text-sm font-black text-white">{gameDetail.linescore.defense?.pitcher?.fullName || 'Waiting...'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-800">
              <button 
                onClick={() => setActiveTab('live')}
                className={cn(
                  "px-6 py-3 text-sm font-bold transition-all border-b-2",
                  activeTab === 'live' ? "text-indigo-400 border-indigo-500 bg-indigo-500/5" : "text-slate-500 border-transparent hover:text-slate-300"
                )}
              >
                Live Feed
              </button>
              <button 
                onClick={() => setActiveTab('roster')}
                className={cn(
                  "px-6 py-3 text-sm font-bold transition-all border-b-2",
                  activeTab === 'roster' ? "text-indigo-400 border-indigo-500 bg-indigo-500/5" : "text-slate-500 border-transparent hover:text-slate-300"
                )}
              >
                Full Roster & Season Stats
              </button>
              <button 
                onClick={() => setActiveTab('analytics')}
                className={cn(
                  "px-6 py-3 text-sm font-bold transition-all border-b-2",
                  activeTab === 'analytics' ? "text-indigo-400 border-indigo-500 bg-indigo-500/5" : "text-slate-500 border-transparent hover:text-slate-300"
                )}
              >
                Game Analytics
              </button>
            </div>

            {activeTab === 'live' ? (
              <>
                {/* Current Matchup / Live Summary */}
                {gameDetail?.status.toLowerCase().includes('progress') && (
                  <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900 rounded-2xl border border-indigo-500/30 p-6 shadow-2xl shadow-indigo-500/10 mb-8">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">Live Matchup</span>
                      </div>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                        {gameDetail.current_play?.about?.atBatIndex !== undefined ? `At-Bat #${gameDetail.current_play.about.atBatIndex + 1}` : 'In Progress'}
                      </span>
                    </div>

                    {(() => {
                      const currentPlay = gameDetail.current_play;
                      const lastCompletedPlay = gameDetail.plays[0]; // Sorted by index DESC in backend
                      
                      const batterName = currentPlay?.matchup?.batter?.fullName || lastCompletedPlay?.batter_name || 'Waiting...';
                      const pitcherName = currentPlay?.matchup?.pitcher?.fullName || lastCompletedPlay?.pitcher_name || 'Waiting...';
                      const batterTeamId = (gameDetail.linescore?.inningHalf === 'Top' ? gameDetail.away_team_id : gameDetail.home_team_id);
                      const pitcherTeamId = (gameDetail.linescore?.inningHalf === 'Top' ? gameDetail.home_team_id : gameDetail.away_team_id);

                      const currentPitches = currentPlay?.playEvents?.filter((e: any) => e.type === 'pitch') || [];
                      const lastPitch = currentPitches[currentPitches.length - 1];

                      // Map current pitches to our Pitch type for StrikeZone
                      const strikeZonePitches: Pitch[] = currentPitches.map((p: any, idx: number) => ({
                        pitch_id: `current_${idx}`,
                        play_id: 'current',
                        pitch_number: p.pitchNumber || idx + 1,
                        pitch_type: p.details?.type?.description || 'Unknown',
                        velocity: p.pitchData?.startSpeed || null,
                        spin_rate: p.pitchData?.breaks?.spinRate || null,
                        pfx_x: p.pitchData?.coordinates?.pfxX || null,
                        pfx_z: p.pitchData?.coordinates?.pfxZ || null,
                        px: p.pitchData?.coordinates?.pX || null,
                        pz: p.pitchData?.coordinates?.pZ || null,
                        extension: p.pitchData?.extension || null,
                        result: p.details?.description || ''
                      }));

                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          <div className="lg:col-span-2 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                              {/* Batter */}
                              <div className="flex items-center gap-6">
                                <div className="relative">
                                  <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shadow-xl">
                                    <img 
                                      src={`https://www.mlbstatic.com/team-logos/${batterTeamId}.svg`}
                                      alt="Batter Team"
                                      className="w-12 h-12 object-contain opacity-20 absolute"
                                      referrerPolicy="no-referrer"
                                    />
                                    <Users className="w-10 h-10 text-slate-600 relative z-10" />
                                  </div>
                                  <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg">
                                    BATTER
                                  </div>
                                </div>
                                <div className="flex flex-col">
                                  <h4 className="text-2xl font-black text-white tracking-tight leading-none mb-1">
                                    {batterName}
                                  </h4>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-500 uppercase">Current At-Bat</span>
                                    <div className="h-1 w-1 bg-slate-700 rounded-full" />
                                    <span className="text-xs font-mono text-indigo-400 font-bold">
                                      {stats.batters.find(b => b.name === batterName)?.avg || '.000'} AVG
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Pitcher */}
                              <div className="flex items-center gap-6 md:flex-row-reverse md:text-right">
                                <div className="relative">
                                  <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shadow-xl">
                                    <img 
                                      src={`https://www.mlbstatic.com/team-logos/${pitcherTeamId}.svg`}
                                      alt="Pitcher Team"
                                      className="w-12 h-12 object-contain opacity-20 absolute"
                                      referrerPolicy="no-referrer"
                                    />
                                    <Target className="w-10 h-10 text-slate-600 relative z-10" />
                                  </div>
                                  <div className="absolute -bottom-2 -left-2 md:-left-auto md:-right-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg">
                                    PITCHER
                                  </div>
                                </div>
                                <div className="flex flex-col">
                                  <h4 className="text-2xl font-black text-white tracking-tight leading-none mb-1">
                                    {pitcherName}
                                  </h4>
                                  <div className="flex items-center gap-3 md:flex-row-reverse">
                                    <span className="text-xs font-bold text-slate-500 uppercase">On Mound</span>
                                    <div className="h-1 w-1 bg-slate-700 rounded-full" />
                                    <span className="text-xs font-mono text-emerald-400 font-bold">
                                      {stats.pitchers.find(p => p.name === pitcherName)?.era || '0.00'} ERA
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Latest Pitch Stats */}
                            <div className="pt-6 border-t border-slate-800/50">
                              <div className="flex flex-wrap gap-4 items-center justify-between">
                                <div className="flex items-center gap-6">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Last Pitch</span>
                                    <span className="text-lg font-black text-white">
                                      {lastPitch?.details?.type?.description || lastPitch?.details?.type?.code || '--'}
                                    </span>
                                  </div>
                                  <div className="w-px h-8 bg-slate-800" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Velocity</span>
                                    <span className="text-lg font-mono font-black text-indigo-400">
                                      {lastPitch?.pitchData?.startSpeed || '--'} <span className="text-xs font-normal text-slate-600">MPH</span>
                                    </span>
                                  </div>
                                  <div className="w-px h-8 bg-slate-800" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Spin Rate</span>
                                    <span className="text-lg font-mono font-black text-slate-300">
                                      {lastPitch?.pitchData?.breaks?.spinRate || '--'} <span className="text-xs font-normal text-slate-600">RPM</span>
                                    </span>
                                  </div>
                                </div>
                                <div className={cn(
                                  "px-4 py-2 rounded-xl font-black text-sm uppercase tracking-widest border shadow-lg",
                                  lastPitch?.details?.description?.toLowerCase().includes('strike') ? "bg-red-500/10 border-red-500/30 text-red-500" :
                                  lastPitch?.details?.description?.toLowerCase().includes('ball') ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                                  "bg-slate-800 border-slate-700 text-slate-400"
                                )}>
                                  {lastPitch?.details?.description || 'Waiting for pitch...'}
                                </div>
                              </div>

                              {/* Pitch Sequence */}
                              {currentPitches.length > 0 && (
                                <div className="mt-6">
                                  <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">Sequence:</span>
                                    {currentPitches.map((p: any, idx: number) => (
                                      <PitchIndicator 
                                        key={idx} 
                                        pitch={p} 
                                        index={idx + 1} 
                                      />
                                    ))}
                                  </div>
                                  <PitchLegend />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Strike Zone Visualization */}
                          <div className="flex justify-center">
                            <div className="w-full max-w-[300px]">
                              <StrikeZone 
                                pitches={strikeZonePitches} 
                                selectedPitchId={strikeZonePitches[strikeZonePitches.length - 1]?.pitch_id}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Game Stats Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Batter Leaders */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Top Batters
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Game Performance</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-6 text-[10px] uppercase font-bold text-slate-500 mb-2 px-2">
                    <div className="col-span-2">Player</div>
                    <div className="text-center">H/AB</div>
                    <div className="text-center">BB</div>
                    <div className="text-center">RBI</div>
                    <div className="text-right">HR</div>
                  </div>
                  <div className="space-y-1">
                    {stats.batters.length === 0 && (
                      <p className="text-center py-8 text-xs text-slate-500 italic">No batting stats available for this game</p>
                    )}
                    {(batterSearch 
                      ? stats.batters.filter(b => b.name.toLowerCase().includes(batterSearch.toLowerCase()))
                      : stats.batters.slice(0, 5)
                    ).map((b) => (
                      <div key={b.name} className="grid grid-cols-6 items-center p-2 rounded-lg hover:bg-slate-800/50 transition-colors gap-2">
                        <div className="col-span-2 flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center">
                            <img 
                              src={`https://www.mlbstatic.com/team-logos/${b.teamId || 1}.svg`}
                              alt="Team Logo"
                              className="w-4 h-4 object-contain"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-logos/1.svg';
                              }}
                            />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="text-sm font-bold text-slate-200 truncate">{formatPlayerName(b.name)}</div>
                            {b.seasonAvg && (
                              <div className="text-[9px] text-slate-500 font-mono">Season: {b.seasonAvg} • {b.seasonHr} HR</div>
                            )}
                          </div>
                        </div>
                        <div className="text-center text-xs font-mono text-slate-400">{b.h}/{b.ab}</div>
                        <div className="text-center text-xs font-mono text-slate-400">{b.bb}</div>
                        <div className="text-center text-xs font-mono font-bold text-indigo-400">{b.rbi}</div>
                        <div className="text-right text-xs font-mono font-bold text-amber-400">{b.hr}</div>
                      </div>
                    ))}
                    {batterSearch && stats.batters.filter(b => b.name.toLowerCase().includes(batterSearch.toLowerCase())).length === 0 && (
                      <p className="text-center py-4 text-xs text-slate-500 italic">No batter found</p>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-slate-800/20 border-t border-slate-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Search for a batter..."
                      value={batterSearch}
                      onChange={(e) => setBatterSearch(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-md py-1.5 pl-8 pr-3 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>

              {/* Pitcher Leaders */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    Pitcher Stats
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Game Performance</span>
                </div>
                <div className="p-4 flex-grow">
                  <div className="grid grid-cols-7 text-[10px] uppercase font-bold text-slate-500 mb-2 px-2">
                    <div className="col-span-2">Player</div>
                    <div className="text-center">IP</div>
                    <div className="text-center">H</div>
                    <div className="text-center">ER</div>
                    <div className="text-center">BB</div>
                    <div className="text-right">K</div>
                  </div>
                  <div className="space-y-1">
                    {stats.pitchers.length === 0 && (
                      <p className="text-center py-8 text-xs text-slate-500 italic">No pitching stats available for this game</p>
                    )}
                    {(pitcherSearch 
                      ? stats.pitchers.filter(p => p.name.toLowerCase().includes(pitcherSearch.toLowerCase()))
                      : stats.pitchers.slice(0, 5)
                    ).map((p) => (
                      <div key={p.name} className="grid grid-cols-7 items-center p-2 rounded-lg hover:bg-slate-800/50 transition-colors gap-2">
                        <div className="col-span-2 flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center">
                            <img 
                              src={`https://www.mlbstatic.com/team-logos/${p.teamId || 1}.svg`}
                              alt="Team Logo"
                              className="w-4 h-4 object-contain"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-logos/1.svg';
                              }}
                            />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="text-sm font-bold text-slate-200 truncate">{formatPlayerName(p.name)}</div>
                            {p.seasonEra && (
                              <div className="text-[9px] text-slate-500 font-mono">Season ERA: {p.seasonEra}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-center text-xs font-mono text-slate-400">{p.ip}</div>
                        <div className="text-center text-xs font-mono text-slate-400">{p.h}</div>
                        <div className="text-center text-xs font-mono text-indigo-400 font-bold">{p.er}</div>
                        <div className="text-center text-xs font-mono text-slate-400">{p.bb}</div>
                        <div className="text-right text-xs font-mono font-black text-emerald-400">{p.k}</div>
                      </div>
                    ))}
                    {pitcherSearch && stats.pitchers.filter(p => p.name.toLowerCase().includes(pitcherSearch.toLowerCase())).length === 0 && (
                      <p className="text-center py-4 text-xs text-slate-500 italic">No pitcher found</p>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-slate-800/20 border-t border-slate-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Search for a pitcher..."
                      value={pitcherSearch}
                      onChange={(e) => setPitcherSearch(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-md py-1.5 pl-8 pr-3 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Top Section: Play-by-Play & Data */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-100 flex items-center gap-2">
                      <Database className="w-4 h-4 text-indigo-400" />
                      Live Play-by-Play
                    </h3>
                    <span className="text-xs text-slate-500 font-mono">
                      {gameDetail?.plays.length || 0} At-Bats Recorded
                    </span>
                  </div>
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Search batter or pitcher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600"
                    />
                  </div>
                </div>
                
                <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto">
                  {gameDetail?.plays
                    .filter(play => 
                      play.batter_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      play.pitcher_name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((play) => (
                    <div 
                      key={play.play_id}
                      className={cn(
                        "p-4 transition-colors cursor-pointer hover:bg-slate-800/30",
                        selectedPlayId === play.play_id ? "bg-indigo-900/20 border-l-4 border-l-indigo-500" : ""
                      )}
                      onClick={() => {
                        setSelectedPlayId(play.play_id);
                        setSelectedPitchId(null);
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                            <img 
                              src={`https://www.mlbstatic.com/team-logos/${play.batter_team_id || 1}.svg`}
                              alt="Team Logo"
                              className="w-6 h-6 object-contain"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-logos/1.svg';
                              }}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-100">{play.batter_name}</p>
                            <p className="text-xs text-slate-500">vs {play.pitcher_name}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] font-black uppercase text-slate-300">
                          {play.event}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 mb-3 leading-relaxed">{play.description}</p>
                      
                      {/* Statcast Metrics for Play */}
                      {(play.exit_velocity || play.launch_angle) && (
                        <div className="flex gap-4 mb-4">
                          {play.exit_velocity && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-500 uppercase font-bold">Exit Velocity</span>
                              <span className="text-sm font-mono font-bold text-indigo-400">{play.exit_velocity} <span className="text-[10px] font-normal text-slate-600">MPH</span></span>
                            </div>
                          )}
                          {play.launch_angle && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-500 uppercase font-bold">Launch Angle</span>
                              <span className="text-sm font-mono font-bold text-emerald-400">{play.launch_angle}°</span>
                            </div>
                          )}
                          {play.distance && (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-500 uppercase font-bold">Distance</span>
                              <span className="text-sm font-mono font-bold text-amber-400">{play.distance} <span className="text-[10px] font-normal text-slate-600">FT</span></span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pitches in this Play */}
                      <AnimatePresence>
                        {selectedPlayId === play.play_id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 space-y-2">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Pitch Sequence</p>
                              <div className="flex flex-col gap-2">
                                {play.pitches.map((pitch, idx) => (
                                  <div 
                                    key={pitch.pitch_id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPitchId(pitch.pitch_id);
                                    }}
                                    className={cn(
                                      "p-3 rounded-xl border transition-all flex items-center justify-between group",
                                      selectedPitchId === pitch.pitch_id 
                                        ? "bg-indigo-900/20 border-indigo-500/50 ring-1 ring-indigo-500/20" 
                                        : "bg-slate-900 border-slate-800 hover:border-slate-700",
                                      idx === play.pitches.length - 1 && "ring-1 ring-emerald-500/30 bg-emerald-500/5"
                                    )}
                                  >
                                    <div className="flex items-center gap-4">
                                      <PitchIndicator 
                                        pitch={pitch} 
                                        index={pitch.pitch_number} 
                                        active={selectedPitchId === pitch.pitch_id}
                                      />
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-black text-slate-100">{pitch.pitch_type}</span>
                                          <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
                                            pitch.result.toLowerCase().includes('strike') ? "bg-red-900/30 text-red-400" :
                                            pitch.result.toLowerCase().includes('ball') ? "bg-emerald-900/30 text-emerald-400" :
                                            "bg-slate-800 text-slate-400"
                                          )}>
                                            {pitch.result}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                          {pitch.velocity && (
                                            <span className="text-xs font-mono font-bold text-indigo-400">{pitch.velocity} <span className="text-[9px] font-normal text-slate-600">MPH</span></span>
                                          )}
                                          {pitch.spin_rate && (
                                            <span className="text-xs font-mono text-slate-500">{pitch.spin_rate} <span className="text-[9px]">RPM</span></span>
                                          )}
                                          {pitch.extension && (
                                            <span className="text-xs font-mono text-slate-600 hidden sm:inline">{pitch.extension.toFixed(1)} <span className="text-[9px]">FT EXT</span></span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      {idx === play.pitches.length - 1 && (
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter animate-pulse">Latest</span>
                                      )}
                                      <ChevronRight className={cn(
                                        "w-4 h-4 transition-colors",
                                        selectedPitchId === pitch.pitch_id ? "text-indigo-400" : "text-slate-700 group-hover:text-slate-500"
                                      )} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Section: Visualizations */}
              <div className="flex justify-center">
                <StrikeZone 
                  pitches={selectedPlay?.pitches || []} 
                  selectedPitchId={selectedPitchId}
                />
              </div>
            </div>
          </>
        ) : activeTab === 'analytics' ? (
          <div className="space-y-8">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-600/20 p-2 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Game Analytics & Trends</h2>
                  <p className="text-sm text-slate-500">Visualizing Statcast data and performance metrics for the current game.</p>
                </div>
              </div>
              {gameDetail && <PlayerPerformanceCharts gameDetail={gameDetail} />}
            </div>
          </div>
        ) : (
            <div className="space-y-8">
              {/* Team Selector for Roster */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setRosterTeamFilter('away')}
                  className={cn(
                    "flex-1 py-4 px-6 rounded-2xl border font-black transition-all flex items-center justify-center gap-4 group",
                    rosterTeamFilter === 'away' 
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-500/20 scale-[1.02]" 
                      : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg p-1.5 flex items-center justify-center transition-colors",
                    rosterTeamFilter === 'away' ? "bg-white/10" : "bg-slate-800"
                  )}>
                    <img 
                      src={`https://www.mlbstatic.com/team-logos/${gameDetail?.away_team_id || 1}.svg`}
                      alt={gameDetail?.away_team}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] uppercase tracking-widest opacity-60">Away Team</span>
                    <span className="text-lg">{gameDetail?.away_team}</span>
                  </div>
                </button>

                <button
                  onClick={() => setRosterTeamFilter('home')}
                  className={cn(
                    "flex-1 py-4 px-6 rounded-2xl border font-black transition-all flex items-center justify-center gap-4 group",
                    rosterTeamFilter === 'home' 
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-500/20 scale-[1.02]" 
                      : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg p-1.5 flex items-center justify-center transition-colors",
                    rosterTeamFilter === 'home' ? "bg-white/10" : "bg-slate-800"
                  )}>
                    <img 
                      src={`https://www.mlbstatic.com/team-logos/${gameDetail?.home_team_id || 1}.svg`}
                      alt={gameDetail?.home_team}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] uppercase tracking-widest opacity-60">Home Team</span>
                    <span className="text-lg">{gameDetail?.home_team}</span>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {/* Full Batter Roster */}
                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                    <h3 className="font-bold text-slate-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      {rosterTeamFilter === 'away' ? gameDetail?.away_team : gameDetail?.home_team} Batters
                    </h3>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Season & Game Stats</span>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                          <th className="pb-2 pl-2">Player</th>
                          <th className="pb-2 text-center">AB</th>
                          <th className="pb-2 text-center">H</th>
                          <th className="pb-2 text-center">HR</th>
                          <th className="pb-2 text-center">RBI</th>
                          <th className="pb-2 text-center">BB</th>
                          <th className="pb-2 text-center">K</th>
                          <th className="pb-2 text-center">AVG</th>
                          <th className="pb-2 text-right pr-2">Season AVG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {stats.batters
                          .filter(b => b.teamId === (rosterTeamFilter === 'away' ? gameDetail?.away_team_id : gameDetail?.home_team_id))
                          .map((b) => (
                          <tr key={b.id || b.name} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 pl-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center">
                                  <img 
                                    src={`https://www.mlbstatic.com/team-logos/${b.teamId || 1}.svg`}
                                    alt="Team Logo"
                                    className="w-5 h-5 object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <span className="text-sm font-bold text-slate-200">{b.name}</span>
                              </div>
                            </td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{b.ab}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{b.h}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{b.hr}</td>
                            <td className="py-3 text-center text-xs font-mono text-indigo-400 font-bold">{b.rbi}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{b.bb}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{b.k}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-300">{b.avg}</td>
                            <td className="py-3 text-right pr-2 text-xs font-mono font-bold text-emerald-400">{b.seasonAvg || '--'}</td>
                          </tr>
                        ))}
                        {stats.batters.filter(b => b.teamId === (rosterTeamFilter === 'away' ? gameDetail?.away_team_id : gameDetail?.home_team_id)).length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-12 text-center text-slate-500 italic text-sm">No batter data recorded for this team yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Full Pitcher Roster */}
                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                    <h3 className="font-bold text-slate-100 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-indigo-400" />
                      {rosterTeamFilter === 'away' ? gameDetail?.away_team : gameDetail?.home_team} Pitchers
                    </h3>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Season & Game Stats</span>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                          <th className="pb-2 pl-2">Player</th>
                          <th className="pb-2 text-center">IP</th>
                          <th className="pb-2 text-center">H</th>
                          <th className="pb-2 text-center">R</th>
                          <th className="pb-2 text-center">ER</th>
                          <th className="pb-2 text-center">BB</th>
                          <th className="pb-2 text-center">K</th>
                          <th className="pb-2 text-right pr-2">Season ERA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {stats.pitchers
                          .filter(p => p.teamId === (rosterTeamFilter === 'away' ? gameDetail?.away_team_id : gameDetail?.home_team_id))
                          .map((p) => (
                          <tr key={p.id || p.name} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 pl-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center">
                                  <img 
                                    src={`https://www.mlbstatic.com/team-logos/${p.teamId || 1}.svg`}
                                    alt="Team Logo"
                                    className="w-5 h-5 object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <span className="text-sm font-bold text-slate-200">{p.name}</span>
                              </div>
                            </td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{p.ip}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{p.h}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{p.r}</td>
                            <td className="py-3 text-center text-xs font-mono text-indigo-400 font-bold">{p.er}</td>
                            <td className="py-3 text-center text-xs font-mono text-slate-400">{p.bb}</td>
                            <td className="py-3 text-center text-xs font-mono text-emerald-400 font-bold">{p.k}</td>
                            <td className="py-3 text-right pr-2 text-xs font-mono font-bold text-rose-400">{p.seasonEra || '--'}</td>
                          </tr>
                        ))}
                        {stats.pitchers.filter(p => p.teamId === (rosterTeamFilter === 'away' ? gameDetail?.away_team_id : gameDetail?.home_team_id)).length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-500 italic text-sm">No pitcher data recorded for this team yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>

      <AnimatePresence>
        {showPlayerSearch && (
          <PlayerSearch onClose={() => setShowPlayerSearch(false)} />
        )}
      </AnimatePresence>

      {/* Footer / Info */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Info className="w-4 h-4" />
            <span>Data provided by MLB Stats API & Statcast</span>
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Feed Active</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
