import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// ⚠️ Counters live in this process. With two replicas each client gets 2x the limit,
// and a restart resets everything.
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private counters: Record<string, number> = {};

  constructor() {
    setInterval(() => { this.counters = {}; }, 60_000);
  }

  use(req: Request, res: Response, next: NextFunction) {
    console.log('request', req.method, req.url);
    const key = req.ip ?? 'unknown';
    this.counters[key] = (this.counters[key] ?? 0) + 1;
    if (this.counters[key] > 100) {
      res.status(429).send('too many requests');
      return;
    }
    next();
  }
}
