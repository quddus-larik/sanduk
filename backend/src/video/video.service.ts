import { Socket } from "socket.io";

export interface WaitingUser {
    client: Socket;
    rank: number;
}

export interface MatchResult {
    socketId: string;
    client: Socket;
    diff: number;
}

/**
 * Rank-based auto-matchmaking algorithm.
 *
 * Users enter a rank number. The server keeps a waiting queue and, when a new
 * user clicks "Find Match", scans all waiting users for the one whose rank is
 * closest within the configured threshold. If found, both users are paired
 * into a video-call room.
 */
export class RankMatchService {
    private waitingSockets = new Map<string, WaitingUser>();

    constructor(private readonly matchThreshold: number = 2) {}

    /**
     * Add a user to the waiting queue.
     */
    addWaitingUser(socketId: string, client: Socket, rank: number): void {
        this.waitingSockets.set(socketId, { client, rank });
    }

    /**
     * Remove a user from the waiting queue (on disconnect or after match).
     */
    removeWaitingUser(socketId: string): void {
        this.waitingSockets.delete(socketId);
    }

    /**
     * Find the waiting user whose rank is closest to the given rank
     * and within the match threshold.
     */
    findBestMatch(rank: number): MatchResult | null {
        let best: MatchResult | null = null;

        for (const [socketId, entry] of this.waitingSockets) {
            const diff = Math.abs(entry.rank - rank);
            if (diff <= this.matchThreshold && (!best || diff < best.diff)) {
                best = { socketId, client: entry.client, diff };
            }
        }

        return best;
    }

    /**
     * Number of users currently waiting for a match.
     */
    getWaitingCount(): number {
        return this.waitingSockets.size;
    }

    /**
     * Clear the entire waiting queue.
     */
    clearQueue(): void {
        this.waitingSockets.clear();
    }
}
