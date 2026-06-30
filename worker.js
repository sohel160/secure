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

  - name: proxy1
    type: http
    server: 103.115.242.240
    port: 2610

  - name: proxy2
    type: http
    server: 103.172.15.9
    port: 5452

  - name: proxy3
    type: http
    server: 144.48.108.121
    port: 5452

  - name: proxy4
    type: http
    server: 144.48.108.122
    port: 5452
    
  - name: proxy5
    type: http
    server: 103.172.14.1
    port: 5452

  - name: proxy6
    type: http
    server: 103.172.15.5
    port: 5452

  - name: proxy7
    type: http
    server: 103.172.15.17
    port: 5452
    
  - name: proxy8
    type: http
    server: 103.69.151.244
    port: 2610
    
  - name: proxy9
    type: http
    server: 103.172.14.253
    port: 5452

  - name: proxy10
    type: http
    server: 103.172.14.245
    port: 5452
    
    
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
  
  - name: SELECTOR🔥
    type: select
    proxies:
      - LOAD-BALANCE
      - STABLE
      
  - name: STABLE
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 10
    tolerance: 500000
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
  - DOMAIN-SUFFIX,googlevideo.com,SELECTOR🔥
  - DOMAIN-SUFFIX,youtube.com,SELECTOR🔥
  - DOMAIN-SUFFIX,gstatic.com,SELECTOR🔥
  - DOMAIN-SUFFIX,googleapis.com,SELECTOR🔥
  - DOMAIN-SUFFIX,cloudflare.com,SELECTOR🔥
  - DOMAIN-SUFFIX,akamaihd.net,SELECTOR🔥
  - DOMAIN-SUFFIX,fastly.net,SELECTOR🔥
  - DOMAIN-SUFFIX,cdn.jsdelivr.net,SELECTOR🔥
  - MATCH,SELECTOR🔥
`

    return new Response(config, {
      headers: { "Content-Type": "text/plain" }
    })
  }
}
