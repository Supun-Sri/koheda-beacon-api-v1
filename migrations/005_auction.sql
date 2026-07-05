-- Phase 6: Auction Engine Tables

CREATE TABLE IF NOT EXISTS auction_rounds (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beacon_id    UUID REFERENCES beacons(id),
  round_number INT NOT NULL DEFAULT 1,
  winner_id    UUID REFERENCES restaurants(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bids (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_round_id UUID REFERENCES auction_rounds(id),
  restaurant_id    UUID REFERENCES restaurants(id),
  bid_amount       DECIMAL(10,2) NOT NULL,
  match_ratio      DECIMAL(4,3),
  efficiency_score DECIMAL(10,3),
  is_winner        BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vibe_tag     TEXT NOT NULL,
  winner_id    UUID REFERENCES restaurants(id),
  bid_amount   DECIMAL(10,2),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_history_tag ON auction_history(vibe_tag, created_at DESC);

CREATE TABLE IF NOT EXISTS deals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id    UUID REFERENCES auction_rounds(id),
  restaurant_id UUID REFERENCES restaurants(id),
  title         TEXT NOT NULL,
  description   TEXT,
  total_claims  INT DEFAULT 30,
  claimed_count INT DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
