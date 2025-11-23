import os
import json
import traceback
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import google.generativeai as genai


load_dotenv()

if "GOOGLE_API_KEY" not in os.environ:
    print("❌ ERROR: Missing key in .env!")

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash", 
    safety_settings=safety_settings
)

app = Flask(__name__)



PROMPT_TRIAGE_QUESTION = """
Jesteś "Rozbijaczem" – coachem produktywności ADHD.

ZASADY:
1. Nie diagnozuj.
2. Bądź konkretny.

Zadanie użytkownika: "{task}"

Twoje zadanie:
1. Ustal, czy problem jest FIZYCZNY (zmęczenie, otoczenie) czy EMOCJONALNY (lęk, opór).
2. Zadaj 1 trafne pytanie doprecyzowujące.
{tone_instruction}

Zwróć czysty JSON:
{{
  "type": "physical" lub "emotional",
  "validation": "krótkie zdanie otuchy",
  "question": "pytanie doprecyzowujące"
}}
"""

PROMPT_GET_BLOCKERS_AND_WARMUP = """
Typ: "{type}"
Zadanie: "{task}"
Info: "{user_answer}"

ZASADY:
- Rozgrzewka to SETUP. Ma doprowadzić usera do stanu gotowości (otwarte programy, czyste biurko).
- To mają być czynności "bezmózgowe" (kliknij, otwórz, przesuń).

Twoje zadanie:
1. Zidentyfikuj 3 blokery.
2. Dla KAŻDEGO blokera napisz "Rozgrzewkę" (3 mikro-kroki).
{tone_instruction}

Zwróć czysty JSON:
{{
  "options": [
    {{
      "blocker": "Nazwa Blokera 1",
      "steps": {{ "step1": "...", "step2": "...", "step3": "..." }}
    }},
    {{
      "blocker": "Nazwa Blokera 2",
      "steps": {{ "step1": "...", "step2": "...", "step3": "..." }}
    }},
    {{
      "blocker": "Nazwa Blokera 3",
      "steps": {{ "step1": "...", "step2": "...", "step3": "..." }}
    }}
  ]
}}
"""

PROMPT_FINAL_STEPS = """
Zadanie: "{task}"
Własny Bloker: "{blocker}"
Typ Problemu: "{type}"
INFO Z TRIAŻU: "{user_answer}" 

Wygeneruj 3 kroki rozgrzewki (setup), które przygotują grunt pod pracę.
Kroki muszą być aktywne i fizyczne, aby przełamać paraliż.
{tone_instruction}

Zwróć czysty JSON:
{{
  "step1": "...",
  "step2": "...",
  "step3": "..."
}}
"""

PROMPT_ACTION_STEPS = """
Zadanie główne: "{task}"

KONTEKST (Co użytkownik właśnie zrobił w Rozgrzewce):
{last_steps}

TWOJE ZADANIE:
Wygeneruj 3 kroki SPRINTU, które zajmą ŁĄCZNIE max 5 minut.
To mają być "Nano-Kroki" - tak małe, że nie wymagają myślenia, tylko wykonania.

🚨 KRYTYCZNE ZASADY CZASU:
1. KAŻDY krok musi zająć max 60 sekund.
2. ZABRONIONE jest: "Zastanów się", "Wymyśl", "Zaprojektuj", "Przeanalizuj" (to trwa za długo!).
3. DOZWOLONE jest: "Napisz jedno zdanie", "Stwórz pusty plik", "Wklej ten kod", "Nazwij plik".
4. Jeśli user otworzył IDE w rozgrzewce -> Pierwszy krok to "Napisz import..." lub "Stwórz plik...", a nie "Planowanie architektury".

Cel: Rozpędzić użytkownika przez małe sukcesy, a nie przytłoczyć go planowaniem.
{tone_instruction}

Zwróć czysty JSON:
{{
  "step1": "Krok na 1 minutę...",
  "step2": "Krok na 1 minutę...",
  "step3": "Krok na 1 minutę..."
}}
"""

def clean_json_response(ai_response):
    print(f"\n--- MODEL RESPONSE ---\n{ai_response}\n------------------------\n")
    if not ai_response: return None
    cleaned = ai_response.strip()
    if "```" in cleaned:
        lines = cleaned.split('\n')
        new_lines = [l for l in lines if "```" not in l]
        cleaned = "\n".join(new_lines).strip()
    return cleaned


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/start-conversation', methods=['POST'])
def start_conversation():
    try:
        data = request.get_json()
        task = data.get('task')
        mode = data.get('mode', 'survival')

        if mode == 'survival':
            tone_add = "TON: Bądź edukacyjnym, spokojnym trenerem. Wspieraj budowanie nawyku. Wyjaśniaj dlaczego, motywuj długoterminowo."
        else:
            tone_add = "TON: Bądź krótki, żołnierski, dyrektywny. Zero gadania. Tylko konkretne rozkazy. Bez wyjaśnień."

        prompt = PROMPT_TRIAGE_QUESTION.format(
            task=task, 
            tone_instruction=tone_add 
        )
        
        response = model.generate_content(prompt)
        return jsonify(json.loads(clean_json_response(response.text)))
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/get-blockers', methods=['POST'])
def get_blockers():
    try:
        data = request.get_json()
        mode = data.get('mode', 'survival')
        
        if mode == 'survival':
            tone_add = "TON: Bądź edukacyjnym, spokojnym trenerem. Wspieraj budowanie nawyku. Wyjaśniaj dlaczego, motywuj długoterminowo."
        else:
            tone_add = "TON: Bądź krótki, żołnierski, dyrektywny. Zero gadania. Tylko konkretne rozkazy. Bez wyjaśnień."
        
        prompt = PROMPT_GET_BLOCKERS_AND_WARMUP.format(
            task=data['task'], 
            user_answer=data['user_answer'], 
            type=data['type'],
            tone_instruction=tone_add
        )
        response = model.generate_content(prompt)
        cleaned = clean_json_response(response.text)
        parsed = json.loads(cleaned)

        if 'blockers' in parsed and 'options' not in parsed:
            new_opts = []
            for b in parsed['blockers']:
                new_opts.append({
                    "blocker": b, 
                    "steps": {"step1": "Setup", "step2": "Oddech", "step3": "Start"}
                })
            parsed['options'] = new_opts
            
        return jsonify(parsed)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/generate-final-steps', methods=['POST'])
def generate_final_steps():
    try:
        data = request.get_json()
        user_answer = data.get('user_answer', 'Brak odpowiedzi użytkownika z triażu.')
        mode = data.get('mode', 'survival')
        
        if mode == 'survival':
            tone_add = "TON: Bądź edukacyjnym, spokojnym trenerem. Wspieraj budowanie nawyku. Wyjaśniaj dlaczego, motywuj długoterminowo."
        else:
            tone_add = "TON: Bądź krótki, żołnierski, dyrektywny. Zero gadania. Tylko konkretne rozkazy. Bez wyjaśnień."
        
        prompt = PROMPT_FINAL_STEPS.format(
            task=data['task'], 
            blocker=data['blocker'], 
            type=data['type'],
            user_answer=user_answer,
            tone_instruction=tone_add
        )
        response = model.generate_content(prompt)
        return jsonify(json.loads(clean_json_response(response.text)))
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/generate-action-steps', methods=['POST'])
def generate_action_steps():
    try:
        data = request.get_json()
        last_steps_context = data.get('last_steps', 'Brak danych o rozgrzewce.')
        mode = data.get('mode', 'survival')
        
        if mode == 'survival':
            tone_add = "TON: Bądź edukacyjnym, spokojnym trenerem. Wspieraj budowanie nawyku. Wyjaśniaj dlaczego, motywuj długoterminowo."
        else:
            tone_add = "TON: Bądź krótki, żołnierski, dyrektywny. Zero gadania. Tylko konkretne rozkazy. Bez wyjaśnień."
        
        prompt = PROMPT_ACTION_STEPS.format(
            task=data['task'], 
            last_steps=last_steps_context,
            tone_instruction=tone_add
        )
        
        response = model.generate_content(prompt)
        return jsonify(json.loads(clean_json_response(response.text)))
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)