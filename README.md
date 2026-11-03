# MovieHawk

An engine that reads movie and series sites (HDHub4u, 4KHDHub, Vegamovies, RogMovies), and a read-only HTTP API over it
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
| `engine/` | The engine. Consumers import only `engine/index.js` |
| `src/` | The API: `server.js` (runs it: `npm start`, Vercel's entrypoint), `setup.js` (its Fastify options and setup), `sites.js` and `links.js` (routes), `names.js`, `problems.js` (errors), `domains.js`, `cache.js` |
| `vercel.json` | Vercel's config ([Deploy](#deploy)) |
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
(HubCDN, GoFile, the players) are found the same way; HubCloud's and HubCDN's files are resolved.

Vegamovies and RogMovies take one road: every button leads to a NexDrive page, which lists the
servers of its file or of each episode; the user chooses there.

```
 Listing / search      Post              Gateway             Host
┌────────────────┐   ┌────────────┐   ┌──────────┐   ┌──────────────────────────────────────┐
│ /page/2/       │─▶ │ post page  │─▶ │ NexDrive │─▶ │ V-Cloud, FastDL (G-Direct), VegaDrive │
│ ts-search.php  │   │ its links  │   └──────────┘   │ (V-Drive); GDToT, Filepress, ...      │
└────────────────┘   └────────────┘                  └──────────────────────────────────────┘
```

V-Cloud is HubCloud's software (its file card, its download page and servers); FastDL is HubCDN's.
NexDrive pages of 2021–22 link V-Cloud's older link page (`vcloud.beer/api/index.php?link=`), which
leads to one V-Cloud file. V-Cloud's, FastDL's and VegaDrive's files are resolved; GDToT, Filepress,
DropGalaxy and the mirrors are opened in the browser.

The API goes the sites' way: it shows the pages where the user chooses, and opens on the way the
pages that lead to one place. GreenMotors has one destination; a HubDrive file page, one HubCloud
file, at times with a Telegram link (live, 2026-11-01: 327 GreenMotors pages and 224 HubDrive file
pages, of 100 posts). HUBLinks and a HubDrive pack list files: the user chooses there.

| Step | The user sees | Engine | API | Time (live, 2026-11-01) |
|---|---|---|---|---|
| 0. Find | posters, a next page | `scrapeListing`, `searchPosts` | `GET /v1/sites/{site}/posts`, `/search?q=` | under 1 s |
| 1. Post | the post, its links (`720p x264 [850MB]`) | `scrapePost` | `GET /v1/sites/{site}/posts/{post}` | up to 1 s |
| 2. Files, where the sites list them | HUBLinks', a pack's or NexDrive's files, in its groups (`480p`: `Drive`, `Instant`; `-:Episodes: 1:-`: `V-Cloud`, `V-Drive`) | `expand` | `GET /v1/links/{link}`: `files` | up to 2 s |
| 3. Download | name, size, download servers | `resolve` | `GET /v1/links/{link}`: `file` | 1 to 6 s; 10 s when 10Gbps's redirects are slow; HubCDN, FastDL 1 to 4 s; VegaDrive 4 to 14 s (live, 2026-11-03), Vegadrop's link being made |

A link straight to a file (HubCloud, HubCDN, a HubDrive file page) opens at step 3. Downloads
expire within minutes or hours, so step 3 is always live.

What a link is for, from live posts: its section and line say it; its label is its button's own
text.

| Post | Section | Line | Labels |
|---|---|---|---|
| HDHub4u movie (Wrong Turn) | `: DOWNLOAD LINKS :` | `720p x264 [850MB]` | `720p x264 [850MB]` |
| HDHub4u series, episode lines | `EPiSODE 1` | `720p` | `Drive`, `Instant`, `WATCH` |
| HDHub4u series, an episode's own line | `: DOWNLOAD LINKS :` | none | `EPiSODE 1`, `WATCH` |
| 4KHDHub movie or pack | `Download Links`, `Download Complete Season` | its file: `A Story of Derry (1080p WEB-DL H264)` | `Download HubCloud`, `Download HubDrive` |
| 4KHDHub episode | its season's group: `S02 1080p WEB-DL H264` | `Episode-01` | `Download HubCloud`, `Download HubDrive` |
| A HUBLinks page (step 2) | `Watch Online`, or none | `480p`, or a server: `Instant⚡Download` | `Drive`, `Instant`, a mirror's URL |
| Vegamovies or RogMovies movie (Spider-Man: Brand New Day) | `• iMAX – WEB-DL •`, or none | its file: `… 720p iMAX-WEB-DL x264 [1.3GB]` | `Download Now` |
| Vegamovies or RogMovies series | `• Episodes 01 To 04 •`, or none | `Season 1 {Hindi-Korean} 480p WEB-DL x264 [160MB/E]` | `⚡ G-Direct [Instant]`, `⚡ V-Cloud [Resumable]`, `⚡ Batch/Zip [1.1GB]` |
| A NexDrive page (step 2) | none; `Alternative Sources` | `-:Episodes: 1:-`, `-:Complete Zip Pack:-`; none for a movie | `⚡ V-Cloud [Resumable]`, `⚡ V-Drive [Multi]`, `G-Drive [Login]` |

## The engine

It takes a URL, reads the page and returns what the page states. No database, cache or logging:
those belong to its consumers.

| In the engine | Outside the engine |
|---|---|
| fetching, timeout, retry | storing results |
| parsing, following links | caching, rate limits |
| failure codes (`notFound`, ...) | where the configuration comes from |
| file ids, moving URLs to current domains | logs |

`createEngine({ domains, fetch, timeoutMs, waitMs })` gives the functions below, each with that
config, so no call can read dead domains for lack of `domains`. A call's own option is `signal`.
`waitMs` is how long `resolve` waits for a download its host makes on request (Vegadrop: 90 s by
default, as its page waits); the API, which answers within 30 s, waits 20 s. What a consumer
does with the pieces (which link to follow, how long to keep an answer) is its own.
New domains need a new engine: its config never changes. Beside them, `identify(url)` says what a
link is, from its URL alone: `{ type: 'gateway', id }`, `{ type: 'file', id, resolves }`,
`{ type: 'post', id }` (a post of a site the engine reads, its path one segment), or null; and
`providerIds` names the sites it reads (`['hdhub4u', '4khdhub', 'vegamovies', 'rogmovies']`). The engine gives the pieces; the
consumer makes its own flow of them (the API's: GetLink).

| Function | Reads | Returns |
|---|---|---|
| `scrapeListing(url, page)` | a listing page of the site `url` is on (1 request) | `{ posts, hasNextPage }`: each card's `{ url, title, posterUrl }` |
| `searchPosts(url, query, page)` | a page of the site's search, as its search box asks it (1 request) | `{ posts, hasNextPage }`, as `scrapeListing` |
| `scrapePost(url)` | a post page (1 request) | `{ post, sections }` |
| `expand(url)` | a gateway page (1 request) | `{ links }`: where it leads, as the page gives it; a page where the user chooses among files (HUBLinks, a HubDrive pack) also `{ title, tags, sections }`, a page that leads to one place (GreenMotors, a HubDrive file page) none |
| `resolve(url)` | the file's page, its download page, then 10Gbps's redirects (2 or 3 requests) | `{ filename, sizeBytes, downloads }` |

### Names

| Name | Meaning | Example |
|---|---|---|
| `provider` | a source site | `hdhub4u` |
| `post` | one page of a provider: `{ provider, url, title, year, imdbId, posterUrl, publishedAt }` | Wrong Turn |
| `listing` | a page that lists posts | `/page/2/` |
| `link` | a link on a page, its destination not yet known: `{ url, label }` | `720p x264 [850MB]` |
| `gateway` | a page that leads further | GreenMotors, HUBLinks, HubDrive, NexDrive |
| `host` | a site a file is on | `hubcloud` |
| `file` | one file on a host, named by its URL | |
| `externalId` | the host's own file id | `xukqlp6jbsf8wja` |
| `download` | one way to download a file: `{ server, kind, url, label }` | |
| `server` | one server on HubCloud's or V-Cloud's download page, `hubcdn`, `fastdl`, or one of VegaDrive's (`vegadrop`, its mirrors by name) | `10gbps`, `fsl`, `vegadrop`, `telegram` |

### Rules

- `scrape*` reads a page and returns what it states, which does not expire. `resolve` follows
  redirects to make `downloads`, which expire: a different job, so a different verb.
- `scrapePost`'s `sections` hold the post's download links, as each site's provider reads its page
  (HDHub4u: a link in a heading, or alone in its paragraph; 4KHDHub: a block's buttons;
  Vegamovies and RogMovies: a paragraph of buttons only, under the heading that names it), whatever
  gateway or host they lead to, a URL that is no web page too (a magnet); not WhatsApp, IMDb, the site's own pages, or a link in a sentence. `identify` tells which
  the engine can open. A link's label is its button's text (`Drive`, `Download HubCloud`); what the
  button is for is its line's title (`720p`, `Episode-01 4.01 GB`) and its section's (`EPiSODE 1`,
  `S01 1080p WEB-DL H264`). A button that states its file (`720p x264 [850MB]`) is its line's title
  too. A movie's players (`WATCH`, `PLAYER-2`) name no file.
- `expand` gives a gateway page's links as the page gives them: a torrent, a host the engine does
  not know, HubCloud's Telegram link. Which to follow is the consumer's: `identify` is null for
  each of those. It reads one page, on its gateway's current domain.
- `resolve` reads HubCloud and HubCDN; another host's file is `unsupported`. A HubCDN file has
  one download, `direct`: the file's URL (on R2 or Google) that its page's script holds,
  base64-encoded. Its name and size are that URL's headers, asked for with a HEAD request, which
  sends none of the file (a ranged GET would not do: Google answers it with the whole file); when
  the HEAD fails they are null, and the download is still given. For HubCloud, `download.kind` is
  `direct` when its URL answers with the file (FSL, FSLv2, ZipDisk, Download File, 10Gbps once
  followed), `page` when it leads to it (PixelDrain, Buzz, Telegram, Watch Online, a server not
  known yet: `other`). 10Gbps is the only server it follows; when that fails, the button's own
  link is given, as a page. Some zip packs have no 10Gbps server. A button is read by the link
  the page's script leaves in it: PixelServer's `href` is a decoy (`pixeldrain.dev/u/negn6f`, no
  file, on every page), which `var pxl = "…"` replaces; a button without a link (`href=""`) is
  left out.
- V-Cloud is read as HubCloud (its file card, its download page, its servers: GoFile and
  `Downoad From Telegram` too); its download page's link is in its script, base64 of base64.
  FastDL is read as HubCDN: its script's `reurl` holds the file's URL on Google, as it is.
  VegaDrive states the file's name and size; its Vegadrop (10Gbps) is followed as its page's
  script does, in the page's session (its cookie): "prepare" until ready, then "download-link",
  for the file on Google. Its mirrors (Telegram, GoFile, Buzzheavier, ...) are pages, which lead
  to the file in a browser. A zip has no Vegadrop.
- Vegadrop's answer states `expires_in_seconds: 120`: how long its page keeps the button ready.
  The file's URL still answered 20 minutes on (live, 2026-11-03), so it is a download as any
  other, kept as long.
- `domains`: the current domain of each site, gateway and host whose domain rotates, by hostname
  label (`{ hblinks: 'https://hblinks.lol' }`). Every URL is moved to it before it is read, files
  too (hubcloud.foo → hubcloud.ist), with nothing of its old origin (port, credentials). A label
  without a domain is read where the link says, so a consumer that reads URLs from strangers (the
  API) gives a domain for every gateway and host.
- Nothing found is an empty result (a gateway's `links: []`, a search's `posts: []`), not an error.

### Errors

Every function throws `EngineError`, whose `code` says what the site said (with `url`, and a
message that names the site, such as `new10.hdhub4u.cl answered HTTP 404`):

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

Each route but GetLink is one engine function, and reads only what that function reads.

| HTTP | Method | Engine | Requests to the sites |
|---|---|---|---|
| `GET /v1/sites` | ListSites | `providerIds` | 0 |
| `GET /v1/sites/{site}/posts?pageToken=` | ListPosts | `scrapeListing` | 1 |
| `GET /v1/sites/{site}/search?q=&pageToken=` | SearchPosts | `searchPosts` | 1 |
| `GET /v1/sites/{site}/posts/{post}` | GetPost | `scrapePost` | 1 |
| `GET /v1/links/{link}` | GetLink | `identify`, `expand`, `resolve` | 1 to 5 |

### Names

Every resource has a `name`: the path that reads it, without `/v1/`.

```
sites/hdhub4u
sites/4khdhub/posts/ali-g-who-iz-i-movie-8435
links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...
```

- `{site}`: the engine's provider.
- `{post}`: the one segment of the post's path on its site, so a name works on any of the site's
  domains. Not 4KHDHub's number alone: `/8435/` is HTTP 404, `/ali-g-who-iz-i-movie-8435/` is the
  post. Every post path of the four sites is one segment (live, 2026-11-01: HDHub4u's 14,288 and
  4KHDHub's 7,136 known posts), and the URL made back from it opens the post.
- A few slugs are not plain ASCII: HDHub4u's `wall%c2%b7e-2008-hindi-bluray-full-movie` (WALL·E)
  is named `wall·e-2008-...`; the API encodes it again to make the URL (`wall%C2%B7e-...`), which
  opens the post too.
- `{link}`: the link's URL, base64url-encoded (RFC 4648 §5). The client takes it from GetPost or
  GetLink, and never makes or reads one. The URL comes back from the
  name, so no request goes to the post again, and a link keeps working when the site edits the
  post. A post's links have the same URLs on every read (live, 2026-11-01).
- A name that is not of a web URL is HTTP 400. A link's name of a URL on no gateway or host the
  engine knows is `external`.
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
GET /v1/sites/hdhub4u/posts/how-to-ruin-diwali-meet-the-parents-season-1-hindi-webrip-all-episodes
```
```json
{
  "name": "sites/hdhub4u/posts/how-to-ruin-diwali-meet-the-parents-season-1-hindi-webrip-all-episodes",
  "url": "https://new10.hdhub4u.cl/how-to-ruin-diwali-meet-the-parents-season-1-hindi-webrip-all-episodes/",
  "title": "How to Ruin Diwali: Meet the Parents (Season 1) WEB-DL [Hindi (DD5.1) & English] 4K 1080p 720p & 480p Dual Audio [x264/ESubs] | NF Series",
  "year": null,
  "imdbId": null,
  "posterUrl": "https://image.tmdb.org/t/p/w500/84CWUqIiQCfCyC7epKT8y24DGRd.jpg",
  "publishTime": "2026-10-31T08:32:59.000Z",
  "sections": [
    {
      "title": ": DOWNLOAD LINKS :",
      "tab": null,
      "tags": [],
      "episodes": false,
      "lines": [
        { "title": "480p x264 [200MB]", "file": null, "tags": [], "links": [
          { "name": "links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...", "url": "https://greenmotors.club/?id=cUk4...", "label": "480p x264 [200MB]", "host": "greenmotors" }
        ] }
      ]
    },
    {
      "title": "EPiSODE 1",
      "tab": null,
      "tags": [],
      "episodes": false,
      "lines": [
        { "title": "720p", "file": null, "tags": [], "links": [
          { "name": "links/aHR0cHM6Ly9odWJkcml2ZS5iYXIvZmlsZS8x...", "url": "https://hubdrive.bar/file/1...", "label": "Drive", "host": "hubdrive" },
          { "name": "links/aHR0cHM6Ly9odWJjZG4uY2x1Yi9maWxlL2Nk...", "url": "https://hubcdn.club/file/cd...", "label": "Instant", "host": "hubcdn" },
          { "name": "links/aHR0cHM6Ly9oZHN0cmVhbTR1LmNvbS9maWxl...", "url": "https://hdstream4u.com/file/...", "label": "WATCH", "host": "hdstream4u" }
        ] },
        { "title": "1080p", "links": ["..."] }
      ]
    }
  ]
}
```

The engine's `post` and `sections`; `publishedAt` is `publishTime` (AIP-142). A post the site moved
is named by the URL it answered at. The links come with the post: its screen shows both.

`sections` are the post's download links, grouped as its site groups them, in page order:

| | HDHub4u | 4KHDHub |
|---|---|---|
| A section | a heading without links: `: DOWNLOAD LINKS :`, `EPiSODE 1` | `Download Links`, `Download Complete Season`, a season's episodes (`S01 AVC 1080p WEB-DL H264`) |
| A line | a heading with buttons: `720p – Drive \| Instant \| WATCH` | a block, titled by its file: `Episode-01 4.01 GB` |
| A link | a button: `Drive`, `WATCH-2` | `Download HubDrive`, `Download HubCloud` |

- A section's `title` is the site's, as it writes it; null where it gives none (a link before any
  heading). A line's `title` is what it names (`720p`, a file); a button alone in its heading
  (`720p x264 [850MB]`) is a line of that title and one link of that label; a line of buttons only
  (`EPiSODE 1 | WATCH`) has none. Every section has a line, and every line a link.
- What a site states beyond it, by its page's classes, is there too, and null or `[]` where it
  states none (HDHub4u): a section's `tab`, the label of the site's tab it is in (4KHDHub: `Zip/Pack`,
  `Single EP's`), its `tags` (`Episodes 4`, `English, Swedish`), and `episodes`, whether it is a
  season's group of episodes, one line each (4KHDHub's `.season-item`); a line's `file`, its file's name
  (`Fallen.S01E01.Sword.and.Cross.1080p…mkv`), and its `tags`, its badges as the site gives them
  (`24.26 GB`, `English`, `WEB-DL`; an episode's size, `3.35 GB`). What each tag is, is not read.
- A link is `{ name, url, label, host }` here as on every answer (GetLink's pages too): `label`, its
  button's text; `host`, the site it is on: the engine's id of its gateway or host (`hubdrive`), or
  the hostname of one it does not know (`sugarke.com`), never null. A link that is no web URL (a magnet) has no
  name, so it is left out, as is a line or a section left without links.
- The grouping is read from the page's structure, never from words: on HDHub4u an episode, a note
  (`[HINDI – TAMIL – TELUGU]`) and a film of a collection are sections alike. A paragraph titles
  nothing (the post's prose), but for one set apart as a heading: all bold, without links, alone
  between two `<hr>` (`| BONUS EPiSODES |`, `New Episodes Every Week`; live, 2026-11-03: 5 of 261
  posts).
- They are every download link, whatever gateway or host it leads to, so a host the engine has no
  extractor for loses no link: GetLink answers it `external`, and the user opens it in the browser.
  The site's own links are left out (HDHub4u's promo, genres, screenshots and "[How To Download]"),
  read by where they are, not by what they say: a link in a sentence or the info box. A link alone
  in its paragraph is a server, as the 2017–18 posts give theirs (`Openload.co`, `Torrent Link`),
  and is in its post's sections as the site shows it (live, 2026-11-02: 296 posts, 79 with such
  links, all servers).

### GetLink

What a link opens, past the pages that lead to one place: GreenMotors (decoded), then a HubDrive
file page; V-Cloud's older link page. The engine says which pages those are (`expand` gives no `sections` for them), and each
is followed to its first link the engine resolves (a HubDrive file page's HubCloud server, wherever
the page puts it), or else its first (a file on Telegram only); a page without links is HTTP 404,
and a link through more than three gateway pages, 502 `unrecognized`. Then, by the page it reaches,
one of four `kind`s:

| Reaches | `kind` | Its fields |
|---|---|---|
| HUBLinks, a HubDrive pack, NexDrive (any gateway page where the user chooses: the engine gives its `sections`) | `files` | `title`: what the page calls itself, as it is (HUBLinks: its `<title>`, `Lupin.S04E01 – HUBLinks`; a pack: its header's name, `Lupin - S04 1080p WEB-DL Packs`), or null; `tags`: what the page states of itself, as it gives it (a pack: `Includes 9 files`, `Total Size: 23.61 GB`; HUBLinks: none); `sections`: its groups, each `{ title, lines }`, a line `{ title, tags, links }` (`tags`: what the page states of the line's file beside it, a pack's `3.1 GB`), a link as on GetPost; every web link, as the page orders them (HUBLinks: groups split by `<hr>`; a pack: one group, a line per file); each is a link, read by GetLink again |
| A file on HubCloud, HubCDN, V-Cloud, FastDL or VegaDrive | `file` | `filename`: the file's own name, as its host states it; `sizeBytes`, `downloads` (`resolve`) |
| A post of a site the API reads (HDHub4u's link to the title's post on 4KHDHub) | `post` | `post`: the post's name, read by GetPost |
| A file on another host, or a site the engine does not know | `external` | the page the user opens there |

Every kind but `post` also has `url`, the page the link opens on its site (its source:
`https://hblinks.lol/archives/120993`), and `host`, that site, by the same rule as a link's
(`hblinks`, `streamtape`, `example.com`). A page of files names itself `title`, which is what its
site calls the page; a file names itself `filename`, which is the file's.

```http
GET /v1/links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...Wmc5
```
```json
{
  "name": "links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...Wmc5",
  "kind": "files",
  "host": "hblinks",
  "url": "https://hblinks.lol/archives/120993",
  "title": "Make.Me.Tingle.S01E01 – HUBLinks",
  "sections": [
    {
      "title": null,
      "lines": [
        { "title": "480p", "links": [
          { "name": "links/aHR0cHM6Ly9odWJkcml2ZS5iYXIvZmlsZS81NzgyNDg0Mzc5", "url": "https://hubdrive.bar/file/5782484379", "label": "Drive", "host": "hubdrive" },
          { "name": "links/aHR0cHM6Ly9odWJjZG4ud2lraS9maWxlLy4uLg", "url": "https://hubcdn.wiki/file/...", "label": "Instant", "host": "hubcdn" }
        ] }
      ]
    },
    { "title": "Watch Online", "lines": [{ "title": null, "links": ["..."] }] }
  ]
}
```

```http
GET /v1/links/aHR0cHM6Ly9odWJkcml2ZS5iYXIvZmlsZS81NzgyNDg0Mzc5
```
```json
{
  "name": "links/aHR0cHM6Ly9odWJkcml2ZS5iYXIvZmlsZS81NzgyNDg0Mzc5",
  "kind": "file",
  "host": "hubcloud",
  "url": "https://hubcloud.ist/drive/xukqlp6jbsf8wja",
  "filename": "Wrong.Turn.2003.720p.BluRay.Hindi.English.DD5.1.x264.ESubs.mkv",
  "sizeBytes": 890922598,
  "downloads": [
    { "server": "pixeldrain", "kind": "page", "url": "https://pixeldrain.dev/u/ZT863Edf", "label": "Download [PixelServer : 2]" },
    { "server": "fsl", "kind": "direct", "url": "https://...r2.cloudflarestorage.com/...", "label": "Download [FSL Server]" },
    { "server": "10gbps", "kind": "direct", "url": "https://video-downloads.googleusercontent.com/...", "label": "Download [Server : 10Gbps]" }
  ]
}
```

```json
{ "name": "links/aHR0cHM6Ly9zdGFwZS5mdW4vdi8uLi4", "kind": "external", "host": "streamtape", "url": "https://stape.fun/v/..." }
```

A `files` label is the page's (`Drive`, under its line `480p`; a pack's `Lupin.S04E01....mkv`, its size its line's tag); a file's
own name and size come when it is opened. A HubCDN or FastDL file's `filename` and `sizeBytes` are
null when its storage did not state them.

### Errors

RFC 9457, with the cause as the extension `code`:

```json
{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "4KHDHub says the post does not exist", "code": "notFound" }
```

| Cause | Status | `code` |
|---|---|---|
| The site said it is gone; no such site or route | 404 | `notFound` |
| A name, `pageToken` or `q` the API cannot read | 400 (414 for a name over 2048 characters) | `invalidArgument` |
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
by hand. The API (`src/domains.js`) reads the repo's raw `domains.json` once, at start, and
makes its engine with them. The host starts the API on every deploy, and again after a few idle
minutes ([Deploy](#deploy)), so new domains reach it then; a site that moved still answers on its
old domain meanwhile, while it redirects.

When GitHub does not answer, or gives domains that cannot be used (no domain for one of
`FALLBACK_DOMAINS`' labels, a domain with a path), the API starts with `FALLBACK_DOMAINS`, those
of 2026-11-03, and logs why. Every label the engine reads is one of them (the four sites, and
every gateway and host it opens: NexDrive, V-Cloud, FastDL and VegaDrive too), so a new label goes
into moviehawk-domains' `domains.json` before the API that needs it is deployed.

### Relay

V-Cloud's Cloudflare answers datacenters HTTP 403. With its base URL as Referer and the cookie
`xla=sod` (which the engine sends it), it answers Wasmer, but never Vercel (live, 2026-11-03: 3 of 3
files each way; without them, Wasmer 403 too). So the API on Wasmer relays V-Cloud's pages for the
API on Vercel (`src/relay.js`):

- `GET /v1/relay?url=<a V-Cloud URL>` (and HEAD) reads the URL, following redirects, with the
  request's User-Agent, Accept, Referer and Cookie, and answers as V-Cloud did: its status,
  Content-Type and body, and `X-Relay-URL`, where it ended. Any other URL is HTTP 400: the relay is
  open, and reads V-Cloud only. Nothing is kept.
- On Vercel (`VERCEL` set), the engine's `fetch` sends V-Cloud's requests to the relay at
  `https://moviehawk.wasmer.app`, every other one as it is; `RELAY_URL` names another relay, or
  `""` none. Elsewhere (Wasmer, a machine) the API reads V-Cloud itself. A V-Cloud file takes 1 to 2 s
  more on Vercel.

### Cache

Each route's answer is kept in memory (`src/cache.js`, `lru-cache`, 500 answers at most), by
what the request asks (its route, its names, and the query the route reads, in any order: a query
it does not read is dropped), for as long as it stays true:

| Route | Kept | Why |
|---|---|---|
| ListPosts | 5 min | new posts come often |
| SearchPosts | 10 min | |
| GetPost | 15 min | a site adds links to a post (a series' new episodes) |
| GetLink, `files` or `external` | 1 hour | where a link leads hardly changes |
| GetLink, `file` | 5 min | its downloads expire, but not within 5 minutes (Vegadrop's too: 20 minutes on, live) |

A repeat answers without reading the sites. Errors are not kept: the next request tries again.
`Cache-Control: public, max-age=<seconds left>` lets the client keep an answer as long. Each
running copy of the API has its own cache; two requests at once for one URL both read the site.

### Deploy

**Vercel**, at https://moviehawk.vercel.app (project `moviehawk`, Hobby): the `main` branch
of [moviehawk](https://github.com/ElonMuskOfficial/moviehawk) through Vercel's GitHub integration,
every push deployed. Vercel's Fastify preset finds `src/server.js` (an entrypoint that imports
Fastify) and serves its default export as one Vercel Function, in the region the project's
settings name. Each instance starts the app once and has its own cache; Vercel stops it when
traffic stops. A client that disconnects does not end its request there: the API reads on, 30 s
at most. HubCDN answers HTTP 429 to many requests at once from Vercel (live, 2026-11-02); one at a
time they pass.

**Wasmer Edge**, at https://moviehawk.wasmer.app, deployed from `main` too while it stays: its
start command `npm start`, the API on its defaults, 127.0.0.1:3000, where Wasmer's proxy reaches
it. Wasmer stops an instance idle for about 3 minutes, which empties its cache.

### Departures from AIP

- **Search is `GET /v1/sites/{site}/search?q=`**, not AIP-136's `posts:search?query=`: the common
  form (GitHub, and the sites' own `?s=`).
- **`links` are top-level, not under their post**: a link is read from its URL alone. Under its
  post, every link request would read the post again, and break when the site edits it.
- **GetLink's answer has a `kind`**, one of three shapes: a link is the page the user would see
  next, and that is a list of files, a file, or another site's page.
- **No Get or List for every resource** (AIP-121): only the routes a consumer uses.
- **`pageToken` is the site's page number**, not an opaque token (AIP-158): the sites number their
  pages, and nothing else finds a page. Clients still only pass back the `nextPageToken` given.
- **No `pageSize`**: the sites fix it (HDHub4u 85 on its first page, then 15; 4KHDHub 18;
  Vegamovies 18, RogMovies 20, 21 on their first page).
- **GetLink's `files` have no pagination**: a page lists a few (the most seen was 25, a pack's).
- **Errors are RFC 9457, not AIP-193**, which is made for gRPC.

## The sites

| Site | Engine | Listing | A page after the last | Search |
|---|---|---|---|---|
| HDHub4u | read | `/page/<n>/`, `ul.recent-movies`; 85 posts on page 1, then 15 | HTTP 404 | a Typesense API (`search.pingora.fyi`), 15 a page |
| 4KHDHub | read | `/page/<n>/`, `.card-grid`; 18 | answers as its last page; the engine makes it `notFound` | `/page/<n>/?s=<q>`, 18 a page |
| Vegamovies (`vegamovies.lease`) | read | `/page/<n>/`, `.movies-grid`; 21 on page 1, then 18 | HTTP 404 | `/ts-search.php?q=&page=` (Typesense), 15 a page |
| RogMovies (`rogmovies.im`) | read | as Vegamovies; 21, then 20 | HTTP 404 | as Vegamovies |

- 4KHDHub finds a post by the number at the end of its URL and ignores the slug, but needs one.
  It states no publication date or IMDb id. A series' title states no year, on both sites; HDHub4u
  posts from before 2022 write it without brackets (`The Jackal 1997 Hindi ...`), and the engine
  reads none from them. Those old posts mostly link hosts that are gone (Openload, ClickNupload):
  their links give no files.
- Vegamovies and RogMovies are two sites of one WordPress theme (`vegamoviesofficial`,
  `rogmoviesofficial`), read by one provider (`providers/vegamovies.js`), each under its own id
  (live, 2026-11-03: 168 posts of 2020 to 2026 across both catalogs, Vegamovies' 785 listing
  pages and RogMovies' 397, the same structure on each). A post's title is `h1.post-title`, its
  body `main.page-body`, its date `.post-date time[datetime]`, its poster `og:image`: on the
  site's image proxy (`img.vegamovies.lease`, `img.rogmovies.im`), which no longer resolves, the
  proxy's `u`, base64 of the image's TMDB URL. Their JSON-LD differs (Vegamovies' date is its
  `Movie`'s `dateCreated`, RogMovies' its `datePublished`), and is not read. Vegamovies' cards
  load their images late, from `data-src`. Their `/?s=` goes to `/search.html`, whose script asks
  `/ts-search.php`. Every download button of the 168 posts (590) leads to NexDrive.
- Some posts link hosts that are gone: vegadrive.xyz (2020–21, not VegaDrive), RogMovies.art.

## Not decided yet

- **Rate limit**: none: the API is for personal use. Each GetLink to a file sends 2 to 5
  requests to the sites; a limit by IP (`@fastify/rate-limit`, 429 with `Retry-After`) if others use it.
- **Access**: open, without a key, for now.
- **Load on the sites**: the engine sets no limit on requests at once, as no site has answered 429
  or stalled. When one does, retrying after its `Retry-After` is added then; nothing before.
- **The other consumers**: the crawler and the bot (in moviehawk-bot) move to the engine after the
  API, as clients of the API.
