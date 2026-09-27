/**
 * Performance thresholds, all in one place.
 *
 * The idea is that a huge file never copies or walks the full text on the UI
 * thread: the editor and the preview are progressively simplified and the
 * analysis is dispatched to a worker in chunks.
 */

/** From here on the content is flushed to the state only after a pause. */
export const LARGE_DOC_LIMIT = 500_000;
/** From here on the preview runs without highlighting or diagrams. */
export const SIMPLIFY_LIMIT = 400_000;
/** From here on the editor works in plain text (no parsing or highlighting). */
export const PLAIN_LIMIT = 1_200_000;
/** From here on the preview is limited to the first lines. */
export const PREVIEW_LIMIT = 1_500_000;
/** How many lines are shown in that window. */
export const PREVIEW_WINDOW_LINES = 2_000;
/** From here on word counting is done in a worker. */
export const STATS_WORKER_LIMIT = 256_000;
/** Size of each chunk sent to the worker. */
export const STATS_CHUNK = 2_000_000;
/** From here on the document is "huge": the text is not copied to the state. */
export const HUGE_DOC_LIMIT = 8_000_000;
