
const BASE_URL = "https://xnetapi.xrorx.com";

const KEY_PARTS = [
  "Vkh3R1JTZEhqYlNQ",
  "VEw0Vi82WmsyM1Rs",
  "MW16eGNmZkFBMzcz",
  "WUJnODRTbz0="
];

const SALT = "xn3t_v2_s@lt_2026";

// =============================
// BASE64
// =============================

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function decodeUrlBase64(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - s.length % 4) % 4);
  return decodeBase64(s);
}

// =============================
// CRYPTO KEY DERIVATION
// =============================

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

// =============================
// FERNET DECRYPTION
// =============================

async function decryptCredential(token, keys) {
  const data = decodeUrlBase64(token);

  if (
    data.length < 73 ||
    data[0] !== 0x80 ||
    (data.length - 57) % 16 !== 0
  ) {
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
    throw new Error("HMAC verification failed");
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
    throw new Error("Invalid credential format");
  }

  const [ip, port, username, password] = parts;
  const octets = ip.split(".").map(Number);

  if (
    octets.length !== 4 ||
    octets.some(n => !Number.isInteger(n) || n < 0 || n > 255) ||
    !/^\d+$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535
  ) {
    throw new Error("Invalid proxy address");
  }

  return {
    ip,
    port: Number(port),
    username,
    password
  };
}

// =============================
// XRORX API
// =============================

async function apiRequest(path, token, body) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "X-Client-Version": "2.0.0",
    "X-Request-ID":
      `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`,
    "X-Timestamp": String(Date.now())
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(BASE_URL + path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000)
  });

  if (!response.ok) {
    throw new Error(
      `Xrorx API ${path}: HTTP ${response.status}`
    );
  }

  return response.json();
}

// =============================
// REFRESH PROXY DATABASE
// =============================

async function refreshProxies(env) {
  if (!env.XRORX_EMAIL || !env.XRORX_PASSWORD) {
    throw new Error("Missing Xrorx credentials");
  }

  if (!env.PROXY_KV) {
    throw new Error("PROXY_KV binding missing");
  }

  console.log("Starting Xrorx proxy refresh");

  // Login
  const login = await apiRequest(
    "/auth/login",
    null,
    {
      email: env.XRORX_EMAIL,
      password: env.XRORX_PASSWORD
    }
  );

  const bearer =
    login.accessToken || login.access_token;

  if (!bearer) {
    throw new Error("Bearer token missing");
  }

  // Last updated
  const lastUpdated = await apiRequest(
    "/api/server-checker/last-updated",
    bearer
  );

  console.log(
    "Xrorx last updated:",
    lastUpdated.lastUpdated
  );

  // Pull encrypted proxies
  const rawProxies = await apiRequest(
    "/api/server-checker/proxies",
    bearer
  );

  if (!Array.isArray(rawProxies)) {
    throw new Error("Invalid proxy API response");
  }

  console.log(
    `Received ${rawProxies.length} encrypted proxies`
  );

  const keys = await deriveKeys();
  const output = [];
  let failed = 0;

  for (const proxy of rawProxies) {
    const encrypted =
      proxy.legacyEncryptedCredentials ||
      proxy.legacy_encrypted_credentials ||
      proxy.encryptedCredentials ||
      proxy.encrypted_credentials;

    if (!encrypted) {
      failed++;
      continue;
    }

    try {
      const credentials = await decryptCredential(
        encrypted,
        keys
      );

      output.push({
        name:
          proxy.serverName ||
          proxy.server_name ||
          `BD-${output.length + 1}`,
        ...credentials
      });

    } catch (error) {
      failed++;
      console.error(
        "Proxy decryption failed:",
        error.message
      );
    }
  }

  // Never overwrite good data with an empty list
  if (output.length === 0) {
    throw new Error(
      "No valid proxies decrypted; old cache preserved"
    );
  }

  // One KV write for the entire proxy list
  await env.PROXY_KV.put(
    "latest_proxies",
    JSON.stringify(output)
  );

  await env.PROXY_KV.put(
    "refresh_status",
    JSON.stringify({
      success: true,
      updatedAt: new Date().toISOString(),
      count: output.length,
      failed,
      apiCount: rawProxies.length,
      serverLastUpdated: lastUpdated.lastUpdated
    })
  );

  console.log(
    `Refresh complete: ${output.length} valid, ${failed} failed`
  );

  return {
    success: true,
    count: output.length,
    failed
  };
}

// =============================
// YAML GENERATOR
// =============================

function makeProxyYaml(proxies) {
  const entries = proxies.map((p, i) => {
    return [
      `  - name: ${JSON.stringify(
        `🇧🇩 ${p.name || `BD-${i + 1}`}`
      )}`,
      "    type: socks5",
      `    server: ${p.ip}`,
      `    port: ${p.port}`,
      `    username: ${JSON.stringify(p.username)}`,
      `    password: ${JSON.stringify(p.password)}`
    ].join("\n");
  });

  return "proxies:\n" + entries.join("\n") + "\n";
}

// =============================
// MAIN CLASH CONFIG
// =============================

function mainConfig(origin, workerToken) {
  const providerURL =
    `${origin}/proxies?token=${encodeURIComponent(workerToken)}`;

  return `proxy-providers:
  myprovider:
    type: http
    url: "${providerURL}"
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

// =============================
// WORKER
// =============================

export default {

  async fetch(request, env) {
    const url = new URL(request.url);

    // Authentication
    const suppliedToken = url.searchParams.get("token");

    if (
      !env.WORKER_TOKEN ||
      !suppliedToken ||
      suppliedToken !== env.WORKER_TOKEN
    ) {
      return new Response("Forbidden", {
        status: 403
      });
    }

    // Clash clients only
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
      return new Response("404 Not Found", {
        status: 404
      });
    }

    // Proxy provider
    if (url.pathname === "/proxies") {
      const cached = await env.PROXY_KV.get(
        "latest_proxies"
      );

      if (!cached) {
        return new Response(
          "Proxy list not initialized. Wait for the first Cron refresh.",
          { status: 503 }
        );
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

    // Refresh status
    if (url.pathname === "/status") {
      const status = await env.PROXY_KV.get(
        "refresh_status"
      );

      return new Response(
        status || JSON.stringify({
          success: false,
          message: "No refresh completed yet"
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // Manual initial refresh
    if (url.pathname === "/refresh") {
      try {
        const result = await refreshProxies(env);

        return Response.json(result);

      } catch (error) {
        console.error("Manual refresh failed:", error.message);

        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 502 }
        );
      }
    }

    // Main Clash configuration
    if (url.pathname === "/") {
      return new Response(
        mainConfig(url.origin, env.WORKER_TOKEN),
        {
          headers: {
            "Content-Type": "text/yaml; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    return new Response("Not Found", {
      status: 404
    });
  },

  // Automatic refresh every minute
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      refreshProxies(env).catch(async error => {
        console.error(
          "Scheduled refresh failed:",
          error.message
        );

        await env.PROXY_KV.put(
          "refresh_status",
          JSON.stringify({
            success: false,
            error: error.message,
            failedAt: new Date().toISOString()
          })
        );
      })
    );
  }
};
