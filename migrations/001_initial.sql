-- Enable PostGIS and UUID extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create vibe_tags table
CREATE TABLE IF NOT EXISTS vibe_tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT UNIQUE NOT NULL,
  radius_km  INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
