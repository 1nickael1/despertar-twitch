CREATE TABLE hunters (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  level INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  gold INTEGER NOT NULL,
  rank_reached_at INTEGER NOT NULL,
  last_hunt_at INTEGER,
  injured_until INTEGER,
  reeval_blocked_until INTEGER,
  equipped_title_id TEXT,
  season_id INTEGER NOT NULL
);

CREATE TABLE hunter_titles (
  user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  label TEXT NOT NULL,
  season_id INTEGER NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, title_id)
);

CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE hall_of_fame (
  season_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  final_rank INTEGER NOT NULL,
  final_level INTEGER NOT NULL,
  PRIMARY KEY (season_id, position)
);
