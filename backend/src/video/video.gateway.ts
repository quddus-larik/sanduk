import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class VideoGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket): void {
        console.log(`Received ${client.id}`);
    }

    handleDisconnect(client: Socket): void {
        console.log(`Disconnected ${client.id}`);

        // Let the remaining users in each room know someone left
        for (const room of client.rooms) {
            if (room === client.id) continue; // skip the socket's own id room
            client.to(room).emit("user-left", { userId: client.id });
        }
    }

    @SubscribeMessage('join-room')
    handleJoinRoom(
        @MessageBody() roomId: string,
        @ConnectedSocket() client: Socket,
    ) {
        client.join(roomId);
        // Notify everyone else in the room that a new user joined
        client.to(roomId).emit('user-joined', client.id);
    }

    @SubscribeMessage('offer')
    handleOffer(
        @MessageBody() data: { roomId: string; offer: RTCSessionDescriptionInit },
        @ConnectedSocket() client: Socket,
    ) {
        client.to(data.roomId).emit('offer', {
            offer: data.offer,
            senderId: client.id
        });
    }

    @SubscribeMessage('answer')
    handleAnswer(
        @MessageBody() data: { roomId: string; answer: RTCSessionDescriptionInit },
        @ConnectedSocket() client: Socket,
    ) {
        client.to(data.roomId).emit("answer", {
            answer: data.answer,
            senderId: client.id
        });
    }

    @SubscribeMessage('ice-candidate')
    handleIceCandidate(
        @MessageBody() data: { roomId: string, candidate: RTCIceCandidateInit },
        @ConnectedSocket() client: Socket,
    ) {
        client.to(data.roomId).emit("ice-candidate", data.candidate);
    }
}
