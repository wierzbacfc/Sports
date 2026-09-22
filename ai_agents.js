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
            temperature: 0.1
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
 * Filtruje surowe dane, odrzuca niższe ligi i niechciane sporty, grupuje według dni i lig.
 */
async function runAgent1Curator(apiKey, rawScheduleJson) {
    console.log('[AI Agent 1: Ekspert Sportowy] Selekcja i filtrowanie surowych wydarzeń...');
    const systemPrompt = `Jesteś rygorystycznym analitykiem i kuratorem wydarzeń sportowych.
Otrzymujesz surowy zbiór wydarzeń pobranych ze Strumyka podzielony na DZIŚ, JUTRO i POJUTRZE.

TWOJE JEDYNE ZADANIE:
1. Przefiltruj wydarzenia, pozostawiając WYŁĄCZNIE najwyższy poziom rozgrywkowy (TOP TIER / Elita / Mecze hitowe):
   - Piłka nożna: tylko najwyższe ligi (np. Ekstraklasa, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie, itp.), europejskie puchary, mecze reprezentacji. BEZWZGLĘDNIE USUŃ: 2. ligi, 3. ligi, rozgrywki U23/U19, sparingi.
   - Żużel: tylko PGE Ekstraliga (finały, mecze o medale, runda zasadnicza) oraz Speedway Grand Prix. USUŃ 2. ligi i DMPJ.
   - Motosport: tylko Formuła 1 i MotoGP.
   - Kolarstwo: tylko Mistrzostwa Świata (Elita) i Wielkie Toury.
   - Tenis: turnieje główne ATP i WTA, mecze Pucharu Davisa, Wielki Szlem. USUŃ turnieje rangi Challenger i ITF.
   - Sporty walki: gale UFC oraz prestiżowe walki bokserskie.
   - Siatkówka: mecze reprezentacji narodowych.
   - Piłka ręczna: WYŁĄCZNIE mecze reprezentacji Polski. Całkowicie wykasuj klubową piłkę ręczną!
   - Magazyny sportowe: główne podsumowania (np. Liga+Extra, Magazyn PGE Ekstraliga, Sportowy Wieczór).

2. BEZWZGLĘDNIE WYELIMINUJ:
   - Sporty amerykańskie: Futbol amerykański (NFL), Baseball (MLB), WNBA.
   - Dart.
   - Golf.
   - Koszykówkę.

3. Pogrupuj wydarzenia według dni (DZIŚ, JUTRO, POJUTRZE) oraz podkategorii lig/dyscyplin z godzinami.

4. ZAKAZ: Nie twórz żadnych esejów, wstępów, powitań, ani komentarzy do meczów. Chcemy tylko i wyłącznie czystą, uporządkowaną listę wydarzeń!`;

    const userPrompt = `Oto surowe dane ze Strumyka do przefiltrowania:\n${JSON.stringify(rawScheduleJson, null, 2)}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

/**
 * Agent 2: Weryfikator & Kontroler Jakości
 * Sprawdza poprawność filtrowania Agenta 1, eliminuje ewentualne przeoczenia i formatuje pod WhatsApp.
 */
async function runAgent2Verifier(apiKey, agent1Draft) {
    console.log('[AI Agent 2: Weryfikator & Kontroler Jakości] Audyt i weryfikacja raportu...');
    const systemPrompt = `Działasz jako bezwzględny audytor i kontroler jakości raportu sportowego przeznaczonego do wysyłki na WhatsApp.
Twoim celem jest sprawdzenie zestawienia przygotowanego przez Agenta 1 i upewnienie się, że spełnia w 100% poniższe reguły:

1. KONTROLA NIŻSZYCH LIG: Czy nie prześlizgnęła się żadna 2. liga, 3. liga, zaplecze, rozgrywki U23, Challenger lub ITF? Jeśli tak, natychmiast ją wykreśl.
2. KONTROLA PIŁKI RĘCZNEJ: Piłka ręczna może dotyczyć WYŁĄCZNIE meczów reprezentacji Polski. Jeśli widzisz mecze klubowe – usuń je.
3. KONTROLA SPORTÓW WYKLUCZONYCH: Brak sportów amerykańskich (NFL, MLB, WNBA), darta, golfa, koszykówki.
4. FORMATOWANIE WHATSAPP:
   - Zastosuj formatowanie WhatsApp: *pogrubienie* godzin i nagłówków lig.
   - Zachowaj czytelną strukturę:
     🏆 *SPORTOWY ROZKŁAD JAZDY*
     
     *─── DZIŚ ───*
     (mecze pogrupowane ligami)
     
     *─── JUTRO ───*
     (mecze na jutro)
     
     *─── POJUTRZE ───*
     (mecze na pojutrze)
   - Używaj odpowiednich emoji dla dyscyplin.

5. Zwróć WYŁĄCZNIE ostateczną, zweryfikowaną treść wiadomości gotową do wysłania. Nie dodawaj żadnych własnych uwag ("Oto zweryfikowany raport"), żadnych wstępów ani komentarzy.`;

    const userPrompt = `Oto draft sporządzony przez Agenta 1 do zweryfikowania i finalnego sformatowania:\n\n${agent1Draft}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

module.exports = {
    runAgent1Curator,
    runAgent2Verifier
};
