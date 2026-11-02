/**
 * The one shape a post's links are read into (providers/index.js: Section, Line), made here so every
 * provider fills every field: what its site does not state is null, [] or false.
 */

/** @typedef {import('./providers/index.js').Section} Section @typedef {import('./providers/index.js').Line} Line */

/**
 * A section without lines yet.
 *
 * @param {{ title?: string | null, tab?: string | null, tags?: string[], episodes?: boolean }} [stated]
 *   What the site states of it.
 * @returns {Section}
 */
export function newSection({ title = null, tab = null, tags = [], episodes = false } = {}) {
  return { title: title || null, lines: [], tab: tab || null, tags, episodes };
}

/**
 * @param {string | null} title
 * @param {import('./html.js').Link[]} links
 * @param {{ file?: string | null, tags?: string[] }} [stated] - What the site states of its file.
 * @returns {Line}
 */
export function newLine(title, links, { file = null, tags = [] } = {}) {
  return { title: title || null, links, file: file || null, tags };
}
