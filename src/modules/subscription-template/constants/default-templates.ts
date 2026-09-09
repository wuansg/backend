export const DEFAULT_TEMPLATE_MIHOMO = `mixed-port: 7890
socks-port: 7891
redir-port: 7892
allow-lan: true
mode: global
log-level: info
external-controller: 127.0.0.1:9090
dns:
  enable: true
  use-hosts: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 1.1.1.1
    - 8.8.8.8
  nameserver:
    - 1.1.1.1
    - 8.8.8.8
  fake-ip-filter:
    - '*.lan'
    - stun.*.*.*
    - stun.*.*
    - time.windows.com
    - time.nist.gov
    - time.apple.com
    - time.asia.apple.com
    - '*.openwrt.pool.ntp.org'
    - pool.ntp.org
    - ntp.ubuntu.com
    - time1.apple.com
    - time2.apple.com
    - time3.apple.com
    - time4.apple.com
    - time5.apple.com
    - time6.apple.com
    - time7.apple.com
    - time1.google.com
    - time2.google.com
    - time3.google.com
    - time4.google.com
    - api.joox.com
    - joox.com
    - '*.xiami.com'
    - '*.msftconnecttest.com'
    - '*.msftncsi.com'
    - '+.xboxlive.com'
    - '*.*.stun.playstation.net'
    - xbox.*.*.microsoft.com
    - '*.ipv6.microsoft.com'
    - speedtest.cros.wr.pvp.net

proxies: # LEAVE THIS LINE!

proxy-groups:
  - name: '→ Remnawave'
    type: 'select'
    proxies: # LEAVE THIS LINE!

rules:
  - MATCH,→ Remnawave
`;

export const DEFAULT_TEMPLATE_STASH = `proxy-groups:
  - name: → Remnawave
    type: select
    proxies: # LEAVE THIS LINE!

proxies: # LEAVE THIS LINE!

rules:
  - SCRIPT,quic,REJECT
  - DOMAIN-SUFFIX,iphone-ld.apple.com,DIRECT
  - DOMAIN-SUFFIX,lcdn-locator.apple.com,DIRECT
  - DOMAIN-SUFFIX,lcdn-registration.apple.com,DIRECT
  - DOMAIN-SUFFIX,push.apple.com,DIRECT
  - PROCESS-NAME,v2ray,DIRECT
  - PROCESS-NAME,Surge,DIRECT
  - PROCESS-NAME,ss-local,DIRECT
  - PROCESS-NAME,privoxy,DIRECT
  - PROCESS-NAME,trojan,DIRECT
  - PROCESS-NAME,trojan-go,DIRECT
  - PROCESS-NAME,naive,DIRECT
  - PROCESS-NAME,CloudflareWARP,DIRECT
  - PROCESS-NAME,Cloudflare WARP,DIRECT
  - IP-CIDR,162.159.193.0/24,DIRECT,no-resolve
  - PROCESS-NAME,p4pclient,DIRECT
  - PROCESS-NAME,Thunder,DIRECT
  - PROCESS-NAME,DownloadService,DIRECT
  - PROCESS-NAME,qbittorrent,DIRECT
  - PROCESS-NAME,Transmission,DIRECT
  - PROCESS-NAME,fdm,DIRECT
  - PROCESS-NAME,aria2c,DIRECT
  - PROCESS-NAME,Folx,DIRECT
  - PROCESS-NAME,NetTransport,DIRECT
  - PROCESS-NAME,uTorrent,DIRECT
  - PROCESS-NAME,WebTorrent,DIRECT
  - GEOIP,LAN,DIRECT
  - MATCH,→ Remnawave
script:
  shortcuts:
    quic: network == 'udp' and dst_port == 443
dns:
  default-nameserver:
    - 1.1.1.1
    - 1.0.0.1
  nameserver:
    - 1.1.1.1
    - 1.0.0.1
log-level: warning
mode: rule

`;

export const DEFAULT_TEMPLATE_CLASH = `mixed-port: 7890
socks-port: 7891
redir-port: 7892
allow-lan: true
mode: global
log-level: info
external-controller: 127.0.0.1:9090
dns:
  enable: true
  use-hosts: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 1.1.1.1
    - 8.8.8.8
  nameserver:
    - 1.1.1.1
    - 8.8.8.8
  fake-ip-filter:
    - '*.lan'
    - stun.*.*.*
    - stun.*.*
    - time.windows.com
    - time.nist.gov
    - time.apple.com
    - time.asia.apple.com
    - '*.openwrt.pool.ntp.org'
    - pool.ntp.org
    - ntp.ubuntu.com
    - time1.apple.com
    - time2.apple.com
    - time3.apple.com
    - time4.apple.com
    - time5.apple.com
    - time6.apple.com
    - time7.apple.com
    - time1.google.com
    - time2.google.com
    - time3.google.com
    - time4.google.com
    - api.joox.com
    - joox.com
    - '*.xiami.com'
    - '*.msftconnecttest.com'
    - '*.msftncsi.com'
    - '+.xboxlive.com'
    - '*.*.stun.playstation.net'
    - xbox.*.*.microsoft.com
    - '*.ipv6.microsoft.com'
    - speedtest.cros.wr.pvp.net

proxies: # LEAVE THIS LINE!

proxy-groups:
  - name: '→ Remnawave'
    type: 'select'
    proxies: # LEAVE THIS LINE!

rules:
  - MATCH,→ Remnawave`;

export const DEFAULT_TEMPLATE_SURGE = `[General]
loglevel = notify
dns-server = system, 223.5.5.5, 119.29.29.29, 8.8.8.8
encrypted-dns-server = tls://dot.pub
encrypted-dns-follow-outbound-mode = false
skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local, e.crashlynatics.com
internet-test-url = http://wifi.vivo.com.cn/generate_204
proxy-test-url = http://www.google.com/generate_204
test-timeout = 4
ipv6 = false
ipv6-vif = disabled
allow-wifi-access = false
exclude-simple-hostnames = true
show-error-page-for-reject = true
udp-priority = false
compatibility-mode = 1

[Proxy]
#!remnawave-proxies

[Proxy Group]
escapee = select, DIRECT, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/06jichang/FishPort.png
emby = select, DIRECT, include-all-proxies=1, no-alert=1, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/04ProxySoft/emby(1).png
Telegram = smart, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/04ProxySoft/telegram.png
YouTube = smart, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/04ProxySoft/Youtube.png, url=http://redirector.googlevideo.com/report_mapping
APPLE = smart, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/03CNSoft/apple.png
ai = select, DIRECT, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/04ProxySoft/chatgpt(balck).png
tg-nl = smart, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/04ProxySoft/telegram.png
tg-us = smart, include-all-proxies=1, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/04ProxySoft/telegram.png
speedtest = select, DIRECT, include-all-proxies=1, update-interval=0, no-alert=0, hidden=0, icon-url=https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/03CNSoft/speedtest.png

[Rule]
DOMAIN-SUFFIX,challenges.cloudflare.com,escapee
DOMAIN-SUFFIX,stun.cloudflare.com,escapee
DOMAIN-SUFFIX,sdl.mugi.uk,DIRECT
DOMAIN-SUFFIX,uhdnow.online,DIRECT
DOMAIN-SUFFIX,uhdnow.com,DIRECT
RULE-SET,https://raw.githubusercontent.com/QuixoticHeart/rule-set/refs/heads/ruleset/loon/apns.list,escapee
DOMAIN-SUFFIX,aemby.de,emby
DOMAIN-SUFFIX,28.al,emby
DOMAIN,1dot1dot1dot1.cloudflare-dns.com,DIRECT
DOMAIN-SUFFIX,hdslb.com,DIRECT
DOMAIN-SUFFIX,biliapi.com,DIRECT
DOMAIN-SUFFIX,bilibili.com,DIRECT
DOMAIN-SUFFIX,xhscdn.com,DIRECT
DOMAIN-SUFFIX,xiaohongshu.com,DIRECT
DOMAIN-SUFFIX,qq.com,DIRECT
IP-CIDR,43.174.154.21/32,DIRECT,no-resolve
DOMAIN-SUFFIX,meituan.com,DIRECT
DOMAIN-SUFFIX,alibabausercontent.com,DIRECT
DOMAIN-SUFFIX,taobao.com,DIRECT
DOMAIN-SUFFIX,xxlb.net,DIRECT
DOMAIN-SUFFIX,emby.pro,emby
DOMAIN,proactivebackend-pa.googleapis.com,ai
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/Google/Google.list,YouTube
DOMAIN-SUFFIX,miraiemby.com,emby
DOMAIN-SUFFIX,startspoint.com,emby
RULE-SET,https://kelee.one/Tool/Loon/Lsr/SpeedtestChina.lsr,DIRECT
RULE-SET,https://kelee.one/Tool/Loon/Lsr/SpeedtestInternational.lsr,speedtest
RULE-SET,https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/rule/openai.list,ai
DOMAIN,www.r34anim.com,escapee
DOMAIN,panel.silverspoon.top,escapee
DOMAIN-SUFFIX,longemby.com,emby
DOMAIN-SUFFIX,nodeseek.com,escapee
DOMAIN-SUFFIX,push.apple.com,APPLE
DOMAIN,46-courier.push.apple.com,APPLE
DOMAIN,free.28.al,emby
DOMAIN-SUFFIX,aliapp.org,DIRECT
DOMAIN-SUFFIX,alicdn.com,DIRECT
DOMAIN-SUFFIX,nube.sh,DIRECT
DOMAIN-SUFFIX,aws.a2z.com,DIRECT
DOMAIN-SUFFIX,amazon.com,DIRECT
DOMAIN,speed.cloudflare.com,speedtest
DOMAIN,arm2.silverspoon.top,escapee
DOMAIN,stream2.jingzhe.pro,emby
DOMAIN,emby.jingzhe.pro,emby
DOMAIN-SUFFIX,apple-cdn.net,emby
DOMAIN,aaa.silverspoon.top,escapee
DOMAIN,gateway.icloud.com,APPLE
DOMAIN,ch.silverspoon.top,DIRECT
DOMAIN,lite.cn2gias.uk,emby
DOMAIN,status.silverspoon.top,escapee
DOMAIN,lala-jpiij.010004.xyz,emby
DOMAIN-SUFFIX,emby.my,emby
DOMAIN,eggtartemby.itsmyduty.top,emby
IP-CIDR,5.28.192.0/18,tg-nl,no-resolve
DOMAIN-SUFFIX,nanflix.net,emby
DOMAIN,ll.892818.xyz,emby
DOMAIN-SUFFIX,ooklaserver.net,speedtest
DOMAIN,api.iturrit.com,Telegram
DOMAIN-SUFFIX,jsq.vban.xyz,emby
DOMAIN-SUFFIX,sfcj.org,emby
IP-CIDR,95.161.76.100/31,REJECT-DROP,no-resolve
DOMAIN-SUFFIX,silverspoon.top,DIRECT
DOMAIN,emby.heisi.org,emby
DOMAIN,emby3.mcjoker.xyz,emby
DOMAIN-SUFFIX,lite.saturdayvideo.top,emby
DOMAIN-SUFFIX,misty.cx,emby
DOMAIN,emby.bangumi.ca,emby
DOMAIN,ch.feiyue.lol,emby
USER-AGENT,Forward*/*,emby
DOMAIN,image.tmdb.org,emby
USER-AGENT,Forward/**,emby
DOMAIN-SUFFIX,misaka.be,DIRECT
IP-CIDR,91.108.56.130/32,Telegram,no-resolve
IP-CIDR6,2001:b28:f23f:f005::a/128,Telegram,no-resolve
IP-CIDR,149.154.175.53/32,tg-us,no-resolve
IP-CIDR6,2001:b28:f23d:f001::a/128,tg-us,no-resolve
IP-CIDR,149.154.167.51/32,tg-nl,no-resolve
IP-CIDR6,2001:67c:4e8:f002::a/128,tg-nl,no-resolve
IP-CIDR,149.154.167.91/32,tg-nl,no-resolve
IP-CIDR6,2001:67c:4e8:f004::a/128,tg-nl,no-resolve
IP-CIDR,149.154.160.0/20,Telegram,no-resolve
IP-CIDR,91.108.0.0/16,Telegram,no-resolve
IP-CIDR,185.76.151.0/24,Telegram,no-resolve
IP-CIDR,91.105.192.0/23,Telegram,no-resolve
IP-CIDR6,2001:b28:f23c::/48,Telegram,no-resolve
IP-CIDR6,2001:b28:f23d::/48,Telegram,no-resolve
IP-CIDR6,2001:b28:f23f::/48,Telegram,no-resolve
IP-CIDR6,2001:67c:4e8::/48,Telegram,no-resolve
IP-CIDR6,2a0a:f280::/32,Telegram,no-resolve
RULE-SET,https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/proxy/YouTube.list,YouTube
RULE-SET,https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/direct/cn.list,DIRECT
GEOIP,CN,DIRECT
FINAL,escapee,dns-failed

[Host]
91.108.56.106 = 91.108.56.147
91.108.56.131 = 91.108.56.147
`;

export const DEFAULT_TEMPLATE_SINGBOX = {
    log: {
        disabled: true,
        level: 'debug',
        timestamp: true,
    },
    dns: {
        servers: [
            {
                type: 'https',
                tag: 'cf-doh',
                server: '1.1.1.1',
                server_port: 443,
                path: '/dns-query',
                detour: 'direct',
            },
            {
                type: 'udp',
                tag: 'cf-dns',
                server: '1.1.1.1',
                server_port: 53,
                detour: 'direct',
            },
            {
                type: 'fakeip',
                tag: 'remote',
                inet4_range: '198.18.0.0/15',
            },
        ],
        rules: [
            {
                query_type: 'AAAA',
                action: 'reject',
            },
            {
                query_type: 'A',
                action: 'route',
                server: 'remote',
            },
        ],
        final: 'cf-doh',
        strategy: 'ipv4_only',
        cache_capacity: 4096,
    },
    inbounds: [
        {
            type: 'tun',
            mtu: 9000,
            interface_name: 'tun125',
            tag: 'tun-in',
            address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
            auto_route: true,
            strict_route: true,
            endpoint_independent_nat: true,
            stack: 'mixed',
            platform: {
                http_proxy: {
                    enabled: true,
                    server: '127.0.0.1',
                    server_port: 2412,
                },
            },
        },
        {
            type: 'mixed',
            tag: 'mixed-in',
            listen: '127.0.0.1',
            listen_port: 2412,
            users: [],
            set_system_proxy: false,
        },
    ],
    outbounds: [
        {
            type: 'selector',
            tag: '→ Remnawave',
            interrupt_exist_connections: true,
            outbounds: null,
        },
        {
            type: 'direct',
            tag: 'direct',
        },
    ],
    route: {
        rules: [
            {
                action: 'sniff',
            },
            {
                type: 'logical',
                mode: 'or',
                rules: [
                    {
                        protocol: 'dns',
                    },
                    {
                        port: 53,
                    },
                ],
                action: 'hijack-dns',
            },
            {
                action: 'route',
                ip_is_private: true,
                outbound: 'direct',
            },
        ],
        auto_detect_interface: true,
        default_domain_resolver: {
            server: 'cf-dns',
            strategy: 'ipv4_only',
        },
    },
    experimental: {
        clash_api: {
            external_controller: '127.0.0.1:9090',
            external_ui: 'yacd',
            external_ui_download_url: 'https://github.com/MetaCubeX/Yacd-meta/archive/gh-pages.zip',
            external_ui_download_detour: 'direct',
            default_mode: 'rule',
        },
        cache_file: {
            enabled: true,
            path: 'remnawave.db',
            cache_id: 'remnawave',
            store_fakeip: true,
            store_dns: true,
        },
    },
};

export const DEFAULT_TEMPLATE_XRAY_JSON = {
    dns: {
        servers: ['1.1.1.1', '1.0.0.1'],
        queryStrategy: 'UseIP',
    },
    routing: {
        rules: [
            {
                type: 'field',
                protocol: ['bittorrent'],
                outboundTag: 'direct',
            },
        ],
        domainMatcher: 'hybrid',
        domainStrategy: 'IPIfNonMatch',
    },
    inbounds: [
        {
            tag: 'socks',
            port: 10808,
            listen: '127.0.0.1',
            protocol: 'socks',
            settings: {
                udp: true,
                auth: 'noauth',
            },
            sniffing: {
                enabled: true,
                routeOnly: false,
                destOverride: ['http', 'tls', 'quic'],
            },
        },
        {
            tag: 'http',
            port: 10809,
            listen: '127.0.0.1',
            protocol: 'http',
            settings: {
                allowTransparent: false,
            },
            sniffing: {
                enabled: true,
                routeOnly: false,
                destOverride: ['http', 'tls', 'quic'],
            },
        },
    ],
    outbounds: [
        {
            tag: 'direct',
            protocol: 'freedom',
        },
        {
            tag: 'block',
            protocol: 'blackhole',
        },
    ],
};
