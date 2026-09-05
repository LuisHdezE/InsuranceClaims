import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createProductionRuntimeFromEnv } from '@insurance/infrastructure';
import { ApiModule } from './app.module.js';

const runtime = await createProductionRuntimeFromEnv();
const app = await NestFactory.create(ApiModule.register(runtime), { logger: ['error', 'warn', 'log'] });
app.enableShutdownHooks();
const port = Number(process.env.PORT ?? 3000);
await app.listen(port, '0.0.0.0');
console.log(JSON.stringify({ event: 'API_LISTENING', port }));
