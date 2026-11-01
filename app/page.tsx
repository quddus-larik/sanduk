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

export default function Page() {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    const [joined, setJoined] = useState(false);
    const roomId = 'room-1'; // Fixed room ID for testing 2 persons

    useEffect(() => {
        socketRef.current = io(SOCKET_URL);

        socketRef.current.on('user-joined', async () => {
            // Create and send WebRTC Offer when a second user joins
            if (peerConnectionRef.current) {
                const offer = await peerConnectionRef.current.createOffer();
                await peerConnectionRef.current.setLocalDescription(offer);
                socketRef.current?.emit('offer', { roomId, offer });
            }
        });

        socketRef.current.on('offer', async ({ offer }) => {
            // Handle incoming offer, generate answer
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                socketRef.current?.emit('answer', { roomId, answer });
            }
        });

        socketRef.current.on('answer', async ({ answer }) => {
            // Handle incoming answer from remote peer
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socketRef.current.on('ice-candidate', async (candidate) => {
            // Add network candidate from peer
            if (peerConnectionRef.current && candidate) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        socketRef.current.on('user-left', () => {
            // Close the peer connection when the remote user leaves
            const pc = peerConnectionRef.current;
            if (pc) {
                pc.close();
                peerConnectionRef.current = null;
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
            }
        });

        return () => {
            socketRef.current?.disconnect();
            const pc = peerConnectionRef.current;
            if (pc) {
                pc.close();
                peerConnectionRef.current = null;
            }
        };
    }, []);

    const startCall = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Attach local camera tracks to WebRTC connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Handle remote media stream
        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        // Send local ICE candidates to peer via socket
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', { roomId, candidate: event.candidate });
            }
        };

        socketRef.current?.emit('join-room', roomId);
        setJoined(true);
    };

    return (
        <div style={{ padding: 20, textAlign: 'center' }}>
            <h1>2-Person Video Call</h1>
            {!joined && <button onClick={startCall}>Start / Join Call</button>}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20 }}>
                <div>
                    <h3>Local Video</h3>
                    <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '400px', borderRadius: '8px', background: '#000' }} />
                </div>
                <div>
                    <h3>Remote Video</h3>
                    <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '400px', borderRadius: '8px', background: '#000' }} />
                </div>
            </div>
        </div>
    );
}
