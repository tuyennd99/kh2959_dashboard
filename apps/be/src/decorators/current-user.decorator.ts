import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../types/auth';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload =>
    context.switchToHttp().getRequest<Request & { user: AccessTokenPayload }>()
      .user,
);
