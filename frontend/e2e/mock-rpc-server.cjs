const http = require("node:http");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  if (req.method === "POST") {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let id;
      try {
        id = JSON.parse(body).id;
      } catch {
        id = null;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: "No fixture data" },
      }));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({
    title: "Resource Missing",
    status: 404,
    detail: "No fixture data",
  }));
});

server.listen(8765, "127.0.0.1");
