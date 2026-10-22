# Events served with 0 winners: what their pages show

Checked 2026-10-22 for the round in
`improvements/rounds/2026-10-22-queue-batch.md`. A read-only lane (Claude
Sonnet 5.5) listed every past event that `GET /api/hackathons/<slug>` served
with `hackathon.stats.winners == 0` (13 of 27 events) and read each event's
own pages. The orchestrator fetched each non-DoraHacks winner source again
and confirmed the names. A winner counts only when a page names it as a
winner; posts that do not say "winner" were not used.

## Winners on readable pages (4 events)

| event | winners | source |
| --- | --- | --- |
| hackmeridian-2025 | The Simple Fund, 4Bridge, Stellar Forge (innovation awards, 1st to 3rd); Lance, Star Lends, Panorama Block (composability, 1st to 3rd) | https://stellar.org/blog/foundation-news/the-blueprint-at-meridian-2025 (2025-10-01); already curated, waiting on the curated-builds execute |
| build-on-stellar-philippines-2026 | AbotPera (Champion), PinkRaft (1st Runner-Up), Axial (2nd Runner-Up), Sobre and TyFi (Best Use of Stellar) | https://bitpinas.com/feature/stellar-rise-in-ph-hackathon-concludes/ (2026-06-08); the organizer's blog (2026-08-04) names the same five without places |
| alebrije2026 | Mañana Seguro, Seyf, Gibbor (named as winning projects, no places) | https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route (2026-05-04); submissions are stored from DoraHacks |
| apac-stellar-hackathon-2026 | Olio (1st place, Payment and Consumer Application track); the other two tracks not found | https://www.risein.com/blog/builder-spotlight-from-hackathon-curiosity-to-building-olio-on-stellar (2026-09-01) |

## No winners announced on any readable page (9 events)

Each DoraHacks-sourced event below reports `winner_announced: false` in the
DoraHacks hub API, an empty winner-assignments list and no announcements.
Social posts (X, LinkedIn, Instagram, Telegram) could not be read, so this is
absence on readable pages, not proof that no results exist.

| event | pages checked |
| --- | --- |
| stellar-journey-to-mastery-2026 | organizer program page and two recap posts (aggregates only, no named winners) |
| stellarhack | DoraHacks detail page and hub API, BAF Stellar Week page, BAF newsletter, Luma |
| give-hackathon-argentina | DoraHacks detail page and hub API, two BAF newsletters |
| telluscoop-ideaton | DoraHacks detail page and hub API, ideaton.telluscoop.org (now the later edition), the Tellus newsletter archive |
| codigoraiz2025 | DoraHacks detail page and hub API, Luma, BAF newsletter |
| stellar-builders-camp-jaipur-2026 | Luma, the organizer's blog |
| buildonstellarhack | DoraHacks detail page and hub API, Luma |
| mqcstellar | DoraHacks detail page and hub API, Luma |
| stellar-pulso-hackathon | DoraHacks detail, winner and announcement pages and hub API, three Luma demo-day pages, SDF meeting notes; its "winners announced" line is a planned timeline row |

## Also noted

- apac-stellar-hackathon-2026 serves endDate 2026-07-24; the organizer's
  2026-07-29 post puts the grand finale on 31 July.
- Events named in sources but absent from getHackathons: Argentina Builder
  Challenge, Stellar Pro Hackathon, Stellar Hack Pera, Tellus Find Your Way.
