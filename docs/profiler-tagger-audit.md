# Profiler and tagger audit (old model vs new model)

Date: 2026-11-14 (evening). Status: stopped early on request (machine shutting down). What was and was not measured is marked below.

Everything here was measured dry: no claim, tag, embedding or snapshot was written, and no company was re-profiled in the database. The hand checks are my own reading of the stored page text, **not** the team's gold hand-check.

Models: OLD `nvidia/nemotron-3.5-lightning-30b-a3b`, NEW `nvidia/nemotron-3.5-super-vl-120b-a12b`.

Model requests used: about 60, of which about 35 were answered and about 25 were 429 "Too Many Requests" (the new model was busy with the re-judge on the same key). All one at a time.

## Recommendations

**A. Re-profile all 56 with the new model: yes.** On the same stored page text, one run per model:

| 8 companies with both runs | OLD | NEW |
| --- | ---: | ---: |
| Quotes found word for word | 47 / 78 (60 %) | 144 / 151 (95 %) |
| Profile fields supported (of 64) | 38 | 63 |
| Fields dropped to "missing" by the quote check | 22 | 0 |
| Fields the retry rescued | 0 of 22 | 7 of 7 |
| Profiles that come out "thin" | 3 (dnv-cyber, kustbevakningen, knowit) | 0 |
| Gold fields right on my reading (3 gold, 21 factual fields) | 12 right, 1 wrong, 4 unsure, 3 missed | 19 right, 1 wrong (EmbeddedArt "UV sensors"), 1 rightly missing |
| Seconds, first call (mean / max) | 8.4 / 17.4 | 7.2 / 11.2 |

The old model's failures are almost all one kind: it glues a heading or a fact-list label to the text ("Ort: Karlskrona", "Sjöräddning: Vid en olycka ..."), which is never on the page; that is why geography is dropped most. The new model does this rarely (4 of 151 quotes). Malvacom's geography and markets are both stated and found with the new model. EmbeddedArt's "UV-sensorer" is still written "UV sensors" by both models: fix that claim by hand or with the prompt line below.

Cost: about 56 first calls plus about 50 short retries (the new model answers inferredInterests without a quote in its first answer almost every time, so nearly every company takes a second, roughly 2 s call): about 100 to 110 calls, about 15 to 25 minutes at a safe pace while the key is not shared, more while the re-judge runs. Then: every claim id changes (superseded, not deleted; member-written claims stay in charge, e.g. EmbeddedArt's corrected interests), so `data/gold-profiles/*.json` and the printed staff sheets must be regenerated before the team hand-checks, and every company must be re-tagged, re-embedded, re-ranked and re-judged (about an hour). If the hour is not there: re-profile at least the 6 thin ones (ballou, blekinge-business-incubator, dnv-cyber, karlskrona-kommun, kingspan-baga, nexer) and the companies whose stored run dropped 3 or more fields (hi-story, indigo-ipex, kiwa, lysa, malvacom, nkt, softhouse, wip, plus the thin ones): 14 companies.

Before the gold export is regenerated, do it in this order: re-profile, then fix or check EmbeddedArt's offerings, then export.

**Prompt change (optional, NOT tested):** two sentences in lib/profiler/prompt.ts, prepared but not run because the session was stopped: "inferredInterests needs quotes too: the sentences your reading is based on." (would save the retry call per company) and "Translate by meaning ...: in Swedish defence and marine texts "UV" means undervattens (underwater), so "UV-sensorer" are underwater sensors." Nothing was changed in the repo. Test it dry on the same companies before using it.

**B. Tagging: the new tags are right; no re-tag needed.** 79 of 190 opportunities have no tag, but on a read of all 79, 70 are honestly outside the six areas (EU health, agriculture, circularity, space, generic business support), 2 are clear misses (an EU disaster decision-support call that is about AI; an EU quantum gravimetry call that is about measurement) and 7 are borderline (mainly three short Energimyndigheten teasers whose text never says energy). Company tags: 52 of 56 right, 4 borderline, none wrong; the service-dog and Stena Line errors are gone. The misses are too few to justify a re-tag and a re-rank and re-judge. About 37 % of the opportunity pool (70 of 190) and 27 of 56 companies are outside all six tags; for them matching rests on embedding similarity alone (tag overlap is 0 for every pair, 0.2 of the score), which is acceptable but means the tag weight does nothing for half the members.

## Question A: re-profile with the new model?

Companies picked (10): techinova, embeddedart, malvacom (gold); dnv-cyber, kingspan-baga (thin); saab (large corporation), kustbevakningen (public agency), yellowfish (small product company), knowit (consultancy), njord-x (marine company).

### Method

- A scratch script outside the repo loaded, read-only, the latest stored snapshot of each company's own site and BSP member page (the same two pages the profile-company job reads, own site first) and ran the job's own code path in memory: `runProfiler` (lib/profiler/index.ts) for the first answer, `verifyDraftClaims` for the quote check, one retry with `retryFeedback` for the failed fields, `mergeRetry`, then `assessProfile` for profiled/thin. Only the `model` option differed. Nothing was fetched again and nothing was stored.
- Both models read exactly the same text. Note that this text is not always the text the stored profiles were made from: for malvacom the stored BSP member page is now much richer (it states markets and offices), so a re-profile today reads more than the morning run did.
- Failed quotes were sorted into three kinds by a small script and checked by eye: **label join** (a page heading or a fact-list label glued to its text, "Ort: Karlskrona", "Sjöräddning: Vid en olycka ...", or a label and value that are not next to each other on the page), **translated** (English quote from a Swedish page), **other** (reworded, merged, typo).
- Requests were paced one at a time, at least 12 to 15 s apart; a 429 waited 60 s or more. The new model answered 429 often, because the same key was busy with the re-judge.

### Samples: what was measured and what was not

- OLD model: all 10 companies, one run each (dnv-cyber ran twice by accident; the second run dropped 6 fields instead of 4, same verdict: thin).
- NEW model: 8 companies, one run each (malvacom twice, same result 18/18 both times). **Not measured with the new model: kingspan-baga (all attempts answered 429) and njord-x (stopped on request).** The table in the recommendations therefore compares the 8 companies that have both runs.
- One run per model per company: the old model varies from run to run (kingspan-baga was thin in the stored run, 7/7 profiled in this dry run), so read single-company numbers as samples.
- The prompt change was not tested. The tagger dry re-run (current prompt and a small variant on 9 misses, 20 correctly tagged and 8 correctly untagged texts) was prepared but not run.

### Per company (first answer quotes found / given; fields supported of 8; fields dropped)

| Company | Kind | Stored run (old, this morning) | OLD dry | NEW dry |
| --- | --- | --- | --- | --- |
| techinova | gold | 11/14, dropped 0 | 15/17, 8 supported, 0 dropped | 15/16, 8, 0 |
| embeddedart | gold | 10/11, dropped 1 | 9/10, 7, 0 | 12/12, 7, 0 |
| malvacom | gold | 3/7, dropped 4 | 4/7, 4, 4 | 18/18, 8, 0 |
| dnv-cyber | thin | 2/4, dropped 4 (thin) | 2/3, 2, 4 (thin) | 14/15, 8, 0 |
| kingspan-baga | thin | 2/7, dropped 5 (thin) | 7/7, 7, 0 | not measured |
| saab | large corporation | 7/8, dropped 1 | 7/8, 7, 1 | 19/21, 8, 0 |
| kustbevakningen | public agency | 5/8, dropped 2 | 1/20, 1, 7 (thin) | 17/18, 8, 0 |
| yellowfish | small product company | 8/9, dropped 0 | 7/9, 7, 1 | 14/15, 8, 0 |
| knowit | consultancy | 6/9, dropped 2 | 2/3, 2, 5 (thin) | 14/15, 8, 0 |
| njord-x | marine company | 5/8, dropped 2 | 7/7, 7, 0 | not measured |

Failed quotes by kind: OLD 29 label join, 0 translated, 2 other (of 31); NEW 4 label join, 0 translated, 3 other (of 7). No translated quote from either model in these runs. The old model's retry answered "missing" for every retried field (0 of 22 rescued), which matches the stored 2 of 87.

Things to watch with the new model (not failures of the quote check):
- It fills more: 269 values against 139, 9 values over ten words (e.g. Saab "Naval 9LV Combat System, Combat Management System and Fire Control System with Ceros"). It marked no factual field "inferred".
- Some quotes are bare headings that pass the check but prove little (DNV Cyber offerings: "Prepare & prevent", "Detect & respond"), and some values stretch a quote (DNV Cyber geography "Norway, Finland, Denmark" from a sentence about research reports on those countries). The same kind of stretch the judge was tightened for tonight.
- Its first answer gives inferredInterests with no quote in 7 of 8 companies, so a retry call is almost always needed (the retry then passes).

### Gold companies, hand check (my reading of the stored page text, not the team's check)

R right, W contains a wrong value, U unsure or not backed by the quotes kept, M missing although the page states it, ok missing and the page does not state it.

| Field | techinova stored / old / new | embeddedart stored / old / new | malvacom stored / old / new |
| --- | --- | --- | --- |
| summary | R / R / R | R / R / R | R / R (just "IT consulting company") / R |
| offerings | R / R / R (all six product lines) | **W** "UV-sensors" / **W** "UV-sensors" / **W** "UV sensors" | R / R / R |
| technologies | R / R / R | R / R / R | R / M (label join) / R |
| applicationAreas | R / R (vague) / R | R / U ("Patrol" for spaning) / R | M / R (quote backs one item) / R |
| markets | R / R / R | R / R / R | M / M / R |
| geography | U ("Operates in Sweden (implied ...)") / U / R | R / R / R | M / U (quote "3 Kontor i Sverige") / R |
| statedPriorities | M (dLab integration) / U (restates offerings) / R | ok / ok / ok | M / M / R |

"UV-sensorer" on EmbeddedArt's page means undervattenssensorer (underwater sensors); "UV sensors" in English reads as ultraviolet. Both models get it wrong.

## Question B: is the new tagging right?

How it works (lib/tagger): up to ten texts per call; for each text the model writes what it is about in at most twelve words, then true/false for each of the six tags. Opportunities are tagged from title + description (cut to 1,200 characters); companies from their public profile text (name, BSP industry, active public claims). Curated testbed tags are never replaced.

### What is stored now (read-only query, data dumped at the start of this audit)

Opportunities, fixtures left out (190 rows):

| Source | Kind | Rows | No tag |
| --- | --- | ---: | ---: |
| EU Funding & Tenders | funding | 135 | 51 |
| Vinnova | funding | 15 | 11 |
| Energimyndigheten | funding | 11 | 6 |
| Regional funding (hand-entered) | funding | 8 | 8 |
| Curated testbed list | testbed | 11 | 0 |
| BSP and MTC event series | event | 5 | 2 |
| Blue Science Park | news | 4 | 1 |
| Tech Concept Lab | event | 1 | 0 |
| **Total** | | **190** | **79 (42 %)** |

Tags on the 111 tagged rows: ai 38, energy 35, marine 24, defence 21, cyber 19, sensor 13.

Companies: 27 of 56 have no tag. Tags: marine 11, energy 9, ai 8, sensor 6, defence 5, cyber 5.

### The untagged opportunities, judged by hand (all 79 read; 25 listed)

My reading of title and description, not a team check. "Right" means none of the six tags clearly fits.

| # | Source | Title (short) | Verdict |
| --- | --- | --- | --- |
| 1 | EU | Enhancing decision support system for disaster crises (trustworthy AI, near real-time data) | **miss: ai** |
| 2 | EU | Quantum Space Gravimetry (measuring the Earth's gravity field) | **miss: sensor** |
| 3 | EU | Digital enablers for collaborative Earth Observation and SatCom (EO payloads) | borderline: sensor |
| 4 | EU | EU policy framework for CO2 transport and storage infrastructure | borderline: energy |
| 5 | EU | Societal resilience, younger generations, disaster resilience | borderline: defence (civil preparedness) |
| 6 | Energimyndigheten | Lansera i Indien (ISIA accelerator) | borderline: energy (only the funder says so) |
| 7 | Energimyndigheten | Sök stöd för kapitalanskaffning (accelerator, investment round > 30 MSEK) | borderline: energy (only the funder says so) |
| 8 | Energimyndigheten | Swedish-German Cleantech Platform 2027 | borderline: energy (cleantech) |
| 9 | Vinnova | 5G och automatisering för operativ industrinytta | borderline: sensor/ai |
| 10 | EU | Enhancing preparedness for large-scale cross-border disasters (VR/AR training) | right |
| 11 | EU | Space critical EEE components / equipment for EU non-dependence (2 rows) | right |
| 12 | EU | ISOS4I pilot mission (in-orbit servicing) | right |
| 13 | EU | On-site robotic and automated techniques for building renovation | right (construction) |
| 14 | EU | Improve the capacity to monitor and reduce air pollution from agriculture | right (agriculture) |
| 15 | EU | Air quality planning through multi-scale modelling | right |
| 16 | EU | European Partnership for Pandemic Preparedness, and 7 other health topics | right (health) |
| 17 | EU | Carbon farming, biomass flows, agriculture resilience (4 rows) | right (agriculture) |
| 18 | EU | Circularity and ecodesign topics (7 rows) | right |
| 19 | EU | EIC Accelerator short proposal, Pathfinder Open, STEP Scale Up | right (generic) |
| 20 | Vinnova | Chips JU pilot lines; Chips JU ECS calls (energy only in a list) | right |
| 21 | Vinnova | Life science; FutureFoodS; FOREST; RAMP; DUT; Innowwide; Innovativa Startups; Eureka SMART | right |
| 22 | Energimyndigheten | DUT; FORESTPathways; RAMP Joint Call | right |
| 23 | Regional | Almi loans (3), Region Blekinge grants (4), Interreg South Baltic | right (general business support) |
| 24 | BSP news | Dosify: from refill solution to digital business | right |
| 25 | Events | Onsdagsluncher; TCL & Friends | right |

Totals over all 79: **2 clear misses, 7 borderline, 70 right**. The tags that are set look right too: on a read of all 111 tagged rows I found no clear false tag (one weak one: the news item about Blue Science Park and Blekinge Business Incubator merging is tagged marine).

### Company tags, judged by hand (all 56)

| Verdict | Companies |
| --- | --- |
| Right (52) | 3d-vision [], affarsverken [energy], afry [marine]*, allbinary [], almi [], atea [], ballou [], baltic-offshore [marine, energy], blekinge-business-incubator [], blekinge-tekniska-hogskola [sensor, ai], c-marine-ab [marine], cleura [], dnv-cyber [cyber], dxc-technology [], embeddedart [marine, defence, sensor], energimyndigheten [energy], ericsson []**, factor10 [], fmv [defence], forsakringskassan [], forsvarsmakten [marine, defence], ge-99 [], hi-story [], hiq [cyber, ai], hundtjanst-blekinge-ab [], indigo-ipex [], karlskrona-kommun [], kingspan-baga [], kiwa [], knowit [cyber, ai], kustbevakningen [marine, defence], lansstyrelsen-blekinge [], lassen-construction [marine], lysa [], malvacom [ai], midcon [], mj-marcable-consulting-ab [energy], nexer [cyber, ai], nicon [], njord-x [marine], ocean-harvesting [marine, energy], region-blekinge [], roxtec [], saab [marine, defence, sensor, ai], softhouse [ai], spirius [sensor], stena-line [marine], techinova [sensor, energy], telenor [], varidens [], wip [], yellowfish [sensor] |
| Borderline (4) | addsecure [cyber, energy]: sensor missing? (IoT connectivity, real-time monitoring, fault detection). nkt [energy]: marine missing? (high-voltage cables for offshore wind). compani-56 [ai]: AI is one technology of a marketing agency. sweco [energy]: energy is one of ten application areas |
| Wrong | none |

\* afry's profile itself says "Profile within marine technology", so the tag follows the profile. \*\* Ericsson's profile only says ICT infrastructure for telecom operators; telecom is not one of the six.

The two problems seen with the small model are gone: the service-dog company (hundtjanst-blekinge-ab) has no tag, and Stena Line is marine.

### Is there a pattern worth a prompt change?

Only a weak one: three Energimyndigheten teasers (ISIA India accelerator, capital-raising accelerator, Swedish-German Cleantech Platform) never say "energy"; only the funder makes them energy calls. The tagger sees title and description only, not the source name, so a prompt change alone cannot fix two of the three; adding the source name to the tagged text (lib/embeddings/text.ts or enrich.ts, outside lib/tagger) would. A small definition tweak (energy: "cleantech"; sensor: "Earth observation, remote sensing, quantum sensing"; ai: "decision support built on AI or data analysis") was prepared but **not tested**, so no row change can be reported. My advice: leave the tagger as it is.

### Are six tags too few?

About 70 of 190 opportunities (37 %) and 27 of 56 companies are honestly outside all six areas (health, agriculture, circularity, construction, space, general business support, ICT services, finance, public administration). For a pair where either side has no tag, tag overlap is 0, so 0.2 of the score is the same for every item and the ranking rests on embedding similarity, urgency and the judge. That does not hurt an untagged company's own ranking (every item gets the same 0), but for a tagged company the untagged items lose up to 0.2 against tagged ones, and the tag weight gives no help to half the members. No schema change proposed here; this is only the finding.
