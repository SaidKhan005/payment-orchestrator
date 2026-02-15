# Phase 2 Strategy: Standalone Simphony Payment Reliability SaaS

**Status:** Planning — Post-Ethor Partnership
**Timeline:** Month 3–12 (after Ethor validation)
**Prepared by:** Said Khan
**Date:** February 15, 2026

---

> **Important Context:** Phase 2 begins AFTER Phase 1 (Ethor partnership) is validated.
> Phase 1 is the immediate priority. This document is for planning purposes only.

---

## Strategic Positioning

### Phase 1 vs Phase 2

| Dimension | Phase 1 (Ethor Partnership) | Phase 2 (Standalone SaaS) |
|-----------|----------------------------|--------------------------|
| Target | Ethor company | Any Simphony restaurant |
| Sales motion | B2B partnership | Direct to restaurant chains |
| Distribution | Through Ethor | Direct + partner channels |
| Scope | Ethor customers only | All Simphony users |
| Dependency | Ethor integration required | No third-party dependency |
| Timeline | Now (months 0–3) | Month 3–12 |

### The Strategic Pivot

Phase 1 validates the technology and business model through the Ethor partnership. Phase 2 removes the Ethor dependency and goes direct to restaurants.

**Why Phase 2 matters:**
- Ethor relationship may not progress, or may be slow
- Direct relationship gives more control and higher margin
- Larger TAM (all Simphony restaurants vs. Ethor subset)
- Positions for acquisition or licensing by Oracle/Simphony

---

## Market Opportunity

### Oracle Simphony Market Size

- **Simphony customers:** 30,000+ restaurant locations globally
- **North American focus:** ~10,000 locations (initial TAM)
- **Target segment:** Mid-market chains (10–200 locations)

### Problem Prevalence

Every Simphony customer with handheld payment devices faces the duplicate charge problem. The problem severity correlates with:
- Transaction volume (higher volume = more duplicates)
- Network quality (worse WiFi = more timeouts = more retries)
- Staff behavior (more retries = more duplicates)

### Revenue Potential (Phase 2)

**Conservative scenario (100 customer locations):**
- SaaS fee: $500/location/month
- Annual revenue: $600,000

**Growth scenario (500 customer locations):**
- SaaS fee: $400/location/month (volume discount)
- Annual revenue: $2,400,000

**Scale scenario (2,000 customer locations):**
- SaaS fee: $300/location/month
- Annual revenue: $7,200,000

---

## Product Vision

### Phase 2 Product: "SimphonyGuard" (working name)

**Positioning:** The only payment reliability layer purpose-built for Oracle Simphony POS

**Core offering:**
- Idempotency for any payment terminal (not just Ethor)
- Simphony STS integration
- Split-brain detection and reconciliation
- Complete audit trail for PCI and chargeback defense

**Differentiators:**
- Only product focused specifically on Simphony payment reliability
- Proven at Safari (24 locations) — not vaporware
- No Oracle involvement required — works with existing credentials
- 2-week deployment vs. 6-month Oracle Professional Services

---

## Go-to-Market Strategy

### Target Customer Profile

**Ideal Customer:**
- Restaurant chain with 5–200 locations
- Using Oracle Simphony POS
- Using handheld payment devices (Ethor, other)
- Experiencing duplicate charge complaints

**Persona:**
- IT Director or Technology Officer
- Feels pain from duplicate charges
- Responsible for PCI compliance
- Decision-maker for operations technology

### Sales Channels

**Channel 1: Direct (Primary)**
- Conference presence at NRA Show, Oracle OpenWorld
- LinkedIn outreach to restaurant technology leaders
- Referrals from Safari (case study)
- Content marketing (Simphony payment reliability)

**Channel 2: Partner Network**
- Ethor (post Phase 1 validation)
- Oracle Simphony resellers and VARs
- Restaurant technology consultants
- POS integrators

**Channel 3: Oracle Marketplace**
- List on Oracle Hospitality Marketplace (if program permits)
- Visibility to Simphony customers searching for add-ons

---

## Pricing Model

### SaaS Subscription (Per Location/Month)

| Tier | Locations | Price/Location/Month |
|------|-----------|---------------------|
| Starter | 1–10 | $500 |
| Growth | 11–50 | $400 |
| Scale | 51–200 | $300 |
| Enterprise | 200+ | Custom |

### One-Time Fees

| Item | Price |
|------|-------|
| Onboarding & setup | $2,000/location group |
| Custom integration | $10,000–$30,000 |

### Value-Based Pricing Justification

At $500/location/month ($6,000/year), a 10-location chain pays $60,000/year.
If that chain loses $120K–$360K/year to duplicates, the payback period is:
- Break-even: 2–6 months
- Year 1 ROI: 100%–500%

---

## Technical Requirements for Phase 2

See [TECHNICAL_REQUIREMENTS.md](TECHNICAL_REQUIREMENTS.md) for full architecture details.

**Key additions from Phase 1:**
- Multi-tenant data isolation
- Self-service onboarding portal
- Per-customer credential management
- Usage metering and billing integration
- Admin dashboard
- SLA monitoring per tenant

---

## Roadmap

### Month 3–4: Foundation
- Multi-tenant database schema
- Tenant management API
- Basic admin portal
- Billing integration (Stripe)

### Month 5–6: Self-Service
- Customer onboarding wizard
- Simphony credential validation
- Gateway credential management
- Basic monitoring dashboard

### Month 7–9: Scale
- Partner API (for Ethor and VARs)
- Enhanced analytics
- SLA reporting
- Automated health checks

### Month 10–12: Market Expansion
- Oracle Marketplace listing
- Partner program
- Enterprise tier features
- Multi-region deployment

---

## Dependencies

### Required Before Phase 2 Launch
1. ✅ Phase 1 validated (Ethor integration confirmed)
2. ✅ Safari as reference customer (case study ready)
3. Elavon production credentials obtained
4. Multi-tenant architecture designed and tested
5. Legal: Terms of Service, Privacy Policy, Data Processing Agreement

### Nice to Have
- Oracle Hospitality partnership
- Payment gateway partnerships (Elavon, Shift4)
- Restaurant technology industry analyst coverage

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Oracle blocks third-party Simphony integrations | Low | High | Use existing STS API; no new integration required |
| Ethor builds competing solution | Medium | Medium | Phase 2 removes Ethor dependency; direct relationships |
| Slow sales cycle (restaurant IT) | High | Medium | Land-and-expand; start with 1-2 locations per customer |
| Price sensitivity | Medium | Low | ROI is proven; $6K/year vs. $120K+ loss is compelling |

---

## Success Criteria for Phase 2 Launch

- [ ] 3+ paying customers (post-Ethor pilot)
- [ ] $50K+ ARR
- [ ] Self-service onboarding working end-to-end
- [ ] Multi-tenant architecture live and tested
- [ ] Safari case study published

---

**Status:** Planning document — not yet in development
**Next Review:** After Phase 1 Ethor partnership is validated
**Owner:** Said Khan (said@junglejims.ca)
