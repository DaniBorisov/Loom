---
sidebar_position: 99
---

# Third-Party Licensing & Compliance

Internal reference for the terms governing every external service Loom
integrates with. Terms change without notice — re-check every 6–12 months
or before any major release. (Epic 10; started under DAN-71, finalized
under DAN-66.)

## TheTVDB (v4 API) — verified 2026-09-11 (DAN-71)

**Status: live integration exists — the "static dataset only" assumption is
refuted. Documented as a known risk per project decision.**

What the app actually does:

- `server/api/tvdb` talks to `https://api4.thetvdb.com/v4` (login, token
  refresh, series extended/episodes/seasons lookups).
- TVDB is a **user-selectable metadata provider** for TV and anime
  (`getMetadataProvider` in `server/api/metadata.ts`, honoring
  `settings.metadataSettings`). When selected, TVDB data enriches TMDB
  results with graceful fallback to TMDB-only on any TVDB failure.
- Supporting uses: connectivity test (`routes/settings/metadata.ts`),
  artwork CDN proxy (`artworks.thetvdb.com` via `routes/imageproxy.ts`),
  dedicated `tvdb` response cache bucket (`server/lib/cache.ts`).

Authentication (the risk):

- Login uses a **hardcoded project API key baked into source**
  (`server/api/tvdb/index.ts`) with **no per-user PIN**:
  `getInstance()` constructs the client pin-less, no settings field for a
  PIN exists, and the `pin?` constructor parameter is unwired.
- Under TVDB v4 terms, direct API access requires a negotiated license or
  a per-user subscription PIN. Server-wide access on a shared key without
  per-user PINs does not match that model.

Explicitly out of scope for this app:

- The anime ID crosswalk (`server/data/anime-crosswalk.json`, loaded by
  `server/api/anilist/crosswalk.ts`) is a static community dataset,
  separate from TVDB's licensed live API.
- Sonarr's own communication with TVDB is Sonarr's concern, not this
  app's.

Rules going forward:

- Do not add new TVDB-dependent features without revisiting this section.
- If TVDB usage expands, the compliant paths are removing the provider
  (TMDB-only; fallbacks already exist) or wiring per-user PINs (settings
  field → client constructor), with each user holding a TVDB subscription.

## Jellyseerr / Seerr (MIT) — verified 2026-09-10 (DAN-62)

Upstream license: MIT, `Copyright (c) 2020 sct` — confirmed byte-identical
against both `Fallenbagel/jellyseerr` and `seerr-team/seerr` (Seerr is the
renamed Jellyseerr). MIT requires only that the copyright + permission
notice ship with copies/substantial portions.

How we comply:

- `LICENSE` at repo root is the verbatim upstream text, unmodified.
- No new license file added by the fork.
- Visible credit: README Credits section + Settings → About → Credits
  ("Forked from Seerr", DAN-62).

## TMDB (API Terms of Use, updated 2023-10-20) — verified 2026-09-11 (DAN-66)

Source: <https://www.themoviedb.org/api-terms-of-use>. Free for
non-commercial use only; commercial use needs a separate written agreement.
Notable restrictions beyond attribution: 6-month maximum cache of TMDB
content, no ML/AI training on TMDB content, no use as an image host, no
derivatives of the API/content.

How we comply:

- **Attribution**: Settings → About → Credits renders the required notice
  with the unmodified approved TMDB mark at modest size (DAN-67). NOTE
  (2026-09-11): the issue quoted older wording; the in-app text matches
  the current terms ("...uses TMDB and the TMDB APIs but is not endorsed,
  certified, or otherwise approved by TMDB").
- **Logo prominence**: the mark renders at small size next to the text,
  well below the Loom wordmark's prominence, per the terms.
- **6-month cache**: in-memory `tmdb` bucket TTL is 6 hours; DB holds IDs
  only; TMDB image disk cache is capped at 180 days with background
  refresh on expiry (DAN-70).
- **Non-commercial**: stated in README + About Usage notice (DAN-69); the
  app has no payments, ads, or revenue paths.

## AniList (GraphQL API) — verified 2026-09-11 (DAN-66)

Source: <https://anilist.gitbook.io/anilist-apiv2-docs>. Free for
non-commercial use. Rate limit 90 requests/min (429 + `Retry-After` on
excess; burst limiter on top; raises by email request only, currently not
being granted). Naming restrictions concern only apps calling themselves
AniList/AniChart — "Loom" is unaffected.

How we comply:

- Non-commercial status stated (DAN-69); credited on the About page
  alongside TMDB (DAN-68).
- NOTE: at verification time the API was in a degraded state (30 req/min,
  403 "temporarily disabled" on some endpoints) — an upstream incident,
  not a terms issue. Client honors 429/`Retry-After` semantics.

## MyAnimeList (API v2) — verified 2026-09-11 (DAN-66)

Source: <https://myanimelist.net/apiconfig/references/api/v2>. Requires
official app/client-ID registration; per-user actions use OAuth2 bearer
tokens, public reads may use the `X-MAL-CLIENT-ID` header.

How we comply:

- `server/api/mal` takes the client ID from `MAL_CLIENT_ID` (warns when
  unset, refuses to call without it) and performs per-user actions with
  per-user OAuth tokens (`server/lib/mal-auth`), matching the registered
  -app model — no shared-credential API abuse.
- Users link their own MAL accounts at Settings → MyAnimeList.
- Credited on the About page (DAN-68).
