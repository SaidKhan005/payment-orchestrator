# Phase 2 Market Analysis: Standalone Simphony SaaS

**Status:** Planning — Post-Ethor Partnership
**Date:** February 15, 2026

---

> **Note:** This is a planning document for Phase 2. Phase 1 (Ethor partnership) is the immediate priority.

---

## Market Overview

### Oracle Simphony in the Restaurant Industry

Oracle Hospitality's Simphony POS is one of the dominant enterprise POS platforms for mid-to-large restaurant chains globally.

**Key facts:**
- Used by major chains: TGI Fridays, Hard Rock Cafe, Marriott F&B, and thousands more
- Enterprise focus: typically 10+ location chains
- Strong in hotel/resort F&B and entertainment dining
- Growing segment: fast casual and QSR

### The Addressable Problem

Every Simphony customer that uses:
- Handheld payment devices
- Table-side ordering with payment
- Self-service kiosks with POS integration
- Any device that can retry payment requests

...is exposed to the duplicate charge problem. The proxy solves this regardless of which handheld vendor they use.

---

## Total Addressable Market (TAM)

### Simphony Installations Estimate

| Segment | Estimated Locations | % at Risk |
|---------|--------------------:|----------:|
| North America enterprise chains | 8,000–12,000 | 60% |
| International (English-speaking) | 5,000–10,000 | 40% |
| Hotel/resort F&B | 3,000–5,000 | 50% |
| **Total estimated** | **16,000–27,000** | **~50%** |

### SAM (Serviceable Addressable Market)

**Focus: North American chains using handhelds + Simphony**
- Estimated locations: 5,000–8,000
- At $400/location/month average: **$24M–$38M ARR potential**

### SOM (Serviceable Obtainable Market — 3 Year)

**Realistic capture in 3 years:** 1–3% of SAM
- 50–240 locations
- Revenue: $240K–$1.15M ARR

---

## Customer Segments

### Segment 1: Mid-Market Entertainment Dining (Primary)
**Description:** Safari-type customers — entertainment-focused restaurants, 10–50 locations, using Ethor or similar handhelds

**Characteristics:**
- High transaction volume per location
- Heavy handheld usage
- Strong Simphony adoption
- Pain from duplicate charges highly visible

**Examples:** Safari Eatertainment, Dave & Buster's type operators, sports bar chains

**Revenue potential:** $2,000–$5,000/location/month (high volume premium)

---

### Segment 2: Casual Dining Chains
**Description:** Casual dining groups with 20–200 locations using Simphony and table-side payment

**Characteristics:**
- Moderate transaction volume
- Mix of handheld and fixed POS
- IT team has budget for operational tools
- Chargeback and reconciliation pain point

**Examples:** Independent regional chains; groups managing multiple concepts

**Revenue potential:** $300–$500/location/month

---

### Segment 3: Hotel F&B
**Description:** Hotel restaurant operations using Simphony (often bundled with property management)

**Characteristics:**
- Simphony deeply integrated with hotel systems
- Payment reliability critical (high-value guests)
- Often use Micros/Oracle gateway
- Decision made at corporate level

**Revenue potential:** $400–$800/location/month (premium for hospitality SLA)

---

## Competitive Landscape

### Direct Competitors

**None identified.** No product specifically solving idempotency for Oracle Simphony + payment gateways.

**Why the gap exists:**
- Simphony is complex to integrate with
- The problem is subtle — it requires understanding both gateway and POS behavior
- POS vendors don't want to admit their stack has this issue
- Payment gateway vendors don't want to solve it (not their responsibility)

### Indirect Competitors

| Competitor | What They Do | Gap |
|------------|-------------|-----|
| Oracle Payment Integration | Native Simphony payments | Doesn't solve idempotency for 3rd party gateways |
| Payment gateways (Elavon, Shift4) | Gateway services | No Simphony integration |
| Restaurant tech consultants | Custom integrations | One-off, not productized |
| POS vendors (Ethor, etc.) | Handheld software | No idempotency layer |

### Competitive Advantage

1. **First mover:** No direct competitor exists
2. **Deep Simphony expertise:** PKCE auth, STS API, tender posting — learned from Safari
3. **Proven solution:** Not a concept — tested with real checks
4. **Switching cost:** Once deployed, high stickiness (audit trail, integrations)

---

## Pricing Benchmarks

### Comparable SaaS Products in Restaurant Tech

| Product | Category | Price | Notes |
|---------|----------|-------|-------|
| Olo (ordering) | Online ordering middleware | $250–500/location/month | Revenue share model |
| Toast (POS) | POS system | $110/location/month + fees | Full POS replacement |
| Restaurant365 | Accounting/ops | $200–400/user/month | Back-office platform |
| Revel Systems | POS | $99/month | SMB focus |

**Our pricing position:**
- $300–$500/location/month
- Premium justified by direct ROI (savings > 10x cost)
- Below full POS replacement cost

---

## Sales Process

### Typical Enterprise Restaurant Tech Sales Cycle

| Stage | Duration | Key Activity |
|-------|---------|--------------|
| Discovery | 1–2 weeks | Identify pain, qualify budget |
| Technical validation | 2–4 weeks | Proof of concept, IT review |
| Business case | 1–2 weeks | ROI calculation, approval |
| Contract | 2–4 weeks | Legal, procurement |
| Implementation | 4–8 weeks | Deploy, test, train |
| **Total** | **10–20 weeks** | |

### Land-and-Expand Motion

1. **Land:** Start with 1–3 pilot locations
2. **Prove:** Show zero duplicates, provide metrics
3. **Expand:** Roll to remaining locations in chain
4. **Reference:** Become case study for next customer

---

## Partnership Opportunities

### Oracle Hospitality
- **Opportunity:** Oracle Marketplace listing, partner program
- **Risk:** Oracle may build competing solution if market is large enough
- **Strategy:** Position as complementary, not competitive; focus on speed-to-value

### Payment Gateways
- **Elavon:** Current integration target; potential co-marketing
- **Shift4:** Growing restaurant presence; potential integration
- **Value prop to gateways:** We drive more successful transactions, reducing chargebacks

### Restaurant Technology Associations
- HITEC (Hospitality Industry Technology Exposition)
- NRA Show (National Restaurant Association)
- Presence validates credibility

---

## Financial Model (Phase 2 — 3 Year)

### Conservative Scenario

| Year | Locations | MRR | ARR |
|------|-----------|-----|-----|
| Year 1 | 25 | $10,000 | $120,000 |
| Year 2 | 75 | $30,000 | $360,000 |
| Year 3 | 150 | $55,000 | $660,000 |

### Growth Scenario

| Year | Locations | MRR | ARR |
|------|-----------|-----|-----|
| Year 1 | 50 | $20,000 | $240,000 |
| Year 2 | 200 | $75,000 | $900,000 |
| Year 3 | 500 | $175,000 | $2,100,000 |

### Key Assumptions
- Average $400/location/month at scale
- 80% gross margin (SaaS infrastructure costs)
- 12-month average sales cycle for new chains
- 90%+ retention (high switching cost)

---

## Key Metrics to Track

- **ARR:** Annual recurring revenue
- **Locations under management:** Total paying locations
- **Duplicate prevention rate:** % of retries that hit idempotency cache
- **Customer NPS:** Satisfaction and referral likelihood
- **Churn rate:** Monthly location churn
- **CAC:** Customer acquisition cost per location
- **LTV:** Lifetime value per location (target: 3+ years)

---

**Status:** Planning document — not yet in development
**Next Review:** After Phase 1 Ethor partnership is validated
**Owner:** Said Khan (said@junglejims.ca)
