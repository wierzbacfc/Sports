const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');

const CANDIDATE_DOMAINS = [
    'https://strumyk.ca',
    'https://strumyk.cv',
    'https://strumyk.xyz',
    'https://strumyk.cc',
    'https://strumyk.tv',
    'https://strims.top'
];

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {}
    return { current_domain: 'https://strumyk.ca' };
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {}
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Domain Discovery
async function getCandidateDomains() {
    const list = [];
    try {
        const rentryRes = await fetch('https://rentry.co/strumyk', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (rentryRes.ok) {
            const rentryHtml = await rentryRes.text();
            const matches = rentryHtml.match(/https?:\/\/(?:www\.)?strumyk\.[a-z]{2,4}\/?/gi);
            if (matches && matches.length > 0) {
                const unique = [...new Set(matches.map(u => u.replace(/\/$/, '')))];
                list.push(...unique);
            }
        }
    } catch (e) {}

    for (const d of CANDIDATE_DOMAINS) {
        if (!list.includes(d)) list.push(d);
    }
    return list;
}

// 2. CDP Stealth Scraper
async function sendCDP(ws, method, params = {}, id = 1) {
    return new Promise((resolve, reject) => {
        const msg = JSON.stringify({ id, method, params });
        const handler = (event) => {
            try {
                const res = JSON.parse(event.data);
                if (res.id === id) {
                    ws.removeEventListener('message', handler);
                    if (res.error) reject(res.error);
                    else resolve(res.result);
                }
            } catch (e) {}
        };
        ws.addEventListener('message', handler);
        ws.send(msg);
    });
}

function getBrowserExecutable() {
    if (process.platform === 'win32') {
        const paths = [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
        return 'msedge.exe';
    } else {
        return process.env.CHROME_BIN || '/usr/bin/google-chrome' || 'google-chrome' || 'google-chrome-stable';
    }
}

async function fetchStrumykData(preferredDomain) {
    const browserPath = getBrowserExecutable();
    const profileDir = path.join(__dirname, '.browser_profile');

    // Build candidates list: preferred first, then all others
    const allCandidates = await getCandidateDomains();
    const candidateUrls = [preferredDomain, ...allCandidates.filter(d => d !== preferredDomain)];

    console.log(`[CDP] Uruchamianie przeglądarki (${browserPath})...`);
    console.log(`[CDP] Kolejka sprawdzanych domen:`, candidateUrls);

    const args = [
        '--remote-debugging-port=9333',
        '--remote-allow-origins=*',
        `--user-data-dir=${profileDir}`,
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        '--window-size=1920,1080',
        '--lang=pl-PL,pl',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank'
    ];

    if (process.platform === 'linux') {
        args.push(
            '--headless=new',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        );
    }

    const browserProc = spawn(browserPath, args);

    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            const res = await fetch('http://127.0.0.1:9333/json/version');
            if (res.ok) break;
        } catch (e) {}
    }

    const listRes = await fetch('http://127.0.0.1:9333/json/list');
    const targets = await listRes.json();
    const pageTarget = targets.find(t => t.type === 'page');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve));

    let msgId = 1;
    await sendCDP(ws, 'Page.enable', {}, msgId++);
    await sendCDP(ws, 'Runtime.enable', {}, msgId++);
    await sendCDP(ws, 'Fetch.enable', { patterns: [{ urlPattern: '*' }] }, msgId++);

    // Blokada przekierowań reklamowych
    ws.addEventListener('message', async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.method === 'Fetch.requestPaused') {
                const { requestId, request } = data.params;
                const url = request.url;
                const isAllowed = url.includes('strumyk') || 
                                  url.includes('cloudflare.com') || 
                                  url.includes('challenges.cloudflare.com') ||
                                  url.startsWith('data:') ||
                                  url.startsWith('blob:');

                if (isAllowed) {
                    ws.send(JSON.stringify({ id: msgId++, method: 'Fetch.continueRequest', params: { requestId } }));
                } else {
                    ws.send(JSON.stringify({ id: msgId++, method: 'Fetch.failRequest', params: { requestId, errorReason: 'Aborted' } }));
                }
            }
        } catch (e) {}
    });

    // Pełny stealth fingerprinting
    await sendCDP(ws, 'Page.addScriptToEvaluateOnNewDocument', {
        source: `
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['pl-PL', 'pl', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            window.open = () => null;
        `
    }, msgId++);

    let extractedEvents = null;
    let winningDomain = null;

    // Próbuj każdą domenę po kolei, jeśli poprzednia nie odpowiada danymi
    for (const domain of candidateUrls) {
        console.log(`[CDP] Próba załadowania domeny: ${domain}...`);
        try {
            await sendCDP(ws, 'Page.navigate', { url: domain }, msgId++);
        } catch (e) {
            console.log(`[CDP] Błąd nawigacji do ${domain}:`, e.message);
            continue;
        }

        // Czekaj do 15 sekund na załadowanie danych z tej domeny
        for (let s = 0; s < 15; s++) {
            await sleep(1000);
            try {
                const evalRes = await sendCDP(ws, 'Runtime.evaluate', {
                    expression: `(() => {
                        const list = (typeof eventsData !== 'undefined' ? eventsData : [])
                            .concat(typeof popularEvents !== 'undefined' ? popularEvents : []);
                        if (list.length > 0) {
                            return list.map(e => ({
                                id: e.id,
                                category: e.category,
                                startTime: e.startTime,
                                title: e.title?.pl ? (e.title.pl.home + ' – ' + e.title.pl.away) : (typeof e.title === 'string' ? e.title : '')
                            }));
                        }
                        return null;
                    })()`,
                    returnByValue: true
                }, msgId++);

                const val = evalRes?.result?.value;
                if (val && Array.isArray(val) && val.length > 0) {
                    console.log(`[CDP] Sukces! Wyekstrahowano ${val.length} wydarzeń z domeny: ${domain}`);
                    extractedEvents = val;
                    winningDomain = domain;
                    break;
                }
            } catch (e) {}
        }

        if (extractedEvents && extractedEvents.length > 0) {
            break; // Mamy dane, nie trzeba sprawdzać kolejnych domen
        } else {
            console.log(`[CDP] Domena ${domain} nie zwróciła listy meczów (możliwa blokada). Przechodzę do kolejnej...`);
        }
    }

    ws.close();
    browserProc.kill();

    if (winningDomain) {
        saveConfig({ current_domain: winningDomain });
    }

    return extractedEvents;
}

// 3. Reguły Filtrowania Użytkownika & Podział na Dni
function processEvents(rawEvents) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);

    const schedule = {
        dzisiaj: [],
        jutro: [],
        pojutrze: []
    };

    const excludedCategories = [
        'americanfootball',
        'baseball',
        'golf',
        'dart',
        'koszykowka'
    ];

    const lowerTierKeywords = [
        '2. liga', '3. liga', 'u23', 'u19', 'challenger',
        'metalkas 2 ekstraliga', '2. bundesliga', 'la liga 2',
        'serie b', 'revelação', 'dmpj', 'cro race', 'itf'
    ];

    for (const ev of rawEvents) {
        if (!ev.startTime || !ev.title) continue;

        const cat = (ev.category || '').toLowerCase();
        const titleLower = ev.title.toLowerCase();

        // 1. Eliminacja niechcianych dyscyplin
        if (excludedCategories.includes(cat)) continue;
        if (titleLower.includes('wnba') || titleLower.includes('nfl') || titleLower.includes('mlb')) continue;

        // 2. Piłka ręczna: WYŁĄCZNIE Reprezentacja Polski
        if (cat === 'pilkareczna') {
            const isPoland = titleLower.includes('polska') || titleLower.includes('poland');
            if (!isPoland) continue;
        }

        // 3. Eliminacja niższych poziomów rozgrywkowych
        const isLowerTier = lowerTierKeywords.some(kw => titleLower.includes(kw));
        if (isLowerTier) continue;

        // 4. Tenis: eliminacja challengerów
        if (cat === 'tenis' && (titleLower.includes('challenger') || titleLower.includes('itf'))) {
            continue;
        }

        // Przypisanie do dnia
        const evDate = new Date(ev.startTime * 1000);
        const evDay = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate());

        let targetBucket = null;
        if (evDay.getTime() === today.getTime()) {
            targetBucket = schedule.dzisiaj;
        } else if (evDay.getTime() === tomorrow.getTime()) {
            targetBucket = schedule.jutro;
        } else if (evDay.getTime() === dayAfter.getTime()) {
            targetBucket = schedule.pojutrze;
        }

        if (targetBucket) {
            const timeStr = evDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
            if (!targetBucket.some(e => e.title === ev.title && e.time === timeStr)) {
                targetBucket.push({
                    time: timeStr,
                    startTime: ev.startTime,
                    category: ev.category,
                    title: ev.title
                });
            }
        }
    }

    for (const key of Object.keys(schedule)) {
        schedule[key].sort((a, b) => a.startTime - b.startTime);
    }

    return schedule;
}

module.exports = {
    loadConfig,
    saveConfig,
    getCandidateDomains,
    fetchStrumykData,
    processEvents
};
