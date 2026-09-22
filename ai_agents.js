// ai_agents.js - 2-Agent Sports Pipeline (Gemini)

const MODELS = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash'
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
                    temperature: 0.0
                }
            };

            let res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Jeśli 503 (chwilowe przeciążenie), odczekaj 2s i ponów
            if (res.status === 503) {
                console.warn(`[Gemini API] Model ${model} tymczasowo przeciążony (503). Ponawiam za 2 sekundy...`);
                await new Promise(r => setTimeout(r, 2000));
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text && text.trim().length > 0) {
                    console.log(`[Gemini API] Sukces z modelem: ${model}`);
                    return text.trim();
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
 * Agent 1: Ekspert Sportowy & Rygorystyczny Selekcjoner
 */
async function runAgent1Curator(apiKey, rawScheduleJson) {
    console.log('[AI Agent 1: Ekspert Sportowy] Rygorystyczna selekcja danych...');
    const systemPrompt = `Jesteś analitykiem danych sportowych. Twoim jedynym celem jest bezbłędna selekcja i kategoryzacja danych ze Strumyka.

KRYTYCZNE ZASADY DYSCYPLIN:
1. SIATKÓWKA TO NIE PIŁKA NOŻNA!
   - Każdy mecz siatkówki (np. Polska – Niemcy) MUSI być w sekcji SIATKÓWKA (sport: 'Siatkówka')!
   - BEZWZGLĘDNY ZAKAZ umieszczania meczów siatkówki w piłce nożnej!
2. UZUPEŁNIENIE PEŁNEGO HARMONOGRAMU WEEKENDU F1 (CZAS POLSKI - EUROPE/WARSAW):
   - Jeśli w danych pojawia się sesja Formuły 1, to oznacza weekend Grand Prix F1!
   - Używaj DOKŁADNYCH godzin podanych w danych ze Strumyka (są już przeliczone na czas polski Europe/Warsaw, np. 10:25 1. sesja treningowa, 13:55 2. sesja treningowa).
   - Uzupełnij pełny terminarz tego Grand Prix na cały weekend z godzinami w czasie polskim (dla GP Azerbejdżanu w Baku wyścig główny odbywa się w sobotę o 13:00 czasu polskiego!).
   - HARMONOGRAM F1 MUSI BYĆ CZYSTY, SUROWY I KONKRETNY:
     🏎️ *Formuła 1 – GP Azerbejdżanu (Baku):*
     *Czwartek (Pojutrze):*
     • *10:25* 1. sesja treningowa
     • *13:55* 2. sesja treningowa
     *Piątek:*
     • *10:25* 3. sesja treningowa
     • *13:55* Kwalifikacje
     *Sobota:*
     • *13:00* Wyścig główny
   - CAŁKOWITY ZAKAZ wymyślania żartów, fikcyjnych opisów o kawie i oponach. Czysty terminarz!
3. CZYSTE DANE:
   - Zakaz jakichkolwiek opisów, komentarzy czy żartów. Wyłącznie godziny i nazwy rywali/sesji.

KRYTERIA SELEKCJI (TYLKO TOP TIER / ELITA):
- Piłka nożna: tylko najwyższe ligi (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Ekstraklasa itp.), Liga Mistrzów, Liga Mistrzyń UEFA, oficjalne mecze seniorskich reprezentacji narodowych.
  Wyrzuć: 2. ligi, 3. ligi, ligi młodzieżowe (U20, U21, U19 itp.), rezerwy i sparingi!
- Siatkówka: oficjalne mecze seniorskich reprezentacji (np. Polska – Niemcy).
- Żużel: PGE Ekstraliga i Speedway Grand Prix.
- Tenis: WYŁĄCZNIE mecze z udziałem Polaków (Świątek, Hurkacz itp.) ORAZ TYLKO faza półfinałów lub finałów.
- Piłka ręczna: WYŁĄCZNIE seniorska reprezentacja Polski.
- Magazyny: Sportowy Wieczór, Premier League Review, Liga+Extra itp.

BEZWZGLĘDNIE WYELIMINUJ:
- Sporty walki (UFC, MMA, boks), Futsal, Kolarstwo, Hokej na lodzie, Krykiet, Koszykówkę, Dart, Golf, Baseball, Futbol amerykański.

Pogrupuj zakwalifikowane wydarzenia na: DZIŚ, JUTRO, POJUTRZE.`;

    const userPrompt = `Oto dane ze Strumyka do przefiltrowania:\n${JSON.stringify(rawScheduleJson, null, 2)}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

/**
 * Agent 2: Perfekcyjny Formater WhatsApp (Gemini 3.8 Flash)
 */
async function runAgent2Verifier(apiKey, agent1Draft) {
    console.log('[AI Agent 2: Perfekcyjny Formater WhatsApp] Czyste i eleganckie formatowanie...');
    const systemPrompt = `Działasz jako precyzyjny edytor WhatsApp. Twój model: Gemini 3.8 Flash.
Twoim celem jest sformatowanie danych od Agenta 1 w CZYSTY, PRZEJRZYSTY I ELEGANCKI sposób.

ŻELAZNE ZASADY FORMATOWANIA:
- SIATKÓWKA MUSI MIEĆ EMOJI 🏐: '🏐 *Siatkówka (Mecze Reprezentacji):*' (np. mecz Polska – Niemcy). NIGDY nie łącz siatkówki z piłką nożną (⚽)!
- PIŁKA NOŻNA MUSI MIEĆ EMOJI ⚽: '⚽ *Mecze Reprezentacji / Liga Narodów:*' lub nazwa ligi ('⚽ *Liga Mistrzyń UEFA:*', '⚽ *Premier League:*').
- FORMUŁA 1: zachowaj kompletny harmonogram weekendu F1 (Piątek, Sobota, Niedziela) w czystej, przejrzystej formie.
- BEZWZGLĘDNY ZAKAZ pozostawiania pustych nagłówków (np. '📺 *' bez meczów pod spodem). Jeśli w danej kategorii nie ma meczów – usuń ją!
- ZERO komentarzy, zero żartów, zero opinii. Czysty terminarz.

WZÓR STRUKTURY:
🏆 *SPORTOWY ROZKŁAD JAZDY*

*─── DZIŚ ───*

🏐 *Siatkówka (Mecze Reprezentacji):*
• *16:00* Polska – Niemcy

⚽ *Liga Mistrzyń UEFA:*
• *16:45* Bayern Munich K – Manchester City K
• *19:00* Arsenal K – Koge K

📺 *Magazyny Sportowe:*
• *20:00* Sportowy Wieczór

*─── JUTRO ───*

⚽ *Mecze Reprezentacji / Liga Narodów:*
• *14:30* Irak – Oman
• *18:00* Arabia Saudyjska – Kuwejt

*─── POJUTRZE ───*

🏎️ *Formuła 1 – GP [Nazwa]:*
*Piątek:*
• *GG:MM* 1. sesja treningowa
• *GG:MM* 2. sesja treningowa
*Sobota:*
• *GG:MM* 3. sesja treningowa
• *GG:MM* Kwalifikacje
*Niedziela:*
• *GG:MM* Wyścig główny

ZASADY ESTETYKI:
1. ZAWSZE punktor '• ' przed każdym meczem/sesją.
2. ZAWSZE pogrubiona dokładna godzina ze Strumyka: '*GG:MM* '.
3. Dokładnie jedna pusta linijka między ligami dla maksymalnej czytelności na telefonie.
4. Zwróć WYŁĄCZNIE gotową wiadomość (bez wstępów i zakończeń).`;

    const userPrompt = `Oto draft do sformatowania pod WhatsApp:\n\n${agent1Draft}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

module.exports = {
    runAgent1Curator,
    runAgent2Verifier
};
