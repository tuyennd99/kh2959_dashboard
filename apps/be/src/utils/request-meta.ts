import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { RequestMeta } from '../types/auth';

export function requestMeta(request: Request): RequestMeta {
  const reqWithMeta = request as Request & { _requestMeta?: RequestMeta };
  if (reqWithMeta._requestMeta) {
    return reqWithMeta._requestMeta;
  }
  const rawId = request.headers ? request.headers['x-request-id'] : undefined;
  const requestId =
    typeof rawId === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(rawId)
      ? rawId
      : randomUUID();

  const userAgent = request.headers ? request.headers['user-agent'] : undefined;
  const meta: RequestMeta = {
    ipAddress: request.ip,
    userAgent:
      typeof userAgent === 'string' ? userAgent.slice(0, 500) : undefined,
    requestId,
  };
  reqWithMeta._requestMeta = meta;
  return meta;
}
