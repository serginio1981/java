/** Error con código que llega al operador como mensaje legible. */
export interface AppError extends Error {
  code: string;
}

export function appError(code: string, message: string): AppError {
  return Object.assign(new Error(message), { code });
}
