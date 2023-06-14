import { Server } from "socket.io";

import { autogpt } from "./conductor";

export function initServer() {
  const io = new Server({
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "*",
    },
  });

  function run(msg: string) {
    console.log('running autogpt with message: ', msg);
    autogpt.run([msg]).then((response) => {
      console.log("final response: ", response);
      io.emit("conductor:output", response);
    }).catch((err) => {
      console.error(err);
    });
  }

  io.on("connection", (socket) => {
    console.log("a user connected");
    socket.on("user:input", (msg) => {
      run(msg);
    });
    socket.on("disconnect", () => {
      console.log("user disconnected");
    });
  });

  io.listen(3044);
  console.log('SocketIO server listening on port 3009');
}
