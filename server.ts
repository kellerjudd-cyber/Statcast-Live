import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("mlb_statcast.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    game_pk INTEGER PRIMARY KEY,
    home_team TEXT,
    away_team TEXT,
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    home_team_id INTEGER,
    away_team_id INTEGER,
    sport_id INTEGER DEFAULT 1,
    status TEXT,
    start_time TEXT,
    boxscore TEXT,
    linescore TEXT,
    current_play TEXT
  );

  -- Ensure columns exist if table was already created
  PRAGMA table_info(games);
`);

// Add columns if they don't exist (SQLite doesn't support IF NOT EXISTS for ADD COLUMN easily in one statement)
try {
  db.exec("ALTER TABLE games ADD COLUMN home_score INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE games ADD COLUMN away_score INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE games ADD COLUMN home_team_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE games ADD COLUMN away_team_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE games ADD COLUMN boxscore TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE games ADD COLUMN linescore TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE games ADD COLUMN current_play TEXT");
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS plays (
    play_id TEXT PRIMARY KEY,
    game_pk INTEGER,
    at_bat_index INTEGER,
    batter_name TEXT,
    pitcher_name TEXT,
    event TEXT,
    description TEXT,
    rbi INTEGER DEFAULT 0,
    outs_recorded INTEGER DEFAULT 0,
    is_at_bat INTEGER DEFAULT 0,
    is_hit INTEGER DEFAULT 0,
    batter_id INTEGER,
    pitcher_id INTEGER,
    batter_team_id INTEGER,
    pitcher_team_id INTEGER,
    exit_velocity REAL,
    launch_angle REAL,
    distance REAL,
    FOREIGN KEY(game_pk) REFERENCES games(game_pk)
  );

  CREATE TABLE IF NOT EXISTS pitches (
    pitch_id TEXT PRIMARY KEY,
    play_id TEXT,
    pitch_number INTEGER,
    pitch_type TEXT,
    velocity REAL,
    spin_rate REAL,
    pfx_x REAL,
    pfx_z REAL,
    px REAL,
    pz REAL,
    extension REAL,
    result TEXT,
    FOREIGN KEY(play_id) REFERENCES plays(play_id)
  );
`);

// Ensure plays table has new columns
try {
  db.exec("ALTER TABLE plays ADD COLUMN rbi INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE plays ADD COLUMN outs_recorded INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE plays ADD COLUMN is_at_bat INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE plays ADD COLUMN is_hit INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE plays ADD COLUMN batter_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE pitches ADD COLUMN extension REAL");
} catch (e) {}
try {
  db.exec("ALTER TABLE plays ADD COLUMN batter_team_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE plays ADD COLUMN pitcher_team_id INTEGER");
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Database connection failed" });
    }
  });

  // Fetch games for a specific date
  app.get("/api/games", (req, res) => {
    const { date, sportId } = req.query;
    console.log(`[API] GET /api/games - date: ${date}, sportId: ${sportId}`);
    
    res.setHeader('Content-Type', 'application/json');
    
    try {
      let query = "SELECT * FROM games";
      let params: any[] = [];
      let conditions: string[] = [];

      if (date) {
        conditions.push("date(start_time) = date(?)");
        params.push(date);
      }

      if (sportId) {
        conditions.push("sport_id = ?");
        params.push(Number(sportId));
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY start_time DESC";
      const games = db.prepare(query).all(...params);
      res.json(games);
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/game/:gamePk", (req, res) => {
    try {
      const { gamePk } = req.params;
      const game = db.prepare("SELECT * FROM games WHERE game_pk = ?").get(gamePk);
      if (!game) return res.status(404).json({ error: "Game not found" });

      // Parse boxscore if it exists
      if (game.boxscore) {
        try {
          game.boxscore = JSON.parse(game.boxscore);
        } catch (e) {
          game.boxscore = null;
        }
      }

      // Parse linescore if it exists
      if (game.linescore) {
        try {
          game.linescore = JSON.parse(game.linescore);
        } catch (e) {
          game.linescore = null;
        }
      }

      // Parse current_play if it exists
      if (game.current_play) {
        try {
          game.current_play = JSON.parse(game.current_play);
        } catch (e) {
          game.current_play = null;
        }
      }

      const plays = db.prepare("SELECT * FROM plays WHERE game_pk = ? ORDER BY at_bat_index DESC").all(gamePk);
      
      const playsWithPitches = plays.map((play: any) => {
        const pitches = db.prepare("SELECT * FROM pitches WHERE play_id = ? ORDER BY pitch_number ASC").all(play.play_id);
        return { ...play, pitches };
      });

      res.json({ ...game, plays: playsWithPitches });
    } catch (error) {
      console.error("Error fetching game detail:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Proxy to MLB API to avoid CORS and handle data ingestion
  app.get("/api/sync/:gamePk", async (req, res) => {
    const { gamePk } = req.params;
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
      if (!response.ok) {
        throw new Error(`MLB API returned ${response.status}`);
      }
      const data: any = await response.json();

      const gameData = data.gameData;
      const liveData = data.liveData;

      if (!gameData || !liveData) {
        throw new Error("Incomplete game data received from MLB API");
      }

      // Upsert Game
      db.prepare(`
        INSERT INTO games (game_pk, home_team, away_team, home_score, away_score, home_team_id, away_team_id, sport_id, status, start_time, boxscore, linescore, current_play)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_pk) DO UPDATE SET
          status = excluded.status,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          home_team_id = excluded.home_team_id,
          away_team_id = excluded.away_team_id,
          sport_id = excluded.sport_id,
          boxscore = excluded.boxscore,
          linescore = excluded.linescore,
          current_play = excluded.current_play
      `).run(
        gamePk,
        gameData.teams?.home?.name || "Unknown",
        gameData.teams?.away?.name || "Unknown",
        liveData.linescore?.teams?.home?.runs || 0,
        liveData.linescore?.teams?.away?.runs || 0,
        gameData.teams?.home?.id || null,
        gameData.teams?.away?.id || null,
        gameData.game?.sport?.id || 1,
        gameData.status?.detailedState || "Unknown",
        gameData.datetime?.dateTime || new Date().toISOString(),
        JSON.stringify(liveData.boxscore || {}),
        JSON.stringify(liveData.linescore || {}),
        JSON.stringify(liveData.plays?.currentPlay || {})
      );

      const homeTeamId = gameData.teams?.home?.id;
      const awayTeamId = gameData.teams?.away?.id;

      // Ingest Plays and Pitches
      const allPlays = liveData.plays?.allPlays;
      if (allPlays) {
        // Sort plays by atBatIndex to ensure chronological processing for out calculation
        const sortedPlays = [...allPlays].sort((a, b) => a.atBatIndex - b.atBatIndex);
        
        let lastOuts = 0;
        let lastInning = -1;
        let lastHalf = "";

        for (const play of sortedPlays) {
          const playId = `${gamePk}_${play.atBatIndex}`;
          const result = play.result || {};
          const about = play.about || {};
          const matchup = play.matchup || {};
          
          // Improved hitData extraction: check play level and playEvents level
          let hitData = play.hitData;
          if (!hitData && play.playEvents) {
            const hitEvent = play.playEvents.find((e: any) => e.hitData);
            if (hitEvent) hitData = hitEvent.hitData;
          }

          // Determine batter and pitcher team IDs
          const isTop = about.halfInning === "top";
          const batterTeamId = isTop ? awayTeamId : homeTeamId;
          const pitcherTeamId = isTop ? homeTeamId : awayTeamId;

          // Reset outs if inning or half changed
          if (about.inning !== lastInning || about.halfInning !== lastHalf) {
            lastOuts = 0;
            lastInning = about.inning;
            lastHalf = about.halfInning;
          }

          const currentOuts = result.outs || 0;
          let outsRecorded = Math.max(0, currentOuts - lastOuts);
          
          // Fallback for outs if result.outs is missing or inconsistent
          if (outsRecorded === 0 && result.event) {
            const ev = result.event.toLowerCase();
            if (ev.includes('double_play')) outsRecorded = 2;
            else if (ev.includes('triple_play')) outsRecorded = 3;
            else if (ev.includes('out') || ev.includes('strikeout') || ev.includes('caught_stealing') || ev.includes('pickoff')) {
              // Only count as 1 out if it's not a hit or walk
              if (!result.isHit && !ev.includes('walk') && !ev.includes('hit_by_pitch')) {
                outsRecorded = 1;
              }
            }
          }
          
          lastOuts = currentOuts;

          db.prepare(`
            INSERT INTO plays (play_id, game_pk, at_bat_index, batter_name, pitcher_name, batter_id, pitcher_id, batter_team_id, pitcher_team_id, event, description, rbi, outs_recorded, is_at_bat, is_hit, exit_velocity, launch_angle, distance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(play_id) DO UPDATE SET
              event = excluded.event,
              description = excluded.description,
              rbi = excluded.rbi,
              outs_recorded = excluded.outs_recorded,
              is_at_bat = excluded.is_at_bat,
              is_hit = excluded.is_hit,
              batter_id = excluded.batter_id,
              pitcher_id = excluded.pitcher_id,
              batter_team_id = excluded.batter_team_id,
              pitcher_team_id = excluded.pitcher_team_id,
              exit_velocity = excluded.exit_velocity,
              launch_angle = excluded.launch_angle,
              distance = excluded.distance
          `).run(
            playId,
            gamePk,
            play.atBatIndex,
            matchup.batter?.fullName || "Unknown Batter",
            matchup.pitcher?.fullName || "Unknown Pitcher",
            matchup.batter?.id || null,
            matchup.pitcher?.id || null,
            batterTeamId || null,
            pitcherTeamId || null,
            result.event || "Unknown",
            result.description || "",
            result.rbi || 0,
            outsRecorded,
            result.isAtBat ? 1 : 0,
            result.isHit ? 1 : 0,
            hitData?.launchSpeed || null,
            hitData?.launchAngle || null,
            hitData?.totalDistance || null
          );

          // Pitches
          if (play.pitchIndex && play.playEvents) {
            for (const pitchIndex of play.pitchIndex) {
              const pitch = play.playEvents[pitchIndex];
              if (!pitch || pitch.type !== "pitch") continue;

              const pitchId = `${playId}_${pitch.pitchNumber}`;
              const pData = pitch.pitchData || {};
              const details = pitch.details || {};
              
              db.prepare(`
                INSERT INTO pitches (pitch_id, play_id, pitch_number, pitch_type, velocity, spin_rate, pfx_x, pfx_z, px, pz, extension, result)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(pitch_id) DO UPDATE SET
                  result = excluded.result,
                  spin_rate = excluded.spin_rate,
                  pfx_x = excluded.pfx_x,
                  pfx_z = excluded.pfx_z,
                  px = excluded.px,
                  pz = excluded.pz,
                  extension = excluded.extension
              `).run(
                pitchId,
                playId,
                pitch.pitchNumber,
                details.type?.description || "Unknown",
                pData.startSpeed || null,
                pData.breaks?.spinRate || null,
                pData.coordinates?.pfxX !== undefined ? pData.coordinates.pfxX * 12 : null,
                pData.coordinates?.pfxZ !== undefined ? pData.coordinates.pfxZ * 12 : null,
                pData.coordinates?.pX || null,
                pData.coordinates?.pZ || null,
                pData.extension || null,
                details.description || ""
              );
            }
          }
        }
      }

      // After syncing, return the updated game detail directly to save a round trip
      const updatedGame = db.prepare("SELECT * FROM games WHERE game_pk = ?").get(gamePk);
      if (updatedGame) {
        if (updatedGame.boxscore) updatedGame.boxscore = JSON.parse(updatedGame.boxscore);
        if (updatedGame.linescore) updatedGame.linescore = JSON.parse(updatedGame.linescore);
        if (updatedGame.current_play) updatedGame.current_play = JSON.parse(updatedGame.current_play);
        
        const plays = db.prepare("SELECT * FROM plays WHERE game_pk = ? ORDER BY at_bat_index DESC").all(gamePk);
        const playsWithPitches = plays.map((play: any) => {
          const pitches = db.prepare("SELECT * FROM pitches WHERE play_id = ? ORDER BY pitch_number ASC").all(play.play_id);
          return { ...play, pitches };
        });
        
        return res.json({ ...updatedGame, plays: playsWithPitches });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Sync error:", error);
      res.status(500).json({ error: "Failed to sync game data" });
    }
  });

  // Fetch games for a specific date to populate the list
  app.get("/api/sync-date", async (req, res) => {
    const { date, sportId = '1' } = req.query;
    if (!date) return res.status(400).json({ error: "Date is required" });

    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=${sportId}&date=${date}`);
      const data: any = await response.json();
      
      const games = data.dates[0]?.games || [];
      for (const game of games) {
        db.prepare(`
          INSERT INTO games (game_pk, home_team, away_team, home_score, away_score, status, start_time, home_team_id, away_team_id, sport_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(game_pk) DO UPDATE SET
            status = excluded.status,
            home_score = excluded.home_score,
            away_score = excluded.away_score,
            home_team_id = excluded.home_team_id,
            away_team_id = excluded.away_team_id,
            sport_id = excluded.sport_id
        `).run(
          game.gamePk,
          game.teams.home.team.name,
          game.teams.away.team.name,
          game.teams.home.score || 0,
          game.teams.away.score || 0,
          game.status.detailedState,
          game.gameDate,
          game.teams.home.team.id,
          game.teams.away.team.id,
          Number(sportId)
        );
      }
      res.json({ success: true, count: games.length });
    } catch (error) {
      console.error("Sync date error:", error);
      res.status(500).json({ error: "Failed to sync games for date" });
    }
  });

  // Fetch season stats for all players in a game
  app.get("/api/game/:gamePk/player-stats", async (req, res) => {
    const { gamePk } = req.params;
    try {
      // Get all unique player IDs from the plays of this game
      const players = db.prepare(`
        SELECT DISTINCT batter_id as id FROM plays WHERE game_pk = ?
        UNION
        SELECT DISTINCT pitcher_id as id FROM plays WHERE game_pk = ?
      `).all(gamePk, gamePk);

      const playerIds = players.map((p: any) => p.id).filter((id: any) => id !== null);
      
      if (playerIds.length === 0) {
        return res.json({ batters: {}, pitchers: {} });
      }

      // Fetch stats in batches (MLB API has limits, but 50-100 is usually fine)
      const batchSize = 50;
      const statsMap: Record<number, any> = {};

      for (let i = 0; i < playerIds.length; i += batchSize) {
        const batch = playerIds.slice(i, i + batchSize);
        const url = `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(",")}&hydrate=stats(group=[hitting,pitching],type=[season])`;
        const response = await fetch(url);
        const data: any = await response.json();
        
        if (data.people) {
          data.people.forEach((person: any) => {
            statsMap[person.id] = person.stats;
          });
        }
      }

      res.json(statsMap);
    } catch (error) {
      console.error("Game player stats error:", error);
      res.status(500).json({ error: "Failed to fetch player stats for game" });
    }
  });

  // Player Search
  app.get("/api/player/search", async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Name is required" });

    try {
      // Hydrate with currentTeam to get team names in search results
      const response = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name as string)}&activeStatus=BOTH&hydrate=currentTeam&sportId=1`);
      const data: any = await response.json();
      res.json(data.people || []);
    } catch (error) {
      console.error("Player search error:", error);
      res.status(500).json({ error: "Failed to search for players" });
    }
  });

  // Player Detail (to get accurate team and info)
  app.get("/api/player/:playerId", async (req, res) => {
    const { playerId } = req.params;
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam,team`);
      const data: any = await response.json();
      if (!data.people || data.people.length === 0) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(data.people[0]);
    } catch (error) {
      console.error("Player detail error:", error);
      res.status(500).json({ error: "Failed to fetch player details" });
    }
  });

  // Player Statcast Data
  app.get("/api/player/:playerId/stats", async (req, res) => {
    const { playerId } = req.params;
    const { season } = req.query;
    
    try {
      let targetSeason = season as string;

      // If no season specified, find the most recent season with data
      if (!targetSeason) {
        // Try multiple hydration types to find any season with data
        const ybyUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=stats(group=[hitting,pitching],type=[yearByYear,season,career])`;
        const ybyRes = await fetch(ybyUrl);
        const ybyData: any = await ybyRes.json();
        const person = ybyData.people?.[0];
        
        if (person && person.stats) {
          let latestYear = 0;
          person.stats.forEach((statGroup: any) => {
            statGroup.splits?.forEach((split: any) => {
              if (split.season) {
                const year = parseInt(split.season);
                if (year > latestYear) latestYear = year;
              }
            });
          });
          if (latestYear > 0) {
            targetSeason = latestYear.toString();
            console.log(`Auto-detected latest season for ${playerId}: ${targetSeason}`);
          }
        }
      }

      // Fallback to current/previous year logic if still no target season
      if (!targetSeason) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        targetSeason = (currentMonth < 4 ? currentYear - 1 : currentYear).toString();
      }

      // Fetch stats more broadly and filter manually to ensure minor league data is captured.
      // The MLB API's 'season' parameter in hydration can sometimes exclude minor league splits 
      // if not used carefully with sportId.
      const url = `https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=stats(group=[hitting,pitching,fielding],type=[yearByYear,season,statcastMetrics,standard,advanced]),currentTeam,team`;
      
      console.log(`[API] Fetching hydrated stats for player ${playerId}: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[API] MLB API error for ${playerId}: ${response.status}`);
        throw new Error(`MLB API returned ${response.status}`);
      }

      const data = await response.json();
      const person = data.people?.[0];
      
      if (!person) {
        console.warn(`[API] No person found in MLB API response for ID ${playerId}`);
        return res.json({ hitting: [], pitching: [], season: targetSeason });
      }

      if (!person.stats) {
        console.warn(`[API] Person ${playerId} found, but has no stats array`);
        return res.json({ hitting: [], pitching: [], season: targetSeason });
      }

      const hittingSplits: any[] = [];
      const pitchingSplits: any[] = [];

      person.stats.forEach((statGroup: any) => {
        const groupName = statGroup.group.displayName.toLowerCase();
        const typeName = statGroup.type.displayName;
        
        // Only process splits that match our target season
        const filteredSplits = (statGroup.splits || []).filter((s: any) => s.season === targetSeason);
        
        console.log(`[API] - Group: ${groupName}, Type: ${typeName}, Total Splits: ${statGroup.splits?.length || 0}, Filtered (Season ${targetSeason}): ${filteredSplits.length}`);
        
        if (groupName === 'hitting') {
          hittingSplits.push(...filteredSplits);
        } else if (groupName === 'pitching') {
          pitchingSplits.push(...filteredSplits);
        }
      });

      console.log(`[API] Total splits for Player ${playerId} in ${targetSeason}: ${hittingSplits.length} hitting, ${pitchingSplits.length} pitching`);

      res.json({
        hitting: hittingSplits,
        pitching: pitchingSplits,
        season: targetSeason
      });
    } catch (error) {
      console.error("Hydrated stats error:", error);
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  // Catch-all for API routes to prevent falling through to Vite/SPA fallback
  app.all("/api/*", (req, res) => {
    console.log(`[API] 404 - ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: "API route not found", 
      method: req.method, 
      url: req.originalUrl 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
