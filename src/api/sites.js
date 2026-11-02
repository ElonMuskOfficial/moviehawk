/**
 * The sites and their posts (README.md, The API): ListSites, ListPosts, SearchPosts, GetPost.
 */
import { queryOf } from './cache.js';
import { linkName, postName, postUrl } from './names.js';
import { ProblemError } from './problems.js';

// The sites the engine reads posts of. Vegamovies and RogMovies come with their provider.
export const SITES = ['hdhub4u', '4khdhub'];

// A page number, as the API gives it in nextPageToken: from 1. At most 15 digits, which Number()
// reads exactly: a 400-digit one is Infinity, which the engine rejects with a TypeError (a 500).
const pageToken = { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 15 };

// A query with text: the engine rejects one of spaces only with a TypeError (a 500).
const q = { type: 'string', pattern: '\\S' };

// Every segment of a name is at least 1 character: "/v1/sites/hdhub4u/posts/" is no post, and
// would read the site's home page as one.
const segment = { type: 'string', minLength: 1 };
const siteParams = { type: 'object', required: ['site'], properties: { site: segment } };
const postParams = { type: 'object', required: ['site', 'post'], properties: { site: segment, post: segment } };

const postCard = {
  type: 'object',
  required: ['name', 'title', 'posterUrl'],
  properties: {
    name: { type: 'string' },
    title: { type: 'string' },
    posterUrl: { type: ['string', 'null'] },
  },
};

const postPage = {
  type: 'object',
  required: ['posts'],
  properties: {
    posts: { type: 'array', items: postCard },
    nextPageToken: { type: 'string' }, // absent on the last page
  },
};

const fullPost = {
  type: 'object',
  required: ['name', 'url', 'title', 'year', 'imdbId', 'posterUrl', 'publishTime', 'sections'],
  properties: {
    name: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string' },
    year: { type: ['integer', 'null'] },
    imdbId: { type: ['string', 'null'] },
    posterUrl: { type: ['string', 'null'] },
    publishTime: { type: ['string', 'null'], format: 'date-time' },
    // The site's sections of the post's download links: each a title and lines of buttons.
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'lines'],
        properties: {
          title: { type: ['string', 'null'] },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'links'],
              properties: {
                title: { type: ['string', 'null'] },
                links: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'label'],
                    properties: { name: { type: 'string' }, label: { type: ['string', 'null'] } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const siteList = {
  type: 'object',
  required: ['sites'],
  properties: { sites: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
};

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ engine: ReturnType<typeof import('../engine/index.js').createEngine>, domains: Record<string, string>, cached: ReturnType<typeof import('./cache.js').createCache> }} options
 *   `domains`: each site's current domain. `cached`: the app's cache.
 */
export async function sitesRoutes(app, { engine, domains, cached }) {
  // The site a request names, and its current domain.
  const siteOf = (request) => {
    const { site } = request.params;
    if (!SITES.includes(site)) throw new ProblemError(404, 'notFound', `No site ${site}`);
    return { site, siteUrl: domains[site] };
  };

  // The engine's { posts, hasNextPage } as a page of the API.
  const pageOf = (site, page, { posts, hasNextPage }) => ({
    posts: posts.map(({ url, title, posterUrl }) => ({ name: postName(site, url), title, posterUrl })),
    ...(hasNextPage && { nextPageToken: String(page + 1) }),
  });

  app.get('/v1/sites', {
    schema: { response: { 200: siteList } },
  }, () => ({ sites: SITES.map((site) => ({ name: `sites/${site}` })) }));

  app.get('/v1/sites/:site/posts', {
    schema: {
      params: siteParams,
      querystring: queryOf({ pageToken }),
      response: { 200: postPage },
    },
  }, async (request, reply) => {
    const { site, siteUrl } = siteOf(request);
    const page = Number(request.query.pageToken ?? 1);
    // New posts come often.
    return cached(request, reply, 5 * 60_000, async () => pageOf(site, page, await engine.scrapeListing(siteUrl, page, { signal: request.signal })));
  });

  app.get('/v1/sites/:site/search', {
    schema: {
      params: siteParams,
      querystring: queryOf({ q, pageToken }, ['q']),
      response: { 200: postPage },
    },
  }, async (request, reply) => {
    const { site, siteUrl } = siteOf(request);
    const page = Number(request.query.pageToken ?? 1);
    return cached(request, reply, 10 * 60_000, async () => pageOf(site, page, await engine.searchPosts(siteUrl, request.query.q, page, { signal: request.signal })));
  });

  app.get('/v1/sites/:site/posts/:post', {
    schema: { params: postParams, querystring: queryOf(), response: { 200: fullPost } },
  }, async (request, reply) => {
    const { site, siteUrl } = siteOf(request);
    // A site adds links to a post (a series' new episodes).
    return cached(request, reply, 15 * 60_000, async () => {
      const { post, sections } = await engine.scrapePost(postUrl(siteUrl, request.params.post), { signal: request.signal });
      return {
        // From the URL the site answered at: a post the site renamed is named by its new slug.
        name: postName(site, post.url),
        url: post.url,
        title: post.title,
        year: post.year,
        imdbId: post.imdbId,
        posterUrl: post.posterUrl,
        publishTime: post.publishedAt,
        sections: sections.map(({ title, lines }) => ({
          title,
          lines: lines.map((line) => ({ title: line.title, links: line.links.map(({ url, label }) => ({ name: linkName(url), label })) })),
        })),
      };
    });
  });
}
