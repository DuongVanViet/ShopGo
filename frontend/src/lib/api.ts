export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}
const pendingKeys = new Map<string, string>();
interface Options {
  method?: string;
  body?: unknown | FormData;
  token?: string | null;
  signal?: AbortSignal;
  idempotent?: boolean;
}
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const body =
    options.body === undefined
      ? undefined
      : isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body);
  const fingerprint = `${options.token}:${method}:${path}:${isFormData ? '[form-data]' : body}`;
  const headers: Record<string, string> = {};
  if (body && !isFormData) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotent) {
    if (!pendingKeys.has(fingerprint)) pendingKeys.set(fingerprint, crypto.randomUUID());
    headers['Idempotency-Key'] = pendingKeys.get(fingerprint)!;
  }
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(18000)])
        : AbortSignal.timeout(18000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status < 500) pendingKeys.delete(fingerprint);
      if (response.status === 401 && options.token)
        window.dispatchEvent(new CustomEvent('shopgo:session-expired', { detail: options.token }));
      throw new ApiError(
        result?.error?.message ??
          'Chưa kết nối được backend. Vui lòng kiểm tra dịch vụ và thử lại.',
        result?.error?.code ?? 'BACKEND_UNAVAILABLE',
        response.status,
        result?.meta?.requestId,
      );
    }
    pendingKeys.delete(fingerprint);
    return result.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      method === 'GET'
        ? 'Chưa kết nối được cửa hàng. Vui lòng thử lại.'
        : 'Kết nối bị gián đoạn. Với thao tác đặt/thu tiền, hãy thử lại cùng thao tác để kiểm tra kết quả trước đó.',
      'NETWORK_ERROR',
      0,
    );
  }
}
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
}
export const query = (values: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString();
