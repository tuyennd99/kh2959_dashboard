import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isObjectLike } from 'lodash';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { ApiSuccess } from '../types/api';

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiSuccess<T>>
{
  private readonly reflector = new Reflector();

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T>> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) {
          return data as unknown as ApiSuccess<T>;
        }
        const statusCode = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>().statusCode;
        const message = this.resolveMessage(context);
        const withMessage = message ? { message } : {};
        if (this.isPaginated(data)) {
          return {
            statusCode,
            data: data.data,
            meta: data.meta,
            ...withMessage,
          } as ApiSuccess<T>;
        }
        return { statusCode, data, ...withMessage };
      }),
    );
  }

  private resolveMessage(context: ExecutionContext): string | undefined {
    const explicit = this.reflector.get<string>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );
    if (explicit) return explicit;

    const method = context
      .switchToHttp()
      .getRequest<{ method?: string }>().method;
    switch (method) {
      case 'POST':
        return 'Thao tác thành công';
      case 'PUT':
      case 'PATCH':
        return 'Cập nhật thành công';
      case 'DELETE':
        return 'Xóa thành công';
      default:
        return undefined;
    }
  }

  private isPaginated(value: unknown): value is {
    data: unknown;
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  } {
    if (!isObjectLike(value)) return false;
    const candidate = value as Record<string, unknown>;
    const meta = candidate.meta;
    return (
      'data' in candidate &&
      isObjectLike(meta) &&
      ['page', 'limit', 'total', 'totalPages'].every(
        (key) => typeof (meta as Record<string, unknown>)[key] === 'number',
      )
    );
  }
}
