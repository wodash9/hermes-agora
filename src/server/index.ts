import 'dotenv/config';
import { createServer } from 'node:http';
import { loadServerConfig } from './config.js';
import { JsonMessageStore } from './store.js';
import { createAgoraApp } from './app.js';
import { attachAgoraSocket } from './socket.js';

const config = loadServerConfig();
const store = await JsonMessageStore.open(config.dataFile);
const { app, events } = await createAgoraApp({ config, store });
const httpServer = createServer(app);

attachAgoraSocket(httpServer, config, events, store);

httpServer.listen(config.port, () => {
  console.log(`Hermes Agora listening on :${config.port}`);
});
