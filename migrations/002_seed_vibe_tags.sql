-- Seed vibe tags with their radius ranges
INSERT INTO vibe_tags (name, radius_km) VALUES
  ('cocktails',  7),
  ('rooftop',    10),
  ('dj',         12),
  ('live music', 14),
  ('mic night',  16),
  ('fine dining', 18),
  ('late night', 12),
  ('byob',       10),
  ('cafe',       6),
  ('beach',      15),
  ('family',     8),
  ('date night', 10)
ON CONFLICT (name) DO NOTHING;
