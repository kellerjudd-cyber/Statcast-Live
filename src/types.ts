export interface Game {
  game_pk: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  home_team_id: number;
  away_team_id: number;
  status: string;
  start_time: string;
  linescore?: any;
}

export interface Pitch {
  pitch_id: string;
  play_id: string;
  pitch_number: number;
  pitch_type: string;
  velocity: number | null;
  spin_rate: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  px: number | null;
  pz: number | null;
  extension: number | null;
  result: string;
}

export interface Play {
  play_id: string;
  game_pk: number;
  at_bat_index: number;
  batter_name: string;
  pitcher_name: string;
  batter_id: number;
  pitcher_id: number;
  batter_team_id: number;
  pitcher_team_id: number;
  event: string;
  description: string;
  rbi: number;
  outs_recorded: number;
  is_at_bat: boolean;
  is_hit: boolean;
  exit_velocity: number | null;
  launch_angle: number | null;
  distance: number | null;
  pitches: Pitch[];
}

export interface GameDetail extends Game {
  plays: Play[];
  boxscore?: any;
  current_play?: any;
}

export interface Player {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  primaryNumber: string;
  currentTeam?: {
    id: number;
    name: string;
  };
  team?: {
    id: number;
    name: string;
  };
  primaryPosition: {
    code: string;
    name: string;
    type: string;
    abbreviation: string;
  };
  active: boolean;
}

export interface StatcastMetric {
  stat: {
    avg?: number;
    battingAverage?: number;
    obp?: number;
    onBasePercentage?: number;
    slg?: number;
    sluggingPercentage?: number;
    ops?: number;
    onBasePlusSlugging?: number;
    homeRuns?: number;
    hr?: number;
    rbi?: number;
    runsBattedIn?: number;
    era?: number;
    earnedRunAverage?: number;
    whip?: number;
    strikeOuts?: number;
    so?: number;
    k?: number;
    wins?: number;
    w?: number;
    opponentBattingAverage?: number;
    exitVelocity?: number;
    launchAngle?: number;
    distance?: number;
    averageVelocity?: number;
    spinRate?: number;
    extension?: number;
  };
  season: string;
  team?: {
    id: number;
    name: string;
  };
  league?: {
    id: number;
    name: string;
  };
  sport?: {
    id: number;
    link: string;
  };
}

export interface PlayerStats {
  hitting: StatcastMetric[];
  pitching: StatcastMetric[];
  season?: string;
}
