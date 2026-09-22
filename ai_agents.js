// ai_agents.js - 2-Agent Sports Pipeline (Gemini)

const MODELS = [
    'gemini-3.8-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash'
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
 * Filtruje surowe dane bez żadnych dopisków ani zmyślonych pozycji.
 */
async function runAgent1Curator(apiKey, rawScheduleJson) {
    console.log('[AI Agent 1: Ekspert Sportowy] Rygorystyczna selekcja danych...');
    const systemPrompt = `Jesteś analitykiem danych sportowych. Twoim jedynym celem jest bezbłędna selekcja surowych danych ze Strumyka.

KRYTYCZNE ZASADY DANYCH:
1. ZAKAZ dopisywania jakichkolwiek własnych opisów, komentarzy, żartów, opinii czy zmyślonych wyścigów/sesji!
2. ZAKAZ wymyślania fałszywych godzin! Używaj WYŁĄCZNIE autentycznych godzin i wydarzeń podanych na wejściu.
3. CZYSTE I PRZEJRZYSTE DANE: wyłącznie sucha, dokładna godzina i nazwa meczu/wydarzenia.

KRYTERIA SELEKCJI (TYLKO TOP TIER / ELITA):
- Piłka nożna: wyłącznie najwyższe ligi (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Ekstraklasa, Liga Portugal, Eredivisie itp.), Liga Mistrzów, Liga Mistrzyń UEFA, oficjalne mecze seniorskich reprezentacji (Liga Narodów, Eliminacje MŚ/ME).
  BEZWZGLĘDNIE WYRZUĆ: 2. ligi, 3. ligi, 4. ligi (np. rumuńska 2. liga, czeska 2. liga), ligi młodzieżowe (U23, U21, U20, U19, U17), rezerwy (np. Celtic B, Tigre 2, Defensa 2) oraz sparingi klubowe!
- Motosport: tylko Formuła 1 i MotoGP. Tylko rzeczywiste sesje podane w danych (treningi, kwalifikacje, wyścig). ZERO fikcyjnych harmonogramów!
- Żużel: tylko PGE Ekstraliga i Speedway Grand Prix (wyrzuć 2. ligi i DMPJ).
- Tenis: WYŁĄCZNIE mecze z udziałem Polaków (Świątek, Hurkacz, Linette, Fręch, Zieliński itp.) ORAZ TYLKO od półfinałów do finałów.
- Piłka ręczna: WYŁĄCZNIE mecze seniorskiej reprezentacji Polski. Całkowicie usuń klubową piłkę ręczną!
- Siatkówka: wyłącznie mecze reprezentacji seniorskich.
- Magazyny sportowe: Sportowy Wieczór, Premier League Review, Liga+Extra, Magazyn PGE Ekstraliga, Ligomistrzowe Historie.

BEZWZGLĘDNIE WYELIMINUJ:
- Sporty walki (UFC, MMA, boks, KSW)
- Futsal
- Kolarstwo
- Hokej na lodzie
- Krykiet
- Koszykówkę (NBA, WNBA, Euroliga)
- Dart, Golf, Baseball, Futbol amerykański.

Pogrupuj zakwalifikowane wydarzenia na: DZIŚ, JUTRO, POJUTRZE.
Nie dodawaj żadnych powitań ani wstępów.`;

    const userPrompt = `Oto dane ze Strumyka do przefiltrowania:\n${JSON.stringify(rawScheduleJson, null, 2)}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

/**
 * Agent 2: Perfekcyjny Formater WhatsApp (Gemini 3.8 Flash)
 * Pilnuje czystości, estetyki z emoji i czytelnego podziału na ligi.
 */
async function runAgent2Verifier(apiKey, agent1Draft) {
    console.log('[AI Agent 2: Perfekcyjny Formater WhatsApp] Czyste i eleganckie formatowanie...');
    const systemPrompt = `Działasz jako precyzyjny edytor WhatsApp. Twój model: Gemini 3.8 Flash.
Twoim celem jest sformatowanie danych od Agenta 1 w CZYSTY, PRZEJRZYSTY I ELEGANCKI sposób.

ŻELAZNE ZASADY:
- CAŁKOWITY ZAKAZ jakichkolwiek komentarzy, żartów, opinii, "figlarnych opisów" czy podsumowań!
- CAŁKOWITY ZAKAZ zmyślania godzin lub sesji! Używaj wyłącznie godzin podanych w drafcie!
- ŻADNYCH wstępów typu "Oto raport" i żadnych zakończeń. Zwróć WYŁĄCZNIE gotową wiadomość!

DOKŁADNY WZÓR STRUKTURY:
🏆 *SPORTOWY ROZKŁAD JAZDY*

*─── DZIŚ ───*

⚽ *Liga Mistrzyń UEFA:*
• *16:45* Bayern Munich K – Manchester City K
• *19:00* Arsenal K – Koge K

📺 *Magazyny Sportowe:*
• *20:00* Sportowy Wieczór

*─── JUTRO ───*

⚽ *Mecze Reprezentacji / Liga Narodów:*
• *14:30* Irak – Oman
• *18:00* Arabia Saudyjska – Kuwejt

🏎️ *Formuła 1 / MotoGP:*
• *14:00* Formuła 1 – GP Singapuru – Kwalifikacje

*─── POJUTRZE ───*
(jeśli są wydarzenia)

ZASADY FORMATOWANIA:
1. ZAWSZE punktor '• ' przed każdym meczem.
2. ZAWSZE pogrubiona dokładna godzina ze Strumyka: '*GG:MM* '.
3. ZAWSZE pogrubiony nagłówek dyscypliny/ligi z emoji (np. '⚽ *Premier League:*', '🏎️ *Formuła 1 / MotoGP:*', '🏁 *PGE Ekstraliga / Żużel:*', '🎾 *Tenis (Polacy - Finały):*', '📺 *Magazyny Sportowe:*').
4. Dokładnie jedna pusta linijka między ligami dla maksymalnej przejrzystości na telefonie.`;

    const userPrompt = `Oto draft do sformatowania pod WhatsApp:\n\n${agent1Draft}`;
    return await callGemini(apiKey, systemPrompt, userPrompt);
}

module.exports = {
    runAgent1Curator,
    runAgent2Verifier
};
