import { io } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const socketUrl = import.meta.env.VITE_SOCKET_URL || apiUrl.replace(/\/api\/?$/, '');

const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
});

export const connectSocket = () => {
  const token = localStorage.getItem('token');
  if (!token) return socket;

  socket.auth = { token };
  if (!socket.connected) socket.connect();
  return socket;
};

export const disconnectSocket = () => {
  if (socket.connected || socket.active) socket.disconnect();
  socket.auth = {};
};

export const getSocket = () => socket;

export default socket;
