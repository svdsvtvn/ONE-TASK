document.addEventListener('DOMContentLoaded', () => {

    // --- DARK MODE ---
    const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme');
    
    if (currentTheme === 'dark') {
        body.classList.add('dark-mode');
        if (themeToggleCheckbox) themeToggleCheckbox.checked = true;
    }

    if (themeToggleCheckbox) {
        themeToggleCheckbox.addEventListener('change', () => {
            if (themeToggleCheckbox.checked) {
                body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // --- MODE SELECTION (Survival vs Training) ---
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabel = document.getElementById('mode-label');
    const modeDesc = document.getElementById('mode-desc'); 
    let currentMode = 'survival'; 

    if (modeToggle) {
        modeToggle.addEventListener('change', () => {
            if (modeToggle.checked) {
                // --- TRAINING MODE (Trophy) ---
                currentMode = 'growth';
                modeLabel.innerHTML = 'Tryb: <strong>Trening</strong> 🏆';
                modeDesc.textContent = 'Budujemy nawyk. Zapisuję Twoje sukcesy w historii.'; 
                
                // NO CONFETTI (Per request - clean change)
            } else {
                // --- SURVIVAL MODE (Rescue) ---
                currentMode = 'survival';
                modeLabel.innerHTML = 'Tryb: <strong>Przetrwanie</strong> 🚑';
                modeDesc.textContent = 'Opcja na gorszy moment. Zero presji. Tylko pomoc.'; 
            }
        });
    }

    // --- ONE TASK LOGIC ---
    
    const taskInput = document.getElementById('task-input');
    const generateButton = document.getElementById('generate-button');
    const stepsContainer = document.getElementById('steps-container');

    let currentTask = ''; 
    let currentProblemType = '';
    let lastWarmupStepsContext = ''; 

    if (generateButton) {
        generateButton.addEventListener('click', handleStartConversation);
    }

    // STAGE 1: Start
    async function handleStartConversation() {
        const taskDescription = taskInput.value;
        if (!taskDescription.trim()) {
            alert('Najpierw wpisz zadanie!');
            return;
        }
        currentTask = taskDescription; 
        
        generateButton.disabled = true;
        generateButton.textContent = 'Myślę...';
        stepsContainer.innerHTML = ''; 

        try {
            // CHANGE HERE: We also send 'mode' (work mode) to the backend
            const response = await fetch('/start-conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    task: currentTask,
                    mode: currentMode 
                })
            });

            if (!response.ok) throw new Error('Błąd połączenia');
            
            const data = await response.json(); 
            if (data.type) currentProblemType = data.type;
            displayQuestionPrompt(data.validation, data.question);

        } catch (error) {
            console.error(error);
            stepsContainer.innerHTML = `<p class="error">Błąd: ${error.message}</p>`;
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = 'Rozbij to!';
        }
    }

    function displayQuestionPrompt(validation, question) {
        stepsContainer.innerHTML = ''; 
        if (validation) {
            const valEl = document.createElement('p');
            valEl.classList.add('ai-validation');
            valEl.textContent = validation;
            stepsContainer.appendChild(valEl);
        }
        const qEl = document.createElement('p');
        qEl.classList.add('ai-question');
        qEl.textContent = question;
        stepsContainer.appendChild(qEl);

        const input = document.createElement('textarea');
        input.id = 'user-answer-input';
        input.placeholder = 'Odpisz krótko...';
        stepsContainer.appendChild(input);

        const btn = document.createElement('button');
        btn.id = 'submit-answer-button';
        btn.textContent = 'Dalej';
        stepsContainer.appendChild(btn);

        btn.addEventListener('click', handleSubmitAnswer);
    }

    async function handleSubmitAnswer() {
        const input = document.getElementById('user-answer-input');
        if (!input || !input.value.trim()) {
            alert('Odpowiedz na pytanie!');
            return;
        }
        
        stepsContainer.innerHTML = '<p class="loading-message">Szukam strategii...</p>';

        try {
            const response = await fetch('/get-blockers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    task: currentTask,  
                    user_answer: input.value,
                    type: currentProblemType 
                })
            });

            if (!response.ok) throw new Error('Błąd połączenia');
            const data = await response.json();
            
            if (data.options) {
                displayBlockerButtons(data.options);
            } else {
                throw new Error("Błąd danych z AI.");
            }
        } catch (error) {
            console.error(error);
            stepsContainer.innerHTML = `<p class="error">Błąd: ${error.message}</p>`;
        }
    }

    function displayBlockerButtons(options) {
        stepsContainer.innerHTML = ''; 
        const container = document.createElement('div');
        container.classList.add('blockers-container');
        
        const title = document.createElement('p');
        title.className = 'ai-question';
        title.textContent = "Co Cię blokuje?";
        stepsContainer.appendChild(title);

        options.forEach(option => {
            const btn = document.createElement('button');
            btn.classList.add('blocker-button');
            btn.textContent = option.blocker;
            btn.addEventListener('click', () => {
                displayWarmupSteps(option.steps, option.blocker);
            });
            container.appendChild(btn);
        });
        stepsContainer.appendChild(container);

        addCustomBlockerSection();
    }

    function addCustomBlockerSection() {
        const sep = document.createElement('p');
        sep.classList.add('separator-text');
        sep.textContent = '--- lub wpisz własny ---';
        stepsContainer.appendChild(sep);

        const customInput = document.createElement('input');
        customInput.id = 'custom-blocker-input';
        customInput.placeholder = 'Inny powód...';
        stepsContainer.appendChild(customInput);

        const customBtn = document.createElement('button');
        customBtn.id = 'custom-blocker-button';
        customBtn.textContent = 'Użyj tego';
        stepsContainer.appendChild(customBtn);

        customBtn.addEventListener('click', () => {
            const val = customInput.value;
            if (!val.trim()) return;
            fetchCustomSteps(val);
        });
    }

    async function fetchCustomSteps(blockerText) {
        stepsContainer.innerHTML = '<p class="loading-message">Planuję rozgrzewkę...</p>';
        
        const userAnswer = document.getElementById('user-answer-input') ? document.getElementById('user-answer-input').value : '';
        
        try {
            const response = await fetch('/generate-final-steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    task: currentTask,
                    blocker: blockerText, 
                    type: currentProblemType,
                    user_answer: userAnswer 
                })
            });
            const stepsObject = await response.json();
            displayWarmupSteps(stepsObject, blockerText);
        } catch (e) {
            stepsContainer.innerHTML = `<p class="error">Błąd: ${e.message}</p>`;
        }
    }

    function displayWarmupSteps(stepsObject, blockerName) { 
        stepsContainer.innerHTML = ''; 

        const stepsArray = Object.values(stepsObject);
        lastWarmupStepsContext = stepsArray.join(", "); 

        const header = document.createElement('div');
        header.classList.add('steps-header'); 
        header.innerHTML = `
            <p class="header-title">Bloker: <strong>${blockerName}</strong></p>
            <p class="header-subtitle">Zróbmy szybki setup. Odhaczaj:</p>
        `;
        stepsContainer.appendChild(header);

        stepsArray.forEach((stepText, index) => {
            const stepRow = document.createElement('div');
            stepRow.classList.add('step');
            if (index > 0) stepRow.classList.add('hidden'); 

            stepRow.innerHTML = `
                <input type="checkbox" id="step-${index}" data-index="${index}">
                <label for="step-${index}">${stepText}</label>
            `;
            stepsContainer.appendChild(stepRow);
        });

        const checkboxes = stepsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(box => {
            box.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                
                if (e.target.checked) {
                    e.target.parentElement.classList.add('completed');
                    if (typeof confetti === 'function') confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });

                    const nextStep = stepsContainer.querySelector(`.step:nth-child(${idx + 3})`);
                    if (nextStep) {
                        nextStep.classList.remove('hidden');
                    } else {
                        setTimeout(displayBridgeUI, 600);
                    }
                } else {
                    e.target.parentElement.classList.remove('completed');
                }
            });
        });
    }

    function displayBridgeUI() {
        stepsContainer.innerHTML = ''; 
        const bridge = document.createElement('div');
        bridge.style.textAlign = "center";
        bridge.innerHTML = `
            <h3 style="margin-bottom:10px;">🔥 Setup gotowy!</h3>
            <p style="color:var(--text-secondary); margin-bottom:20px;">Jesteś przygotowany. Czas na Sprint.</p>
            <button id="btn-action-yes" style="width:100%; background-color:var(--btn-main-bg); color:#fff; padding:15px; border-radius:8px; margin-bottom:10px; cursor:pointer;">START (5 min Sprint)</button>
            <button id="btn-action-no" style="width:100%; background:none; border:1px solid var(--border-color-medium); color:var(--text-secondary); padding:10px; border-radius:8px; cursor:pointer;">Nie, tyle wystarczy</button>
        `;
        stepsContainer.appendChild(bridge);

        document.getElementById('btn-action-yes').addEventListener('click', handleActionSteps);
        document.getElementById('btn-action-no').addEventListener('click', () => {
             stepsContainer.innerHTML = '<p class="ai-validation">Luz. Ważne, że zacząłeś. Do następnego!</p>';
             currentTask = '';
        });
    }

    async function handleActionSteps() {
        stepsContainer.innerHTML = '<p class="loading-message">Analizuję setup i generuję sprint...</p>';

        try {
            const response = await fetch('/generate-action-steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    task: currentTask,
                    last_steps: lastWarmupStepsContext 
                })
            });
            
            const stepsObject = await response.json();
            displayActionSteps(stepsObject);

        } catch (e) {
            stepsContainer.innerHTML = `<p class="error">Błąd: ${e.message}</p>`;
        }
    }

    function displayActionSteps(stepsObject) {
        stepsContainer.innerHTML = ''; 
        const header = document.createElement('div');
        header.classList.add('steps-header');
        header.innerHTML = `
            <p class="header-title">SPRINT ⏱️</p>
            <p class="header-subtitle">5 minut czystej pracy. Tylko to:</p>
        `;
        stepsContainer.appendChild(header);

        Object.values(stepsObject).forEach((stepText, index) => {
            const div = document.createElement('div');
            div.classList.add('step');
            if (index > 0) div.classList.add('hidden'); 

            div.innerHTML = `
                <input type="checkbox" id="act-${index}" data-index="${index}">
                <label for="act-${index}">${stepText}</label>
            `;
            stepsContainer.appendChild(div);
        });

        stepsContainer.querySelectorAll('input[type="checkbox"]').forEach(box => {
            box.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                
                if (e.target.checked) {
                    e.target.parentElement.classList.add('completed');
                    if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 100 });
                    
                    const next = stepsContainer.querySelector(`.step:nth-child(${idx + 3})`);
                    if (next) {
                        next.classList.remove('hidden');
                    } else {
                        if (!stepsContainer.querySelector('.win-message')) {
                            const win = document.createElement('div');
                            win.classList.add('win-message'); 
                            win.innerHTML = `<h2 style="margin-top:20px; color:green;">BRAWO! 🎉</h2><p>Najtrudniejsze za Tobą.</p>`;
                            stepsContainer.appendChild(win);
                        }
                    }
                } else {
                    e.target.parentElement.classList.remove('completed');
                }
            });
        });
    }
});