# MovieHawk

An engine that reads movie and series sites (HDHub4u, 4KHDHub), and a read-only HTTP API over it
for web and mobile apps. Every request reads the live sites: there is no database.

Written from scratch. The old crawler, API and bot stay in
[moviehawk-bot](https://github.com/ElonMuskOfficial/moviehawk-bot), running until their
replacements use the engine.

```bash
npm test                              # every test, on saved pages (test/fixtures/)
npm start                             # the API on http://127.0.0.1:3000
PORT=8080 HOST=0.0.0.0 npm start
```

Node 22 or later. Dependencies: [Fastify](https://fastify.dev) 5 (the API), cheerio (HTML).

| Folder | What |
|---|---|
| `src/engine/` | The engine. Consumers import only `src/engine/index.js` |
| `src/api/` | The API: `server.js` (runs it: `npm start`), `app.js` (builds it), `sites.js` and `files.js` (routes), `names.js`, `problems.js` (errors), `domains.js`, `cache.js` |
| `test/` | `test/engine/`, `test/api/`; `test/fixtures/` holds saved live pages |

## The user flow

What a user goes through, from finding a post to a download, and what does it.

```
 Listing / search      Post              Gateways (0 to 3 in a row)            Host
┌────────────────┐   ┌────────────┐   ┌─────────────┐  ┌──────────┐  ┌──────────┐   ┌──────────┐
│ /page/2/       │─▶ │ post page  │─▶ │ GreenMotors │─▶│ HUBLinks │─▶│ HubDrive │─▶ │ HubCloud │
│ /?s=dexter     │   │ its links  │   └─────────────┘  └──────────┘  └──────────┘   └──────────┘
└────────────────┘   └────────────┘
```

A link can skip gateways: 4KHDHub's HubCloud button is GreenMotors → HubCloud. Other hosts
(HubCDN, GoFile, the players) are found the same way, but only HubCloud's files are resolved.

| Step | The user sees | Engine | API | Time (live, 2026-11-01) |
|---|---|---|---|---|
| 0. Find | posters, a next page | `scrapeListing`, `searchPosts` | `GET /v1/sites/{site}/posts`, `/search?q=` | under 1 s |
| 1. Post | the post, its links (`720p x264 [850MB]`) | `scrapePost` | `GET /v1/sites/{site}/posts/{post}` | up to 1 s |
| 2. Files | the files a link leads to (`[HubCloud Server]`) | `scrapeLinks` | `GET /v1/links/{link}/files` | up to 3 s |
| 3. Download | name, size, download servers | `resolve` | `GET /v1/files/{file}` | 1 to 6 s; 10 s when 10Gbps's redirects are slow |

Whether step 2 is shown when a link leads to one file is the consumer's choice. Downloads expire
within minutes or hours, so step 3 is always live.

The labels, from live posts:

| Post | A link's label (step 1) | Its files (step 2) |
|---|---|---|
| HDHub4u movie (Wrong Turn) | `720p x264 [850MB]` | HubCloud `[HubCloud Server]`, a MultiCloudLinks player |
| HDHub4u series, packs (Akka) | `720p HEVC [1GB]` | HubCloud `[HubCloud Server]`: the season's zip |
| HDHub4u series, episode lines | `EPiSODE 1 720p · Drive`, `EPiSODE 1 720p · Instant`, `EPiSODE 1 · WATCH` | the episode's file, or its player |
| HDHub4u link to a HUBLinks page of lines | the button's own text | `480p · Drive`, `480p · Instant`, ..., `1080p WEB-DL [4.1GB]` |
| 4KHDHub movie or pack | `<the block's file> · Download HubCloud`, `... · Download HubDrive` | one HubCloud file: both buttons lead to it |
| 4KHDHub episode | `S02 1080p WEB-DL H264 Episode-01 4.01 GB · Download HubCloud` | the episode's HubCloud file |

`<the block's file>` is its header as 4KHDHub writes it: `A Story of Derry (1080p WEB-DL H264)
1.78 GB English WEB-DL`.

## The engine

It takes a URL, reads the page and returns what the page states. No database, cache or logging:
those belong to its consumers.

| In the engine | Outside the engine |
|---|---|
| fetching, timeout, retry | storing results |
| parsing, following links | caching, rate limits |
| failure codes (`notFound`, ...) | where the configuration comes from |
| file ids, moving URLs to current domains | logs |

`createEngine({ domains, fetch, timeoutMs })` gives the functions below, each with that config, so
no call can read dead domains for lack of `domains`. A call's own option is `signal`.
New domains need a new engine: its config never changes.

| Function | Reads | Returns |
|---|---|---|
| `scrapeListing(url, page)` | a listing page of the site `url` is on (1 request) | `{ posts, hasNextPage }`: each card's `{ url, title, posterUrl }` |
| `searchPosts(url, query, page)` | a page of the site's search, as its search box asks it (1 request) | `{ posts, hasNextPage }`, as `scrapeListing` |
| `scrapePost(url)` | a post page (1 request) | `{ post, links }` |
| `scrapeLinks(urls)` | the gateway pages the links lead to, until each reaches a host | `{ files, failures }` |
| `resolve(url)` | the file's page, its download page, then 10Gbps's redirects (2 or 3 requests) | `{ filename, sizeBytes, downloads }` |

### Names

| Name | Meaning | Example |
|---|---|---|
| `provider` | a source site | `hdhub4u` |
| `post` | one page of a provider: `{ provider, url, title, year, imdbId, posterUrl, publishedAt }` | Wrong Turn |
| `listing` | a page that lists posts | `/page/2/` |
| `link` | a link on a page, its destination not yet known: `{ url, label }` | `720p x264 [850MB]` |
| `gateway` | a page that leads further | GreenMotors, HUBLinks, HubDrive |
| `host` | a site a file is on | `hubcloud` |
| `file` | one file on a host, with the first label on the way to it: `{ host, externalId, url, label }` (JSDoc `HostFile`: Node has a global `File`) | |
| `externalId` | the host's own file id | `xukqlp6jbsf8wja` |
| `download` | one way to download a file: `{ server, kind, url, label }` | |
| `server` | one server on HubCloud's download page | `10gbps`, `fsl` |

### Rules

- `scrape*` reads a page and returns what it states, which does not expire. `resolve` follows
  redirects to make `downloads`, which expire: a different job, so a different verb.
- `scrapePost`'s links are its links to a gateway or a known host (not WhatsApp, IMDb, the site's
  own pages). A link's label is what the page says: a button that states its file has its own
  text (`720p x264 [850MB]`); a button that names only its server has the page's words for its
  file, then the button (`EPiSODE 1 720p · Drive`, `Addicted (1080p WEB-DL H264 AVC) 7 GB English
  WEB-DL · Download HubCloud`). A movie's players (`WATCH`, `PLAYER-2`) name no file.
- `scrapeLinks` follows each link through its gateways (live: 3 at most), reads each gateway page
  once (a gateway that leads back ends there), and gives every file once, by host and
  `externalId`, with the first label on its way (null when no page on the way says anything).
  It reads all pages at once: the sites answered 1,088 requests at once with HTTP 200 only
  (2026-10-31). A URL on no gateway or host it knows is skipped, and not requested.
- `resolve` reads HubCloud only; another host's file is `unsupported`. `download.kind` is
  `direct` when its URL answers with the file (FSL, FSLv2, ZipDisk, Download File, 10Gbps once
  followed), `page` when it leads to it (PixelDrain, Buzz, Telegram, Watch Online, a server not
  known yet: `other`). 10Gbps is the only server it follows; when that fails, the button's own
  link is given, as a page. Some zip packs have no 10Gbps server.
- `domains`: the current domain of each site, gateway and host whose domain rotates, by hostname
  label (`{ hblinks: 'https://hblinks.lol' }`). Every URL is moved to it before it is read, files
  too (hubcloud.foo → hubcloud.ist).
- Nothing found is an empty result (`files: []`, a search's `posts: []`), not an error.

### Errors

Every function throws `EngineError`, whose `code` says what the site said; `failures` in
`scrapeLinks` are `EngineError`s too (`code`, `url`, and a message that names the site, such as
`new10.hdhub4u.cl answered HTTP 404`):

- `notFound`: the site said it is gone: HTTP 404 or 410, or the host's own "not found" page;
- `transient`: the site did not answer: a timeout, a network error, any HTTP error but 404 and 410;
- `unrecognized`: a page the engine cannot read: a changed layout or a challenge page;
- `unsupported`: a URL no provider or host of the engine handles.

Retried: `transient` and `unrecognized` (a challenge page often passes on the next try). Not
retried: `notFound`, `unsupported`, and a request the caller cancelled (`signal`), which is passed
on as it is.

## The API

### Standards

| What | Follows |
|---|---|
| Resources, names, JSON | [Google AIP](https://google.aip.dev), as a guide: where a rule would make the API harder to use and prevents no failure, the API takes the common industry form instead ([Departures from AIP](#departures-from-aip)) |
| HTTP methods, status codes, headers | RFC 9110 |
| Errors | RFC 9457 (`application/problem+json`) |

JSON is camelCase, as AIP's JSON and the engine are.

### Routes

Each route is one engine function, and reads only what that function reads.

| HTTP | Method | Engine | Requests to the sites |
|---|---|---|---|
| `GET /v1/sites` | ListSites | (the API's list) | 0 |
| `GET /v1/sites/{site}/posts?pageToken=` | ListPosts | `scrapeListing` | 1 |
| `GET /v1/sites/{site}/search?q=&pageToken=` | SearchPosts | `searchPosts` | 1 |
| `GET /v1/sites/{site}/posts/{post}` | GetPost | `scrapePost` | 1 |
| `GET /v1/links/{link}/files` | ListFiles | `scrapeLinks([url])` | 1 to 3 |
| `GET /v1/files/{file}` | GetFile | `resolve` | 2 or 3 |

Live through the API (2026-11-01): 30 posts of both sites, 3 links of each: 87 links, 83 of them
to files (167 files), and 75 of 75 HubCloud files resolved; another host's file is 400
`unsupported` (34 of 34).

### Names

Every resource has a `name`: the path that reads it, without `/v1/`.

```
sites/hdhub4u
sites/4khdhub/posts/ali-g-who-iz-i-movie-8435
links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...
files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph
```

- `{site}`: the engine's provider.
- `{post}`: the one segment of the post's path on its site, so a name works on any of the site's
  domains. Not 4KHDHub's number alone: `/8435/` is HTTP 404, `/ali-g-who-iz-i-movie-8435/` is the
  post. Every post path of the four sites is one segment (live, 2026-11-01: HDHub4u's 14,288 and
  4KHDHub's 7,136 known posts), and the URL made back from it opens the post.
- A few slugs are not plain ASCII: HDHub4u's `wall%c2%b7e-2008-hindi-bluray-full-movie` (WALL·E)
  is named `wall·e-2008-...`; the API encodes it again to make the URL (`wall%C2%B7e-...`), which
  opens the post too.
- `{link}`, `{file}`: the link's or the file's URL, base64url-encoded (RFC 4648 §5). The client
  takes them from GetPost and ListFiles, and never makes or reads one. The URL comes back from the
  name, so no request goes to the post again, and a link keeps working when the site edits the
  post. A post's links have the same URLs on every read (live, 2026-11-01).
- A name that is not of a web URL is HTTP 400. A link's name of a URL on no gateway or host the
  engine knows gives `files: []`.
- Names are long: a GreenMotors link's up to 540 characters, an HDHub4u slug up to 143. Fastify's
  `maxParamLength` (100 by default) is 2048, or they would be HTTP 414.

### ListSites

```http
GET /v1/sites
```
```json
{ "sites": [ { "name": "sites/hdhub4u" }, { "name": "sites/4khdhub" } ] }
```

### ListPosts, SearchPosts

```http
GET /v1/sites/hdhub4u/posts?pageToken=2
GET /v1/sites/hdhub4u/search?q=dexter
```
```json
{
  "posts": [
    {
      "name": "sites/hdhub4u/posts/dead-end-job-season-1-webrip-hindi-full-series",
      "title": "Dead-End Job (Season 1) WEB-DL [REPACK] [Hindi (DD5.1) & English] 4K 1080p 720p & 480p Dual Audio [x264/ESubs] | NF Series",
      "posterUrl": "https://image.tmdb.org/t/p/w342/1yobke0bpfNOazuF9wW7QbM2GER.jpg"
    }
  ],
  "nextPageToken": "3"
}
```

A post in a list has only what the site's card says. `nextPageToken` is absent on the last page;
a `pageToken` after the last page is HTTP 404; a search that matches nothing is `posts: []`.

Search is its own route, as GitHub's (`/search/repositories?q=`), not a filter on the list: the
site's search decides what matches and in what order.

### GetPost

```http
GET /v1/sites/hdhub4u/posts/wrong-turn-2003-hindi-bluray-full-movie
```
```json
{
  "name": "sites/hdhub4u/posts/wrong-turn-2003-hindi-bluray-full-movie",
  "url": "https://new10.hdhub4u.cl/wrong-turn-2003-hindi-bluray-full-movie/",
  "title": "Wrong Turn (2003) BluRay [Hindi (DD5.1) & English] 1080p 720p & 480p Dual Audio [x264] | Full Movie",
  "year": 2003,
  "imdbId": "tt0295700",
  "posterUrl": "https://imgshare.info/images/2026/08/19/Wrong-Turn-2003.jpg",
  "publishTime": "2026-08-19T04:16:42.000Z",
  "links": [
    { "name": "links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...b1E9", "label": "480p⚡[320MB]" },
    { "name": "links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...Wmc5", "label": "720p x264 [850MB]" }
  ]
}
```

The engine's `post` and `links`; `publishedAt` is `publishTime` (AIP-142). A post the site moved
is named by the URL it answered at. The links come with the post: its screen shows both.

### ListFiles

```http
GET /v1/links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...Wmc5/files
```
```json
{
  "files": [
    {
      "name": "files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph",
      "host": "hubcloud",
      "url": "https://hubcloud.ist/drive/xukqlp6jbsf8wja",
      "label": "[HubCloud Server]"
    },
    {
      "name": "files/aHR0cHM6Ly9uZXcyLm11bHRpY2xvdWRsaW5rcy5jb20vdmlldy9jOHk1ZTI",
      "host": "multicloudlinks",
      "url": "https://new2.multicloudlinks.com/view/c8y5e2",
      "label": null
    }
  ],
  "failures": []
}
```

Wrong Turn's 720p link: GreenMotors → HUBLinks → HubCloud and MultiCloudLinks (and HubDrive → the
same HubCloud file, given once). A file's `url` is the page a client opens for a host the API does
not resolve. `failures` are the pages on the way that failed, each `{ code, url, detail }` (a
HubDrive file that is gone: `notFound`); the link still answers HTTP 200 with the files it reached.

### GetFile

```http
GET /v1/files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph
```
```json
{
  "name": "files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph",
  "filename": "Wrong.Turn.2003.720p.BluRay.Hindi.English.DD5.1.x264.ESubs.mkv",
  "sizeBytes": 890922598,
  "downloads": [
    { "server": "pixeldrain", "kind": "page", "url": "https://pixeldrain.dev/u/negn6f", "label": "Download [PixelServer : 2]" },
    { "server": "fsl", "kind": "direct", "url": "https://...r2.cloudflarestorage.com/...", "label": "Download [FSL Server]" },
    { "server": "10gbps", "kind": "direct", "url": "https://video-downloads.googleusercontent.com/...", "label": "Download [Server : 10Gbps]" }
  ]
}
```

Its Buzz, Watch Online and Telegram downloads are left out here. Only HubCloud's files are
resolved; another host's is HTTP 400 `unsupported`.

### Errors

RFC 9457, with the cause as the extension `code`:

```json
{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "4KHDHub says the post does not exist", "code": "notFound" }
```

| Cause | Status | `code` |
|---|---|---|
| The site said it is gone; no such site or route | 404 | `notFound` |
| A name, `pageToken` or `q` the API cannot read | 400 (414 for a name over 2048 characters) | `invalidArgument` |
| A file on a host the engine does not resolve | 400 | `unsupported` |
| The site's page could not be read (a changed layout, a challenge page) | 502 | `unrecognized` |
| The site did not answer (timeout, network error, any HTTP error but 404 and 410), or the request took over 30 s | 504 | `transient` |
| A bug in the API (its message goes to the log, not the client) | 500 | `internal` |

Every response has a `Request-Id` (RFC 6648: no `X-`), the server's own, to name a request in a
bug report.

A request takes 30 s at most (Fastify's `handlerTimeout`): a host that stalls through every retry
would hold it about a minute. The engine gets the request's `signal`, so it stops reading the
sites when the request times out or its client disconnects.

### Domains

The current domains come from the
[moviehawk-domains](https://github.com/ElonMuskOfficial/moviehawk-domains) repo. Its workflow heals
them twice a day: a site that moves redirects its old domain to the new one for days, and the
workflow follows that redirect. A domain that does not answer opens an issue there, to be fixed
by hand. The API (`src/api/domains.js`) reads the repo's raw `domains.json`:

- **At start.** When GitHub does not answer, or gives domains that cannot be used (no domain for a
  site, a domain with a path), the API starts with `FALLBACK_DOMAINS`, those of 2026-11-01. A site
  that moved since still answers on its old domain while it redirects.
- **When a request comes and the last read is 30 minutes old**, in the background: that request
  has the domains read before, the next ones the new (stale-while-revalidate, RFC 5861). No timer:
  an idle server reads nothing. 30 minutes, not the workflow's 12 hours, so a domain fixed by hand
  reaches the API within half an hour (GitHub caches the raw file for 5).
- **When the read fails**, the API keeps its domains, and asks again 30 minutes after that try.

### Cache

Each route's answer is kept in memory (`src/api/cache.js`, `lru-cache`, 500 answers at most), by
its URL, for as long as it stays true:

| Route | Kept | Why |
|---|---|---|
| ListPosts | 5 min | new posts come often |
| SearchPosts | 10 min | |
| GetPost | 15 min | a site adds links to a post (a series' new episodes) |
| ListFiles | 1 hour | a link's files hardly change; an answer with `failures` is not kept |
| GetFile | 5 min | its downloads expire, but not within 5 minutes |

A repeat answers without reading the sites. Errors are not kept: the next request tries again.
`Cache-Control: public, max-age=<seconds left>` lets the client keep an answer as long. Each
running copy of the API has its own cache; two requests at once for one URL both read the site.

### Deploy

On Wasmer Edge, at https://moviehawk.wasmer.app: the `main` branch of
[moviehawk](https://github.com/ElonMuskOfficial/moviehawk), every push deployed. Its Node.js
engine is Native (V8), its start command `npm start`, and `HOST=0.0.0.0`; Wasmer sets `PORT`.

### Departures from AIP

- **Search is `GET /v1/sites/{site}/search?q=`**, not AIP-136's `posts:search?query=`: the common
  form (GitHub, and the sites' own `?s=`).
- **`links` and `files` are top-level, not under their post**: a link is read from its URL alone,
  and one file linked from two posts is one file. Under its post, every file request would read
  the post again, and break when the site edits it.
- **No Get or List for every resource** (AIP-121): only the routes a consumer uses.
- **`pageToken` is the site's page number**, not an opaque token (AIP-158): the sites number their
  pages, and nothing else finds a page. Clients still only pass back the `nextPageToken` given.
- **No `pageSize`**: the sites fix it (HDHub4u 85 on its first page, then 15; 4KHDHub 18).
- **ListFiles has no pagination**: a link leads to a few files (live: 2,135 of 2,495 links led to
  1, the most was 25, a pack's).
- **`failures` in ListFiles**: like AIP-217's `unreachable`, but each says why.
- **Errors are RFC 9457, not AIP-193**, which is made for gRPC.

## The sites

| Site | Engine | Listing | A page after the last | Search |
|---|---|---|---|---|
| HDHub4u | read | `/page/<n>/`, `ul.recent-movies`; 85 posts on page 1, then 15 | HTTP 404 | a Typesense API (`search.pingora.fyi`), 15 a page |
| 4KHDHub | read | `/page/<n>/`, `.card-grid`; 18 | answers as its last page; the engine makes it `notFound` | `/page/<n>/?s=<q>`, 18 a page |
| Vegamovies (`new1.vegamovies.lease`) | coming | `/page/<n>/`, `.movies-grid`; 18 to 22 | HTTP 404 | `/ts-search.php?q=&page=` (Typesense), 15 a page |
| RogMovies (`rogmovies.im`) | coming | as Vegamovies | HTTP 404 | as Vegamovies |

- 4KHDHub finds a post by the number at the end of its URL and ignores the slug, but needs one.
  It states no publication date or IMDb id. A series' title states no year, on both sites; HDHub4u
  posts from before 2022 write it without brackets (`The Jackal 1997 Hindi ...`), and the engine
  reads none from them. Those old posts mostly link hosts that are gone (Openload, ClickNupload):
  their links give no files.
- Vegamovies and RogMovies are WordPress sites on one template: posts at `/download-<slug>/`, the
  body in `.post-content`, an IMDb link. Their `/?s=` goes to an empty page whose script calls
  `/ts-search.php`. Every download button leads to a NexDrive page (`nexdrive.beer/...`), a gateway
  that lists the hosts of the file or of every episode: VCloud (`vcloud.beer/<id>`), VegaDrive,
  G-Direct, Filepress; zip packs also GoFile, 1fichier, VikingFile, MegaUp. VCloud's and VegaDrive's
  pages state the filename and size, like HubCloud's. The route has HDHub4u's shape (post →
  gateway → host), so they are new modules (a provider, NexDrive, VCloud), and in the API only
  their names in ListSites.
- They state their data differently: Vegamovies' date is in its `Movie` JSON-LD (`dateCreated`),
  RogMovies' in `BlogPosting` and `article:published_time`. One provider or two is decided when
  they are added.

## Not decided yet

- **Rate limit**: none: the API is for personal use. Each GetFile sends 2 or 3 requests to
  HubCloud; a limit by IP (`@fastify/rate-limit`, 429 with `Retry-After`) if others use it.
- **Access**: open, without a key, for now.
- **Load on the sites**: the engine sets no limit on requests at once, as no site has answered 429
  or stalled. When one does, retrying after its `Retry-After` is added then; nothing before.
- **The other consumers**: the crawler and the bot (in moviehawk-bot) move to the engine after the
  API, as clients of the API.
