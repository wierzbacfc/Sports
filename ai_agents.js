// ai_agents.js - 2-Agent Sports Pipeline (Gemini)

async function callGemini(apiKey, systemInstruction, userContent) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
            temperature: 0.2
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Błąd Gemini API (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Agent 1: Ekspert Sportowy & Selekcjoner
 * Filtruje surowe dane, eliminuje niechciane sporty, tworzy figlarny harmonogram F1.
 */
async function runAgent1Curator(apiKey, rawScheduleJson) {
    console.log('[AI Agent 1: Ekspert Sportowy] Selekcja, filtrowanie i tworzenie harmonogramu...');
    const systemPrompt = `Jesteś rygorystycznym, ale błyskotliwym analitykiem i kuratorem wydarzeń sportowych.
Otrzymujesz surowy zbiór wydarzeń pobranych ze Strumyka podzielony na DZIŚ, JUTRO i POJUTRZE.

TWOJE ZADANIA:
1. POZOSTAW WYŁĄCZNIE NAJWYŻSZY POZIOM ROZGRYWKOWY (TOP TIER / Elita / Hity):
   - Piłka nożna: tylko najwyższe ligi (Ekstraklasa, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie itp.), europejskie puchary (Liga Mistrzów, Liga Mistrzyń), mecze reprezentacji. BEZWZGLĘDNIE USUŃ: 2. ligi, 3. ligi, rozgrywki U23/U19, sparingi.
   - Żużel: tylko PGE Ekstraliga i Speedway Grand Prix. USUŃ 2. ligi i DMPJ.
   - Motosport: tylko Formuła 1 i MotoGP.
   - Siatkówka: mecze reprezentacji narodowych.
   - Magazyny sportowe: główne podsumowania (np. Liga+Extra, Magazyn PGE Ekstraliga, Sportowy Wieczór).

2. ŚCISŁE REGUŁY SPECJALNE:
   - TENIS: Zostaw mecze tenisowe WYŁĄCZNIE wtedy, gdy grają Polacy (np. Iga Świątek, Hubert Hurkacz, Magda Linette, Magdalena Fręch, Jan Zieliński itp.) ORAZ TYLKO gdy jest to faza PÓŁFINAŁÓW LUB FINAŁÓW. Wszystkie mecze bez Polaków oraz wszystkie wcześniejsze rundy (1/32, 1/16, ćwierćfinały) BEZWZGLĘDNIE ODRZUĆ!
   - PIŁKA RĘCZNA: WYŁĄCZNIE mecze reprezentacji Polski. Całkowicie wykasuj klubową piłkę ręczną!

3. CAŁKOWICIE I BEZWZGLĘDNIE WYELIMINUJ:
   - Sporty walki (UFC, MMA, boks - USUNIĘTE!)
   - Futsal (USUNIĘTY!)
   - Kolarstwo (USUNIĘTE!)
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
   Dodaj do każdej sesji krótki, figlarny, żartobliwy komentarz (np. o paleniu opon, strategiach Ferrari, szukaniu limitów toru czy porze na kawkę i popcorn).

5. Uporządkuj wydarzenia według dni: DZIŚ, JUTRO, POJUTRZE. Nie pisz żadnych wstępów powitalnych typu 'Cześć'.`;

    const userPrompt = `Oto surowe dane ze Strumyka do przefiltrowania:\n${JSON.stringify(rawScheduleJson, null, 2)}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

/**
 * Agent 2: Weryfikator & Perfekcyjny Formater WhatsApp
 * Dba o idealne formatowanie WhatsApp, audytuje wykluczenia i pilnuje czytelności.
 */
async function runAgent2Verifier(apiKey, agent1Draft) {
    console.log('[AI Agent 2: Weryfikator & Formater WhatsApp] Audyt i finalne formatowanie...');
    const systemPrompt = `Działasz jako bezwzględny audytor i grafik-redaktor wiadomości na WhatsApp.
Twoim celem jest doprowadzenie zestawienia od Agenta 1 do IDEALNEJ, czytelnej postaci na ekranie telefonu.

1. AUDYT WYKLUCZEŃ:
   - Czy na pewno nie ma sportów walki (UFC/MMA/boks), futsalu, kolarstwa, darta, golfa, koszykówki, NFL, MLB? Jeśli są – usuń.
   - Czy tenis to WYŁĄCZNIE Polacy i tylko faza półfinałów/finałów? Jeśli nie – usuń.
   - Czy piłka ręczna to tylko reprezentacja Polski? Jeśli nie – usuń.
   - Czy nie ma 2. i 3. lig piłkarskich? Jeśli są – usuń.

2. ŚCIŚLE WYMAGANE FORMATOWANIE WHATSAPP (WZÓR):
   Wiadomość MUSI wyglądać dokładnie w tym schemacie:

   🏆 *SPORTOWY ROZKŁAD JAZDY*

   *─── DZIŚ ───*
   ⚽ *Liga / Rozgrywki:*
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
   (wydarzenia na pojutrze)

   🏎️ *FIGLARNY ROZKŁAD JAZDY F1 – [NAZWA GP]*
   (pełny, dowcipny harmonogram weekendu z godzinami, jeśli F1 jest zaplanowane)

3. ŻELAZNE ZASADY FORMATOWANIA:
   - ZAWSZE punktor '• ' przed każdym wydarzeniem.
   - ZAWSZE pogrubiona godzina: '*GG:MM* ' przed nazwami rywali.
   - Pogrubione nagłówki z emoji (np. '⚽ *PKO BP Ekstraklasa:*').
   - Odstęp (jedna pusta linijka) między różnymi ligami/kategoriami dla pełnej przejrzystości.
   - Jeśli jest F1, upewnij się, że figlarny harmonogram weekendu jest kompletny i nieurwany!
   - Zwróć WYŁĄCZNIE ostateczną treść wiadomości, bez żadnych metakomentarzy ("Oto raport").`;

    const userPrompt = `Oto draft sporządzony przez Agenta 1 do audytu i idealnego sformatowania pod WhatsApp:\n\n${agent1Draft}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

module.exports = {
    runAgent1Curator,
    runAgent2Verifier
};
