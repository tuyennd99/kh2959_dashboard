import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { isObjectLike } from 'lodash';
import { env } from '../config/env';
import { JWT_AUDIENCE, JWT_ISSUER } from '../constants/auth';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AccessTokenPayload } from '../types/auth';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw this.unauthorized();
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token, {
        secret: env(process.env).jwtSecret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (!this.isPayload(payload)) throw this.unauthorized();
      request.user = payload;
      return true;
    } catch {
      throw this.unauthorized();
    }
  }

  private isPayload(value: unknown): value is AccessTokenPayload {
    if (!isObjectLike(value)) return false;
    const payload = value as Record<string, unknown>;
    return (
      typeof payload.sub === 'string' &&
      payload.sub.length > 0 &&
      typeof payload.email === 'string' &&
      payload.role === 'ADMIN'
    );
  }

  private unauthorized() {
    return new HttpException(
      { message: 'Yêu cầu đăng nhập để thực hiện thao tác này' },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
