/**
 * The sites and their posts (docs/api.md): ListSites, ListPosts, SearchPosts, GetPost.
 */
import { linkName, postName, postUrl } from './names.js';
import { ProblemError } from './problems.js';

// The sites the engine reads posts of. Vegamovies and RogMovies come with their provider.
export const SITES = ['hdhub4u', '4khdhub'];

// A page number, as the API gives it in nextPageToken: from 1. At most 6 digits (the sites have
// under 1,000 pages): a longer one would be read as 1e+21 and make a wrong URL.
const pageToken = { type: 'string', pattern: '^[1-9][0-9]{0,5}$', description: 'The nextPageToken of the page before' };

const postCard = {
  type: 'object',
  required: ['name', 'title', 'posterUrl'],
  properties: {
    name: { type: 'string', examples: ['sites/hdhub4u/posts/akka-season-1-hindi-webrip-full-series'] },
    title: { type: 'string' },
    posterUrl: { type: ['string', 'null'] },
  },
};

const postPage = {
  type: 'object',
  required: ['posts'],
  properties: {
    posts: { type: 'array', items: postCard },
    nextPageToken: { type: 'string', description: 'Absent on the last page' },
  },
};

const siteParams = {
  type: 'object',
  required: ['site'],
  properties: { site: { type: 'string', examples: SITES } },
};

const nullable = (type) => ({ type: [type, 'null'] });

const post = {
  type: 'object',
  required: ['name', 'url', 'title', 'year', 'imdbId', 'posterUrl', 'publishTime', 'links'],
  properties: {
    name: { type: 'string', examples: ['sites/hdhub4u/posts/wrong-turn-2003-hindi-bluray-full-movie'] },
    url: { type: 'string', description: 'The post on its site' },
    title: { type: 'string' },
    year: nullable('integer'),
    imdbId: nullable('string'),
    posterUrl: nullable('string'),
    publishTime: { ...nullable('string'), format: 'date-time' },
    links: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'label'],
        properties: { name: { type: 'string', description: 'Its files: GET /v1/{name}/files' }, label: { type: 'string' } },
      },
    },
  },
};

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ config: { current: (log: import('fastify').FastifyBaseLogger) => import('./domains.js').Config } }} options
 *   `config`: the engine and the sites' domains, for each request (domains.js).
 */
export async function sitesRoutes(app, { config }) {
  // The engine, and the site's current domain, for one request.
  const siteOf = (request) => {
    const { site } = request.params;
    if (!SITES.includes(site)) throw new ProblemError(404, 'notFound', `No site ${site}`);
    const { engine, domains } = config.current(request.log);
    return { site, engine, siteUrl: domains[site] };
  };

  // The engine's { posts, hasNextPage } as a page of the API.
  const pageOf = (site, page, { posts, hasNextPage }) => ({
    posts: posts.map(({ url, title, posterUrl }) => ({ name: postName(site, url), title, posterUrl })),
    ...(hasNextPage && { nextPageToken: String(page + 1) }),
  });

  app.get('/v1/sites', {
    schema: {
      summary: 'ListSites',
      response: {
        200: {
          type: 'object',
          required: ['sites'],
          properties: { sites: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
        },
      },
    },
  }, () => ({ sites: SITES.map((site) => ({ name: `sites/${site}` })) }));

  app.get('/v1/sites/:site/posts', {
    schema: {
      summary: 'ListPosts',
      params: siteParams,
      querystring: { type: 'object', properties: { pageToken } },
      response: { 200: postPage },
    },
  }, async (request) => {
    const { site, engine, siteUrl } = siteOf(request);
    const page = Number(request.query.pageToken ?? 1);
    return pageOf(site, page, await engine.scrapeListing(siteUrl, page));
  });

  app.get('/v1/sites/:site/search', {
    schema: {
      summary: 'SearchPosts',
      params: siteParams,
      querystring: {
        type: 'object',
        required: ['q'],
        properties: { q: { type: 'string', minLength: 1 }, pageToken },
      },
      response: { 200: postPage },
    },
  }, async (request) => {
    const { site, engine, siteUrl } = siteOf(request);
    const page = Number(request.query.pageToken ?? 1);
    return pageOf(site, page, await engine.searchPosts(siteUrl, request.query.q, page));
  });

  app.get('/v1/sites/:site/posts/:post', {
    schema: {
      summary: 'GetPost',
      params: {
        type: 'object',
        required: ['site', 'post'],
        properties: { site: siteParams.properties.site, post: { type: 'string', examples: ['wrong-turn-2003-hindi-bluray-full-movie'] } },
      },
      response: { 200: post },
    },
  }, async (request) => {
    const { site, engine, siteUrl } = siteOf(request);
    const { post: found, links } = await engine.scrapePost(postUrl(siteUrl, request.params.post));
    return {
      // From the URL the site answered at: a post the site renamed is named by its new slug.
      name: postName(site, found.url),
      url: found.url,
      title: found.title,
      year: found.year,
      imdbId: found.imdbId,
      posterUrl: found.posterUrl,
      publishTime: found.publishedAt,
      links: links.map(({ url, label }) => ({ name: linkName(url), label })),
    };
  });
}
