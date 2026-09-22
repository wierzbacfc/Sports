// ai_agents.js - 2-Agent Sports Pipeline (Gemini)

const MODELS = [
    'gemini-3.8-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash'
];

async function callGemini(apiKey, systemInstruction, userContent) {
    let lastError = null;

    for (const model of MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: userContent }]
                    }
                ],
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    temperature: 0.1
                }
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text && text.trim().length > 0) {
                    console.log(`[Gemini API] Sukces z modelem: ${model}`);
                    return text;
                }
            } else {
                const errText = await res.text();
                console.warn(`[Gemini API] Model ${model} zwrócił status ${res.status}: ${errText.substring(0, 150)}`);
                lastError = new Error(`Model ${model}: ${errText}`);
            }
        } catch (e) {
            console.warn(`[Gemini API] Błąd sieciowy dla ${model}:`, e.message);
            lastError = e;
        }
    }

    throw lastError || new Error('Wszystkie modele Gemini zawiodły.');
}

/**
 * Agent 1: Ekspert Sportowy & Selekcjoner
 * Filtruje surowe dane, eliminuje niechciane sporty, tworzy figlarny harmonogram F1.
 */
async function runAgent1Curator(apiKey, rawScheduleJson) {
    console.log('[AI Agent 1: Ekspert Sportowy] Rygorystyczna selekcja i filtrowanie...');
    const systemPrompt = `Jesteś elitarnym analitykiem sportowym o ogromnej wiedzy o ligach i drużynach całego świata.
Otrzymujesz surowy zbiór wydarzeń pobranych ze Strumyka podzielony na DZIŚ, JUTRO i POJUTRZE.

TWOJE ZADANIA:
1. POZOSTAW WYŁĄCZNIE NAJWYŻSZY POZIOM ROZGRYWKOWY (TOP TIER / Elita / Hity):
   - Piłka nożna: tylko i wyłącznie NAJWYŻSZE ligi krajowe (np. Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Ekstraklasa, Liga Portugal, Eredivisie itp.), europejskie puchary (Liga Mistrzów, Liga Mistrzyń), oficjalne mecze seniorskich reprezentacji narodowych.
     BEZWZGLĘDNIE WYRZUĆ: 2. ligi, 3. ligi, 4. ligi, niszowe ligi lokalne, rozgrywki rezerw (np. Celtic B), puchary regionalne, mecze U23, U21, U20, U19, U17 oraz wszelkie sparingi!
   - Żużel: tylko PGE Ekstraliga i Speedway Grand Prix. WYRZUĆ 2. ligi i DMPJ.
   - Motosport: tylko Formuła 1 i MotoGP.
   - Siatkówka: tylko oficjalne mecze seniorskich reprezentacji narodowych (zwłaszcza reprezentacji Polski).
   - Magazyny sportowe: tylko główne podsumowania (Liga+Extra, Magazyn PGE Ekstraliga, Sportowy Wieczór).

2. ŚCISŁE REGUŁY SPECJALNE DLA DYSCYPLIN:
   - TENIS: Zostaw mecze tenisowe WYŁĄCZNIE wtedy, gdy grają Polacy (np. Iga Świątek, Hubert Hurkacz, Magda Linette, Magdalena Fręch, Jan Zieliński itp.) ORAZ TYLKO gdy jest to faza PÓŁFINAŁÓW LUB FINAŁÓW. Wszystkie mecze bez Polaków oraz wszystkie wcześniejsze rundy (1/32, 1/16, ćwierćfinały) BEZWZGLĘDNIE ODRZUĆ!
   - PIŁKA RĘCZNA: WYŁĄCZNIE mecze reprezentacji Polski. Całkowicie wykasuj klubową piłkę ręczną!

3. CAŁKOWICIE I BEZWZGLĘDNIE WYELIMINUJ:
   - Sporty walki (UFC, MMA, boks - USUNIĘTE!)
   - Futsal (USUNIĘTY!)
   - Kolarstwo (USUNIĘTE!)
   - Hokej na lodzie (USUNIĘTY!)
   - Krykiet (np. Anglia - Sri Lanka - USUNIĘTY!)
   - Sporty amerykańskie: Futbol amerykański (NFL), Baseball (MLB), WNBA.
   - Dart, Golf, Koszykówkę.

4. 🏎️ SPECJALNE ZADANIE DLA FORMUŁY 1 (F1):
   Jeśli w wydarzeniach pojawia się Formuła 1 (lub zbliża się weekend wyścigowy GP F1):
   Napisz dedykowaną, wyróżnioną sekcję:
   🏎️ *FIGLARNY ROZKŁAD JAZDY F1 – [NAZWA GP]*
   Rozpisz figlarny, dowcipny i zadziorny harmonogram CAŁEGO weekendu F1 z dokładnymi godzinami:
   - Piątek (Treningi / Kwalifikacje do Sprintu)
   - Sobota (Sprint / Trening 3 / Kwalifikacje)
   - Niedziela (Wyścig główny)
   Dodaj do każdej sesji krótki, figlarny, żartobliwy komentarz (np. o paleniu opon, strategiach Ferrari, limitach toru, kawie i popcornie).

5. Pogrupuj wydarzenia według dni: DZIŚ, JUTRO, POJUTRZE. Nie pisz żadnych wstępów powitalnych typu 'Cześć'.`;

    const userPrompt = `Oto surowe dane ze Strumyka do przefiltrowania:\n${JSON.stringify(rawScheduleJson, null, 2)}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

/**
 * Agent 2: Weryfikator & Perfekcyjny Formater WhatsApp
 * Dba o idealne formatowanie WhatsApp, audytuje wykluczenia i pilnuje czytelności.
 */
async function runAgent2Verifier(apiKey, agent1Draft) {
    console.log('[AI Agent 2: Weryfikator & Perfekcyjny Formater] Audyt jakości i formatowanie...');
    const systemPrompt = `Działasz jako bezwzględny audytor i grafik-redaktor wiadomości na WhatsApp.
Twoim celem jest sprawdzenie zestawienia od Agenta 1 i doprowadzenie go do IDEALNEJ, eleganckiej postaci na telefonie.

1. AUDYT I BEZWZGLĘDNA CZYSZCZKA:
   - Czy na liście jest jakikolwiek krykiet, hokej, futsal, kolarstwo, sporty walki, dart, golf, koszykówka, NFL, MLB? Jeśli tak – NATYCHMIAST TO WYKREŚL.
   - Czy są mecze młodzieżowe (U23, U20, U19, U17), rezerwy (np. Celtic B), 2. lub 3. ligi (np. rumuńska, czeska, szwajcarska)? Jeśli tak – NATYCHMIAST TO WYKREŚL.
   - Czy tenis to WYŁĄCZNIE Polacy i tylko faza półfinałów/finałów? Jeśli nie – usuń.
   - Czy piłka ręczna to tylko reprezentacja Polski? Jeśli nie – usuń.

2. IDEALNY WZÓR FORMATOWANIA WHATSAPP:
   Wiadomość MUSI wyglądać dokładnie w tym schemacie:

   🏆 *SPORTOWY ROZKŁAD JAZDY*

   *─── DZIŚ ───*
   ⚽ *Liga Mistrzyń:*
   • *16:45* Bayern Munich K – Manchester City K
   • *19:00* Real Madrid K – PSG K

   🏐 *Siatkówka (Mecze Reprezentacji):*
   • *16:00* Polska – Niemcy

   📺 *Magazyn Sportowy:*
   • *20:00* Sportowy Wieczór

   *─── JUTRO ───*
   ⚽ *Mecze Reprezentacji:*
   • *14:30* Irak – Oman

   *─── POJUTRZE ───*
   (tylko jeśli są wydarzenia spełniające kryteria)

   🏎️ *FIGLARNY ROZKŁAD JAZDY F1 – [NAZWA GP]*
   (pełny, dowcipny harmonogram weekendu z godzinami, jeśli F1 jest w ten weekend)

3. ŻELAZNE REGUŁY ESTETYKI:
   - ZAWSZE punktor '• ' przed każdym wydarzeniem.
   - ZAWSZE pogrubiona godzina: '*GG:MM* ' przed nazwami rywali.
   - Pogrubiony nagłówek ligi z emoji (np. '⚽ *PKO BP Ekstraklasa:*').
   - Jedna pusta linijka między ligami/kategoriami dla pełnej przejrzystości.
   - Nie dodawaj żadnych własnych uwag, komentarzy ("Oto raport") ani podsumowań na końcu. Tylko i wyłącznie gotowa wiadomość!`;

    const userPrompt = `Oto draft od Agenta 1 do zweryfikowania i perfekcyjnego sformatowania:\n\n${agent1Draft}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

module.exports = {
    runAgent1Curator,
    runAgent2Verifier
};
