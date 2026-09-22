const { loadConfig, saveConfig, discoverWorkingDomain, fetchStrumykData, processEvents, buildElegantReport } = require('./engine');
const { runAgent1Curator, runAgent2Verifier } = require('./ai_agents');
const fs = require('fs');

// Odczyt wyłącznie ze zmiennych środowiskowych (np. GitHub Secrets lub plik .env)
const PHONE = process.env.CALLMEBOT_PHONE;
const API_KEY = process.env.CALLMEBOT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Podział wiadomości per dzień (DZIŚ, JUTRO, POJUTRZE) z limitem URL CallMeBot
function splitMessage(text) {
    // Podział po dniach: DZIŚ, JUTRO, POJUTRZE
    const dayRegex = /(?=\*───\s*(?:DZIŚ|DZISIAJ|JUTRO|POJUTRZE))/gi;
    let parts = text.split(dayRegex).map(p => p.trim()).filter(Boolean);

    // Jeśli pierwsza część to sam nagłówek (np. 🏆 *SPORTOWY ROZKŁAD JAZDY*), dołącz go do pierwszego dnia
    if (parts.length > 1 && !parts[0].includes('*───')) {
        parts[1] = parts[0] + '\n\n' + parts[1];
        parts.shift();
    }

    const chunks = [];
    for (const part of parts) {
        // Bezpieczny limit URL dla CallMeBot (max 1100 zakodowanych znaków)
        if (encodeURIComponent(part).length > 1100) {
            const leagues = part.split(/\n(?=[⚽🏎️🏁🎾🏐🤾📺])/g).map(l => l.trim()).filter(Boolean);
            let sub = '';
            for (const l of leagues) {
                if (encodeURIComponent(sub + '\n\n' + l).length > 1100 && sub) {
                    chunks.push(sub.trim());
                    sub = '';
                }
                sub = (sub ? sub + '\n\n' : '') + l;
            }
            if (sub.trim()) chunks.push(sub.trim());
        } else {
            chunks.push(part);
        }
    }
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

    // 1. Wybór domeny początkowej
    let cfg = loadConfig();
    let activeDomain = cfg.current_domain || 'https://strumyk.ca';

    console.log(`Domyślna domena Strumyka: ${activeDomain}`);

    // 2. Pobranie danych ze Strumyka (CDP Stealth z rotacją domen)
    const rawEvents = await fetchStrumykData(activeDomain);
    if (!rawEvents || rawEvents.length === 0) {
        console.error('❌ Błąd: Nie udało się pobrać listy wydarzeń z żadnej z dostępnych domen.');
        process.exit(1);
    }

    console.log(`Pobrano łącznie ${rawEvents.length} surowych wydarzeń.`);

    // 3. Wstępna segregacja na dni (Dziś, Jutro, Pojutrze)
    const preliminarySchedule = processEvents(rawEvents);

    let finalReportText = '';

    // 4. Zaangażowanie Zespołu Agentów AI (jeśli podano GEMINI_API_KEY)
    if (GEMINI_API_KEY) {
        console.log('\n--- Uruchamianie Zespołu 2 Agentów AI (Gemini Pro/Flash) ---');
        try {
            // Agent 1: Ekspert & Kurator
            const agent1Draft = await runAgent1Curator(GEMINI_API_KEY, preliminarySchedule);

            // Agent 2: Weryfikator & Cenzor Jakości
            finalReportText = await runAgent2Verifier(GEMINI_API_KEY, agent1Draft);
            console.log('✅ Zespół Agentów AI pomyślnie zweryfikował i sformatował raport!');
        } catch (err) {
            console.error('❌ Błąd krytyczny podczas pracy agentów AI:', err.message);
            console.log('Przełączanie na awaryjny algorytm...');
        }
    } else {
        console.error('⚠️ OSTRZEŻENIE: Brak GEMINI_API_KEY w GitHub Secrets! Upewnij się, że dodałeś secret o nazwie GEMINI_API_KEY w ustawieniach repozytorium.');
    }

    // Jeśli brak AI lub wystąpił błąd, używamy wbudowanego eleganckiego formatowania z ikonami i kategoriami lig
    if (!finalReportText) {
        console.log('Generowanie raportu z użyciem wbudowanego inteligentnego formatera (Emoji + podział na dyscypliny/ligi)...');
        finalReportText = buildElegantReport(preliminarySchedule);
    }

    if (!finalReportText) {
        finalReportText = `🏆 *SPORTOWY ROZKŁAD JAZDY*\n\nBrak wydarzeń spełniających elitarne kryteria na najbliższe 3 dni.`;
    }

    // 5. Podział na wiadomości (max 900 znaków, aby CallMeBot nigdy nic nie obciął)
    const messages = splitMessage(finalReportText, 900);
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
