import { MiddlewareConsumer, Module, type DynamicModule, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ACCESS_TOKENS, API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { HealthController, OperatorAuthController, OperatorClaimsController, PublicClaimsController } from './controllers.js';
import { ProblemDetailsFilter, RateLimitService, RequestIdMiddleware } from './transport.js';

@Module({})
export class ApiModule implements NestModule {
  static register(runtime: ApiRuntimeContract): DynamicModule {
    return {
      module: ApiModule,
      controllers: [PublicClaimsController, OperatorAuthController, OperatorClaimsController, HealthController],
      providers: [
        { provide: API_RUNTIME, useValue: runtime },
        { provide: ACCESS_TOKENS, useValue: runtime.accessTokens },
        RateLimitService,
        JwtAuthGuard,
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
