/**
 * What every provider's post page gives. The list of providers comes here in piece 8, when
 * scrapePost uses it.
 */

/**
 * @typedef {{ provider: string, url: string, title: string, year: number | null,
 *   imdbId: string | null, posterUrl: string | null, publishedAt: string | null }} Post
 *   `url`: the post's address after redirects; `publishedAt`: ISO 8601, UTC.
 */

/**
 * @typedef {{ url: string, statedLanguages: string | null }} PostLink
 *   `statedLanguages`: the languages the post states for the link, as written ("Hindi, English").
 */

export {};
