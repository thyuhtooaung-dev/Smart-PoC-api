import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    //connect to redis when nestjs module initialize
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }

  onModuleDestroy() {
    // redis disconnect on app shutdown
    this.client.disconnect();
  }

  // initialize a new kiosk session with 3min sliding TTL
  async initSession(sessionId: string, kioskId: string): Promise<void> {
    const key = `kiosk:session:${sessionId}`;

    await this.client
      .multi()
      .hset(key, {
        kioskId,
        status: 'IDLE',
        createdAt: new Date().toISOString(),
      })
      .expire(key, 180)
      .exec();
  }

  // extend TTL by 3min when user heartbeat occurs
  async slideSessionTTL(sessionId: string): Promise<boolean> {
    const key = `kiosk:session:${sessionId}`;
    const exists = await this.client.exists(key);

    if (exists) {
      await this.client.expire(key, 180); // reset timer
      return true;
    }

    return false;
  }

  // update session status or payload (eg. store weight or receiver info)
  async updateSession(
    sessionId: string,
    data: Record<string, string>,
  ): Promise<void> {
    const key = `kiosk:session:${sessionId}`;
    await this.client.hset(key, data);
  }

  // get current session state
  async getSession(sessionId: string): Promise<Record<string, string> | null> {
    const key = `kiosk:session:${sessionId}`;
    const data = await this.client.hgetall(key);
    return Object.keys(data).length > 0 ? data : null;
  }

  // clear session when flow finisheds or user manually cancels
  async clearSession(sessionId: string): Promise<void> {
    const key = `kiosk:session:${sessionId}`;
    await this.client.del(key);
  }
}
