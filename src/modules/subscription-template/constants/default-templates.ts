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

// Shadowrocket native profile translated from the "selfcore" Mihomo template.
// Nodes normally come from the user's node subscription; group members are
// filled with the panel's node names so the profile works on its own as well.
// Shadowrocket has no GEOSITE rules, so v2fly categories map to blackmatrix7
// rule sets (RULE-SET for typed rules, DOMAIN-SET for their large domain parts).
export const DEFAULT_TEMPLATE_SHADOWROCKET = `[General]
bypass-system = true
ipv6 = false
prefer-ipv6 = false
private-ip-answer = true
dns-server = https://doh.pub/dns-query, https://dns.alidns.com/dns-query
fallback-dns-server = system
hijack-dns = 8.8.8.8:53, 8.8.4.4:53
skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local, captive.apple.com
tun-excluded-routes = 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24, 192.168.0.0/16, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4, 255.255.255.255/32, 239.255.255.250/32
udp-policy-not-supported-behaviour = REJECT

[Proxy Group]
APAC = url-test,#!remnawave-proxy-names,interval=600,tolerance=50,timeout=5,url=https://www.gstatic.com/generate_204
YouTube = url-test,#!remnawave-proxy-names,interval=600,tolerance=50,timeout=5,url=https://www.gstatic.com/generate_204
Telegram = url-test,interval=600,tolerance=50,timeout=5,url=https://flora.web.telegram.org/apiw,policy-regex-filter=(?i)hkg|sin|tyo|🇭🇰|🇸🇬|🇯🇵
AI = select,#!remnawave-proxy-names,policy-regex-filter=(?i)^((?!hkg).)*$
Steam = select,DIRECT,#!remnawave-proxy-names
SteamCN = select,DIRECT,#!remnawave-proxy-names
Emby = select,DIRECT,#!remnawave-proxy-names
speedtest = select,#!remnawave-proxy-names
Europe = url-test,interval=600,tolerance=50,timeout=5,url=https://www.gstatic.com/generate_204,policy-regex-filter=(?i)fra|🇩🇪
America = url-test,interval=600,tolerance=50,timeout=5,url=https://www.gstatic.com/generate_204,policy-regex-filter=(?i)lax|🇺🇸
苹果服务 = select,DIRECT,#!remnawave-proxy-names
微软服务 = select,DIRECT,#!remnawave-proxy-names

[Rule]
# Cloudflare Tunnel (cloudflared)
DOMAIN-SUFFIX,argotunnel.com,APAC
DOMAIN-SUFFIX,cftunnel.com,APAC
IP-CIDR,198.41.192.0/16,APAC,no-resolve
IP-CIDR6,2606:4700:a0::/44,APAC,no-resolve
IP-CIDR6,2606:4700:a8::/44,APAC,no-resolve

DOMAIN-SUFFIX,nodeseek.com,Europe

# Own proxy CloudFront endpoints: bypass other proxies
DOMAIN,d23n4ybafu40b0.cloudfront.net,DIRECT
DOMAIN,d2k5w4v5vmzrsb.cloudfront.net,DIRECT
DOMAIN,d2qfe69g6bw5hw.cloudfront.net,DIRECT
DOMAIN,d3hpyc0owkykx2.cloudfront.net,DIRECT
DOMAIN,d3ofljyr18lykj.cloudfront.net,DIRECT
DOMAIN,dhwz8xjxh53nl.cloudfront.net,DIRECT
DOMAIN,dpie9xf9b7ufr.cloudfront.net,DIRECT

# 必要放行与自有域名
DOMAIN,pbh.mugi.uk,DIRECT
DOMAIN,aiyunfra.mugi.uk,DIRECT
DOMAIN,fra.mugi.uk,DIRECT
DOMAIN,htv.mugi.uk,DIRECT
DOMAIN-SUFFIX,iplark.com,DIRECT
DOMAIN,download.docker.com,DIRECT
DOMAIN-SUFFIX,misaka.be,DIRECT
DOMAIN-SUFFIX,wnacg.com,APAC
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Lan/Lan.list,DIRECT

# 广告、跟踪及恶意请求拦截 (geosite:category-ads-all)
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/AdvertisingLite/AdvertisingLite.list,REJECT
DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/AdvertisingLite/AdvertisingLite_Domain.list,REJECT

# YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Google/Google.list,YouTube
DOMAIN-SUFFIX,ggpht.com,YouTube
DOMAIN-SUFFIX,google.com,YouTube
DOMAIN,dns.google,YouTube
DOMAIN-SUFFIX,ytimg.com,YouTube
DOMAIN,proactivebackend-pa.googleapis.com,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/YouTube/YouTube.list,YouTube

# AI (geosite:category-ai-!cn)
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/OpenAI/OpenAI.list,AI
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Claude/Claude.list,AI
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Gemini/Gemini.list,AI
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Copilot/Copilot.list,AI

# Emby
DOMAIN,rule34video.mugi.uk,Emby
DOMAIN-KEYWORD,htv,Emby
DOMAIN-SUFFIX,dav.mugi.uk,Emby
DOMAIN-SUFFIX,aemby.de,Emby
DOMAIN-SUFFIX,miraiemby.com,Emby
DOMAIN-SUFFIX,emby.my,Emby
DOMAIN-SUFFIX,emby.pro,Emby
DOMAIN-KEYWORD,emby,Emby
DOMAIN-SUFFIX,876645.xyz,Emby
DOMAIN-SUFFIX,boomio-cdn.com,Emby
DOMAIN-SUFFIX,us-storage.mugi.uk,Emby
DOMAIN-SUFFIX,zdbb.net,Emby
DOMAIN-SUFFIX,feiyue.lol,Emby
DOMAIN-SUFFIX,heisi.org,Emby
DOMAIN-SUFFIX,cn2gias.uk,Emby
DOMAIN-SUFFIX,apple-cdn.net,Emby
DOMAIN-SUFFIX,28.al,Emby
DOMAIN-SUFFIX,startspoint.com,Emby
DOMAIN-SUFFIX,xxlb.net,Emby
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Emby/Emby.list,Emby

# 测速及媒体服务器
DOMAIN,tp1.chtm.hinet.net,speedtest
DOMAIN-SUFFIX,ziffstatic.com,speedtest
DOMAIN-KEYWORD,speedtest,speedtest
DOMAIN-KEYWORD,ookla,speedtest
DOMAIN-WILDCARD,speed*.*,speedtest
DOMAIN-WILDCARD,*.speed*.*,speedtest
DOMAIN,speed.cloudflare.com,speedtest
DOMAIN-SUFFIX,ooklaserver.net,speedtest
DOMAIN,speedtest.net,speedtest
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Speedtest/Speedtest.list,speedtest

# 应用与服务分流
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/NetEase/NetEase.list,DIRECT
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/SteamCN/SteamCN.list,SteamCN
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Steam/Steam.list,Steam
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Telegram/Telegram.list,Telegram
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Netflix/Netflix.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/PrimeVideo/PrimeVideo.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Disney/Disney.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/HBO/HBO.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Hulu/Hulu.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Spotify/Spotify.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/AbemaTV/AbemaTV.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/DAZN/DAZN.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/DiscoveryPlus/DiscoveryPlus.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/TikTok/TikTok.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Twitch/Twitch.list,YouTube
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/GitHub/GitHub.list,APAC
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Apple/Apple.list,苹果服务
DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Apple/Apple_Domain.list,苹果服务
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/Microsoft/Microsoft.list,微软服务

# 最终规则
DOMAIN-KEYWORD,cloudflare,APAC
GEOIP,CN,DIRECT
RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China.list,DIRECT
DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China_Domain.list,DIRECT
DOMAIN-KEYWORD,ip,APAC
DOMAIN-SUFFIX,mugi.uk,APAC

# 地区分流(按目标 IP 归属地)
GEOIP,HK,APAC
GEOIP,MO,APAC
GEOIP,TW,APAC
GEOIP,JP,APAC
GEOIP,KR,APAC
GEOIP,SG,APAC
GEOIP,MY,APAC
GEOIP,TH,APAC
GEOIP,VN,APAC
GEOIP,PH,APAC
GEOIP,ID,APAC
GEOIP,KH,APAC
GEOIP,MM,APAC
GEOIP,LA,APAC
GEOIP,BN,APAC
GEOIP,IN,APAC
GEOIP,PK,APAC
GEOIP,BD,APAC
GEOIP,LK,APAC
GEOIP,NP,APAC
GEOIP,MN,APAC
GEOIP,AU,APAC
GEOIP,NZ,APAC
GEOIP,GB,Europe
GEOIP,IE,Europe
GEOIP,DE,Europe
GEOIP,FR,Europe
GEOIP,NL,Europe
GEOIP,BE,Europe
GEOIP,LU,Europe
GEOIP,CH,Europe
GEOIP,AT,Europe
GEOIP,IT,Europe
GEOIP,ES,Europe
GEOIP,PT,Europe
GEOIP,SE,Europe
GEOIP,NO,Europe
GEOIP,DK,Europe
GEOIP,FI,Europe
GEOIP,IS,Europe
GEOIP,PL,Europe
GEOIP,CZ,Europe
GEOIP,SK,Europe
GEOIP,HU,Europe
GEOIP,RO,Europe
GEOIP,BG,Europe
GEOIP,GR,Europe
GEOIP,HR,Europe
GEOIP,SI,Europe
GEOIP,RS,Europe
GEOIP,EE,Europe
GEOIP,LV,Europe
GEOIP,LT,Europe
GEOIP,UA,Europe
GEOIP,MD,Europe
GEOIP,BY,Europe
GEOIP,RU,Europe
GEOIP,TR,Europe
GEOIP,CY,Europe
GEOIP,MT,Europe
GEOIP,US,America
GEOIP,CA,America
GEOIP,MX,America
GEOIP,BR,America
GEOIP,AR,America
GEOIP,CL,America
GEOIP,CO,America
GEOIP,PE,America
GEOIP,VE,America
GEOIP,EC,America
GEOIP,UY,America
GEOIP,PY,America
GEOIP,BO,America
GEOIP,PA,America
GEOIP,CR,America
GEOIP,GT,America
GEOIP,DO,America
GEOIP,PR,America
GEOIP,JM,America

FINAL,APAC
`;
