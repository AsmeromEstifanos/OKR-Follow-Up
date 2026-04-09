const http = require("http");
const next = require("next");

const port = Number(process.env.PORT || process.env.APP_PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const dev = false;

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    http
      .createServer((req, res) => {
        void handle(req, res);
      })
      .listen(port, host, () => {
        console.log(`OKR app running on http://${host}:${port}`);
      });
  })
  .catch((error) => {
    console.error("Failed to start Next.js server", error);
    process.exit(1);
  });
