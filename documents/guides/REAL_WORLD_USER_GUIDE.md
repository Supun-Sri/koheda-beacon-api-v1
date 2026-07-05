# Kohedha Beacon - Real World Application Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [User Flows](#user-flows)
3. [Mobile App Design](#mobile-app-design)
4. [Restaurant Dashboard](#restaurant-dashboard)
5. [Real-World Scenarios](#real-world-scenarios)
6. [Business Model](#business-model)
7. [Marketing Strategy](#marketing-strategy)

---

## System Overview

### What is Kohedha?

Kohedha is a location-based deal discovery platform that connects consumers with nearby restaurants through a unique "beacon" system. Consumers activate beacons when they're looking for deals, and restaurants bid in real-time auctions to deliver personalized offers.

### Key Differentiators

1. **Consumer Control**: Users activate beacons only when they want deals (no spam)
2. **Smart Matching**: Combines location + vibe preferences (PostGIS + Jaccard)
3. **Fair Pricing**: Dynamic surge pricing based on demand
4. **Anti-Abuse**: Exponential noise decay prevents beacon spam
5. **Real-Time**: WebSocket updates for live countdown and notifications

---

## User Flows

### 1. Consumer Flow (Mobile App)

#### A. First Time User

```
Step 1: Download App
  ↓
Step 2: Sign Up / Login
  - Phone number verification (OTP)
  - Basic profile (name, preferences)
  ↓
Step 3: Onboarding
  - Location permission request
  - Select favorite vibe tags (3-5 tags)
  - Tutorial: "Activate beacon when hungry"
  ↓
Step 4: Home Screen
  - Map view with nearby restaurants
  - "Activate Beacon" button (prominent)
  - Browse active deals (optional)
```

#### B. Activating a Beacon

```
Step 1: Tap "Activate Beacon"
  ↓
Step 2: Select Vibe Tags (2-4 tags recommended)
  - Quick select: "rooftop", "cocktails", "live music"
  - Current location auto-detected
  ↓
Step 3: Beacon Activated!
  - Visual: Pulsing circle on map (18km radius)
  - Countdown: "1H 59M remaining"
  - Status: "Finding deals..."
  ↓
Step 4: Receive Deals (within seconds)
  - Push notification: "8 deals found nearby!"
  - List view: Sorted by match quality
  - Each card shows:
    * Restaurant name + photo
    * Deal title (e.g., "30% off cocktails")
    * Distance (e.g., "0.6 km away")
    * Match score (e.g., "67% match")
    * Rating (4.5 stars)
  ↓
Step 5: Claim a Deal
  - Tap deal card → "Claim Now"
  - QR code generated: K-940FF6
  - Timer: "Expires in 120 minutes"
  - Directions: Google Maps integration
  ↓
Step 6: Redeem at Restaurant
  - Show QR code to staff
  - Staff scans code
  - Deal applied to bill
  - Rating prompt after visit
```

#### C. Noise Level Tracking (Hidden from User)

```
User activates beacon
  ↓
8 deals found → Noise: 0 + (0.15 × 8) = 1.2
  ↓
State: MUTED (noise ≥ 1.0)
  ↓
User tries to activate another beacon
  ↓
App shows: "You're receiving too many deals! 
            Try again in 8 hours."
  ↓
After 8 hours: Noise decays to 0.28 → ACTIVE
  ↓
User can activate beacon again
```

#### D. Deal Discovery (Without Beacon)

```
Browse Tab
  ↓
Map View: Shows active deals at nearby restaurants
  ↓
Filter: By vibe tags, distance, rating
  ↓
Claim deal (limited availability: 27/30 claims left)
  ↓
Same redemption flow as beacon deals
```

---

### 2. Restaurant Flow (Web Dashboard)

#### A. Onboarding

```
Step 1: Sign Up
  - Business details (name, address, license)
  - Verification (business documents)
  - Payment setup (bank account for payouts)
  ↓
Step 2: Profile Setup
  - Add photos (venue, dishes, ambiance)
  - Select vibe tags (up to 5 tags)
  - Set operating hours
  - Add menu items
  ↓
Step 3: Auction Settings
  - Set default bid amount (300-1000 LKR)
  - Set bid strategy:
    * Conservative: 300-500 LKR
    * Moderate: 500-700 LKR
    * Aggressive: 700-1000 LKR
  - Auto-bid enabled/disabled
```

#### B. Creating Deals

```
Dashboard → "Create Deal" Button
  ↓
Deal Form:
  - Title: "30% off all cocktails"
  - Description: "Valid until 11pm. All signature drinks."
  - Terms: "Cannot combine with other offers"
  - Total claims: 30 (default)
  - Duration: 2 hours (default)
  - Manual create OR auto-create after auction win
  ↓
Deal Created
  - Live on platform immediately
  - Appears in consumer app
  - Tracking: Claims used / Total claims
```

#### C. Auction Participation

```
Real-Time Dashboard View:
  ┌─────────────────────────────────────┐
  │ ACTIVE AUCTIONS                     │
  │                                     │
  │ 🔴 Beacon #A3F2B1 (2 min ago)      │
  │    Tags: rooftop, cocktails         │
  │    Distance: 0.6 km                 │
  │    Current Bid: 750 LKR             │
  │    Your Bid: 800 LKR ✓              │
  │    Status: WINNING                  │
  │                                     │
  │ 🟡 Beacon #B7D4C9 (5 min ago)      │
  │    Tags: fine dining, date night    │
  │    Distance: 2.3 km                 │
  │    Current Bid: 650 LKR             │
  │    Your Bid: 600 LKR                │
  │    Status: OUTBID                   │
  │    [Increase Bid]                   │
  └─────────────────────────────────────┘

Auction Result:
  ↓
WON AUCTION!
  - Beacon #A3F2B1
  - Final Bid: 800 LKR (charged immediately)
  - Deal auto-created: "30% off cocktails"
  - Expected reach: 1 consumer activated beacon
  - Potential claims: 1-5 claims
  - Revenue potential: 200-1000 LKR (claim fees)
```

#### D. QR Code Scanner

```
Staff Mode (Tablet/Phone):
  ↓
Scan QR Code: K-940FF6
  ↓
Verification:
  - ✓ Valid code
  - Deal: "30% off cocktails"
  - Customer: user-01
  - Claim time: 2:45 PM
  - Expires: 4:45 PM (2h from claim)
  ↓
[Mark as Redeemed]
  ↓
Deal Applied!
  - Original bill: 2500 LKR
  - Discount (30%): -750 LKR
  - Final bill: 1750 LKR
  - Restaurant pays: 200 LKR claim fee
  - Net revenue impact: +2000 LKR (new customer)
```

---

## Mobile App Design

### Consumer App (React Native + Expo)

#### Screen 1: Home / Map View

```
┌─────────────────────────────────────┐
│  ☰  Kohedha          👤 Profile     │
├─────────────────────────────────────┤
│                                     │
│         🗺️ MAP VIEW                 │
│                                     │
│    [Restaurants as pins]            │
│    [Your location: blue dot]        │
│    [Active beacons: pulsing circles]│
│                                     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  🎯 ACTIVATE BEACON                 │
│                                     │
│  Select your vibe:                  │
│  [🏙️ rooftop] [🍹 cocktails]       │
│  [🎵 live music] [🌅 sunset]       │
│                                     │
└─────────────────────────────────────┘
```

#### Screen 2: Active Beacon View

```
┌─────────────────────────────────────┐
│  ←  Beacon Active                   │
├─────────────────────────────────────┤
│                                     │
│       ⏱️ 1H 45M remaining           │
│                                     │
│   🎯 Finding deals nearby...        │
│                                     │
│   Your vibe: rooftop, cocktails     │
│   Radius: 18 km                     │
│                                     │
├─────────────────────────────────────┤
│  💎 8 DEALS FOUND                   │
├─────────────────────────────────────┤
│                                     │
│  🏨 The Hangover Bar        0.6 km  │
│  30% off all cocktails              │
│  ⭐ 4.5  |  67% match  |  CLAIM     │
│                                     │
│  🏙️ Rooftop 27              2.9 km  │
│  Buy 2 Get 1 Free                   │
│  ⭐ 4.8  |  67% match  |  CLAIM     │
│                                     │
│  🍸 Ministry of Crab        1.2 km  │
│  Happy Hour Extended                │
│  ⭐ 4.9  |  33% match  |  CLAIM     │
│                                     │
│                 [See All]           │
│                                     │
├─────────────────────────────────────┤
│  [CANCEL BEACON]                    │
└─────────────────────────────────────┘
```

#### Screen 3: Deal Claim / QR Code

```
┌─────────────────────────────────────┐
│  ←  Deal Claimed                    │
├─────────────────────────────────────┤
│                                     │
│   The Hangover Bar                  │
│   30% off all cocktails             │
│                                     │
│   ┌───────────────────────────┐    │
│   │                           │    │
│   │   [QR CODE: K-940FF6]     │    │
│   │                           │    │
│   │     K-940FF6              │    │
│   │                           │    │
│   └───────────────────────────┘    │
│                                     │
│   Valid until: 4:45 PM (1h 58m)    │
│                                     │
│   📍 0.6 km away                    │
│   [GET DIRECTIONS]                  │
│                                     │
│   ℹ️ Show this code to staff        │
│      Single use only                │
│                                     │
└─────────────────────────────────────┘
```

### Key Features to Implement

1. **Push Notifications**:
   - "8 deals found nearby!"
   - "Beacon expiring in 15 minutes"
   - "New deal available at your favorite spot"

2. **Offline Mode**:
   - Cache claimed deals locally
   - Show QR code even without internet
   - Sync when back online

3. **Social Features**:
   - Share deals with friends
   - Group beacons (split deals)
   - Leaderboard (most deals claimed)

4. **Personalization**:
   - Learn user preferences
   - Suggest vibe tags based on history
   - "You often enjoy rooftop + cocktails"

---

## Restaurant Dashboard

### Web Dashboard (Next.js or React)

#### Dashboard Home

```
┌──────────────────────────────────────────────────────┐
│  Kohedha Restaurant Dashboard                        │
│  The Hangover Bar                            [Logout]│
├──────────────────────────────────────────────────────┤
│                                                      │
│  TODAY'S STATS                                       │
│  ┌──────────┬──────────┬──────────┬──────────┐      │
│  │ Auctions │ Deals    │ Claims   │ Revenue  │      │
│  │ Won      │ Active   │ Today    │ Today    │      │
│  │    3     │    2     │   12     │ 8,400 LKR│      │
│  └──────────┴──────────┴──────────┴──────────┘      │
│                                                      │
│  ACTIVE AUCTIONS (Real-Time)                         │
│  ┌────────────────────────────────────────────┐     │
│  │ 🔴 Beacon #A3F2B1 (2 min ago)             │     │
│  │    Tags: rooftop, cocktails                │     │
│  │    Distance: 0.6 km                        │     │
│  │    Your Bid: 800 LKR                       │     │
│  │    Status: ✅ WINNING                      │     │
│  │    Efficiency: 803 (Rank #1/8)             │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  ACTIVE DEALS                                        │
│  ┌────────────────────────────────────────────┐     │
│  │ 30% off all cocktails                      │     │
│  │ Claims: 8/30  |  Expires: 1h 23m           │     │
│  │ Revenue: 1,600 LKR (claim fees)            │     │
│  │ [View Details] [End Early]                 │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  [+ CREATE DEAL] [📊 ANALYTICS] [⚙️ SETTINGS]       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### QR Scanner View (Staff Tablet)

```
┌──────────────────────────────────────┐
│  Kohedha Scanner                     │
│  The Hangover Bar                    │
├──────────────────────────────────────┤
│                                      │
│  📷 SCAN QR CODE                     │
│                                      │
│  [Camera viewfinder]                 │
│                                      │
│  Or enter code manually:             │
│  [K-______]  [VERIFY]                │
│                                      │
├──────────────────────────────────────┤
│  RECENT REDEMPTIONS (Today)          │
│                                      │
│  ✅ K-940FF6  |  2:45 PM  |  750 LKR │
│  ✅ K-3A38D7  |  3:12 PM  |  850 LKR │
│  ✅ K-F9B2BC  |  3:45 PM  |  620 LKR │
│                                      │
│  Total saved for customers: 2,220 LKR│
│                                      │
└──────────────────────────────────────┘
```

---

## Real-World Scenarios

### Scenario 1: Friday Night Out

**Context**: Sarah and friends want cocktails after work

```
6:00 PM - Sarah opens Kohedha
  ↓
6:01 PM - Activates beacon with tags: rooftop, cocktails, happy hour
  ↓
6:02 PM - 8 deals appear
  - The Hangover Bar: 30% off (0.6 km) ⭐
  - Rooftop 27: Buy 2 Get 1 (2.9 km)
  - Sky Lounge: Extended happy hour (1.8 km)
  ↓
6:03 PM - Sarah claims "30% off" at The Hangover Bar
  ↓
6:15 PM - Group arrives, shows QR code: K-940FF6
  ↓
6:17 PM - Staff scans code, applies 30% discount
  ↓
8:30 PM - Bill: 2500 LKR → 1750 LKR (saved 750 LKR)
  ↓
8:35 PM - Sarah rates restaurant 5 stars
  ↓
Result:
  - Sarah: Saved 750 LKR, discovered new place
  - Restaurant: +4 new customers, paid 800 LKR (bid) + 200 LKR (claim)
  - Net: 2000+ LKR revenue from walk-ins (Sarah's friends)
```

### Scenario 2: Restaurant Slow Night

**Context**: Tuesday 8 PM, restaurant is quiet

```
8:00 PM - Manager sees empty tables
  ↓
8:05 PM - Creates aggressive deal: "50% off entire menu"
  ↓
8:10 PM - 3 beacons active nearby
  ↓
8:11 PM - Restaurant bids 900 LKR on all 3
  ↓
8:12 PM - Wins 2 auctions (efficiency score)
  ↓
8:15 PM - 2 consumers claim deals
  ↓
8:30 PM - First group arrives (4 people)
  ↓
8:45 PM - Second group arrives (2 people)
  ↓
10:00 PM - Results:
  - 6 customers served
  - Average bill: 1500 LKR × 6 = 9000 LKR
  - Discount (50%): -4500 LKR
  - Fees paid: 1800 LKR (bids) + 400 LKR (claims)
  - Net revenue: 2300 LKR
  - BUT: Kitchen stays busy, staff productive, future customers
```

### Scenario 3: Tourist Discovery

**Context**: Mark is visiting Colombo, wants authentic local experience

```
Day 1 - Mark activates beacon
  Tags: local cuisine, authentic, hidden gem
  ↓
Matches: Small local restaurants, not tourist traps
  ↓
Claims deal at "Upali's by Nawaloka"
  ↓
Amazing experience, saves 600 LKR
  ↓
Day 2-5 - Mark uses Kohedha daily
  ↓
Result:
  - Mark discovers 5 authentic restaurants
  - Saves 3000 LKR total
  - Leaves 5-star reviews
  - Restaurants gain international exposure
```

---

## Business Model

### Revenue Streams

#### 1. Restaurant Fees

**Auction Bid Fees** (Primary Revenue)
- Per auction won: 300-1000 LKR
- Average: 500 LKR per auction
- Volume: 100 auctions/day (initial)
- Monthly: 100 × 30 × 500 = 1,500,000 LKR

**Claim Fees**
- Per redemption: 200 LKR
- Average: 15 claims per deal
- Monthly: 100 deals × 15 × 200 = 300,000 LKR

**Subscription (Optional)**
- Basic: Free (pay per auction)
- Pro: 10,000 LKR/month (20% discount on bids)
- Enterprise: 50,000 LKR/month (custom features)

**Total Restaurant Revenue**: ~1,800,000 LKR/month (early stage)

#### 2. Consumer Fees (Future)

**Premium Features**
- Ad-free experience: 299 LKR/month
- Priority claims: 499 LKR/month
- Group beacons: 699 LKR/month

**Estimated**: 10% of users × 399 LKR avg = Marginal revenue

### Cost Structure

#### Monthly Operating Costs (Initial)

**Infrastructure**:
- Railway hosting: 2,000 LKR/month
- Database: 3,000 LKR/month (PostgreSQL + PostGIS)
- CDN + Storage: 1,500 LKR/month
- **Total**: 6,500 LKR/month

**Development**:
- Mobile app updates: Contract basis
- Backend maintenance: 2-3 hours/week
- **Total**: Minimal (own team)

**Marketing**:
- Social media ads: 50,000 LKR/month
- Restaurant onboarding: 20,000 LKR/month
- Influencer partnerships: 30,000 LKR/month
- **Total**: 100,000 LKR/month

**Total Monthly Costs**: ~106,500 LKR

### Profitability

**Month 1-3** (Bootstrap Phase):
- Revenue: 200,000 LKR/month
- Costs: 106,500 LKR/month
- **Profit**: 93,500 LKR/month

**Month 6** (Growth Phase):
- Revenue: 1,000,000 LKR/month
- Costs: 200,000 LKR/month
- **Profit**: 800,000 LKR/month

**Month 12** (Scale Phase):
- Revenue: 3,000,000 LKR/month
- Costs: 500,000 LKR/month
- **Profit**: 2,500,000 LKR/month

---

## Marketing Strategy

### Phase 1: Launch (Month 1-2)

**Target**: Colombo 7 (Fort, Bambalapitiya, Kollupitiya)

**Consumer Acquisition**:
1. **Influencer Partnerships**:
   - 5-10 food bloggers
   - Instagram stories showing deals
   - "I saved 2000 LKR this week!" testimonials

2. **Referral Program**:
   - Refer a friend: Both get 500 LKR in "beacon credits"
   - Credits: Waive bid fees for restaurants

3. **Launch Event**:
   - Partner with 10 restaurants
   - "Kohedha Night": Exclusive deals
   - Social media buzz

**Restaurant Onboarding**:
1. **Direct Sales**:
   - Visit top 50 restaurants
   - Demo the dashboard
   - Offer: First 10 auctions free

2. **Success Stories**:
   - Case study: "How Restaurant X filled tables on Tuesday"
   - Show ROI: 10x return on bid fees

3. **Training**:
   - 1-hour onboarding session
   - QR scanner setup
   - Best practices guide

### Phase 2: Growth (Month 3-6)

**Expand Coverage**:
- Colombo 3 (Kollupitiya, Bambalapitiya)
- Colombo 5 (Havelock Town, Kirulapone)
- Colombo 6 (Wellawatta)

**Features**:
- Group beacons (split deals)
- Loyalty points
- "Beacon streaks" (gamification)

**Partnerships**:
- Uber/PickMe: "Ride + Deal" combo
- Hotels: Tourist package
- Events: Concert + dinner deals

### Phase 3: Scale (Month 7-12)

**National Expansion**:
- Galle, Kandy, Negombo
- Beach destinations

**B2B Partnerships**:
- Corporate lunch programs
- Event catering discounts

**Premium Features**:
- VIP beacons (exclusive restaurants)
- Concierge service
- Private events

---

## Success Metrics

### Consumer KPIs

- **Beacon Activation Rate**: 40% of users activate weekly
- **Claim Rate**: 60% of deals shown are claimed
- **Redemption Rate**: 80% of claims are redeemed
- **Retention**: 50% of users active after 3 months
- **NPS**: >70

### Restaurant KPIs

- **Auction Win Rate**: 30% (balanced competition)
- **ROI**: 5x (5 LKR revenue per 1 LKR spent)
- **Repeat Rate**: 70% of restaurants stay active
- **Fill Rate**: 20% increase in slow hours

### Platform KPIs

- **Monthly Active Users**: 10,000 (Month 6)
- **Active Restaurants**: 200 (Month 6)
- **Auctions/Day**: 500 (Month 6)
- **GMV**: 5,000,000 LKR/month (Month 6)

---

## Competitive Advantages

1. **Real-Time Auctions**: No competitor has this
2. **Consumer Control**: Beacons prevent spam
3. **Smart Matching**: PostGIS + Jaccard = precise recommendations
4. **Fair Pricing**: Surge pricing prevents market manipulation
5. **Anti-Abuse**: Noise tracking ensures quality

---

## Risk Mitigation

### Risk 1: Low Consumer Adoption

**Mitigation**:
- Aggressive referral program
- Partner with influencers
- Exclusive launch deals

### Risk 2: Restaurant Churn

**Mitigation**:
- ROI dashboard (show value)
- Success stories
- Dedicated account managers

### Risk 3: Technical Issues

**Mitigation**:
- Comprehensive testing (7 phases complete)
- Real-time monitoring
- 24/7 support for critical issues

### Risk 4: Competition

**Mitigation**:
- Patent auction algorithm
- Build strong network effects
- Focus on quality over quantity

---

## Next Steps

1. **Week 1-2**: Deploy backend to production
2. **Week 3-4**: Build mobile app MVP (Expo)
3. **Week 5-6**: Build restaurant dashboard
4. **Week 7**: Beta testing (10 restaurants, 50 users)
5. **Week 8**: Public launch (Colombo 7)
6. **Week 9-12**: Iterate based on feedback
7. **Month 4+**: Scale to other areas

---

**Built with ❤️ in Sri Lanka**

For questions: [Your Contact]
For demo: [Your Website]
