const { loadConfig, saveConfig, discoverWorkingDomain, fetchStrumykData, processEvents } = require('./engine');
const { runAgent1Curator, runAgent2Verifier } = require('./ai_agents');
const fs = require('fs');

// Odczyt wyłącznie ze zmiennych środowiskowych (np. GitHub Secrets lub plik .env)
const PHONE = process.env.CALLMEBOT_PHONE;
const API_KEY = process.env.CALLMEBOT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Podział długiej wiadomości na części (limit WhatsApp/CallMeBot: ~2000 znaków)
function splitMessage(text, maxChunk = 2000) {
    if (text.length <= maxChunk) return [text.trim()];

    const lines = text.split('\n');
    const chunks = [];
    let current = '';

    for (const line of lines) {
        if ((current + line).length > maxChunk) {
            if (current.trim()) chunks.push(current.trim());
            current = '';
        }
        current += line + '\n';
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

async function sendWhatsApp(text) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(PHONE)}&text=${encodeURIComponent(text)}&apikey=${API_KEY}`;
    const res = await fetch(url);
    const body = await res.text();
    return { ok: res.ok, body };
}

async function run() {
    console.log('=== Uruchamianie Codziennego Raportu Sportowego ===');

    if (!PHONE || !API_KEY) {
        console.error('❌ BŁĄD: Brak zdefiniowanych zmiennych CALLMEBOT_PHONE lub CALLMEBOT_API_KEY!');
        console.error('Upewnij się, że dodałeś je w GitHub Repository Secrets lub w środowisku uruchomieniowym.');
        process.exit(1);
    }

    // 1. Sprawdzenie i auto-discovery domeny Strumyka
    let cfg = loadConfig();
    let activeDomain = cfg.current_domain;

    try {
        const testRes = await fetch(activeDomain, { method: 'HEAD' });
        if (testRes.status !== 200 && testRes.status !== 403) throw new Error();
    } catch (e) {
        console.log(`Domena ${activeDomain} jest niedostępna. Rozpoczynam wykrywanie nowej domeny...`);
        activeDomain = await discoverWorkingDomain();
        cfg.current_domain = activeDomain;
        saveConfig(cfg);
    }

    console.log(`Aktywna domena Strumyka: ${activeDomain}`);

    // 2. Pobranie danych ze Strumyka (CDP Stealth)
    const rawEvents = await fetchStrumykData(activeDomain);
    if (!rawEvents || rawEvents.length === 0) {
        console.error('❌ Błąd: Nie udało się pobrać listy wydarzeń.');
        process.exit(1);
    }

    console.log(`Pobrano łącznie ${rawEvents.length} surowych wydarzeń.`);

    // 3. Wstępna segregacja na dni (Dziś, Jutro, Pojutrze)
    const preliminarySchedule = processEvents(rawEvents);

    let finalReportText = '';

    // 4. Zaangażowanie Zespołu Agentów AI (jeśli podano GEMINI_API_KEY)
    if (GEMINI_API_KEY) {
        console.log('\n--- Uruchamianie Zespołu 2 Agentów AI (Gemini) ---');
        try {
            // Agent 1: Ekspert & Kurator
            const agent1Draft = await runAgent1Curator(GEMINI_API_KEY, preliminarySchedule);

            // Agent 2: Weryfikator & Cenzor Jakości
            finalReportText = await runAgent2Verifier(GEMINI_API_KEY, agent1Draft);
            console.log('✅ Zespół Agentów AI pomyślnie zweryfikował i sformatował raport!');
        } catch (err) {
            console.warn('⚠️ Ostrzeżenie: Błąd podczas pracy agentów AI:', err.message);
            console.log('Przełączanie na zapasowy algorytm regułowy...');
        }
    } else {
        console.log('ℹ️ Brak GEMINI_API_KEY - generowanie raportu za pomocą wbudowanego filtra regułowego.');
    }

    // Jeśli brak AI lub wystąpił błąd, używamy wbudowanego formatowania awaryjnego
    if (!finalReportText) {
        finalReportText = `🏆 *SPORTOWY ROZKŁAD JAZDY*\n\n`;
        finalReportText += `*─── DZIŚ ───*\n`;
        for (const ev of preliminarySchedule.dzisiaj) {
            finalReportText += `• *${ev.time}* ${ev.title}\n`;
        }
        if (preliminarySchedule.jutro.length > 0) {
            finalReportText += `\n*─── JUTRO ───*\n`;
            for (const ev of preliminarySchedule.jutro) {
                finalReportText += `• *${ev.time}* ${ev.title}\n`;
            }
        }
        if (preliminarySchedule.pojutrze.length > 0) {
            finalReportText += `\n*─── POJUTRZE ───*\n`;
            for (const ev of preliminarySchedule.pojutrze) {
                finalReportText += `• *${ev.time}* ${ev.title}\n`;
            }
        }
    }

    // 5. Podział na wiadomości i wysyłka przez CallMeBot na WhatsApp
    const messages = splitMessage(finalReportText, 2000);
    console.log(`\nPrzygotowano ${messages.length} części wiadomości do wysłania na WhatsApp (${PHONE}).`);

    for (let i = 0; i < messages.length; i++) {
        console.log(`Wysyłanie części ${i + 1}/${messages.length}...`);
        const result = await sendWhatsApp(messages[i]);
        console.log(`Status odpowiedzi:`, result.body.substring(0, 100));
        if (i < messages.length - 1) {
            console.log('Czekam 5 sekund przed kolejną wiadomością...');
            await sleep(5000);
        }
    }

    console.log('✅ Raport został pomyślnie dostarczony na WhatsApp!');
}

run().catch(err => {
    console.error('Błąd krytyczny:', err);
    process.exit(1);
});
