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

## Jellyseerr / Seerr (MIT) — to be finalized in DAN-66

## TMDB — to be finalized in DAN-66

## AniList — to be finalized in DAN-66

## MyAnimeList — to be finalized in DAN-66
