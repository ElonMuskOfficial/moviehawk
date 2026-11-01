# API

**Status:** being built on the branch `engine`, piece by piece, as the engine was: pieces 1 and 2
are done (the server, without its routes over the engine yet).

```bash
npm run api                          # http://127.0.0.1:3000
PORT=8080 HOST=0.0.0.0 npm run api
```

A read-only HTTP API over the engine (`docs/engine.md`) for web and mobile apps. Each request reads
the live sites through the engine: there is no database.

## Standards

| What | Follows |
|---|---|
| Resources, names, JSON | [Google AIP](https://google.aip.dev), as a guide: where a rule would make the API harder to use and prevents no failure, the API takes the common industry form instead |
| HTTP methods, status codes, headers | RFC 9110; caching RFC 9111 |
| Errors | RFC 9457 (`application/problem+json`) |
| The contract | OpenAPI 3.1, made from the routes' schemas (`@fastify/swagger`) |

Node, [Fastify](https://fastify.dev) 5. JSON is camelCase, as AIP's JSON and the engine are. Where
the API departs from AIP is in [Departures from AIP](#departures-from-aip), with its reason.

## Routes

Each route is one engine function, and reads only what that function reads.

| HTTP | Engine | Requests to the sites |
|---|---|---|
| `GET /v1/sites` | (the API's config) | 0 |
| `GET /v1/sites/{site}/posts?pageToken=` | `scrapeListing` | 1 |
| `GET /v1/sites/{site}/search?q=&pageToken=` | `searchPosts` | 1 |
| `GET /v1/sites/{site}/posts/{post}` | `scrapePost` | 1 |
| `GET /v1/links/{link}/files` | `scrapeLinks([url])` | 1 to 3 |
| `GET /v1/files/{file}` | `resolve` | 2 or 3 |

## Names

Every resource has a `name` (AIP-122): the path that reads it, without `/v1/`.

```
sites/hdhub4u
sites/4khdhub/posts/ali-g-who-iz-i-movie-8435
links/aHR0cHM6Ly9ncmVlbm1vdG9ycy5jbHViLz9pZD1jVWs0...
files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph
```

- `{site}`: the engine's `provider`: `hdhub4u`, `4khdhub`; `vegamovies`, `rogmovies` when the
  engine reads them.
- `{post}`: the one segment of the post's path on its site, so a post's name works on any of its
  site's domains. `/akka-season-1-hindi-webrip-full-series/` is
  `akka-season-1-hindi-webrip-full-series`. Not the number alone on 4KHDHub: `/8435/` is HTTP 404
  there, `/ali-g-who-iz-i-movie-8435/` is the post. Live (2026-11-01): every post path of the
  four sites is one segment (HDHub4u's 14,288 and 4KHDHub's 7,136 known posts; 76 posts of
  Vegamovies' and RogMovies' listing pages), and the URL made back from it opens the post (25 of
  25 on each of the first two, 4 of 4 on the others).
- A few slugs are not plain ASCII: HDHub4u's `wall%c2%b7e-2008-hindi-bluray-full-movie` (WALL·E),
  `jung_e-2023-hindi-webrip-full-movie`. The router decodes `{post}`; the API encodes it again to
  make the URL (`wall%C2%B7e-...`), which opens the post too (live, 2026-11-01).
- `{link}`, `{file}`: the link's or the file's URL, base64url-encoded (RFC 4648 §5). The client
  takes them from GetPost and ListFiles and never makes or reads one. The API reads the URL back
  from the name, so no request goes to the post again, and a link keeps working when the site
  edits the post. The URL is the one the page gives; the engine moves it to the site's current
  domain when it reads it.
- Every link of a post has the same URL each time the page is read (live, 2026-11-01: 29 links
  of 3 HDHub4u and 4KHDHub posts, and 4 posts each of Vegamovies and RogMovies, read twice).
- A name decodes only to a URL the engine reads: one on a gateway or host it knows. Any other URL
  is HTTP 400; the engine requests nothing for it.
- Names are long: a GreenMotors link is up to 540 characters (median 231; 4KHDHub's 199),
  Vegamovies' and RogMovies' NexDrive links under 150, a HubCloud file 56. HDHub4u slugs are up
  to 143 characters (90 over 100). Fastify's `maxParamLength` (100 by default) is set to 2048, or
  those would be HTTP 404.

## Methods

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

A post in a list has only what the site's card says: `name`, `title`, `posterUrl`. `nextPageToken`
is absent on the last page. A `pageToken` after the last page is HTTP 404; a search that matches
nothing is `posts: []`.

Search is its own route, as GitHub's (`/search/repositories?q=`), not a `filter` on the list: the
site's search decides what matches and in what order. Each site searches its own way, all by
page number (live, 2026-11-01):

| Site | Its search | Page size |
|---|---|---|
| HDHub4u | a Typesense API, `search.pingora.fyi` | 15 |
| 4KHDHub | its search page, `/page/<n>/?s=<q>` | 18 |
| Vegamovies, RogMovies | a Typesense API on the site, `/ts-search.php?q=&page=` (their `/?s=` goes to an empty page whose script calls it) | 15 |

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

The engine's `post` and `links`. `publishedAt` is `publishTime` (AIP-142: a timestamp's field ends
in `Time`). The links come with the post: the post's screen shows both, from one request.

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
      "label": "[HubCloud Server]"
    },
    {
      "name": "files/aHR0cHM6Ly9uZXcyLm11bHRpY2xvdWRsaW5rcy5jb20vdmlldy9jOHk1ZTI",
      "host": "multicloudlinks",
      "label": null
    }
  ],
  "failures": []
}
```

Wrong Turn's 720p link, live on 2026-11-01: GreenMotors → HUBLinks → HubCloud and MultiCloudLinks
(and HubDrive → the same HubCloud file, given once). Every host's file has a name, the same in
every post that links it.

A link that leads nowhere the engine knows is `files: []`, not an error. `failures` are the pages
on the way that failed, each `{ code, url, detail }` (a HubDrive file that is gone:
`{ "code": "notFound", "url": "https://hubdrive.bar/file/1997118795", "detail": "HubDrive says the
file is gone" }`); the link still answers HTTP 200 with the files it reached.

### GetFile

```http
GET /v1/files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph
```
```json
{
  "name": "files/aHR0cHM6Ly9odWJjbG91ZC5pc3QvZHJpdmUveHVrcWxwNmpic2Y4d2ph",
  "host": "hubcloud",
  "filename": "Wrong.Turn.2003.720p.BluRay.Hindi.English.DD5.1.x264.ESubs.mkv",
  "sizeBytes": 890922598,
  "downloads": [
    { "server": "pixeldrain", "kind": "page", "url": "https://pixeldrain.dev/u/negn6f", "label": "Download [PixelServer : 2]" },
    { "server": "fsl", "kind": "direct", "url": "https://...r2.cloudflarestorage.com/...", "label": "Download [FSL Server]" },
    { "server": "10gbps", "kind": "direct", "url": "https://video-downloads.googleusercontent.com/...", "label": "Download [Server : 10Gbps]" }
  ]
}
```

The same file, live on 2026-11-01 (its Buzz, Watch Online and Telegram downloads left out here).
`downloads` expire within minutes or hours. Only HubCloud's files are resolved; any other host's
is HTTP 400 `unsupported`, until the engine resolves it.

## Errors

RFC 9457, with the engine's code as the extension `code`:

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json
```
```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "4KHDHub says the post does not exist",
  "code": "notFound"
}
```

| Cause | Status | `code` |
|---|---|---|
| The site said it is gone | 404 | `notFound` |
| A name or `pageToken` the API cannot read | 400 | `invalidArgument` |
| A URL no site or host of the engine handles | 400 | `unsupported` |
| The site's page could not be read (a changed layout, a challenge page) | 502 | `unrecognized` |
| The site did not answer (timeout, network error, its 5xx or 429) | 504 | `transient` |

## Headers

- `Request-Id` on every response, to name a request in a bug report (RFC 6648: no `X-`).
- `Cache-Control` on every response, by route: decided with the cache.

## Departures from AIP

- **Search is `GET /v1/sites/{site}/search?q=`**, not AIP-136's `posts:search?query=`: the common
  form (GitHub, and the sites' own `?s=`), read without knowing AIP.
- **`links` and `files` are top-level, not under their post** (AIP-122's hierarchy): a link is
  read from its URL alone, and one file linked from two posts is one file. Under its post, every
  file request would read the post again (1 request more), and break when the site edits it.
- **No Get or List for every resource** (AIP-121): only the routes a consumer uses. A link is
  read in its post; HubCloud cannot list its files.
- **`pageToken` is the site's page number.** AIP-158 wants an opaque token. The sites number their
  pages, and nothing else can find a page. Clients still only pass back the `nextPageToken` they
  were given.
- **No `pageSize`.** The sites fix the size (HDHub4u 85 on its first page, then 15; 4KHDHub 18;
  live, 2026-11-01), and the API returns a page as the site gives it.
- **ListFiles has no pagination.** A link leads to a few files (live, 2026-11-01: 2,135 of 2,495
  links of 60 posts led to 1, the most was 25, a pack's), and the engine gives them at once.
- **`failures` in ListFiles.** Like AIP-217's `unreachable`, but each says why (`code`, `detail`),
  as the engine does.
- **Errors are RFC 9457, not AIP-193.** AIP-193 is `google.rpc.Status`, made for gRPC; RFC 9457 is
  the HTTP standard.

## Vegamovies and RogMovies

They come with the engine's provider, NexDrive and VCloud (`docs/engine.md`); the API then adds
only their names to ListSites. What was checked for them (live, 2026-11-01, on
`new1.vegamovies.lease` and `rogmovies.im`):

- Posts are `/download-<slug>/`, one segment of `[a-z0-9-]`; the URL made from the name opens the
  post.
- Listing pages are `/page/<n>/` (18 to 22 posts), and a page after the last is HTTP 404, as on
  HDHub4u.
- Search: `/ts-search.php?q=&page=`, 15 a page; `found` gives the count of matches.
- A post's links are NexDrive pages (`nexdrive.beer/...`), under 150 characters, the same on
  every read. `vglist.lol` on every page is the site's own banner, not a link to a file.

## Not decided yet

- **Cache:** what is cached, for how long, and where (in memory or Redis). Its own piece.
- **Rate limit:** each GetFile sends 2 or 3 requests to HubCloud. Its own piece, before the API
  is public.
- **Access:** open, without a key.
- **The domains:** where the API reads the sites' current domains from.
- **Deploy:** where it runs.

## Plan

Each piece: an example first, then the code and its tests, one commit.

1. This document, approved.
2. The server: Fastify, `maxParamLength`, `Request-Id`, the error mapping, OpenAPI at
   `/v1/openapi.json`.
3. ListSites, ListPosts, SearchPosts.
4. GetPost: a post's name to its URL and back; a link's name.
5. ListFiles, GetFile.
6. Cache.
7. Rate limit.
8. Live check: the engine's sweep, through the API.
9. Deploy.
