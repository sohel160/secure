export default {
  async fetch(request) {

    const url = new URL(request.url)

    // 🔐 token protection
    if (url.searchParams.get("token") !== "abc123") {
      return new Response("Forbidden", { status: 403 })
    }

    // 🔍 allow only Clash clients
    const ua = request.headers.get("User-Agent") || ""

    const allowedUA = [
      "Clash",
      "clash",
      "Meta",
      "FiClash",
      "Stash",
      "okhttp"
    ]

    if (!allowedUA.some(a => ua.includes(a))) {
      return new Response("404 Not Found", { status: 404 })
    }

    // =========================
    // 📦 PROXY LIST ENDPOINT
    // =========================
    if (url.pathname === "/proxies") {

      const proxies = `
proxies:

  - name: "🇧🇩 Server-1"
    type: http
    server: 103.84.39.93
    port: 3258

  - name: "🇧🇩 Server-2"
    type: http
    server: 103.84.39.94
    port: 3258

  - name: "🇧🇩 Server-3"
    type: http
    server: 103.84.39.92
    port: 3258

  - name: "🇧🇩 Server-4"
    type: http
    server: 103.84.39.95
    port: 3258

  - name: "🇧🇩 Server-5"
    type: http
    server: 103.84.39.113
    port: 3258

  - name: "🇧🇩 Server-6"
    type: http
    server: 113.212.109.211
    port: 8945

  - name: "🇧🇩 Server-7"
    type: http
    server: 113.212.109.210
    port: 8945

  - name: "🇧🇩 Server-8"
    type: http
    server: 113.212.109.209
    port: 8945

  - name: "🇧🇩 Server-9"
    type: http
    server: 113.212.109.208
    port: 8945

  - name: "🇧🇩 Server-10"
    type: http
    server: 113.212.109.208
    port: 8945

  - name: "🇧🇩 Server-11"
    type: http
    server: 103.84.36.225
    port: 52148

  - name: "🇧🇩 Server-12"
    type: http
    server: 103.84.36.73
    port: 52148

  - name: "🇧🇩 Server-13"
    type: http
    server: 103.84.36.169
    port: 52148

  - name: "🇧🇩 Server-14"
    type: http
    server: 103.84.37.225
    port: 52148

  - name: "🇧🇩 Server-15"
    type: http
    server: 103.84.37.161
    port: 52148

  - name: "🇧🇩 Server-16"
    type: http
    server: 103.84.36.237
    port: 22622

  - name: "🇧🇩 Server-17"
    type: http
    server: 103.84.37.196
    port: 22622

  - name: "🇧🇩 Server-18"
    type: http
    server: 103.84.37.123
    port: 22622

  - name: "🇧🇩 Server-19"
    type: http
    server: 103.84.37.72
    port: 22622

  - name: "🇧🇩 Server-20"
    type: http
    server: 113.212.109.208
    port: 8945
    
`

      return new Response(proxies, {
        headers: { "Content-Type": "text/plain" }
      })
    }

    // =========================
    // ⚡ MAIN CONFIG
    // =========================
    const config = `
proxy-providers:
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
      - LOAD-BALANCE
      - STABLE
      
  - name: STABLE
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    use:
      - myprovider

  - name: LOAD-BALANCE
    type: load-balance
    strategy: round-robin
    url: http://www.gstatic.com/generate_204
    interval: 60
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
  - MATCH,SELECTOR🙈
`

    return new Response(config, {
      headers: { "Content-Type": "text/plain" }
    })
  }
}
