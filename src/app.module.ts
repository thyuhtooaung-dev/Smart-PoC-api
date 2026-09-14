import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { KioskGateway } from './kiosk/kiosk.gateway.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, KioskGateway],
})
export class AppModule {}
