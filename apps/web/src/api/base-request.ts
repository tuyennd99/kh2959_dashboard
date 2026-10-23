import axios, { type AxiosRequestConfig } from 'axios';
import { ApiError } from '../lib/api-error';
import { getSession, setSession } from '../stores/session-store';

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: ApiMeta;
  message?: string;
}

const baseRequest = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

baseRequest.interceptors.request.use((config) => {
  const token = getSession()?.accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

baseRequest.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.response) {
      return Promise.reject(error);
    }
    const status = error.response.status;
    const body = error.response.data as { message?: string } | undefined;
    const message =
      body && typeof body.message === 'string'
        ? body.message
        : `Yêu cầu thất bại (${status})`;

    if (status === 401 && getSession()) {
      setSession(null);
    }
    return Promise.reject(new ApiError(message, status));
  },
);

export async function requestJson<T>(
  config: AxiosRequestConfig,
): Promise<ApiEnvelope<T>> {
  const response = await baseRequest.request<unknown>(config);
  const body = response.data;
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const typed = body as { data: T; meta?: ApiMeta; message?: string };
    return {
      data: typed.data,
      meta: typed.meta,
      message: typed.message,
    };
  }
  return { data: body as T };
}

export default baseRequest;
