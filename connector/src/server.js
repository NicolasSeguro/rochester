import http from "node:http";

const PORT = Number(process.env.PORT) || 3000;
const SERVICE = "cqr-connector";

async function readEgressIp() {
  const response = await fetch("https://api.ipify.org", {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`ipify respondió ${response.status}`);
  }
  return (await response.text()).trim();
}

const server = http.createServer((req, res) => {
  const path = req.url?.split("?")[0];
  if (path === "/health" || path === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: SERVICE }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});

server.listen(PORT, () => {
  console.log(`${SERVICE} escuchando en ${PORT}`);
  readEgressIp()
    .then((ip) => console.log(`egress_ip=${ip}`))
    .catch((error) => console.error("egress_check_failed", error.message));
});
