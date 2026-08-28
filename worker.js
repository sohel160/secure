export default {
  async fetch(request) {

    const url = new URL(request.url)

    // 🔐 Token protection
    if (url.searchParams.get("token") !== "abc123") {
      return new Response("Forbidden", { status: 403 })
    }

    // 🔍 Allow only Clash clients
    const ua = request.headers.get("User-Agent") || ""

    const allowedUA = [
      "Clash",
      "clash",
      "Meta",
      "FiClash",
      "Stash",
      "okhttp",
      "Go-http-client"
    ]

    if (!allowedUA.some(a => ua.includes(a))) {
      return new Response("404 Not Found", { status: 404 })
    }

    // =========================
    // 📦 PROXY LIST ENDPOINT
    // =========================
    if (url.pathname === "/proxies") {

      const proxies = `proxies:
  - name: "HTTP-01"
    type: http
    server: 103.115.242.240
    port: 2610

  - name: "HTTP-06"
    type: http
    server: 103.196.233.41
    port: 6321

  - name: "HTTP-07"
    type: http
    server: 103.196.235.234
    port: 6321

  - name: "HTTP-08"
    type: http
    server: 103.196.235.233
    port: 6321

  - name: "HTTP-09"
    type: http
    server: 103.115.242.157
    port: 2610

  - name: "HTTP-10"
    type: http
    server: 103.115.242.1
    port: 7860

  - name: "HTTP-11"
    type: http
    server: 180.149.232.85
    port: 2610

  - name: "HTTP-13"
    type: http
    server: 180.149.234.22
    port: 2610

  - name: "HTTP-14"
    type: http
    server: 103.84.36.237
    port: 22622

  - name: "HTTP-15"
    type: http
    server: 103.84.37.196
    port: 22622

  - name: "HTTP-19"
    type: http
    server: 103.84.37.123
    port: 22622

  - name: "HTTP-20"
    type: http
    server: 103.84.37.72
    port: 22622

  - name: "BD-01"
    type: http
    server: 103.84.39.93
    port: 3258

  - name: "BD-02"
    type: http
    server: 103.84.39.94
    port: 3258

  - name: "BD-03"
    type: http
    server: 103.84.39.92
    port: 3258

  - name: "BD-04"
    type: http
    server: 103.84.39.95
    port: 3258

  - name: "BD-05"
    type: http
    server: 103.84.39.113
    port: 3258`

      return new Response(proxies, {
        headers: { "Content-Type": "text/yaml; charset=utf-8" }
      })
    }

    // =========================
    // ⚡ MAIN CONFIG
    // =========================
    const config = `proxy-providers:
  myprovider:
    type: http
    url: "${url.origin}/proxies?token=abc123"
    interval: 3600
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
  - MATCH,SELECTOR🙈`

    return new Response(config, {
      headers: { "Content-Type": "text/yaml; charset=utf-8" }
    })
  }
}

