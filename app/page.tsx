'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const SOCKET_URL = 'http://localhost:8080';

type MatchStatus = 'idle' | 'waiting' | 'matched' | 'calling';

export default function Page() {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const creatorIdRef = useRef<string>('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const roomIdRef = useRef<string>('room-1');
    const [roomId, setRoomId] = useState('room-1');
    const [joined, setJoined] = useState(false);
    const [rank, setRank] = useState('1200');
    const [matchStatus, setMatchStatus] = useState<MatchStatus>('idle');
    const [countdown, setCountdown] = useState(4);

    // Effect 1: Socket connection — runs ONCE
    useEffect(() => {
        const socket = io(SOCKET_URL);
        socketRef.current = socket;

        socket.on('waiting', () => {
            setMatchStatus('waiting');
        });

        socket.on('matched', ({ roomId: matchedRoomId, creatorId }) => {
            roomIdRef.current = matchedRoomId;
            creatorIdRef.current = creatorId;
            setRoomId(matchedRoomId);
            setMatchStatus('matched');
            setCountdown(4);
        });

        socket.on('offer', async ({ offer }) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                socketRef.current?.emit('answer', { roomId: roomIdRef.current, answer });
            }
        });

        socket.on('answer', async ({ answer }) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socket.on('ice-candidate', async (candidate) => {
            if (peerConnectionRef.current && candidate) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        socket.on('user-left', () => {
            const pc = peerConnectionRef.current;
            if (pc) {
                pc.close();
                peerConnectionRef.current = null;
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
            }
            setMatchStatus('idle');
            setJoined(false);
            setCountdown(4);
            localStreamRef.current = null;
        });

        return () => {
            socket.disconnect();
            const pc = peerConnectionRef.current;
            if (pc) pc.close();
        };
    }, []);

    // Effect 2: Countdown and auto-start WebRTC after 4 seconds
    useEffect(() => {
        if (matchStatus !== 'matched') return;

        if (countdown > 0) {
            timerRef.current = setInterval(() => {
                setCountdown((c) => (c <= 1 ? 0 : c - 1));
            }, 1000);
            return;
        }

        const startCallWebRTC = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

                // Store stream so it can be attached once videos are mounted
                localStreamRef.current = stream;

                const pc = new RTCPeerConnection(ICE_SERVERS);
                peerConnectionRef.current = pc;

                stream.getTracks().forEach((track) => pc.addTrack(track, stream));

                pc.ontrack = (event) => {
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = event.streams[0];
                    }
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        socketRef.current?.emit('ice-candidate', {
                            roomId: roomIdRef.current,
                            candidate: event.candidate,
                        });
                    }
                };

                if (socketRef.current?.id === creatorIdRef.current) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socketRef.current.emit('offer', { roomId: roomIdRef.current, offer });
                }

                setJoined(true);
            } catch (err) {
                console.error('Failed to start call:', err);
                setMatchStatus('idle');
            }
        };

        startCallWebRTC();

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [matchStatus, countdown]);

    // Effect 3: Attach local stream once videos are mounted (joined === true)
    useEffect(() => {
        if (joined && localStreamRef.current && localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
    }, [joined]);

    const findMatch = () => {
        socketRef.current?.emit('start-call', { rank: Number(rank) });
        setMatchStatus('waiting');
    };

    return (
        <div style={{ padding: 20, textAlign: 'center' }}>
            <h1>Video Call</h1>

            {matchStatus === 'idle' && (
                <div style={{ marginBottom: 20 }}>
                    <label style={{ marginRight: 10 }}>
                        Rank:{' '}
                        <input
                            type="number"
                            value={rank}
                            onChange={(e) => setRank(e.target.value)}
                        />
                    </label>
                    <button onClick={findMatch}>Find Match</button>
                </div>
            )}

            {matchStatus === 'waiting' && <p>Searching for a player with a similar rank...</p>}

            {matchStatus === 'matched' && (
                <div>
                    <p>Match found! Room: {roomId}</p>
                    <p>Connecting in {countdown} seconds...</p>
                </div>
            )}

            {joined && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
                        <div style={{ textAlign: 'center' }}>
                            <h3>You</h3>
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{
                                    width: '400px',
                                    borderRadius: '8px',
                                    background: '#000',
                                    border: '2px solid #4ade80',
                                }}
                            />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h3>Partner</h3>
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                style={{
                                    width: '400px',
                                    borderRadius: '8px',
                                    background: '#000',
                                    border: '2px solid #3b82f6',
                                }}
                            />
                        </div>
                    </div>
                    <p>Both users are sharing video with each other.</p>
                </div>
            )}
        </div>
    );
}
