const socketIO = require('socket.io');

const initSocket = (server) => {
  const io = socketIO(server, {
    cors: { origin: "*" }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_ride', (rideId) => {
      socket.join(rideId);
      console.log(`Socket ${socket.id} joined ride ${rideId}`);
    });

    socket.on('update_location', (data) => {
      // Broadcast driver location to the specific ride room
      io.to(data.rideId).emit('location_updated', data.location);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  return io;
};

module.exports = initSocket;
