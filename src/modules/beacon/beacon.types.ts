export interface Beacon {
  id: string;
  user_id: string;
  location: { lat: number; lng: number };
  vibe_tags: string[];
  status: 'active' | 'expired' | 'cancelled';
  created_at: Date;
  expires_at: Date;
}

export interface BeaconActivationRequest {
  userId: string;
  lat: number;
  lng: number;
  vibeTags: string[];
}

export interface BeaconActivationResponse {
  beaconId: string;
  status: string;
  vibeTags: string[];
  expiresAt: Date;
  remainingMs: number;
  remainingDisplay: string;
}
