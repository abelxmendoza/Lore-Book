-- GitHub ingestion pipeline tables
CREATE TABLE IF NOT EXISTS github_repos (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  repo_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS github_events (
  id SERIAL PRIMARY KEY,
  repo_id INT REFERENCES github_repos(id),
  event_type TEXT,
  payload JSONB,
  committed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS github_milestones (
  id SERIAL PRIMARY KEY,
  repo_id INT REFERENCES github_repos(id),
  summary TEXT,
  significance INT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
