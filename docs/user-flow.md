# User flow

The steps a consumer's user goes through, from finding a post to a download, and the engine
function behind each. As the engine does it on the branch `engine`, measured on live pages
(2026-10-31).

## The site, in layers

```
 Listing / search      Post              Gateways (0 to 3 in a row)            Host
┌────────────────┐   ┌────────────┐   ┌─────────────┐  ┌──────────┐  ┌──────────┐   ┌──────────┐
│ /page/2/       │─▶ │ post page  │─▶ │ GreenMotors │─▶│ HUBLinks │─▶│ HubDrive │─▶ │ HubCloud │
│ /?s=dexter     │   │ its links  │   └─────────────┘  └──────────┘  └──────────┘   └──────────┘
└────────────────┘   └────────────┘
```

A link can skip gateways: 4KHDHub's HubCloud button is GreenMotors → HubCloud. Other hosts
(HubCDN's "Instant", GoFile, the players) are found the same way, but only HubCloud is resolved.

## The steps

```
┌────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│ 0. FIND            │    │ 1. POST              │    │ 2. FILES             │    │ 3. DOWNLOAD          │
│                    │    │                      │    │                      │    │                      │
│ [poster] Akka      │ ─▶ │ Akka (Season 1) ...  │ ─▶ │ hubcloud             │ ─▶ │ Akka.S01.720p...zip  │
│ [poster] Wrong Turn│    │ [480p x264 [660MB]]  │    │   [HubCloud Server]  │    │ 1.05 GB              │
│ next page ▶        │    │ [720p HEVC [1GB]]    │    │                      │    │ [FSLv2] [FSL]        │
│                    │    │ [1080p x264 [3.6GB]] │    │                      │    │ [PixelDrain] [Buzz]  │
└────────────────────┘    └──────────────────────┘    └──────────────────────┘    └──────────────────────┘
 scrapeListing /           scrapePost                  scrapeLinks([link.url])     resolve(file.url)
 searchPosts               1 request, 0.6 to 1.3 s     1 to 3 pages, 1 to 2 s      2 or 3 requests, 3 to 10 s
 1 request
```

0. **Find**: `scrapeListing(siteUrl, page)` or `searchPosts(siteUrl, query, page)` give
   `{ posts, hasNextPage }`: each post's card, `{ url, title, posterUrl }`, as many as the site's
   page has. The next page is `page + 1` while `hasNextPage`; a page after the last is `notFound`.
1. **Post**: `scrapePost(post.url)` gives `{ post, links }`. `post` is
   `{ provider, url, title, year, imdbId, posterUrl, publishedAt }`; `links` are its links to a
   gateway or a known host, in page order, each `{ url, label }` with its label as the page
   writes it.
2. **Files**: `scrapeLinks([link.url])` follows the link the user picked through its gateways and
   gives `{ files, failures }`. A file is `{ host, externalId, url, label }`, each once. Its
   `label` is the first one on its way: HUBLinks' `480p · Drive`, HubDrive's `[HubCloud Server]`,
   or null when no page on the way says anything (4KHDHub's GreenMotors → HubCloud). The label of
   the post's link is the consumer's: it picked the link. A file's name and size are not known
   yet; they come with `resolve`.
3. **Download**: `resolve(file.url)`, for a HubCloud file, gives
   `{ filename, sizeBytes, downloads }`; each download is `{ server, kind, url, label }`, `kind`
   `direct` (the file itself) or `page` (a page that leads to it). It takes 10 s when 10Gbps's
   redirects are slow (Wrong Turn's 720p), about 3 s otherwise. Downloads expire within minutes or
   hours, so this step is always live.

Whether screen 2 is shown when a link leads to one file is the consumer's choice: the engine gives
the files, the consumer the screens.

## The links, by kind of post

The labels the engine gives, from live posts:

| Post | A link's label (step 1) | Its files (step 2) |
|---|---|---|
| HDHub4u movie (Wrong Turn) | `720p x264 [850MB]` | HubCloud `[HubCloud Server]`, a MultiCloudLinks player |
| HDHub4u series, packs (Akka) | `720p HEVC [1GB]` | HubCloud `[HubCloud Server]`: the season's zip |
| HDHub4u series, episode lines | `EPiSODE 1 720p · Drive`, `EPiSODE 1 720p · Instant`, `EPiSODE 1 · WATCH` | the episode's file, or its player |
| HDHub4u link to a HUBLinks page of lines (`hblinks.lol/archives/121857`) | the button's own text | `480p · Drive`, `480p · Instant`, ..., `1080p WEB-DL [4.1GB]` |
| 4KHDHub movie or pack | `<the block's file> · Download HubCloud`, `... · Download HubDrive` | one HubCloud file: both buttons lead to it |
| 4KHDHub episode | `S02 1080p WEB-DL H264 Episode-01 4.01 GB · Download HubCloud` | the episode's HubCloud file |

`<the block's file>` is its header as 4KHDHub writes it: `A Story of Derry (1080p WEB-DL H264)
1.78 GB English WEB-DL`.

## Not in the engine yet

- `resolve` reads HubCloud only. HubCDN, GoFile and the players are found by `scrapeLinks`; for
  their files `resolve` is `unsupported`.
- Vegamovies and RogMovies (NexDrive, VCloud) come later.
