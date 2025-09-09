import http from "http";
import express from "express";
import { WebSocketServer } from "ws";

const app = express();
app.use(express.static("public"));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let rooms = {}; // roomId -> [sockets]

wss.on("connection", (ws) => {
   ws.on("message", (msg) => {
      const data = JSON.parse(msg);

      if (data.type === "join") {
         ws.room = data.room;
         if (!rooms[data.room]) rooms[data.room] = [];
         rooms[data.room].push(ws);

         const peers = rooms[data.room];
         if (peers.length === 1) {
            ws.send(JSON.stringify({ type: "role", role: "caller" }));
         } else if (peers.length === 2) {
            ws.send(JSON.stringify({ type: "role", role: "callee" }));
            peers[0].send(JSON.stringify({ type: "peer-joined" }));
            ws.send(JSON.stringify({ type: "incoming" }));
         }
      }

      if (data.type === "accept") {
         const peers = rooms[data.room] || [];
         const caller = peers[0];
         if (caller) {
            caller.send(JSON.stringify({ type: "accepted" }));
         }
      }

      if (data.type === "reject") {
         const peers = rooms[data.room] || [];
         const caller = peers[0];
         if (caller) {
            caller.send(JSON.stringify({ type: "rejected" }));
         }
      }

      // forward offers/answers/candidates/end to other peer
      if (["offer", "answer", "candidate", "end"].includes(data.type)) {
         const peers = rooms[data.room] || [];
         peers.forEach((client) => {
            if (client !== ws) {
               client.send(JSON.stringify(data));
            }
         });
      }
   });

   ws.on("close", () => {
      if (ws.room && rooms[ws.room]) {
         rooms[ws.room] = rooms[ws.room].filter((c) => c !== ws);
         if (rooms[ws.room].length === 0) delete rooms[ws.room];
      }
   });
});

const PORT = 8080;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
