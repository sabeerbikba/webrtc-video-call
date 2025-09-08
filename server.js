import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // <-- fixed

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

wss.on('connection', (ws) => {
   ws.on('message', (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch (e) { return; }
      const { type, room, payload } = data;

      if (type === 'join') {
         if (!rooms.has(room)) rooms.set(room, []);
         const arr = rooms.get(room);
         if (arr.length >= 2) { ws.send(JSON.stringify({ type: 'full' })); return; }
         arr.push(ws);
         ws.room = room;
         ws.role = arr.length === 1 ? 'initiator' : 'callee';
         ws.send(JSON.stringify({ type: 'joined', role: ws.role }));

         if (arr.length === 2) {
            const [a, b] = arr;
            try { b.send(JSON.stringify({ type: 'incoming' })); } catch (e) { }
            try { a.send(JSON.stringify({ type: 'peer-joined' })); } catch (e) { }
         }
      }

      if (type === 'accept') {
         const arr = rooms.get(room) || [];
         const initiator = arr.find(s => s.role === 'initiator');
         if (initiator) initiator.send(JSON.stringify({ type: 'callee-accepted' }));
      }

      if (['offer', 'answer', 'ice'].includes(type)) {
         const arr = rooms.get(room) || [];
         arr.forEach(client => {
            if (client !== ws) { try { client.send(JSON.stringify({ type, payload })); } catch (e) { } }
         });
      }

      if (type === 'end') {
         const arr = rooms.get(room) || [];
         arr.forEach(client => { if (client !== ws) { try { client.send(JSON.stringify({ type: 'end' })); } catch (e) { } } });
         rooms.delete(room);
      }
   });

   ws.on('close', () => {
      const room = ws.room;
      if (!room) return;
      const arr = rooms.get(room) || [];
      const remaining = arr.filter(s => s !== ws);
      if (remaining.length === 0) rooms.delete(room);
      else rooms.set(room, remaining);
      remaining.forEach(client => { try { client.send(JSON.stringify({ type: 'peer-left' })); } catch (e) { } });
   });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
