# Timed test: answer key

> **DRAFT: the team must confirm this key before the first tester starts.**

Built on 2026-11-14 from the opportunities stored in the database. Fixture
rows (external id starting with `fixture-`) are test data and are never part
of the key. "Open" means open on 2026-11-14: check the dates again on the test
day (see "Check on the day" at the end).

For each item: the link, and one line on why, taken from the text we stored
for it. The line is not a promise that the item suits the company, and
nothing in this key says that a company may apply. The items we were unsure
about are listed separately: the team decides on each one before the first
run and ticks a box.

## Scoring rule

- One point for each correct result the tester finds within 15 minutes.
- A result counts when the tester names it clearly enough to find it in this
  key, with its link.
- The same item found twice counts once.
- An "unsure" item counts only if the team ticked "counts" for it before the
  first run.
- A result that is not in this key: the team checks it after the run and
  writes its decision on the record sheet. Open question: may finds from
  outside the database score at all? Decide before the first run.
- Time stops at 15:00 or when the tester says "done", whichever comes first.

---

## Task A: find test facilities for an underwater sensor

The database holds 9 testbeds (2026-11-14). All 9 come from the team's
hand-entered list (`data/testbeds.seed.json`), so the app labels them
"Simulated data", although they describe real places.

### Believed correct

| # | Facility | Link | Why |
| --- | --- | --- | --- |
| A1 | FMV Naval Test Ranges (Naval Test Centre, Karlskrona) | https://testandevaluation.fmv.se/about/test-ranges/fmv-naval-test-ranges/ | The stored text says FMV tests submarines and other vessels and naval sensor systems at its ranges, one of them in Karlskrona, and takes customer projects. |

### Unsure: the team decides

| # | Facility | Link | Why unsure | Decision |
| --- | --- | --- | --- | --- |
| A2 | MTC Saltö marine technology environment, Karlskrona | https://www.mtcos.se/news/har-vaxer-en-ny-miljo-fram-i-karlskrona-dar-framtidens-marinteknik-testas-i-verkligheten/ | A marine technology environment that invites companies, but the stored text says tests at sea are planned and not yet in place. | [ ] counts  [ ] does not count |
| A3 | MTC Test Bed at BTH, Karlskrona | https://www.bth.se/english/research/research-projects/mtc-test-bed-at-bth | It is to get vehicles and sensors for the ocean domain, but the project page uses the future tense and does not say outside companies can book it (stored as not verified). | [ ] counts  [ ] does not count |
| A4 | RISE towing tank (SSPA), Gothenburg | https://www.ri.se/en/maritime/test-demo/towing-tank | Not in the database: it was left out because ri.se blocks automated checks, so the link was never confirmed. A tester searching by hand may find it. It is for ship model tests in water; whether it takes sensor tests is not known. | [ ] counts  [ ] does not count |

### Does not score

Stored, but not a test facility for an underwater sensor:

- Printed Electronics Arena (RISE): printed electronics and sensors, nothing under water.
- AstaZero proving ground (RISE): automated road transport.
- CRATE (FOI) and Sweden Secure Tech Hub: cyber security.
- AI Sweden Technology Infrastructure, Tech Concept Lab and AI Lab Blekinge: AI.
- Funding calls about watching the sea, such as The Baltic Marine Watchdog
  Challenge (Vinnova): these are funding, not facilities.

---

## Task B: find funding for Techinova, safer electricity grids

Techinova's public profile (2026-11-14) says it makes electronics and software
for radio-network communication and automation for the energy sector,
products for remote control and automation of medium-voltage networks, and
products for fault location and switching in overhead line networks.

The database holds 71 funding calls that are open on 2026-11-14: Vinnova 15,
Energimyndigheten 11, EU Funding & Tenders 38, hand-entered regional funding 7.

### Believed correct

| # | Call (funder) | Link | Deadline | Why |
| --- | --- | --- | --- | --- |
| B1 | Industriell flexibel energistyrning med avancerad digitalisering (Vinnova) | https://www.vinnova.se/e/avancerad-digitalisering-industriell-2024-04161/industriell-flexibel-energistyrning-med-2026-02019/ | 19 January 2027 | Funds projects that use advanced digital technology to make electricity use in Swedish industry more flexible; the call text names grid companies and small and medium-sized firms as possible partners. It needs at least two partners, one of them a need-owner from Swedish industry. |
| B2 | Verifiering av innovationer med kund (Energimyndigheten) | https://www.energimyndigheten.se/utlysningar/verifiering-av-innovationer-med-kund/ | 8 December 2026 | For a company that wants to develop and verify its solution with a potential customer, in a project that helps a sustainable energy system. General energy call: the stored text names no grids. |
| B3 | Konceptutveckling av innovationer med affärsfokus (Energimyndigheten) | https://www.energimyndigheten.se/utlysningar/konceptutveckling-av-innovationer-med-affarsfokus/ | 8 December 2026 | For an innovation that can help the move to a sustainable energy system, to develop it and bring it closer to market. General energy call: the stored text names no grids. |

### Unsure: the team decides

Open on 2026-11-14:

| # | Call (funder) | Link | Deadline | Why unsure | Decision |
| --- | --- | --- | --- | --- | --- |
| B4 | Large-Scale piloting of next-generation AI-driven digital platforms for a more affordable, secure and sustainable European energy system (EU) | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-BRIDGING-2027-01-12 | 16 February 2027 | Names grid operation and smart grid services, but funds one large pilot in at least six countries with at least eight digital technology providers: Techinova could only be one partner. | [ ] counts  [ ] does not count |
| B5 | Cybersäkerhet, AI och resiliens (Vinnova) | https://www.vinnova.se/e/avancerad-digitalisering-industriell-2024-04161/cybersakerhet-ai-och-resiliens/ | 19 January 2027 | Industrial cyber security and digital resilience; "safer grids" could include this, but the stored text names no grids. | [ ] counts  [ ] does not count |
| B6 | 5G och automatisering för operativ industrinytta (Vinnova) | https://www.vinnova.se/e/avancerad-digitalisering-industriell-2024-04161/5g-och-automatisering-for-operativ-industrinytta/ | 19 January 2027 | Connectivity and automation in industry with 5G; Techinova works with radio networks and automation, but the stored text names no grids. | [ ] counts  [ ] does not count |
| B7 | Swedish-German Cleantech Platform 2027 (Energimyndigheten) | https://www.energimyndigheten.se/utlysningar/swedish-german-cleantech-platform-2027/ | 1 December 2026 | A programme for Swedish cleantech SMEs that want to enter the German market: about growth abroad, not grid safety. | [ ] counts  [ ] does not count |
| B8 | Sök stöd för kapitalanskaffning (Energimyndigheten) | https://www.energimyndigheten.se/utlysningar/sok-stod-for-kapitalanskaffning/ | 9 December 2026 | An accelerator for companies planning an investment round of more than SEK 30 million: not about grids. | [ ] counts  [ ] does not count |
| B9 | Effektiv energianvändning i bebyggelsen för ett hållbart energisystem (Energimyndigheten) | https://www.energimyndigheten.se/utlysningar/effektiv-energianvandning-i-bebyggelsen-for-ett-hallbart-energisystem/ | 18 November 2026 | About energy use in buildings, not grids. Closes before a test held after 18 November. | [ ] counts  [ ] does not count |
| B10 | Almi Blekinge: Innovation loan (hand-entered) | https://www.almi.se/lan-finansiering/innovationslan/ | none | General innovation loan for companies with up to 249 employees; nothing grid-specific. Techinova's own site says dLaboratory has agreed to buy it, which may change its size (open question). | [ ] counts  [ ] does not count |
| B11 | Almi Blekinge: Verification funding (hand-entered) | https://www.almi.se/lan-finansiering/verifieringsmedel/ | none | General grant for testing a business idea early; nothing grid-specific. | [ ] counts  [ ] does not count |
| B12 | Almi Blekinge: Growth loan (hand-entered) | https://www.almi.se/lan-finansiering/tillvaxtlan/ | none | General loan for growing SMEs; nothing grid-specific. | [ ] counts  [ ] does not count |
| B13 | Region Blekinge: Grant for consultancy services (hand-entered) | https://regionblekinge.se/regional-utveckling/finansiering-foretagsstod-och-projekt/foretagsstod.html | none | General grant for hiring a consultant; energy efficiency is one example, grids are not named. | [ ] counts  [ ] does not count |

Right topic, but NOT open on 2026-11-14 (one decision for the whole group:
[ ] these count  [ ] these do not count). Techinova's Your-week cards for
the week of 9 November 2026 include B14, so a tester using the tool will see it.

| # | Call (EU) | Link | Opens | Why it fits the topic |
| --- | --- | --- | --- | --- |
| B14 | Advanced Distribution Management Systems (ADSM) for more efficient and flexible distribution grids | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-26 | 4 August 2027 | Reliability, resilience and control of electricity distribution grids. |
| B15 | Advanced TSO control rooms to enhance grid observability, stability and resilience | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-25 | 4 August 2027 | Reliability and resilience of electricity transmission grids. |
| B16 | Large scale operational validation and upscaling of state-of-the-art (Generative) AI tools and models powering a next generation digital energy system | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-02-D3-24 | 3 December 2026 | AI tools for real-time grid operation, protection included. |
| B17 | Demonstration for Long-duration Battery Energy Storage Systems (BATT4EU Partnership) | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-05-D2-08 | 5 May 2027 | Storage aimed at grid stability, resilience and flexibility. |
| B18 | Integrated Approaches for Retrofitting Infrastructures with Innovative Energy Storage Technologies | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-27 | 4 August 2027 | Energy storage in existing infrastructure; grids are a weaker link than for B14 to B17. |

### Does not score

- Forskningsmiljö för elmarknadsdesign och reglering (Energimyndigheten): for
  an academic research environment, not a company.
- Interreg South Baltic (hand-entered): its last calls closed on 4 November 2026.
- Any old test row (external id starting with `fixture-`), even if a page shows one.

---

## Check on the day

Before the first run, the team checks that these dates still hold:

- 18 November 2026: B9 closes.
- 1 December 2026: B7 closes.
- 3 December 2026: B16 opens.
- 8 December 2026: B2 and B3 close.
- 9 December 2026: B8 closes.

The key was built with these two read-only queries on the database:

```sql
-- Task A: every stored testbed
select title, url, verified, description from opportunities
where kind = 'testbed' and external_id not like 'fixture-%' order by title;

-- Task B: funding calls open now
select source, title, url, opens_at, deadline from opportunities
where kind = 'funding' and external_id not like 'fixture-%'
  and (opens_at is null or opens_at <= now())
  and (deadline is null or deadline > now())
order by deadline nulls last;
```
