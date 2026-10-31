# Engine

**Status:** being built on the branch `engine`: pieces 1 to 8 are done.

The engine takes a URL, scrapes it and returns the result. The crawler, API, bot and on-demand
scrape all use it.

## Decided

- Lives in `src/engine/`. Consumers import only `src/engine/index.js`.
- No database, cache or logging in the engine.
- Configuration comes in from outside: `createEngine({ fetch, domains, timeoutMs })`.
- `scrapeLinks` returns every file it reaches (HubCloud, HubCDN, GoFile, ...), each once.
- The engine gives one function per layer of the sites (listing, post, links, file); the consumer
  makes its own flow from them: the crawler follows every link of a post, another consumer only the ones its user picks.
- The engine states only what the site said. What a consumer does with a result is its own
  business.

| In the engine | Outside the engine |
|---|---|
| fetching, timeout, retry | storing results |
| parsing, following links | caching, rate limits |
| failure codes (`notFound`, ...) | where the configuration comes from |
| file ids, current domains | logs (the engine reports through `onEvent`) |

## Names

| Name | Meaning | Example |
|---|---|---|
| `provider` | source site | `hdhub4u` |
| `post` | one page of a provider | The Furious |
| `listing` | page that lists posts | `/page/2/` |
| `link` | a link on a page: its URL (destination not yet known) and its text | `{ url, label }` |
| `gateway` | page that leads further | GreenMotors, HUBLinks, HubDrive |
| `host` | site a file is on | `hubcloud` |
| `file` | one file on a host | `{ host, externalId, url }` |
| `externalId` | host's own file id | `abc123` |
| `download` | one way to download a file, from `resolve()` | `{ server, kind, url, label }` |
| `server` | one server on HubCloud's download page | `10gbps`, `fsl` |

`post`: `{ provider, url, title, year, imdbId, posterUrl, publishedAt }`.
`file`: `{ host, externalId, url }` (its JSDoc type is `HostFile`: Node already
has a global `File`).

| Function | Reads | Returns |
|---|---|---|
| `scrapeListing(provider, page)` | a listing page | post URLs |
| `scrapePost(url)` | a post page (1 request) | `{ post, links }` |
| `scrapeLinks(links)` | the gateway pages the links lead to, until each reaches a host | `{ files, failures }` |
| `scrapeFile(url)` | a file's page on its host (1 request) | `{ filename, sizeBytes }` |
| `resolve(url)` | the file's page, its download page, then the redirects to the file (3 requests) | `{ filename, sizeBytes, downloads }` |

- `scrape*` reads a page and returns what it states, which does not expire. `resolve` follows
  redirects to make `downloads`, which expire within minutes or hours. A different job, so a
  different verb ("link resolver").
- `resolve` reads the file page with the same parser as `scrapeFile`. No flag that switches one
  function between the two jobs.
- `download.kind`: `direct` when its URL answers with the file itself (FSL, FSLv2, ZipDisk,
  Download File, and 10Gbps once followed), `page` when it is a page that leads to it (PixelDrain,
  Buzz, Telegram, Watch Online, a server not known yet: `other`). `label` is the button's text.
- 10Gbps is the only server `resolve` follows (its redirects end on an ad page whose `link` is the
  file). When that fails, the button's own link is given, as a page.
- `failures` is a list of `EngineError` (each has `code`, `url`, `status`); the consumer decides
  what they mean (no `outcome`).
- `scrapePost`'s `links` are the post's links to a gateway or a known host (not WhatsApp, IMDb, the
  site's own pages); none can be a glitch of the site. A link's `label` is what the page says it
  is. A button that states its file is labelled with its own text (HDHub4u's `720p x264 [850MB]`).
  A button that names only its server is labelled with what the page says of its file and then
  the button: HDHub4u's episode lines (`EPiSODE 1 720p · Drive`), 4KHDHub's blocks
  (`Addicted (1080p WEB-DL H264 AVC) 7 GB English WEB-DL · Download HubCloud`).
- `scrapeLinks` follows a link through at most 5 gateways in a row (live: 3 at most), reads each
  gateway page once, and reads all pages at once, with no limit: the sites answered 1,088
  requests at once (5 series together) with HTTP 200 only (2026-10-31). Each page is retried.
- `domains`: the current domain of each site whose domain rotates, by its hostname label
  (`{ hblinks: 'https://hblinks.lol' }`); every URL is moved to it before it is read.
- Nothing found is an empty result (`files: []`), not an error.
- `onEvent({ type, url, detail })`: what happened to each link, for logs.
- `EngineError.code`, by what the site said:
  - `notFound`: the site said it is gone: HTTP 404 or 410, or the host's own "not found" page;
  - `transient`: the site did not answer: a timeout, a network error, a 5xx or 429;
  - `unrecognized`: a page the engine cannot read: a changed layout or a challenge page;
  - `unsupported`: a URL no provider or host of the engine handles.
- Retried: `transient` and `unrecognized` (a challenge page often passes on the next try). Not
  retried: `notFound`, `unsupported`, and a request the caller cancelled (`signal`), which is
  passed on as it is, not as an `EngineError`.

## Sources

The engine is built for more than one source from the start: a new source is new modules
(provider, gateways, hosts), never an edit of the pipeline.

| Source | Status |
|---|---|
| HDHub4u, 4KHDHub | Today's sources |
| Vegamovies (`new1.vegamovies.lease`), RogMovies (`rogmovies.im`) | Coming. First look on 2026-10-31 (4 posts) |

First look at Vegamovies and RogMovies:

- Both are WordPress sites on one template: posts at `/download-<slug>/`, the body in
  `.post-content`, an IMDb link. They link each other.
- Every download button leads to a NexDrive page (`nexdrive.beer/genxfm<number>/`), a gateway:
  one page per quality, or per quality and server on series.
- A NexDrive page lists the hosts of the file, or of every episode: VCloud (`vcloud.beer/<id>`),
  VegaDrive (`one.vegadrive.app/s/<id>`), G-Direct (`fastdl.beer/embed.php?download=<id>`),
  Filepress (`filebee.xyz/file/<id>`); zip packs also GoFile, 1fichier, VikingFile, MegaUp.
- VCloud's and VegaDrive's pages state the filename and size, like HubCloud's. G-Direct's page
  says only "redirecting...". Filepress did not answer.
- So the route has the same shape as HDHub4u's (post → gateway → host): piece 8 follows the links a
  gateway returns until they reach a host, with a depth limit, instead of a fixed list of steps.

Wide survey (2026-10-31: 3 listing pages and 20 posts per site, all four sites):

- Each site's listing page has one grid of posts: HDHub4u `ul.recent-movies`, 4KHDHub
  `.card-grid`, Vegamovies and RogMovies `.movies-grid` (their slider repeats on every page).
- Vegamovies and RogMovies look alike but state their data differently: Vegamovies' date is in
  its `Movie` JSON-LD (`dateCreated`), RogMovies' in `BlogPosting` and `article:published_time`.
  Vegamovies writes the languages in each quality's heading ("{Hindi-English}"), RogMovies
  rarely. One provider or two is decided when they are added, with NexDrive and VCloud.
- 4KHDHub finds a post by the number at the end of its URL; the slug is ignored.
- A page after the last: HDHub4u answers HTTP 404, 4KHDHub answers as its last page. Piece 9
  has to tell the caller where the listing ends.

## Open

- Load: no limit on requests at once, as no site has answered 429 or stalled under load. When one
  does, `retry` follows its `Retry-After`; nothing is added before that.
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
3. Hosts: which host a URL belongs to (`hostOf`), and its `externalId` (`externalIdOf`).
4. Gateways: GreenMotors, HUBLinks, HubDrive file and pack. Each reads one page and returns
   `{ links }`.
5. `scrapeFile`: HubCloud's file page.
6. `resolve`: HubCloud's download page and the 10Gbps redirects. Only HubCloud: no consumer
   needs another host resolved yet; one is added when a consumer does.
7. Providers: HDHub4u and 4KHDHub post and listing pages, after a wide survey of all four sites.
   Vegamovies and RogMovies come with NexDrive and VCloud.
8. `scrapePost` (`src/engine/posts.js`) and `scrapeLinks` (`src/engine/links.js`): following the
   links each gateway returns until they reach a host, each file once, `failures`, `onEvent`;
   moving each URL to its current domain before it is fetched.
9. `scrapeListing`.
10. `createEngine` and `src/engine/index.js`.
11. Live check on both sites: the new engine's results against `master`'s.

After that, the consumers (crawler, API, bot) move to the engine.
