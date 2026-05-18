export interface ApiSuccess<T> {
  data: T;
  meta?: {
    nextCursor?: string;
    total?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
