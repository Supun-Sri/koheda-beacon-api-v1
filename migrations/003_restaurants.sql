-- Create restaurants table with PostGIS geography type
CREATE TABLE IF NOT EXISTS restaurants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  location   GEOGRAPHY(POINT, 4326) NOT NULL,
  rating     DECIMAL(2,1) DEFAULT 4.0,
  open_until TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for restaurant-vibe_tag many-to-many relationship
CREATE TABLE IF NOT EXISTS restaurant_vibe_tags (
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  vibe_tag_id   UUID REFERENCES vibe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (restaurant_id, vibe_tag_id)
);

-- Create spatial index for fast distance queries
CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants USING GIST (location);

-- Seed 15 Colombo restaurants (lng, lat order for ST_Point)
INSERT INTO restaurants (name, location, rating, open_until) VALUES
  ('The Hangover Bar',   ST_Point(79.8536, 6.9147)::geography, 4.7, '1AM'),
  ('Salt & Tide',        ST_Point(79.8612, 6.8721)::geography, 4.5, '12AM'),
  ('Black Cat Lounge',   ST_Point(79.8489, 6.9012)::geography, 4.3, '2AM'),
  ('Dish Close-Up',      ST_Point(79.8567, 6.9234)::geography, 4.5, '1AM'),
  ('Garden Bar',         ST_Point(79.8701, 6.8843)::geography, 4.2, '11PM'),
  ('Rooftop 27',         ST_Point(79.8445, 6.9311)::geography, 4.6, '12AM'),
  ('The Loft',           ST_Point(79.8623, 6.8956)::geography, 4.1, '12AM'),
  ('Spice Route',        ST_Point(79.8512, 6.9089)::geography, 4.4, '11PM'),
  ('The Groove',         ST_Point(79.8558, 6.9178)::geography, 4.0, '3AM'),
  ('Colombo Social',     ST_Point(79.8478, 6.8889)::geography, 4.3, '1AM'),
  ('Koko Beach',         ST_Point(79.8345, 6.8712)::geography, 4.4, '11PM'),
  ('Neon Tiger',         ST_Point(79.8601, 6.9267)::geography, 4.2, '2AM'),
  ('The Commons',        ST_Point(79.8534, 6.8978)::geography, 4.1, '10PM'),
  ('Café Moose',         ST_Point(79.8589, 6.9145)::geography, 3.9, '9PM'),
  ('Pearl Rooftop',      ST_Point(79.8467, 6.9198)::geography, 4.8, '1AM')
ON CONFLICT DO NOTHING;

-- Link restaurants to vibe tags
INSERT INTO restaurant_vibe_tags (restaurant_id, vibe_tag_id)
SELECT r.id, v.id FROM restaurants r, vibe_tags v
WHERE (r.name = 'The Hangover Bar' AND v.name IN ('rooftop', 'cocktails', 'dj'))
   OR (r.name = 'Salt & Tide'      AND v.name IN ('byob', 'live music'))
   OR (r.name = 'Black Cat Lounge'  AND v.name IN ('dj', 'late night'))
   OR (r.name = 'Dish Close-Up'     AND v.name IN ('fine dining', 'cocktails'))
   OR (r.name = 'Garden Bar'        AND v.name IN ('live music', 'rooftop'))
   OR (r.name = 'Rooftop 27'        AND v.name IN ('rooftop', 'cocktails'))
   OR (r.name = 'The Loft'          AND v.name IN ('byob', 'rooftop'))
   OR (r.name = 'Spice Route'       AND v.name IN ('fine dining', 'date night'))
   OR (r.name = 'The Groove'        AND v.name IN ('dj', 'late night'))
   OR (r.name = 'Colombo Social'    AND v.name IN ('cocktails', 'live music', 'rooftop'))
   OR (r.name = 'Koko Beach'        AND v.name IN ('beach', 'cocktails'))
   OR (r.name = 'Neon Tiger'        AND v.name IN ('dj', 'late night', 'cocktails'))
   OR (r.name = 'The Commons'       AND v.name IN ('cafe', 'family'))
   OR (r.name = 'Café Moose'        AND v.name IN ('cafe', 'date night'))
   OR (r.name = 'Pearl Rooftop'     AND v.name IN ('rooftop', 'cocktails', 'fine dining'));
