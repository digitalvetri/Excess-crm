interface ApiErrorShape {
  response?: {
    data?: {
      error?: { code?: string; message?: string };
    };
  };
}

export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const shaped = err as ApiErrorShape;
  return shaped?.response?.data?.error?.message ?? fallback;
}

export function getApiErrorCode(err: unknown): string | undefined {
  const shaped = err as ApiErrorShape;
  return shaped?.response?.data?.error?.code;
}
