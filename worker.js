
export default {
  async fetch(request) {
    const url = new URL(request.url)

    // Token protection
    if (url.searchParams.get("token") !== "abc123") {
      return new Response("Forbidden", { status: 403 })
    }

    // Allow only Clash clients
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

    // SOCKS5 PROXY PROVIDER
    if (url.pathname === "/proxies") {

      const proxyList = [
        ["BD-01", "103.96.104.94", "test_w9tows80", "ISymbW1vAMtm"],
        ["BD-02", "103.174.193.185", "test_66bg046y", "v27QCNdKHIp9"],
        ["BD-03", "103.115.116.156", "test_rqcvhvxt", "zN48dHkD3nQI"],
        ["BD-04", "103.111.225.174", "test_w82z07oi", "8hxAXDdVSXm1"],
        ["BD-05", "103.135.136.69", "test_jeqmlef4", "xPAqV7Sl10X2"],
        ["BD-06", "103.135.136.77", "test_fi500y8e", "xLmXPXA9LQxU"],
        ["BD-07", "103.145.210.153", "test_gw0dz1m2", "8ffveETezrLX"],
        ["BD-08", "103.153.171.81", "test_wyym1cr1", "eTCDXK7HLsBw"],
        ["BD-09", "103.153.170.110", "test_zpr2jks3", "GnGuFZ1ZWHwM"],
        ["BD-10", "45.118.63.42", "test_be65rgl3", "aFjsGVbfc1pB"],
        ["BD-11", "103.79.182.146", "test_iupxdm79", "s5BGyLyajmFY"],
        ["BD-12", "103.111.224.46", "test_h02ot9ty", "vK2jWLXxUL2q"],
        ["BD-13", "182.48.83.111", "test_ehhqf6m0", "ASU7NILig2Pg"],
        ["BD-14", "103.73.39.132", "test_rdlyq9ah", "2M8p1cGy9BjX"],
        ["BD-15", "113.11.36.57", "test_9vbynsns", "QkI2wYmX0BMP"],
        ["BD-16", "103.244.49.40", "test_fwxipydb", "xhHEOP8HqLvc"],
        ["BD-17", "103.28.120.42", "test_hngo6t6d", "J60UJOOUxzYA"],
        ["BD-18", "103.124.236.20", "test_itb7br9q", "yVr2QtTY4NpH"],
        ["BD-19", "103.92.212.253", "test_ssl4zq0p", "v2vhGY950PDU"],
        ["BD-20", "103.143.234.102", "test_z5sz6l1i", "6S1gRFdAC9Pc"],
        ["BD-21", "114.134.91.98", "test_3oj3j1yr", "pGgQUaVsAuoU"],
        ["BD-22", "103.178.73.1", "test_xqpme6kk", "c4SwNDiWbQzA"],
        ["BD-23", "202.5.36.149", "test_w39rjy9w", "YbU2PMDOBfoU"],
        ["BD-24", "103.220.205.13", "test_gymhn5xs", "jJY4ZSlzoYVF"],
        ["BD-25", "103.118.152.36", "test_dramhvhx", "Ss26qeuR5tF5"],
        ["BD-26", "103.16.25.141", "test_i4etgi7z", "nbdDPwtEyFs7"],
        ["BD-27", "103.231.34.56", "test_i4p1fjqc", "nQDA0V0d9Ro7"],
        ["BD-28", "114.130.99.148", "test_qg8bplxn", "fg3k6N6bf0g7"],
        ["BD-29", "103.148.10.248", "test_4v6note5", "sOXw2AUaPDmo"]
      ]

      const proxies = "proxies:\n" + proxyList.map(
        ([name, server, username, password]) =>
          `  - name: "🇧🇩 ${name}"\n` +
          `    type: socks5\n` +
          `    server: ${server}\n` +
          `    port: 9169\n` +
          `    username: "${username}"\n` +
          `    password: "${password}"`
      ).join("\n")

      return new Response(proxies, {
        headers: {
          "Content-Type": "text/yaml; charset=utf-8",
          "Cache-Control": "no-store"
        }
      })
    }

    // MAIN CLASH CONFIG
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
      headers: {
        "Content-Type": "text/yaml; charset=utf-8"
      }
    })
  }
}
