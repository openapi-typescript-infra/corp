/* eslint-disable no-console */
import net from 'net';
import { spawn } from 'child_process';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5432;
const RETRY_INTERVAL = 2500;
const INITIAL_WAIT = 5000;
const POST_WAIT = 2500;
let waitCount = 1;

function waitForCloudSql() {
  const client = new net.Socket();

  client.setTimeout(RETRY_INTERVAL);

  client.connect(PORT, 'localhost', () => {
    client.end();

    setTimeout(() => {
      // Spawn a new Node.js process to run the main application
      console.log('CloudSql is available. Running specified command.');
      const mainApp = spawn(process.execPath, process.argv.slice(2), {
        stdio: 'inherit',
      });

      mainApp.on('exit', (code) => {
        fetch('http://localhost:9091/quitquitquit', {
          method: 'POST',
        })
          .then(() => {
            console.log('CloudSql quitquitquit successful');
          })
          .catch((error) => {
            console.error('CloudSql quitquitquit failed', error);
          })
          .finally(() => {
            process.exit(code || 0);
          });
      });
    }, POST_WAIT);
  });

  client.on('error', () => {
    console.log(`CloudSql unavailable after ${(waitCount * RETRY_INTERVAL) / 1000}s`);
  });

  client.on('timeout', () => {
    client.destroy();
    if (waitCount++ > 30) {
      console.error('CloudSql unavailable. Exiting.');
      process.exit(1);
    }
    setTimeout(waitForCloudSql, RETRY_INTERVAL);
  });
}

setTimeout(waitForCloudSql, INITIAL_WAIT);
