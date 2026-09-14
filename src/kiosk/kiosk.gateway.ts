import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  KioskRegisterDto,
  SubmitParcelDto,
  WebJoinDto,
  WeightSyncDto,
} from './dto/index.js';
import { RedisService } from './redis.service.js';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class KioskGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(KioskGateway.name);

  constructor(private readonly redisService: RedisService) {}

  afterInit() {
    this.logger.log('Websocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client Disconnected: ${client.id}`);
  }

  @SubscribeMessage('kiosk:register')
  async handleKioskRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: KioskRegisterDto,
  ) {
    const { kioskId, sessionId } = data;

    // join isolated socker.io room
    await client.join(sessionId);
    // initilize session in redis
    await this.redisService.initSession(sessionId, kioskId);

    this.logger.log(`kiosk [${kioskId}] registered room [${sessionId}]`);
    return { event: 'kiosk:registered', data: { success: true, sessionId } };
  }

  @SubscribeMessage('web:join-session')
  async handleWebJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WebJoinDto,
  ) {
    const { sessionId } = data;

    // check if seesion exists in redis before allowing pair
    const session = await this.redisService.getSession(sessionId);
    if (!session) {
      return {
        event: 'error',
        data: { message: 'Session expired or not found' },
      };
    }

    // join web client into the same room
    await client.join(sessionId);

    // update status to paired
    await this.redisService.updateSession(sessionId, {
      status: 'PAIRED_WEIGHTING',
    });

    this.logger.log(`Mobile paired to session room: ${sessionId}`);

    // notify both kiosk and mobile that pairing is done
    this.server.to(sessionId).emit('status:paired', {
      paired: true,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    return { event: 'web:joined', data: { success: true } };
  }

  // relay real-time weight from kisok scale to paired web
  @SubscribeMessage('kiosk:weight-sync')
  handleWeightSync(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: WeightSyncDto,
  ) {
    const { sessionId, weight, isStable } = data;

    // broadcast weight in the room
    this.server.to(sessionId).emit('web:weight-mirror', {
      weight,
      isStable,
      unit: 'kg',
    });
  }

  // reset sliding 3min TTL upon user explicit actions
  @SubscribeMessage('web:heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const refreshed = await this.redisService.slideSessionTTL(data.sessionId);
    return { success: refreshed };
  }

  // Forward parcel deatils to kiosk screen
  @SubscribeMessage('web:submit-parcel')
  async handleSubmitParcel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: SubmitParcelDto,
  ) {
    const { sessionId, receiverName, receiverPhone, receiverAddress } = data;

    await this.redisService.updateSession(sessionId, {
      status: 'REVIEW',
      receiverName,
      receiverPhone,
      receiverAddress,
    });

    this.logger.log(`Parcel submitted for session [${sessionId}]`);

    this.server.to(sessionId).emit('kiosk:package-review', {
      receiverName,
      receiverPhone,
      receiverAddress,
    });

    return { success: true };
  }
}
