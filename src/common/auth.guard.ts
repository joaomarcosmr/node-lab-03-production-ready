import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

// ⚠️ Hardcoded secret, and the rejection body is not JSON.
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    return req.headers.authorization === 'Bearer secret-token-123';
  }
}
