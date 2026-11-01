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
import { RankMatchService } from "./rank-match.js";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class VideoGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // Rank-based auto-matchmaking algorithm (separate service)
    private rankMatchService = new RankMatchService(2); // threshold = 2

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

        // Clean up from the matchmaking queue
        this.rankMatchService.removeWaitingUser(client.id);
    }

    @SubscribeMessage("start-call")
    handleStartCall(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { rank: number },
    ) {
        // First user: add to waiting list
        if (this.rankMatchService.getWaitingCount() === 0) {
            this.rankMatchService.addWaitingUser(client.id, client, data.rank);
            client.emit("waiting", { message: `Looking for a player with rank ~${data.rank}...` });
            return;
        }

        // Find the waiting user with the closest rank within the match threshold
        const match = this.rankMatchService.findBestMatch(data.rank);

        // No close match found: keep the new user waiting
        if (!match) {
            this.rankMatchService.addWaitingUser(client.id, client, data.rank);
            client.emit("waiting", { message: `Waiting for a player with rank ~${data.rank}...` });
            return;
        }

        // Close match found: pair both users into a new room
        this.rankMatchService.removeWaitingUser(match.socketId);
        this.rankMatchService.removeWaitingUser(client.id);

        const roomId = this.generateRoomId();
        match.client.join(roomId);
        client.join(roomId);

        // The user who just clicked "Start" creates the WebRTC offer
        match.client.emit("matched", { roomId, creatorId: client.id });
        client.emit("matched", { roomId, creatorId: client.id });
    }

    private generateRoomId(): string {
        return `room-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    @SubscribeMessage("offer")
    handleOffer(
        @MessageBody() data: { roomId: string; offer: RTCSessionDescriptionInit },
        @ConnectedSocket() client: Socket,
    ) {
        client.to(data.roomId).emit("offer", {
            offer: data.offer,
            senderId: client.id,
        });
    }

    @SubscribeMessage("answer")
    handleAnswer(
        @MessageBody() data: { roomId: string; answer: RTCSessionDescriptionInit },
        @ConnectedSocket() client: Socket,
    ) {
        client.to(data.roomId).emit("answer", {
            answer: data.answer,
            senderId: client.id,
        });
    }

    @SubscribeMessage("ice-candidate")
    handleIceCandidate(
        @MessageBody() data: { roomId: string; candidate: RTCIceCandidateInit },
        @ConnectedSocket() client: Socket,
    ) {
        client.to(data.roomId).emit("ice-candidate", data.candidate);
    }
}
