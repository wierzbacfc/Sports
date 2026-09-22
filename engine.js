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
        'football', // amerykański futbol w niektórych serwisach
        'nfl',
        'baseball',
        'mlb',
        'golf',
        'dart',
        'darts',
        'koszykowka',
        'basketball',
        'nba',
        'wnba',
        'boks',
        'boxing',
        'mma',
        'ufc',
        'ksw',
        'futsal',
        'kolarstwo',
        'cycling',
        'krykiet',
        'cricket',
        'hokej',
        'hockey',
        'icehockey',
        'snooker',
        'badminton',
        'curling',
        'pilkawodna',
        'pilkaplazowa'
    ];

    const lowerTierKeywords = [
        '2. liga', '3. liga', '4. liga', 'ii liga', 'iii liga', 'iv liga',
        'liga 2', 'liga ii', 'liga 3', 'liga iii',
        'u23', 'u21', 'u20', 'u19', 'u18', 'u17', 'u16', 'youth', 'młodzież',
        'challenger', 'itf',
        'metalkas 2 ekstraliga', '2. bundesliga', 'la liga 2', 'serie b',
        'revelação', 'dmpj', 'cro race',
        'celtic b', 'hearts b', 'rezerwy', 'ii ', ' 2', ' b ',
        'dumbravita', 'resita', 'mures', 'bucuresti', 'kladno', 'banik', 'birmingham – brooklyn'
    ];

    for (const ev of rawEvents) {
        if (!ev.startTime || !ev.title) continue;

        const cat = (ev.category || '').toLowerCase();
        const titleLower = ev.title.toLowerCase();

        // 1. Eliminacja niechcianych dyscyplin po kategorii i słowach
        if (excludedCategories.includes(cat)) continue;
        if (titleLower.includes('wnba') || titleLower.includes('nba') || titleLower.includes('nfl') || 
            titleLower.includes('mlb') || titleLower.includes('ufc') || titleLower.includes('ksw') ||
            titleLower.includes('futsal') || titleLower.includes('kolarstwo') || titleLower.includes('cycling') ||
            titleLower.includes('krykiet') || titleLower.includes('cricket') || titleLower.includes('hokej') ||
            titleLower.includes('snooker') || titleLower.includes('dart') || titleLower.includes('golf')) {
            continue;
        }

        // 2. Eliminacja rezerw i lig młodzieżowych/niższych
        if (lowerTierKeywords.some(kw => titleLower.includes(kw))) continue;

        // 3. Kategoryzacja wydarzenia do sportu / ligi (tylko TOP TIER)
        const displayCategory = categorizeEvent(ev.title, ev.category);
        if (!displayCategory) continue; // jeśli nie pasuje do żadnej elitarnej ligi/kategorii, odrzucamy!

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
                    displayCategory: displayCategory,
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

/**
 * Precyzyjna kategoryzacja wydarzenia na elegancki nagłówek z emoji (TOP TIER).
 * Zwraca null, jeśli wydarzenie nie kwalifikuje się do elity.
 */
function categorizeEvent(title, rawCategory) {
    const t = title.toLowerCase();
    const c = (rawCategory || '').toLowerCase();

    // 1. Magazyny sportowe
    if (t.includes('sportowy wieczór') || t.includes('liga+extra') || t.includes('liga plus extra') ||
        t.includes('magazyn pge ekstraliga') || t.includes('premier league review') ||
        t.includes('ligomistrzowe historie') || t.includes('magazyn ligi mistrzów') ||
        t.includes('turbokozak') || t.includes('liga narodów - zapowiedź') || t.includes('magazyn')) {
        return '📺 *Magazyny Sportowe:*';
    }

    // 2. Motorsport (Formuła 1 / MotoGP)
    if (c === 'motorsport' || c === 'f1' || c === 'formula1' || c === 'motogp' ||
        t.includes('formuła 1') || t.includes('formula 1') || t.includes('f1') ||
        t.includes('grand prix') || t.includes('motogp')) {
        return '🏎️ *Formuła 1 / MotoGP:*';
    }

    // 3. Żużel (PGE Ekstraliga / Speedway GP)
    if (c === 'zuzel' || c === 'speedway' || t.includes('ekstraliga') || t.includes('speedway gp') || t.includes('sgp')) {
        if (t.includes('metalkas') || t.includes('2. ekstraliga') || t.includes('dmpj')) return null;
        return '🏁 *PGE Ekstraliga / Żużel:*';
    }

    // 4. Tenis - WYŁĄCZNIE Polacy i tylko faza 1/2 lub finał
    if (c === 'tenis' || c === 'tennis') {
        const polish = ['świątek', 'swiatek', 'hurkacz', 'linette', 'fręch', 'frech', 'zieliński', 'zielinski', 'majchrzak', 'kawa', 'chwalińska', 'chwalinska', 'polska', 'poland'];
        const isPol = polish.some(k => t.includes(k));
        if (!isPol) return null;
        const isFinalOrSemi = t.includes('finał') || t.includes('final') || t.includes('półfinał') || t.includes('polfinal') || t.includes('semi');
        if (!isFinalOrSemi) return null;
        return '🎾 *Tenis (Występy Polaków - Finały):*';
    }

    // 5. Piłka ręczna - WYŁĄCZNIE Reprezentacja Polski
    if (c === 'pilkareczna' || c === 'handball') {
        if (t.includes('polska') || t.includes('poland')) {
            return '🤾 *Piłka Ręczna (Reprezentacja Polski):*';
        }
        return null;
    }

    // 6. Siatkówka - WYŁĄCZNIE mecze międzynarodowe / reprezentacje
    if (c === 'siatkowka' || c === 'volleyball') {
        if (t.includes('u20') || t.includes('u19') || t.includes('u21') || t.includes('u23')) return null;
        return '🏐 *Siatkówka (Mecze Międzynarodowe):*';
    }

    // 7. Piłka nożna - Ligi i Puchary
    // Liga Mistrzyń UEFA
    if (t.includes('liga mistrzyń') || t.includes('uwcl') || 
        ((t.includes(' k –') || t.includes(' k -') || t.includes('(k)')) && 
         (t.includes('bayern') || t.includes('manchester city') || t.includes('arsenal') || t.includes('real madrid') || t.includes('psg') || t.includes('servette') || t.includes('lyon') || t.includes('barcelona') || t.includes('chelsea') || t.includes('wolfsburg') || t.includes('juventus') || t.includes('koge')))) {
        return '⚽ *Liga Mistrzyń UEFA:*';
    }

    // Liga Mistrzów UEFA
    if (t.includes('liga mistrzów') || t.includes('champions league') || t.includes('ucl')) {
        return '⚽ *Liga Mistrzów UEFA:*';
    }

    // Liga Europy / Liga Konferencji
    if (t.includes('liga europy') || t.includes('europa league') || t.includes('liga konferencji') || t.includes('conference league')) {
        return '⚽ *Europejskie Puchary (LE / LK):*';
    }

    // PKO BP Ekstraklasa
    const ekstraklasaTeams = ['legia', 'lech', 'raków', 'rakow', 'jagiellonia', 'pogoń', 'pogon', 'górnik', 'cracovia', 'widzew', 'radomiak', 'piast', 'zagłębie', 'korona', 'stal mielec', 'śląsk', 'lechia', 'motor lublin', 'gks katowice', 'puszcza'];
    if (t.includes('ekstraklasa') || ekstraklasaTeams.some(team => t.includes(team))) {
        return '⚽ *PKO BP Ekstraklasa:*';
    }

    // Premier League
    const premierTeams = ['arsenal', 'chelsea', 'liverpool', 'manchester city', 'man city', 'manchester united', 'man united', 'tottenham', 'aston villa', 'newcastle', 'brighton', 'west ham', 'fulham', 'brentford', 'crystal palace', 'bournemouth', 'everton', 'nottingham', 'wolves', 'ipswich', 'leicester', 'southampton'];
    if (t.includes('premier league') || premierTeams.some(team => t.includes(team))) {
        return '⚽ *Premier League:*';
    }

    // La Liga
    const laLigaTeams = ['real madryt', 'real madrid', 'barcelona', 'atletico', 'athletic bilbao', 'real sociedad', 'villarreal', 'betis', 'sevilla', 'valencia', 'girona', 'celta vigo', 'espanyol', 'osasuna', 'mallorca'];
    if (t.includes('la liga') || t.includes('laliga') || laLigaTeams.some(team => t.includes(team))) {
        return '⚽ *La Liga:*';
    }

    // Serie A
    const serieATeams = ['inter', 'juventus', 'milan', 'napoli', 'roma', 'lazio', 'atalanta', 'fiorentina', 'bologna', 'torino', 'udinese', 'parma'];
    if (t.includes('serie a') || serieATeams.some(team => t.includes(team))) {
        return '⚽ *Serie A:*';
    }

    // Bundesliga
    const bundesligaTeams = ['bayern', 'dortmund', 'leverkusen', 'leipzig', 'stuttgart', 'eintracht frankfurt', 'wolfsburg', 'freiburg'];
    if (t.includes('bundesliga') || bundesligaTeams.some(team => t.includes(team))) {
        return '⚽ *Bundesliga:*';
    }

    // Ligue 1
    const ligue1Teams = ['psg', 'marseille', 'monaco', 'lyon', 'lille', 'lens', 'nice', 'rennes'];
    if (t.includes('ligue 1') || ligue1Teams.some(team => t.includes(team))) {
        return '⚽ *Ligue 1:*';
    }

    // Mecze Reprezentacji Narodowych (Eliminacje MŚ / Liga Narodów)
    if (t.includes('liga narodów') || t.includes('nations league') || t.includes('eliminacje') ||
        t.includes('irak – oman') || t.includes('arabia saudyjska – kuwejt') ||
        (t.includes('polska') && (t.includes('niemcy') || t.includes('francja') || t.includes('anglia') || t.includes('portugalia') || t.includes('chorwacja') || t.includes('szkocja')))) {
        return '⚽ *Mecze Reprezentacji / Liga Narodów:*';
    }

    // Pozostałe topowe kluby europejskie
    if ((t.includes('benfica') || t.includes('sporting') || t.includes('porto') || t.includes('ajax') || t.includes('psv') || t.includes('feyenoord') || (t.includes('celtic') && !t.includes('celtic b')) || t.includes('rangers')) && !t.includes(' 2') && !t.includes(' u2')) {
        return '⚽ *Europejskie Hity Ligowe:*';
    }

    return null;
}

/**
 * Buduje elegancki, posegregowany raport pod WhatsApp z podziałem na dni i ligi.
 */
function buildElegantReport(schedule) {
    let report = `🏆 *SPORTOWY ROZKŁAD JAZDY*\n\n`;

    const days = [
        { key: 'dzisiaj', label: 'DZIŚ' },
        { key: 'jutro', label: 'JUTRO' },
        { key: 'pojutrze', label: 'POJUTRZE' }
    ];

    let totalEvents = 0;

    for (const { key, label } of days) {
        const events = schedule[key] || [];
        if (events.length === 0) continue;

        // Grupujemy wydarzenia według kategorii
        const grouped = {};
        for (const ev of events) {
            const catHeader = ev.displayCategory || categorizeEvent(ev.title, ev.category);
            if (!catHeader) continue;

            if (!grouped[catHeader]) {
                grouped[catHeader] = [];
            }
            grouped[catHeader].push(ev);
        }

        const groupKeys = Object.keys(grouped);
        if (groupKeys.length === 0) continue;

        report += `*─── ${label} ───*\n\n`;

        for (const groupName of groupKeys) {
            report += `${groupName}\n`;
            for (const ev of grouped[groupName]) {
                report += `• *${ev.time}* ${ev.title}\n`;
                totalEvents++;
            }
            report += `\n`;
        }
    }

    return totalEvents > 0 ? report.trim() : null;
}

module.exports = {
    loadConfig,
    saveConfig,
    getCandidateDomains,
    fetchStrumykData,
    processEvents,
    categorizeEvent,
    buildElegantReport
};
