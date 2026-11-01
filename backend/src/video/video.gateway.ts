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

    // socketId -> client + rank, while the user is waiting for a video-call partner
    private waitingSockets = new Map<string, { client: Socket; rank: number }>();

    // Ranks closer than this are considered a close match
    private readonly MATCH_THRESHOLD = 2;

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
        this.waitingSockets.delete(client.id);
    }

    @SubscribeMessage("start-call")
    handleStartCall(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { rank: number },
    ) {
        const waitingEntries = [...this.waitingSockets.values()];

        // First user: add to waiting list
        if (waitingEntries.length === 0) {
            this.waitingSockets.set(client.id, { client, rank: data.rank });
            client.emit("waiting", { message: `Looking for a player with rank ~${data.rank}...` });
            return;
        }

        // Find the waiting user with the closest rank within the match threshold
        let bestEntry: { client: Socket; rank: number } | null = null;
        let bestDiff = Number.MAX_SAFE_INTEGER;

        for (const entry of waitingEntries) {
            const diff = Math.abs(entry.rank - data.rank);
            if (diff <= this.MATCH_THRESHOLD && diff < bestDiff) {
                bestDiff = diff;
                bestEntry = entry;
            }
        }

        // No close match found: keep the new user waiting
        if (!bestEntry) {
            this.waitingSockets.set(client.id, { client, rank: data.rank });
            client.emit("waiting", { message: `Waiting for a player with rank ~${data.rank}...` });
            return;
        }

        // Close match found: pair both users into a new room
        this.waitingSockets.delete(bestEntry.client.id);
        this.waitingSockets.delete(client.id);

        const roomId = this.generateRoomId();
        bestEntry.client.join(roomId);
        client.join(roomId);

        // The user who just clicked "Start" creates the WebRTC offer
        bestEntry.client.emit("matched", { roomId, creatorId: client.id });
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
