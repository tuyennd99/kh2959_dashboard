import type { Role } from '@land/shared';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  tokenVersion: number;
  iat: number;
  exp: number;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId: string;
}
