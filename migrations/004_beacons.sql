-- Create beacons table with spatial support
CREATE TABLE IF NOT EXISTS beacons (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    TEXT NOT NULL,
  location   GEOGRAPHY(POINT, 4326) NOT NULL,
  vibe_tags  JSONB NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_beacons_user ON beacons(user_id, status);
CREATE INDEX idx_beacons_active ON beacons(status) WHERE status = 'active';
CREATE INDEX idx_beacons_location ON beacons USING GIST (location);
CREATE INDEX idx_beacons_expires ON beacons(expires_at) WHERE status = 'active';
