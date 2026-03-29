import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';

import type { UserEntity } from '../modules/user/user.entity.ts';
import { ContextProvider } from '../providers/context.provider.ts';

@Injectable()
export class AuthUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user: UserEntity }>();

    const user = request.user;
    ContextProvider.setAuthUser(user);

    return next.handle();
  }
}
