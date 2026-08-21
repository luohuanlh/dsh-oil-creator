import { createServer } from "node:net";

export async function findFreePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => { resolve(false); });
      server.listen(port, "127.0.0.1", () => {
        server.close(() => { resolve(true); });
      });
    });
    if (available) return port;
  }
  throw new Error(`no free port between ${start} and ${end}`);
}
