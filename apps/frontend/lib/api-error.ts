/**
 * lib/api-error.ts
 *
 * Un solo lugar para sacar el texto de un error que vino de un route handler.
 *
 * POR QUÉ EXISTE: los route handlers del BFF responden `{ success: false, error }`
 * donde `error` es un OBJETO `{ code, message, status }` que arma
 * `lib/api-client.server.ts` a partir del cuerpo del backend. Varios componentes
 * lo tipaban como `string` y hacían `setError(json.error)`; TypeScript daba por
 * buena la anotación escrita a mano y el objeto terminaba en un `useState<string>`.
 * Al renderizarlo, React tira "Objects are not valid as a React child" y **rompe
 * el render en pleno click** — desde la pantalla se ve como si el botón no hiciera
 * nada. Es la variante de UI del problema ya documentado como "tipos que mienten
 * sobre la API".
 *
 * Acepta las tres formas que circulan hoy (objeto, string suelto y ausencia) para
 * que ningún caller tenga que adivinar cuál le va a tocar.
 */

/** Forma real del `error` que devuelven los route handlers del BFF. */
export interface ApiErrorShape {
  code?: string;
  message?: string;
  status?: number;
}

/** Cuerpo típico de una respuesta fallida del BFF. */
export interface ApiErrorBody {
  error?: ApiErrorShape | string | null;
  message?: string | null;
  code?: string | null;
}

/**
 * Devuelve un mensaje mostrable al usuario, siempre `string`.
 *
 * @param body     Cuerpo ya parseado de la respuesta (o cualquier cosa).
 * @param fallback Texto en español para cuando el backend no mandó nada legible.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;

  const { error, message } = body as ApiErrorBody;

  if (typeof error === 'string' && error.trim()) return error;
  if (
    error &&
    typeof error === 'object' &&
    typeof error.message === 'string' &&
    error.message.trim()
  )
    return error.message;
  if (typeof message === 'string' && message.trim()) return message;

  return fallback;
}

/**
 * Código de error de dominio, cuando el caller necesita ramificar por causa
 * (por ejemplo distinguir "no queda espacio" de cualquier otro rechazo) en vez
 * de comparar textos, que cambian con cada traducción.
 */
export function apiErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;

  const { error, code } = body as ApiErrorBody;

  if (error && typeof error === 'object' && typeof error.code === 'string') return error.code;
  if (typeof code === 'string') return code;

  return null;
}
