import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { 
  ResponsiveContainer, 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  Tooltip, 
  Cell, 
  LineChart, 
  Line, 
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  ReferenceArea
} from 'recharts';
import { GameDetail, Play } from '../types';
import { TrendingUp, Zap, Target, BarChart3, User, Users, Maximize2, RefreshCcw } from 'lucide-react';

interface PlayerPerformanceChartsProps {
  gameDetail: GameDetail;
}

const PlayerPerformanceCharts: React.FC<PlayerPerformanceChartsProps> = ({ gameDetail }) => {
  const [activeTab, setActiveTab] = useState<'hitter' | 'pitcher'>('hitter');
  const [selectedHitterId, setSelectedHitterId] = useState<number | 'all'>('all');
  const [selectedPitcherId, setSelectedPitcherId] = useState<number | 'all'>('all');

  // Scatter Zoom State
  const [scatterZoom, setScatterZoom] = useState({
    left: 'auto' as any,
    right: 'auto' as any,
    top: 'auto' as any,
    bottom: 'auto' as any,
    refAreaLeft: '',
    refAreaRight: '',
    refAreaTop: '',
    refAreaBottom: ''
  });

  // Line Zoom State
  const [lineZoom, setLineZoom] = useState({
    left: 'auto' as any,
    right: 'auto' as any,
    refAreaLeft: '',
    refAreaRight: ''
  });

  const resetScatterZoom = () => {
    setScatterZoom({
      left: 'auto',
      right: 'auto',
      top: 'auto',
      bottom: 'auto',
      refAreaLeft: '',
      refAreaRight: '',
      refAreaTop: '',
      refAreaBottom: ''
    });
  };

  const resetLineZoom = () => {
    setLineZoom({
      left: 'auto',
      right: 'auto',
      refAreaLeft: '',
      refAreaRight: ''
    });
  };

  const getTeamName = (teamId: number) => {
    if (teamId === gameDetail.home_team_id) return gameDetail.home_team;
    if (teamId === gameDetail.away_team_id) return gameDetail.away_team;
    return 'Unknown';
  };

  const gameDate = useMemo(() => {
    return new Date(gameDetail.start_time).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, [gameDetail.start_time]);

  // Extract unique hitters and pitchers
  const { hitters, pitchers } = useMemo(() => {
    const hitterMap = new Map<number, string>();
    const pitcherMap = new Map<number, string>();

    gameDetail.plays.forEach(play => {
      if (play.batter_id && play.batter_name) {
        hitterMap.set(play.batter_id, play.batter_name);
      }
      if (play.pitcher_id && play.pitcher_name) {
        pitcherMap.set(play.pitcher_id, play.pitcher_name);
      }
    });

    return {
      hitters: Array.from(hitterMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      pitchers: Array.from(pitcherMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [gameDetail.plays]);

  // 1. Scatter Data: Exit Velocity vs Launch Angle
  const scatterData = useMemo(() => {
    return gameDetail.plays
      .filter(p => p.exit_velocity !== null && p.launch_angle !== null)
      .filter(p => selectedHitterId === 'all' || p.batter_id === selectedHitterId)
      .map(p => {
        const event = p.event?.toLowerCase() || '';
        const isHit = p.is_hit || 
                      ['single', 'double', 'triple', 'home_run', 'home run'].includes(event) || 
                      event.includes('home_run') || 
                      event.includes('home run');
        
        return {
          x: p.exit_velocity,
          y: p.launch_angle,
          name: p.batter_name,
          team: getTeamName(p.batter_team_id),
          playIndex: p.at_bat_index,
          event: p.event,
          distance: p.distance,
          color: isHit ? '#10b981' : '#ef4444' // Emerald for hits, Red for outs
        };
      });
  }, [gameDetail.plays, gameDetail.home_team_id, gameDetail.away_team_id, selectedHitterId]);

  // 2. Pitch Velocity Trend: Pitch Velocity over the course of the game
  const pitchTrendData = useMemo(() => {
    const allPitches: any[] = [];
    // The plays are sorted by index DESC in the backend, let's reverse to show chronological order
    const chronologicalPlays = [...gameDetail.plays].reverse();
    
    chronologicalPlays.forEach((play) => {
      if (selectedPitcherId !== 'all' && play.pitcher_id !== selectedPitcherId) return;

      play.pitches.forEach((pitch) => {
        if (pitch.velocity !== null) {
          allPitches.push({
            index: allPitches.length + 1,
            velocity: pitch.velocity,
            pitcher: play.pitcher_name,
            team: getTeamName(play.pitcher_team_id),
            playIndex: play.at_bat_index,
            type: pitch.pitch_type,
            result: pitch.result
          });
        }
      });
    });
    return allPitches;
  }, [gameDetail.plays, gameDetail.home_team_id, gameDetail.away_team_id, selectedPitcherId]);

  // 3. Exit Velocity Distribution
  const evDistribution = useMemo(() => {
    const bins = [0, 70, 80, 90, 100, 110, 120];
    const distribution = bins.slice(0, -1).map((min, i) => ({
      range: `${min}-${bins[i+1]}`,
      count: 0,
      min
    }));

    gameDetail.plays.forEach(p => {
      if (p.exit_velocity !== null && (selectedHitterId === 'all' || p.batter_id === selectedHitterId)) {
        const binIndex = bins.findIndex((b, i) => p.exit_velocity! >= b && p.exit_velocity! < (bins[i+1] || 999));
        if (binIndex !== -1 && binIndex < distribution.length) {
          distribution[binIndex].count++;
        }
      }
    });
    return distribution;
  }, [gameDetail.plays, selectedHitterId]);

  // 4. Pitch Type Breakdown & Avg Velocity
  const pitchTypeData = useMemo(() => {
    const types: Record<string, { count: number; totalVel: number }> = {};
    gameDetail.plays.forEach(play => {
      if (selectedPitcherId !== 'all' && play.pitcher_id !== selectedPitcherId) return;

      play.pitches.forEach(pitch => {
        if (pitch.pitch_type && pitch.velocity !== null) {
          if (!types[pitch.pitch_type]) {
            types[pitch.pitch_type] = { count: 0, totalVel: 0 };
          }
          types[pitch.pitch_type].count++;
          types[pitch.pitch_type].totalVel += pitch.velocity;
        }
      });
    });

    return Object.entries(types).map(([type, data]) => ({
      type,
      count: data.count,
      avgVel: (data.totalVel / data.count).toFixed(1)
    })).sort((a, b) => b.count - a.count);
  }, [gameDetail.plays, selectedPitcherId]);

  // 4b. Detailed Pitcher Arsenal Breakdown (All Pitchers)
  const pitchersPitchTypeData = useMemo(() => {
    const pitcherStats: Record<number, { 
      name: string; 
      team: string;
      types: Record<string, { count: number; totalVel: number }> 
    }> = {};

    gameDetail.plays.forEach(play => {
      if (!pitcherStats[play.pitcher_id]) {
        pitcherStats[play.pitcher_id] = {
          name: play.pitcher_name,
          team: getTeamName(play.pitcher_team_id),
          types: {}
        };
      }

      play.pitches.forEach(pitch => {
        if (pitch.pitch_type && pitch.velocity !== null) {
          if (!pitcherStats[play.pitcher_id].types[pitch.pitch_type]) {
            pitcherStats[play.pitcher_id].types[pitch.pitch_type] = { count: 0, totalVel: 0 };
          }
          pitcherStats[play.pitcher_id].types[pitch.pitch_type].count++;
          pitcherStats[play.pitcher_id].types[pitch.pitch_type].totalVel += pitch.velocity;
        }
      });
    });

    return Object.entries(pitcherStats).map(([id, data]) => ({
      id: parseInt(id),
      name: data.name,
      team: data.team,
      types: Object.entries(data.types).map(([type, typeData]) => ({
        type,
        count: typeData.count,
        avgVel: (typeData.totalVel / typeData.count).toFixed(1)
      })).sort((a, b) => b.count - a.count)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [gameDetail.plays, gameDetail.home_team_id, gameDetail.away_team_id, gameDetail.home_team, gameDetail.away_team]);

  // 5. Launch Angle Distribution
  const laDistribution = useMemo(() => {
    const bins = [-90, -10, 10, 25, 40, 60];
    const labels = ['Grounder', 'Low Liner', 'Line Drive', 'Fly Ball', 'Pop Up'];
    const distribution = labels.map((label, i) => ({
      range: label,
      count: 0,
      min: bins[i]
    }));

    gameDetail.plays.forEach(p => {
      if (p.launch_angle !== null && (selectedHitterId === 'all' || p.batter_id === selectedHitterId)) {
        const binIndex = bins.findIndex((b, i) => p.launch_angle! >= b && p.launch_angle! < (bins[i+1] || 999));
        if (binIndex !== -1 && binIndex < distribution.length) {
          distribution[binIndex].count++;
        }
      }
    });
    return distribution;
  }, [gameDetail.plays, selectedHitterId]);

  const zoomScatter = () => {
    let { refAreaLeft, refAreaRight, refAreaTop, refAreaBottom } = scatterZoom;

    if (refAreaLeft === refAreaRight || refAreaRight === '' || refAreaTop === refAreaBottom || refAreaBottom === '') {
      setScatterZoom(prev => ({ ...prev, refAreaLeft: '', refAreaRight: '', refAreaTop: '', refAreaBottom: '' }));
      return;
    }

    // Ensure left is smaller than right
    if (parseFloat(refAreaLeft) > parseFloat(refAreaRight)) [refAreaLeft, refAreaRight] = [refAreaRight, refAreaLeft];
    // Ensure bottom is smaller than top
    if (parseFloat(refAreaBottom) > parseFloat(refAreaTop)) [refAreaBottom, refAreaTop] = [refAreaTop, refAreaBottom];

    setScatterZoom({
      left: parseFloat(refAreaLeft),
      right: parseFloat(refAreaRight),
      top: parseFloat(refAreaTop),
      bottom: parseFloat(refAreaBottom),
      refAreaLeft: '',
      refAreaRight: '',
      refAreaTop: '',
      refAreaBottom: ''
    });
  };

  const zoomLine = () => {
    let { refAreaLeft, refAreaRight } = lineZoom;

    if (refAreaLeft === refAreaRight || refAreaRight === '') {
      setLineZoom(prev => ({ ...prev, refAreaLeft: '', refAreaRight: '' }));
      return;
    }

    if (parseFloat(refAreaLeft) > parseFloat(refAreaRight)) [refAreaLeft, refAreaRight] = [refAreaRight, refAreaLeft];

    setLineZoom({
      left: parseFloat(refAreaLeft),
      right: parseFloat(refAreaRight),
      refAreaLeft: '',
      refAreaRight: ''
    });
  };

  const DistributionTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl min-w-[150px]">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
          <div className="space-y-1 border-t border-slate-800 pt-2">
            {payload.map((item: any, index: number) => (
              <div key={index} className="flex justify-between gap-4">
                <span className="text-[10px] text-slate-500 uppercase">{item.name}</span>
                <span className="text-xs font-mono font-bold" style={{ color: item.color || item.fill }}>
                  {item.value} {item.name === 'count' ? 'Plays' : ''}
                </span>
              </div>
            ))}
            {payload[0].payload.avgVel && (
              <div className="flex justify-between gap-4">
                <span className="text-[10px] text-slate-500 uppercase">Avg Velocity</span>
                <span className="text-xs text-indigo-400 font-mono font-bold">{payload[0].payload.avgVel} MPH</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (!data) return null;
      
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl min-w-[180px]">
          <div className="flex justify-between items-start mb-2 gap-4">
            <div>
              <p className="text-sm font-bold text-white leading-tight">{data.name || data.pitcher}</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{data.team}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-mono">{gameDate}</p>
              {data.playIndex !== undefined && (
                <p className="text-[10px] text-indigo-400 font-mono">Play #{data.playIndex}</p>
              )}
            </div>
          </div>
          
          <div className="space-y-1 border-t border-slate-800 pt-2">
            {data.x !== undefined && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] text-slate-400 uppercase">Exit Velocity</span>
                  <span className="text-xs text-indigo-400 font-mono font-bold">{data.x} MPH</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] text-slate-400 uppercase">Launch Angle</span>
                  <span className="text-xs text-emerald-400 font-mono font-bold">{data.y}°</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] text-slate-400 uppercase">Result</span>
                  <span className="text-xs text-white font-bold">{data.event}</span>
                </div>
              </>
            )}
            {data.velocity !== undefined && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] text-slate-400 uppercase">Velocity</span>
                  <span className="text-xs text-indigo-400 font-mono font-bold">{data.velocity} MPH</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] text-slate-400 uppercase">Type</span>
                  <span className="text-xs text-white font-bold">{data.type}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] text-slate-400 uppercase">Result</span>
                  <span className="text-xs text-slate-300">{data.result}</span>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Tabs and Player Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div className="flex p-1 bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('hitter')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'hitter' 
                ? 'bg-slate-700 text-white shadow-lg' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
            Hitter Stats
          </button>
          <button
            onClick={() => setActiveTab('pitcher')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'pitcher' 
                ? 'bg-slate-700 text-white shadow-lg' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            Pitcher Stats
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            {activeTab === 'hitter' ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            <span className="text-xs font-bold uppercase tracking-wider">Select {activeTab === 'hitter' ? 'Batter' : 'Pitcher'}:</span>
          </div>
          <select
            value={activeTab === 'hitter' ? selectedHitterId : selectedPitcherId}
            onChange={(e) => {
              const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
              if (activeTab === 'hitter') setSelectedHitterId(val as any);
              else setSelectedPitcherId(val as any);
            }}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-w-[200px]"
          >
            <option value="all">All {activeTab === 'hitter' ? 'Batters' : 'Pitchers'}</option>
            {(activeTab === 'hitter' ? hitters : pitchers).map(player => (
              <option key={player.id} value={player.id}>{player.name}</option>
            ))}
          </select>
        </div>
      </div>

      {activeTab === 'hitter' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Exit Velocity vs Launch Angle */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col gap-1">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    Statcast: EV vs Launch Angle
                  </h3>
                  <p className="text-[10px] text-slate-500">Click and drag to zoom into a region</p>
                </div>
                <div className="flex items-center gap-4">
                  {(scatterZoom.left !== 'auto' || scatterZoom.top !== 'auto') && (
                    <button 
                      onClick={resetScatterZoom}
                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-[10px] font-bold rounded border border-slate-700 transition-colors"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      Reset Zoom
                    </button>
                  )}
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-500">Hits</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-slate-500">Outs</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="h-[300px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart 
                    margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                    onMouseDown={e => e && setScatterZoom(prev => ({ ...prev, refAreaLeft: (e as any).xValue, refAreaTop: (e as any).yValue }))}
                    onMouseMove={e => scatterZoom.refAreaLeft && e && setScatterZoom(prev => ({ ...prev, refAreaRight: (e as any).xValue, refAreaBottom: (e as any).yValue }))}
                    onMouseUp={zoomScatter}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Exit Velocity" 
                      unit=" MPH" 
                      stroke="#64748b" 
                      fontSize={10}
                      domain={[scatterZoom.left, scatterZoom.right]}
                      allowDataOverflow
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Launch Angle" 
                      unit="°" 
                      stroke="#64748b" 
                      fontSize={10}
                      domain={[scatterZoom.bottom, scatterZoom.top]}
                      allowDataOverflow
                    />
                    <ZAxis type="number" range={[50, 400]} />
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Plays" data={scatterData}>
                      {scatterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.6} stroke={entry.color} strokeWidth={2} />
                      ))}
                    </Scatter>
                    {scatterZoom.refAreaLeft && scatterZoom.refAreaRight ? (
                      <ReferenceArea 
                        x1={scatterZoom.refAreaLeft} 
                        x2={scatterZoom.refAreaRight} 
                        y1={scatterZoom.refAreaBottom} 
                        y2={scatterZoom.refAreaTop} 
                        {...({ fill: "#6366f1", fillOpacity: 0.1 } as any)}
                      />
                    ) : null}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-4 text-[10px] text-slate-500 text-center italic">
                Visualizing the relationship between how hard a ball is hit and its vertical angle.
              </p>
            </div>

            {/* Exit Velocity Distribution */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Exit Velocity Distribution
                </h3>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Power Profile</span>
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evDistribution} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="range" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip content={<DistributionTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                    <Bar 
                      dataKey="count" 
                      fill="#fbbf24" 
                      radius={[4, 4, 0, 0]} 
                      animationDuration={1000}
                    >
                      {evDistribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.min >= 100 ? '#f59e0b' : entry.min >= 90 ? '#fbbf24' : '#78350f'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Launch Angle Profile
              </h3>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Batted Ball Type</span>
            </div>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={laDistribution} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="range" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip content={<DistributionTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                  <Bar 
                    dataKey="count" 
                    fill="#10b981" 
                    radius={[4, 4, 0, 0]} 
                    animationDuration={1000}
                  >
                    {laDistribution.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.range === 'Line Drive' ? '#10b981' : entry.range === 'Fly Ball' ? '#34d399' : '#064e3b'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pitch Velocity Trend */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col gap-1">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    Game Velocity Trend
                  </h3>
                  <p className="text-[10px] text-slate-500">Click and drag to zoom into a sequence</p>
                </div>
                <div className="flex items-center gap-4">
                  {lineZoom.left !== 'auto' && (
                    <button 
                      onClick={resetLineZoom}
                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-[10px] font-bold rounded border border-slate-700 transition-colors"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      Reset Zoom
                    </button>
                  )}
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Chronological Pitches</span>
                </div>
              </div>
              
              <div className="h-[300px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={pitchTrendData} 
                    margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                    onMouseDown={e => e && setLineZoom(prev => ({ ...prev, refAreaLeft: e.activeLabel as any }))}
                    onMouseMove={e => lineZoom.refAreaLeft && e && setLineZoom(prev => ({ ...prev, refAreaRight: e.activeLabel as any }))}
                    onMouseUp={zoomLine}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="index" 
                      stroke="#64748b" 
                      fontSize={10}
                      tick={false}
                      label={{ value: 'Pitch Sequence', position: 'bottom', fill: '#475569', fontSize: 10 }}
                      domain={[lineZoom.left, lineZoom.right]}
                      allowDataOverflow
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={10} 
                      domain={['dataMin - 5', 'dataMax + 5']}
                      label={{ value: 'MPH', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="velocity" 
                      stroke="#6366f1" 
                      strokeWidth={3} 
                      dot={{ r: 2, fill: '#6366f1', strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      animationDuration={1500}
                    />
                    {lineZoom.refAreaLeft && lineZoom.refAreaRight ? (
                      <ReferenceArea 
                        x1={lineZoom.refAreaLeft} 
                        x2={lineZoom.refAreaRight} 
                        {...({ fill: "#6366f1", fillOpacity: 0.1 } as any)}
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-4 text-[10px] text-slate-500 text-center italic">
                Tracking pitch velocity fluctuations throughout the entire game.
              </p>
            </div>

            {/* Pitch Type Breakdown */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-400" />
                  Pitch Type Breakdown & Average Velocity
                </h3>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Arsenal Analysis</span>
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pitchTypeData} layout="vertical" margin={{ top: 20, right: 40, bottom: 20, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" fontSize={10} />
                    <YAxis dataKey="type" type="category" stroke="#64748b" fontSize={10} />
                    <Tooltip content={<DistributionTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                    <Bar 
                      dataKey="count" 
                      fill="#6366f1" 
                      radius={[0, 4, 4, 0]} 
                      animationDuration={1000}
                      label={{ 
                        position: 'right', 
                        fill: '#64748b', 
                        fontSize: 10, 
                        formatter: (val: any, entry: any) => entry?.payload?.avgVel ? `${entry.payload.avgVel} MPH` : ''
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-4 text-[10px] text-slate-500 text-center italic">
                Frequency of pitch types thrown and their average velocities.
              </p>
            </div>
          </div>

          {/* Detailed Pitcher Arsenal Breakdown */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Pitcher Arsenal Breakdown
              </h3>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Full Game Comparison</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pitcher</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Team</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pitch Type</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Count</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Avg Velocity</th>
                  </tr>
                </thead>
                <tbody>
                  {pitchersPitchTypeData.map((pitcher) => (
                    <React.Fragment key={pitcher.id}>
                      {pitcher.types.map((type, tIdx) => (
                        <tr 
                          key={`${pitcher.id}-${type.type}`} 
                          className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${tIdx === 0 ? 'border-t border-slate-800' : ''}`}
                        >
                          <td className="py-3 px-4">
                            {tIdx === 0 ? (
                              <span className="text-sm font-bold text-white">{pitcher.name}</span>
                            ) : null}
                          </td>
                          <td className="py-3 px-4">
                            {tIdx === 0 ? (
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{pitcher.team}</span>
                            ) : null}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-slate-300 font-medium">{type.type}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-xs font-mono font-bold text-indigo-400">{type.count}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-xs font-mono font-bold text-emerald-400">{type.avgVel} MPH</span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerPerformanceCharts;
