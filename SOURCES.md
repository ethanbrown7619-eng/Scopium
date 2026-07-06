# Scopium — NZ Person-Centric Data Sources

> Goal: given a **person's name**, sweep reputable public NZ sources to assemble
> a provenance-backed picture of who they are — companies, directorships,
> property, licences, legal history, charitable roles, public profile.
>
> This catalogue is the sourcing plan. Tiers A–E carry assertion-grade
> provenance (usable in a due-diligence report); Tier F is lead/context only,
> never an assertion. **Privacy Act 2020 is the load-bearing constraint** — see
> §Privacy at the end.

Format per source: **fields · access · name-searchable? · reputability · privacy flag**

---

## A. Core identity & corporate

### Companies Register — directors & shareholders  ★ primary person anchor
`https://app.companiesoffice.govt.nz/companies/`
- Fields: full legal name, residential OR service address, appointment/cessation dates, role, shareholding (% + parcels), filed documents.
- Access: public search UI (no login), undocumented XHR/JSON behind it. Scrapeable. Official bulk sold by MBIE only.
- Name-searchable: **YES — direct "search directors" function.**
- Reputability: Tier 1 (statutory register).
- Privacy: **HIGH** — residential addresses. Prefer service address; suppress/gate residential.

### NZBN Register
`https://www.nzbn.govt.nz/`
- Fields: entity name, NZBN, trading names, addresses, some authorised people.
- Access: public search UI; official API is the gated MBIE one.
- Name-searchable: entity-name mostly; people via traversal.
- Tier 1. Privacy: Medium.

### Charities Register — officers  ★ START HERE (open API)
`https://www.odata.charities.govt.nz/` (OData) · `https://register.charities.govt.nz/`
- Fields: officer full name, role, sometimes address, tenure, charity, charity financials.
- Access: **open OData API, no key, no approval.**
- Name-searchable: **YES** — filter Officers entity by name.
- Tier 1 (Charities Services / DIA). Privacy: Medium.

### Incorporated Societies & Charitable Trusts
`https://is-register.companiesoffice.govt.nz/`
- Fields: officers, roles, addresses, rules docs naming committee members.
- Access: public search UI, scrapeable. Name-searchable: partial. Tier 1. Privacy: Medium.

### PPSR — Personal Property Securities Register  ⚠ verify access
`https://www.ppsr.companiesoffice.govt.nz/`
- Fields: debtor name (individuals), secured party, collateral, dates.
- Access: **likely requires RealMe/account login; debtor-by-name may be restricted/charged — VERIFY.**
- Name-searchable: uncertain / possibly off-limits for bulk.
- Tier 1. Privacy: **HIGH** (links person to debt).

---

## B. Professional & occupational licences (Person ↔ Licence ↔ Body)

All public "check my practitioner" registers; near all name-searchable public UIs, no login, **no open bulk API — assume scrape the search**. Standard fields: name, licence number, status, scope, sometimes region/employer/conditions/disciplinary flags. **Privacy: LOW** across this tier — publishing licence status is the register's statutory purpose. Safe to surface.

- **Lawyers** — NZLS Register of Lawyers · `https://www.lawsociety.org.nz/`
- **Doctors** — Medical Council · `https://www.mcnz.org.nz/`
- **Nurses** — Nursing Council · `https://www.nursingcouncil.org.nz/`
- **Dentists / oral health** — Dental Council · `https://www.dcnz.org.nz/`
- **Pharmacists** — Pharmacy Council · `https://pharmacycouncil.org.nz/`
- **15+ other health pros** (HPCA Act responsible authorities): Psychologists, Physiotherapy, Optometrists, Chiropractic, Osteopathy, Podiatry, Dietitians, MRT, Paramedics — each publishes a public register, same shape.
- **Financial advisers/providers — FSPR** ★ · `https://fsp-register.companiesoffice.govt.nz/` — name, number, services, status, **+ disciplinary/banning history**. Companies-Office-operated, scrapeable, name-searchable. Best professional anchor (carries enforcement flags).
- **Real estate agents — REA** ★ · `https://www.rea.govt.nz/` — name, licence class, agency, status, **+ published disciplinary history**.
- **Licensed Building Practitioners — LBP** · `https://www.lbp.govt.nz/`
- **Plumbers, Gasfitters & Drainlayers — PGDB** · `https://www.pgdb.co.nz/`
- **Electricians — EWRB** · `https://www.ewrb.govt.nz/`
- **Teachers** — Teaching Council · `https://teachingcouncil.nz/` (⚠ may be confirm-a-teacher only, not browse — verify)
- **Immigration advisers — IAA** · `https://www.iaa.govt.nz/`
- **Chartered Professional Engineers (CPEng)** — Engineering NZ · `https://www.engineeringnz.org/` (⚠ engineering not generally licensed → absence ≠ meaningful)
- **Cadastral surveyors** — Survey & Spatial NZ / CSLB
- **Motor vehicle traders** · `https://www.motortraders.govt.nz/`
- **Security guards & private investigators — PSPLA** · `https://www.pspla.justice.govt.nz/`
- **FMA-licensed individuals** · `https://www.fma.govt.nz/` (see also Tier C)

---

## C. Legal, court & enforcement

### Insolvency Register  ★ best DOB source for entity resolution
`https://www.insolvency.govt.nz/` (Insolvency & Trustee Service, MBIE)
- Fields: name, **often DOB/partial DOB, address, occupation**, type (bankruptcy/NAP/DRO), dates.
- Access: public search UI, no login. Scrapeable.
- Name-searchable: **YES, by person name.** One of the few sources exposing **DOB**.
- Tier 1. Privacy: **HIGH** (financial failure) but statutorily public.

### Disqualified / banned / prohibited directors
Companies Office / FMA / Registrar published lists.
- Fields: name, ground, period. Access: scrapeable lists. Name-searchable: yes. Tier 1. Privacy: low-moderate.

### NZ Gazette  ★ event stream
`https://gazette.govt.nz/`
- Fields: individuals in bankruptcy notices, named liquidator appointments, honours, appointments, name changes, land notices.
- Access: public search + RSS by notice type (⚠ formal API beyond feeds unconfirmed — verify).
- Name-searchable: full-text, **yes**. Tier 1. Privacy: moderate.

### Court judgments — NZLII & official databases  ⚠ needs NLP + suppression handling
`http://www.nzlii.org/` · `https://www.courtsofnz.govt.nz/` · ERA/Employment Court via `https://www.employment.govt.nz/`
- Fields: party names, sometimes address/occupation, dispute, outcome. Free-text → **NLP extraction**.
- Name-searchable: full-text yes, but noisy. Tier 1 source / Tier 2 as data.
- Privacy: **HIGH** — **name suppression is legally enforced; MUST filter suppressed/anonymised matters.**

### Tribunals & disciplinary bodies (named decisions)
- Lawyers & Conveyancers Disciplinary Tribunal; NZLS Standards Committee
- Health Practitioners Disciplinary Tribunal · `https://www.hpdt.org.nz/` (name-searchable)
- Teachers Disciplinary Tribunal (via Teaching Council)
- Real Estate Agents Disciplinary Tribunal
- Tenancy Tribunal (via MoJ) — names landlords & tenants; **high volume, privacy-sensitive**
- Disputes Tribunal / Motor Vehicle Disputes / Immigration & Protection Tribunal (often anonymised)
- Access: public web decision pages, scrapeable + NLP. Tier 1 bodies. Privacy: moderate–high.

### Enforcement / warnings / sanctions
- FMA warnings & enforcement · `https://www.fma.govt.nz/`; Commerce Commission; Serious Fraud Office releases.
- Sanctions: NZ Russia Sanctions Register (MFAT · `https://www.mfat.govt.nz/`) + supplement with UN/OFAC/UK/EU for a real PEP/sanctions screen.
- Name-searchable via full-text. Tier 1. Privacy: low (published enforcement).

---

## D. Property & assets

### LINZ — NZ Property Titles Including Owners  ★ property spine
`https://data.linz.govt.nz/`
- Fields: **registered proprietor names (people + companies)**, title ref, legal description, tenure, parcel geometry/address.
- Access: free LINZ account (instant), **bulk download + WFS/changesets**. Click-through licence specific to the owner layer.
- Name-searchable: not out-of-box, but **index owner-name after bulk load → yes in-system**.
- Tier 1. Privacy: **HIGH** — owner name + property is a key ID vector; owner licence has usage conditions. Most likely source to attract Privacy Act scrutiny. Gate carefully.

### Overseas Investment Office decisions
`https://www.linz.govt.nz/` (OIO decision summaries)
- Fields: named investors, entities, land/assets, conditions. Access: published summaries (web), scrapeable. Name-searchable: full-text yes. Tier 1. Privacy: moderate.

### Rating / valuation  (low priority, patchy)
- Council Rating Information Databases (RID); mostly address- not name-searchable; QV is commercial. Per-council public search. Privacy: high where names appear. Enrichment only.

---

## E. Political & public-figure

- **Electoral Commission — donations & candidate returns** · `https://elections.nz/` — named donors above thresholds, amounts, recipients; candidate expenses. Published PDFs/tables, scrapeable. Name-searchable via full-text. Tier 1. Privacy: low (statutory transparency).
- **Register of Pecuniary Interests of MPs** · `https://www.parliament.nz/` — MP name, directorships, shareholdings, property, trusts, gifts. Annual PDF, scrapeable. Tier 1. Privacy: low.
- **Local govt elected members' interest registers** — per-council published (LGOIMA / standing orders). Patchy. Tier 1. Privacy: low.
- **Government appointments & board memberships** — gazetted + agency sites + Public Service Commission / annual reports. Scattered web + Gazette. Tier 1. Privacy: low.
- **NZ Royal Honours** — DPMC / Gazette, named recipients + citations. Tier 1. Privacy: low.
- **Lobbying**: NZ has **NO statutory lobbyist register** — don't promise one.

---

## F. Media & profile — lead/context only, never assertion

- **Papers Past** · `https://paperspast.natlib.govt.nz/` — historical newspapers, BDM notices, mentions. Free, searchable, scrape with care (NatLib terms). Tier 2. Good for historical/deceased, weak for living-person disambiguation.
- **General news** (Stuff, NZ Herald, RNZ, BusinessDesk) — no clean feed; scraping breaches ToS/paywalls. **Off-limits for systematic ingestion**; analyst-followed links or licensed news API only. Tier 3.
- **Obituaries / death notices** — commercial platforms, ToS-restricted, low match reliability. Tier 3.
- **BDM (Births, Deaths, Marriages)** — historical only (births >100y, deaths >50y, marriages >80y) via DIA `https://www.dia.govt.nz/`, orderable not bulk. **Current BDM NOT public — off-limits. Cannot get living-person DOB here.**
- **Social/professional profiles** (LinkedIn etc.) — Tier 3, ToS-prohibited scraping, analyst-navigated only.

---

## Person entity resolution

No public national person identifier (IRD/NHI/licence all non-public). Resolution = **evidence accumulation** anchored on the few sources exposing disambiguators.

**Disambiguating signals by source:**
- **DOB / partial DOB** — Insolvency (best), some court/tribunal, occasionally Companies Office docs. Strongest single discriminator; DOB+name match ≈ near-decisive.
- **Address** — Companies Office (residential), LINZ (property owned). Shared address = strong link; address history stronger.
- **Full middle name / name order** — Companies Office holds full legal names ("SMITH, John Andrew"); splits common names.
- **Co-occurrence (most powerful, most NZ-appropriate)** — two "J Smith" records sharing a company/co-director/charity/firm/property are far more likely one person. **Resolve on the graph, not just the string.**
- **Occupation/role** — FSPR, REA, pro registers state occupation.
- **Licence numbers** — stable per-person key *within* a register; bridge domains by name+DOB+address.

**Anchor-grade sources (justify high-confidence merge):** Companies Office (name+address+role+graph), Insolvency (name+DOB), FSPR (name+number+enforcement), LINZ (name+property).
**Support-only (never anchor alone):** court/tribunal free-text, Gazette, Papers Past, news.

**Mechanics:** materialise source-scoped person records, never merge at ingest. Resolver: (1) block on surname+first-initial or shared address, (2) score on name-similarity + DOB + shared-address + shared-co-entities, (3) auto-merge only on DOB match or exact full-name+address, (4) everything else = confidence-scored candidate `same_as` links for **analyst confirmation** — reversible, provenance-stamped with resolver version. A wrong auto-merge (attributing a bankruptcy to the wrong John Smith) is the worst failure mode, legally and reputationally. Every "this is one person" claim must show *why* (which shared attributes drove it).

---

## Privacy (Privacy Act 2020) — load-bearing, not optional

Aggregating individually-public records into a searchable people-profile is a **known regulatory sensitivity** (the Privacy Commissioner has commented on exactly this pattern). Non-negotiable build requirements:
- Source-of-truth **provenance on every field** (which register, fetched when, source URL).
- **Residential-address suppression by default**; prefer service addresses; gate residential behind explicit justification.
- **Respect name suppression / anonymisation** — filter suppressed court/tribunal matters.
- Defensible **"public register, lawful purpose"** posture; only reputable official sources for assertions.
- Human-in-the-loop merge confirmation (not friction — it's the product's credibility).

For a due-diligence tool this discipline is what makes it sellable, not just compliant.

---

## Verify-before-ship (genuine uncertainties, ~15 min each)
1. PPSR login/search restrictions; is individual-debtor name search open?
2. Does NZ Gazette expose a formal API beyond RSS?
3. Teaching Council register: browse vs confirm-only granularity?
4. Exact field set on Insolvency public search — is DOB present?
5. Precise usage terms on LINZ owner-name title layer.

---

## Recommended build order (from Fable 5)

1. **Charities OData connector** (Day 1–2) — real open API, no approval, no scraping risk. Instant org+person graph with name-searchable officers. Proves the two-phase pipeline + person-resolution machinery on friendly data.
2. **Companies Register on-demand connector** (Day 3–5) — seed-driven (name → search → detail), prefer XHR/JSON over HTML, cache + ~1 req/sec, one-hop "other directorships" expansion.
3. **Gazette liquidation/insolvency feed** (one afternoon) — first Event connector; makes the graph feel alive.
4. **Two-phase connector architecture** underpinning all of the above: acquire (raw payloads → immutable landing zone) → materialise (pure parse → ontology). Fix parsers without re-crawling; provenance points at exact raw capture.
5. Background: file the free NZBN API application anyway — one-time friction, swappable acquire layer later.
