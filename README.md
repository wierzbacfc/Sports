# 🏆 Sports Intel WhatsApp Reporter (Multi-Agent AI)

Automatyczny system codziennego pobierania, weryfikacji przez **zespół 2 agentów AI (Gemini)** oraz wysyłania terminarza najważniejszych wydarzeń sportowych (DZIŚ, JUTRO, POJUTRZE) ze Strumyka bezpośrednio na WhatsApp.

---

## 🤖 Architektura Zespołu Agentów:
1. **Silnik CDP Stealth:** Pobiera surowe dane ze Strumyka, omija zabezpieczenia Cloudflare i samoczynnie odnajduje nowe domeny (z rejestru Rentry / mirrorów).
2. **Agent 1 (AI Ekspert Sportowy):** Analizuje surową listę ponad 160 wydarzeń. Odcedza niższe ligi, U23, sparingi, sporty amerykańskie, darta, golfa, koszykówkę i klubową piłkę ręczną. Zostawia wyłącznie top-tier i hity.
3. **Agent 2 (AI Weryfikator & Kontroler Jakości):** Niezależnie audytuje listę od Agenta 1 (czy na pewno nie przeszły niższe ligi i klubowa piłka ręczna), formatuje pod WhatsApp (*bold*, emoji, podział na dni i ligi).
4. **Bramka WhatsApp (CallMeBot):** Dzieli tekst na bezpieczne pakiety i dostarcza go bezpośrednio na Twój telefon.

---

## 🔐 Konfiguracja GitHub Secrets (Bezpieczeństwo):

W swoim repozytorium na GitHubie wejdź w:  
**Settings** ➔ **Secrets and variables** ➔ **Actions** ➔ **New repository secret** i dodaj 3 zmienne:

| Nazwa Secretu | Opis | Przykład wartości |
|---|---|---|
| `CALLMEBOT_PHONE` | Twój numer telefonu | `+48785211519` |
| `CALLMEBOT_API_KEY` | Twój klucz CallMeBot | `1142055` |
| `GEMINI_API_KEY` | Darmowy klucz z Google AI Studio | `AIzaSy...` ([Pobierz stąd](https://aistudio.google.com/app/apikey)) |

---

## 🚀 Wdrożenie (GitHub Actions - 24/7 za darmo):

1. **Wypchnij projekt do swojego prywatnego repozytorium:**
   ```bash
   git init
   git add .
   git commit -m "Wdrożenie zespołu agentów AI i wysyłki WhatsApp"
   git branch -M main
   git remote add origin https://github.com/<twoj-login>/<twoje-repo>.git
   git push -u origin main
   ```
2. **Harmonogram:**
   Skrypt odpala się automatycznie codziennie o **08:00 rano** (czasu polskiego).
3. **Ręczny test:**
   W zakładce **Actions** na GitHubie kliknij **Daily Sports Intel WhatsApp Reporter** ➔ **Run workflow**, aby natychmiast wygenerować raport.
