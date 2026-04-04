import type { Server as SocketServer } from "socket.io";

/** Socket.IO channel name for everyone subscribed to a DB room. */
export function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

let io: SocketServer | null = null;

/** Called once from `attachSocket` so HTTP routes can broadcast. */
export function registerIo(instance: SocketServer) {
  io = instance;
}

export function getIo(): SocketServer | null {
  return io;
}
