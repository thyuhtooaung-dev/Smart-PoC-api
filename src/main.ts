import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './kiosk/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // initialize redis adapter and connect pub/sub
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  // override default in-memory adapter with our redis adapter
  app.useWebSocketAdapter(redisIoAdapter);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
await bootstrap();
