# Engine

**Status:** under discussion, not implemented yet.

The engine takes a URL, scrapes it and returns the result. The crawler, API, bot and on-demand
scrape all use it.

## Decided

- Lives in `src/engine/`. Consumers import only `src/engine/index.js`.
- No database, cache or logging in the engine.
- Configuration comes in from outside: `createEngine({ fetch, domains, timeoutMs })`.
- `scrapePost` returns every file it reaches (HubCloud, HubCDN, GoFile, ...), each once.
- `savePost` keeps only HubCloud files, because that is the database's rule.

| In the engine | Outside the engine |
|---|---|
| fetching, timeout, retry | saving and deleting (`src/db/`) |
| parsing, following links | link cache, rate limits (API) |
| failure codes (`notFound`, ...) | reading `sources.json` (scripts) |
| file ids, current domains | logs (`onEvent` callback) |

## Names

| Name | Meaning | Example |
|---|---|---|
| `provider` | source site | `hdhub4u` |
| `post` | one page of a provider | The Furious |
| `listing` | page that lists posts | `/page/2/` |
| `link` | URL on a page, destination not yet known | a post's button |
| `gateway` | page that leads further | GreenMotors, HUBLinks, HubDrive |
| `host` | site a file is on | `hubcloud` |
| `file` | one file on a host | `{ host, externalId, url }` |
| `externalId` | host's own file id | `abc123` |
| `download` | final URL from `resolve()` | `{ server, kind, url }` |
| `server` | one server on HubCloud's download page | `10gbps`, `fsl` |

`post`: `{ provider, url, title, year, imdbId, posterUrl, publishedAt }`.
`file`: `{ host, externalId, url, statedLanguages }` (its JSDoc type is `HostFile`: Node already
has a global `File`).

| Function | Reads | Returns |
|---|---|---|
| `scrapeListing(provider, page)` | a listing page | post URLs |
| `scrapePost(url)` | a post page, and the pages its links lead to | `{ post, files, linkCount, failures }` |
| `scrapeFile(url)` | a file's page on its host (1 request) | `{ filename, sizeBytes }` |
| `resolve(url)` | the file's page, its download page, then the redirects to the file (3 requests) | `{ filename, sizeBytes, downloads }` |

- `scrape*` reads a page and returns what it states, which does not expire. `resolve` follows
  redirects to make `downloads`, which expire, so only the API and bot call it, when a user
  asks. A different job, so a different verb ("link resolver").
- `resolve` calls `scrapeFile` first: one parser for the file page. No flag that switches one
  function between the two jobs.
- `failures` is a list of `EngineError` (each has `code`, `url`, `host`); the consumer decides
  what they mean (no `outcome`).
  `linkCount` is the number of links the provider reads from the post page: 0 can be a glitch of
  the site.
- Nothing found is an empty result (`files: []`), not an error.
- `onEvent({ type, url, detail })`: what happened to each link, for logs.
- `EngineError.code`: `notFound`, `transient`, `unrecognized` (a page the engine cannot read: a
  changed layout or a challenge page) or `unsupported`.

## Open

- 4KHDHub: two blocks with different languages can lead to one file. Check this live.
- On-demand scrape: decided when that feature is built.

## Plan

The engine is written from scratch on the branch `engine`, which started empty. `master` keeps
running until the engine is done and the consumers use it.

**Each piece:**

1. Explain it with an example, before any code.
2. Show the rules the old code (`master`) has for it, learned from live bugs, and decide which
   to keep.
3. Write the code and its tests (the old fixtures where they fit).
4. One commit.

**Pieces, in order:**

1. `EngineError`.
2. Fetching: timeout, `signal`, retry.
3. Hosts: which host a URL belongs to, its `externalId`, its current domain.
4. Gateways: GreenMotors, HUBLinks, HubDrive file and pack.
5. `scrapeFile`: HubCloud's file page.
6. `resolve`: HubCloud's download page and the 10Gbps redirects. Only HubCloud: the API and bot
   resolve stored files, and only HubCloud files are stored. Another host is added when a
   consumer needs it.
7. Providers: HDHub4u and 4KHDHub post and listing pages.
8. `scrapePost`: following the links, each file once, `failures`, `onEvent`.
9. `scrapeListing`.
10. `createEngine` and `src/engine/index.js`.
11. Live check on both sites: the new engine's results against `master`'s.

After that, the consumers (crawler, API, bot) move to the engine.
