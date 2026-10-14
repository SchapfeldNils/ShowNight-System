export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function missing(): never {
  throw new HttpError(404, "NOT_FOUND", "Nicht gefunden oder kein Zugriff.");
}
export function forbidden(): never {
  throw new HttpError(403, "FORBIDDEN", "Diese Aktion ist nicht erlaubt.");
}
