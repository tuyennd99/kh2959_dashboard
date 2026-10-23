export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
}

/** Same as `messageOf`, but empty string when there is no error (for `query.error`). */
export function errorText(error: unknown): string {
  return error ? messageOf(error) : '';
}
