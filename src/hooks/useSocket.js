import { useEffect } from 'react';
import { socket, connectSocket, disconnectSocket } from '../realtime/socket';
import { useAuth } from './useAuth';

export const useSocket = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.token) {
      connectSocket(user.token);
    }
    return () => disconnectSocket();
  }, [user]);

  return socket;
};
