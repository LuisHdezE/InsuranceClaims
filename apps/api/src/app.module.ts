import { MiddlewareConsumer, Module, type DynamicModule, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ACCESS_TOKENS, API_RUNTIME, CUSTOMER_ACCESS_TOKENS, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { AutomationAdminController } from './automation-controller.js';
import { OperatorClaimsAnalyticsController } from './claims-analytics-controller.js';
import { OperatorCollectionsController } from './collection-controller.js';
import { CommunicationTemplateAdminController, OperatorCommunicationsController } from './communication-controller.js';
import { HealthController, OperatorAuthController, OperatorClaimsController, PublicClaimsController } from './controllers.js';
import { CustomerJwtAuthGuard } from './customer-auth.guard.js';
import { CustomerPortalAuthController, CustomerPortalController } from './customer-portal-controller.js';
import { CustomerPolicyController } from './customer-policy-controller.js';
import { DeadLetterAdminController } from './dead-letter-controller.js';
import { GuidanceAdminController } from './guidance-controller.js';
import { GovernedImportsController } from './import-controller.js';
import { AdminIntegrationEventsController, IntegrationEventsController } from './integration-controller.js';
import { PipelineAdminController } from './pipeline-admin-controller.js';
import { OperatorClaimPipelineController } from './pipeline-controller.js';
import { OperatorRenewalsController } from './renewal-controller.js';
import { OperatorTasksController } from './task-controller.js';
import { ProblemDetailsFilter, RateLimitService, RequestIdMiddleware } from './transport.js';

@Module({})
export class ApiModule implements NestModule {
  static register(runtime: ApiRuntimeContract): DynamicModule {
    return {
      module: ApiModule,
      controllers: [
        PublicClaimsController,
        CustomerPortalAuthController,
        CustomerPortalController,
        OperatorAuthController,
        OperatorClaimsController,
        OperatorClaimsAnalyticsController,
        OperatorClaimPipelineController,
        OperatorRenewalsController,
        OperatorCollectionsController,
        CustomerPolicyController,
        PipelineAdminController,
        AutomationAdminController,
        GuidanceAdminController,
        GovernedImportsController,
        DeadLetterAdminController,
        CommunicationTemplateAdminController,
        OperatorCommunicationsController,
        IntegrationEventsController,
        AdminIntegrationEventsController,
        OperatorTasksController,
        HealthController,
      ],
      providers: [
        { provide: API_RUNTIME, useValue: runtime },
        { provide: ACCESS_TOKENS, useValue: runtime.accessTokens },
        { provide: CUSTOMER_ACCESS_TOKENS, useValue: runtime.customerAccessTokens },
        RateLimitService,
        JwtAuthGuard,
        CustomerJwtAuthGuard,
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
