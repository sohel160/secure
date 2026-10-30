
const BASE_URL = "https://xnetapi.xrorx.com";

const KEY_PARTS = [
  "Vkh3R1JTZEhqYlNQ",
  "VEw0Vi82WmsyM1Rs",
  "MW16eGNmZkFBMzcz",
  "WUJnODRTbz0="
];

const SALT = "xn3t_v2_s@lt_2026";

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function decodeUrlBase64(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - s.length % 4) % 4);
  return decodeBase64(s);
}

async function deriveKeys() {
  const joined = KEY_PARTS.join("");
  const step1 = decodeBase64(joined);
  const password = decodeBase64(
    new TextDecoder().decode(step1)
  );

  const material = await crypto.subtle.importKey(
    "raw",
    password,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(SALT),
        iterations: 100000,
        hash: "SHA-256"
      },
      material,
      256
    )
  );

  return {
    hmac: derived.slice(0, 16),
    aes: derived.slice(16, 32)
  };
}

async function decryptCredential(token, keys) {
  const data = decodeUrlBase64(token);

  if (data.length < 57 || data[0] !== 0x80) {
    throw new Error("Invalid credential token");
  }

  const macOffset = data.length - 32;
  const signedData = data.slice(0, macOffset);
  const suppliedMac = data.slice(macOffset);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    keys.hmac,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    hmacKey,
    suppliedMac,
    signedData
  );

  if (!valid) {
    throw new Error("Credential HMAC verification failed");
  }

  const aesKey = await crypto.subtle.importKey(
    "raw",
    keys.aes,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv: data.slice(9, 25)
    },
    aesKey,
    data.slice(25, macOffset)
  );

  const parts = new TextDecoder().decode(plaintext).split(":");

  if (parts.length !== 4) {
    throw new Error("Invalid proxy credential format");
  }

  const [ip, port, username, password] = parts;

  if (
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ||
    !/^\d+$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535
  ) {
    throw new Error("Invalid proxy address");
  }

  return { ip, port: Number(port), username, password };
}

async function apiRequest(path, token, body) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "X-Client-Version": "2.0.0",
    "X-Request-ID": `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`,
    "X-Timestamp": String(Date.now())
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(BASE_URL + path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Xrorx API ${path}: HTTP ${response.status}`);
  }

  return response.json();
}

async function refreshProxies(env) {
  // Login and obtain a fresh bearer token
  const login = await apiRequest(
    "/auth/login",
    null,
    {
      email: env.XRORX_EMAIL,
      password: env.XRORX_PASSWORD
    }
  );

  const bearer = login.accessToken || login.access_token;

  if (!bearer) {
    throw new Error("Login did not return an access token");
  }

  // Check server update information
  await apiRequest(
    "/api/server-checker/last-updated",
    bearer
  );

  // Retrieve encrypted proxies
  const rawProxies = await apiRequest(
    "/api/server-checker/proxies",
    bearer
  );

  if (!Array.isArray(rawProxies)) {
    throw new Error("Unexpected proxy API response");
  }

  const keys = await deriveKeys();
  const output = [];

  for (const proxy of rawProxies) {
    const encrypted =
      proxy.legacyEncryptedCredentials ||
      proxy.legacy_encrypted_credentials ||
      proxy.encryptedCredentials ||
      proxy.encrypted_credentials;

    if (!encrypted) continue;

    try {
      const credentials = await decryptCredential(encrypted, keys);

      output.push({
        name: proxy.serverName || proxy.server_name || `BD-${output.length + 1}`,
        ...credentials
      });
    } catch (error) {
      console.error("Proxy decryption failed:", error.message);
    }
  }

  if (output.length === 0) {
    throw new Error("No valid proxies decrypted; keeping previous cache");
  }

  // Save the new list atomically as one KV value
  await env.PROXY_KV.put(
    "latest_proxies",
    JSON.stringify(output)
  );

  await env.PROXY_KV.put(
    "refresh_status",
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      count: output.length,
      success: true
    })
  );

  console.log(`Successfully refreshed ${output.length} proxies`);
}

function makeProxyYaml(proxies) {
  const entries = proxies.map((p, i) => {
    return [
      `  - name: ${JSON.stringify(`🇧🇩 ${p.name || `BD-${i + 1}`}`)}`,
      "    type: socks5",
      `    server: ${p.ip}`,
      `    port: ${p.port}`,
      `    username: ${JSON.stringify(p.username)}`,
      `    password: ${JSON.stringify(p.password)}`
    ].join("\n");
  });

  return "proxies:\n" + entries.join("\n") + "\n";
}

function mainConfig(origin) {
  return `proxy-providers:
  myprovider:
    type: http
    url: "${origin}/proxies?token=abc123"
    interval: 60
    path: ./proxies.yaml
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 60

proxy-groups:
  - name: SELECTOR🙈
    type: select
    proxies:
      - STABLE
      - LOAD-BALANCE
      - ALL

  - name: STABLE
    type: url-test
    url: https://www.gstatic.com/generate_204
    interval: 120
    tolerance: 20
    lazy: false
    use:
      - myprovider

  - name: LOAD-BALANCE
    type: load-balance
    strategy: consistent-hashing
    url: https://www.gstatic.com/generate_204
    interval: 120
    lazy: false
    use:
      - myprovider

  - name: ALL
    type: select
    use:
      - myprovider

rules:
  - DOMAIN-SUFFIX,googlevideo.com,SELECTOR🙈
  - DOMAIN-SUFFIX,youtube.com,SELECTOR🙈
  - DOMAIN-SUFFIX,gstatic.com,SELECTOR🙈
  - DOMAIN-SUFFIX,googleapis.com,SELECTOR🙈
  - DOMAIN-SUFFIX,cloudflare.com,SELECTOR🙈
  - DOMAIN-SUFFIX,akamaihd.net,SELECTOR🙈
  - DOMAIN-SUFFIX,fastly.net,SELECTOR🙈
  - DOMAIN-SUFFIX,cdn.jsdelivr.net,SELECTOR🙈
  - MATCH,SELECTOR🙈`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.searchParams.get("token") !== env.WORKER_TOKEN) {
      return new Response("Forbidden", { status: 403 });
    }

    const ua = request.headers.get("User-Agent") || "";

    const allowedUA = [
      "Clash",
      "clash",
      "Meta",
      "FiClash",
      "Stash",
      "okhttp",
      "Go-http-client"
    ];

    if (!allowedUA.some(a => ua.includes(a))) {
      return new Response("404 Not Found", { status: 404 });
    }

    if (url.pathname === "/proxies") {
      const cached = await env.PROXY_KV.get("latest_proxies");

      if (!cached) {
        return new Response("Proxy list not initialized", {
          status: 503
        });
      }

      return new Response(
        makeProxyYaml(JSON.parse(cached)),
        {
          headers: {
            "Content-Type": "text/yaml; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    if (url.pathname === "/status") {
      const status = await env.PROXY_KV.get("refresh_status");

      return new Response(status || '{"success":false}', {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    return new Response(mainConfig(url.origin), {
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      refreshProxies(env).catch(error => {
        console.error("Scheduled refresh failed:", error.message);
      })
    );
  }
};
