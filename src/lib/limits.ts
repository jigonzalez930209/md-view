/**
 * Umbrales de rendimiento, en un solo lugar.
 *
 * La idea es que un archivo enorme nunca copie ni recorra el texto completo en
 * el hilo de la interfaz: el editor y la vista previa se van simplificando y el
 * analisis se despacha a un worker por chunks.
 */

/** A partir de aca el contenido se vuelca al estado recien tras una pausa. */
export const LARGE_DOC_LIMIT = 500_000;
/** A partir de aca la vista previa va sin resaltado ni diagramas. */
export const SIMPLIFY_LIMIT = 400_000;
/** A partir de aca el editor trabaja en texto plano (sin parseo ni resaltado). */
export const PLAIN_LIMIT = 1_200_000;
/** A partir de aca la vista previa se limita a las primeras lineas. */
export const PREVIEW_LIMIT = 1_500_000;
/** Cuantas lineas se muestran en esa ventana. */
export const PREVIEW_WINDOW_LINES = 2_000;
/** A partir de aca el conteo de palabras se hace en un worker. */
export const STATS_WORKER_LIMIT = 256_000;
/** Tamaño de cada trozo que se le manda al worker. */
export const STATS_CHUNK = 2_000_000;
/** A partir de aca el documento es "enorme": no se copia el texto al estado. */
export const HUGE_DOC_LIMIT = 8_000_000;
