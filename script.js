// --- Global & Config ---
const GRID_SIZE = 16;
let isDrawing = false;
let timerInterval = null;

// --- App State ---
let state = {
    coins: 150,
    ownedItems: [],
    equippedItems: { hat: null, drink: null, food: null, outfit: null },
    savedCostumes: {},
    currentCostumeCode: "",
    settings: {
        petName: "Pug",
        sound: false,
        notifications: false,
        focusMode: false
    },
    timer: {
        isStudying: false,
        initialDuration: 25 * 60, // seconds
        timeLeft: 25 * 60,
        sessionEndTime: 0,
        currentTask: ""
    },
    stats: {
        history: [], // { date: 'YYYY-MM-DD', timestamp, task, duration, coins }
        activityMap: {} // 'YYYY-MM-DD': total_minutes
    }
};

let friendsData = [
    { id: 'me', name: "You", coins: 0, status: 'online' },
    { id: 'f1', name: "PixelPaws", coins: 1420, status: 'studying' },
    { id: 'f2', name: "StudyBuddy99", coins: 850, status: 'online' },
    { id: 'f3', name: "DoggoLover", coins: 430, status: 'offline' }
];

// --- Deterministic Palette ---
const colorPalette = ['transparent'];
for(let i=0; i<24; i++){
    if (i < 4) { const s = Math.floor((i/3)*255); colorPalette.push(`rgb(${s}, ${s}, ${s})`); }
    else { const h = ((i-4)/19)*360; colorPalette.push(`hsl(${h}, 90%, 55%)`); }
}
let selectedColorIndex = 1;

// --- Core Storage System ---
function saveData() {
    state.currentCostumeCode = getCostumeCode();
    try { localStorage.setItem('pugAppPro', JSON.stringify(state)); } 
    catch(e) { console.warn("Storage failed", e); }
}

function loadData() {
    try {
        const str = localStorage.getItem('pugAppPro');
        if (str) {
            const parsed = JSON.parse(str);
            // Deep merge to ensure new updates don't break old saves
            state.coins = parsed.coins ?? state.coins;
            state.ownedItems = parsed.ownedItems || state.ownedItems;
            Object.assign(state.equippedItems, parsed.equippedItems || {});
            state.savedCostumes = parsed.savedCostumes || state.savedCostumes;
            state.currentCostumeCode = parsed.currentCostumeCode || "";
            Object.assign(state.settings, parsed.settings || {});
            Object.assign(state.timer, parsed.timer || {});
            Object.assign(state.stats, parsed.stats || {});
        }
    } catch(e) { console.warn("Storage disabled", e); }
    
    applySettingsToUI();
    offlineCompletionCheck(); // Check if timer finished while app was closed
    
    if (state.currentCostumeCode) applyCostumeCode(state.currentCostumeCode);
    updateCoinDisplays();
    renderShop();
    renderInventory();
    renderWardrobe();
    renderPugOverlays();
    renderStats();
    updateTimerDisplay();

    // Resume timer if active
    if (state.timer.isStudying) {
        resumeTimer();
    }
}

// --- UI Core ---
function updateCoinDisplays() {
    document.querySelectorAll('.shop-coin-display').forEach(el => el.innerText = state.coins);
    let me = friendsData.find(f => f.id === 'me');
    if (me) me.coins = state.coins;
}

function switchTab(target, btnElement) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
    btnElement.classList.add('active');
    document.getElementById(target + '-panel').classList.add('active');
    
    if(target === 'shop') renderShop();
    if(target === 'inventory') renderInventory();
    if(target === 'friends') renderFriends();
    if(target === 'stats') renderStats();
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// --- Pug Rendering ---
const pugDesign = ["0000000000000000","0004400000044000","0044440000444400","0444443333444440","0444411111144440","0044111111114400","0031111111111300","0031133333311300","0031345334531300","0031344334431300","0031133443311300","0003113333113000","0003111363113000","0003111111113000","0000333003330000","0000000000000000"];
const pugColors = { '0': 'transparent', '1': '#EAB875', '2': '#D1A362', '3': '#3E2A1E', '4': '#221915', '5': '#FFFFFF', '6': '#FF8BA0' };

const basePug = document.getElementById('base-pug');
pugDesign.forEach(row => {
    for(let char of row) {
        const cell = document.createElement('div');
        cell.style.backgroundColor = pugColors[char];
        basePug.appendChild(cell);
    }
});

function petPug() { 
    const pug = document.getElementById('pet-wrapper'); 
    pug.style.transform = 'scale(1.1) translateY(-15px)'; 
    setTimeout(() => { pug.style.transform = ''; }, 200); 
}

const bgThemes = ["linear-gradient(to bottom, #87CEEB 0%, #87CEEB 60%, #55cc55 60%, #32CD32 100%)", "linear-gradient(to bottom, #FF7E5F 0%, #FEB47B 50%, #d45d79 50%, #6A0572 100%)", "linear-gradient(to bottom, #0F2027 0%, #203A43 55%, #1b2e35 55%, #111 100%)"];
let bgIndex = 0;
function cycleBackground() { 
    bgIndex = (bgIndex + 1) % bgThemes.length; 
    document.getElementById('environment').style.background = bgThemes[bgIndex]; 
}

// --- Costume Editor ---
const editorGrid = document.getElementById('editor-grid');
const overlayGrid = document.getElementById('costume-overlay');
const palette = document.getElementById('palette');

for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const editCell = document.createElement('div');
    editCell.classList.add('edit-cell');
    editCell.dataset.index = i;
    editCell.dataset.colorIndex = 0;
    
    const row = Math.floor(i / GRID_SIZE) + 1, col = (i % GRID_SIZE) + 1;
    if (col === 8) editCell.classList.add('col-8'); if (row === 8) editCell.classList.add('row-8');
    if (col === 16) editCell.classList.add('col-16'); if (row === 16) editCell.classList.add('row-16');
    
    const overlayCell = document.createElement('div'); overlayCell.classList.add('pixel');
    editorGrid.appendChild(editCell); overlayGrid.appendChild(overlayCell);
}

function paint(index) {
    editorGrid.children[index].dataset.colorIndex = selectedColorIndex;
    editorGrid.children[index].style.backgroundColor = colorPalette[selectedColorIndex];
    overlayGrid.children[index].style.backgroundColor = colorPalette[selectedColorIndex];
}

editorGrid.addEventListener('touchstart', (e) => { e.preventDefault(); isDrawing = true; handleTouch(e); }, { passive: false });
editorGrid.addEventListener('touchmove', (e) => { e.preventDefault(); if(isDrawing) handleTouch(e); }, { passive: false });
editorGrid.addEventListener('touchend', () => { isDrawing = false; saveData(); });

editorGrid.addEventListener('mousedown', (e) => { isDrawing = true; handleMouse(e); });
editorGrid.addEventListener('mousemove', (e) => { if(isDrawing) handleMouse(e); });
document.addEventListener('mouseup', () => { if(isDrawing){ isDrawing = false; saveData(); } });

function handleTouch(e) {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('edit-cell')) paint(target.dataset.index);
}
function handleMouse(e) { if (e.target && e.target.classList.contains('edit-cell')) paint(e.target.dataset.index); }

for (let i = 1; i < colorPalette.length; i++) {
    const swatch = document.createElement('div');
    swatch.classList.add('color-swatch');
    swatch.dataset.paletteIndex = i;
    swatch.style.backgroundColor = colorPalette[i];
    swatch.addEventListener('click', (e) => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedColorIndex = parseInt(e.target.dataset.paletteIndex);
    });
    palette.appendChild(swatch);
}
palette.children[0].classList.add('selected');

function eraserMode() { document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected')); selectedColorIndex = 0; }
function clearCostume() {
    for (let i = 0; i < editorGrid.children.length; i++) {
        editorGrid.children[i].dataset.colorIndex = 0;
        editorGrid.children[i].style.backgroundColor = 'transparent';
        overlayGrid.children[i].style.backgroundColor = 'transparent';
    }
    saveData();
}

// --- Wardrobe ---
function getCostumeCode() {
    let code = "";
    for(let i=0; i<256; i++) { code += String.fromCharCode(65 + parseInt(editorGrid.children[i].dataset.colorIndex || 0)); }
    return code;
}
function applyCostumeCode(code) {
    if(!code || code.length !== 256) return;
    for(let i=0; i<256; i++) {
        let cIdx = code.charCodeAt(i) - 65;
        if (cIdx < 0 || cIdx >= colorPalette.length) cIdx = 0;
        editorGrid.children[i].dataset.colorIndex = cIdx;
        editorGrid.children[i].style.backgroundColor = colorPalette[cIdx];
        overlayGrid.children[i].style.backgroundColor = colorPalette[cIdx];
    }
}
function saveCostume() {
    const name = document.getElementById('costume-name-input').value.trim();
    if(!name) { showToast("Please enter a name."); return; }
    state.savedCostumes[name] = getCostumeCode();
    document.getElementById('costume-name-input').value = "";
    renderWardrobe(); saveData(); showToast("Saved to Wardrobe!");
}
function importCostume() {
    const code = document.getElementById('costume-import-input').value.trim().toUpperCase();
    if(code.length !== 256) { showToast("Invalid code format!"); return; }
    applyCostumeCode(code);
    document.getElementById('costume-import-input').value = "";
    saveData(); showToast("Imported!");
}
function renderWardrobe() {
    const list = document.getElementById('wardrobe-list'); list.innerHTML = "";
    for(const [name, code] of Object.entries(state.savedCostumes)) {
        const div = document.createElement('div'); div.className = "wardrobe-item";
        div.innerHTML = `
            <span style="flex:1; font-weight:bold; font-size: 0.9rem;">${name}</span>
            <button class="btn" style="padding: 6px 12px; font-size: 0.8rem; background:var(--accent);" onclick="applyCostumeCode('${code}'); saveData();">Equip</button>
            <button class="btn" style="padding: 6px 12px; font-size: 0.8rem; background:#95a5a6;" onclick="navigator.clipboard.writeText('${code}'); showToast('Code Copied!');">Code</button>
            <button class="btn" style="padding: 6px 10px; font-size: 0.8rem; background:#e74c3c;" onclick="deleteCostume('${name}')">X</button>
        `;
        list.appendChild(div);
    }
}
function deleteCostume(name) { delete state.savedCostumes[name]; renderWardrobe(); saveData(); }

// --- Settings & Data Backup ---
function openSettings() { document.getElementById('settings-panel').classList.add('active'); }
function closeSettings() { document.getElementById('settings-panel').classList.remove('active'); }

function applySettingsToUI() {
    document.getElementById('setting-pet-name').value = state.settings.petName;
    document.getElementById('setting-sound').checked = state.settings.sound;
    document.getElementById('setting-notif').checked = state.settings.notifications;
    document.getElementById('setting-focus').checked = state.settings.focusMode;
    document.getElementById('pet-name-display').innerText = state.settings.petName;
    document.getElementById('focus-mode-indicator').style.display = state.settings.focusMode ? 'inline' : 'none';
}

function updateSettings() {
    state.settings.petName = document.getElementById('setting-pet-name').value.trim() || "Pug";
    state.settings.sound = document.getElementById('setting-sound').checked;
    state.settings.focusMode = document.getElementById('setting-focus').checked;
    
    const wantsNotif = document.getElementById('setting-notif').checked;
    if (wantsNotif && Notification.permission !== "granted") {
        Notification.requestPermission().then(perm => {
            state.settings.notifications = (perm === "granted");
            document.getElementById('setting-notif').checked = state.settings.notifications;
            saveData(); applySettingsToUI();
        });
    } else {
        state.settings.notifications = wantsNotif;
    }
    
    saveData(); applySettingsToUI(); showToast("Settings saved!");
}

function exportData() {
    saveData(); // Ensure latest
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `pug_save_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchorElem.click();
}

function importData(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if(imported.coins !== undefined) {
                localStorage.setItem('pugAppPro', JSON.stringify(imported));
                location.reload(); // Quickest way to clean state
            } else { showToast("Invalid save file!"); }
        } catch(err) { showToast("Error reading file."); }
    };
    reader.readAsText(file);
}

// --- Audio & Notifications ---
function playBeep() {
    if (!state.settings.sound) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
}

function triggerNotification(title, body) {
    if (state.settings.notifications && Notification.permission === "granted") {
        new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐶</text></svg>' });
    }
}

// --- Focus Mode Watcher ---
let focusGraceTimeout = null;
document.addEventListener('visibilitychange', () => {
    if (!state.settings.focusMode || !state.timer.isStudying) return;
    
    if (document.hidden) {
        // Give them 10 seconds to return
        focusGraceTimeout = setTimeout(() => {
            failSession();
        }, 10000);
    } else {
        clearTimeout(focusGraceTimeout);
    }
});

function failSession() {
    clearInterval(timerInterval);
    state.timer.isStudying = false;
    state.timer.timeLeft = state.timer.initialDuration;
    updateTimerDisplay();
    
    const btn = document.getElementById('start-timer-btn');
    btn.innerText = "Start New Session"; btn.style.background = "var(--accent)";
    
    document.getElementById('environment').classList.add('failed');
    setTimeout(() => { document.getElementById('environment').classList.remove('failed'); }, 5000);
    
    saveData();
    triggerNotification("Focus Broken!", `${state.settings.petName} is sad you left.`);
    showToast("Focus mode failed session.");
    renderFriends();
}


// --- Timer System ---
function openDurationPicker() {
    if (state.timer.isStudying) return;
    document.getElementById('timer-display').classList.add('hidden');
    document.getElementById('duration-picker').classList.remove('hidden');
}

function closeDurationPicker() {
    document.getElementById('duration-picker').classList.add('hidden');
    document.getElementById('timer-display').classList.remove('hidden');
    updateTimerDisplay();
}

function setDuration(mins) {
    state.timer.initialDuration = mins * 60;
    state.timer.timeLeft = mins * 60;
    document.getElementById('custom-duration-text').innerText = `${mins} min`;
    closeDurationPicker();
}

function adjustDuration(deltaMins) {
    let currentMins = Math.floor(state.timer.initialDuration / 60);
    currentMins = Math.max(5, Math.min(120, currentMins + deltaMins));
    state.timer.initialDuration = currentMins * 60;
    state.timer.timeLeft = currentMins * 60;
    document.getElementById('custom-duration-text').innerText = `${currentMins} min`;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const mins = Math.floor(state.timer.timeLeft / 60).toString().padStart(2, '0');
    const secs = (state.timer.timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${mins}:${secs}`;
}

function spawnCoinDrop(amount) {
    const app = document.getElementById('app');
    const visualCoins = Math.min(amount, 20); 
    for(let i = 0; i < visualCoins; i++) {
        setTimeout(() => {
            const wrapper = document.createElement('div'); wrapper.className = 'coin-drop-wrapper';
            wrapper.style.left = (Math.random() * 85) + '%'; wrapper.style.animationDuration = (1.2 + Math.random() * 0.8) + 's';
            const trail = document.createElement('div'); trail.className = 'coin-trail';
            const sprite = document.createElement('div'); sprite.className = 'coin-sprite';
            sprite.style.animationDuration = (0.4 + Math.random() * 0.4) + 's';
            sprite.style.animationDirection = Math.random() > 0.5 ? 'normal' : 'reverse';
            wrapper.appendChild(trail); wrapper.appendChild(sprite); app.appendChild(wrapper);
            setTimeout(() => { wrapper.remove(); }, 2500);
        }, i * 150); 
    }
}

function offlineCompletionCheck() {
    if (state.timer.isStudying && state.timer.sessionEndTime > 0) {
        const remaining = Math.round((state.timer.sessionEndTime - Date.now()) / 1000);
        if (remaining <= 0) {
            // Session finished while offline
            completeSession(true);
        } else {
            state.timer.timeLeft = remaining;
        }
    }
}

function resumeTimer() {
    const btn = document.getElementById('start-timer-btn');
    btn.innerText = "Pause Session"; btn.style.background = "#e67e22";
    
    // Safety check just in case interval is stuck
    clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        state.timer.timeLeft = Math.max(0, Math.round((state.timer.sessionEndTime - Date.now()) / 1000));
        updateTimerDisplay();

        if (state.timer.timeLeft <= 0) {
            completeSession(false);
        }
    }, 1000);
}

function completeSession(wasOffline = false) {
    clearInterval(timerInterval);
    state.timer.isStudying = false; 
    
    let me = friendsData.find(f => f.id === 'me');
    if(me) me.status = 'online';
    
    const btn = document.getElementById('start-timer-btn');
    if(btn) { btn.innerText = "Start New Session"; btn.style.background = "var(--accent)"; }
    
    const earnedCoins = Math.round((state.timer.initialDuration / 60) * 4);
    state.coins += earnedCoins;
    
    logSession(earnedCoins);
    
    state.timer.timeLeft = state.timer.initialDuration;
    state.timer.sessionEndTime = 0;
    document.getElementById('task-input').value = ""; // clear task
    state.timer.currentTask = "";
    
    updateTimerDisplay();
    updateCoinDisplays();
    saveData();
    
    if(!wasOffline) {
        playBeep();
        cycleBackground(); 
        spawnCoinDrop(earnedCoins);
        if(document.hidden) triggerNotification("Session Complete!", `You earned ${earnedCoins} coins!`);
    } else {
        setTimeout(() => showToast(`Welcome back! You earned ${earnedCoins} coins while away.`), 1000);
    }
    
    if (document.getElementById('friends-panel').classList.contains('active')) renderFriends();
}

function toggleTimer() {
    const btn = document.getElementById('start-timer-btn');
    let me = friendsData.find(f => f.id === 'me');

    if (state.timer.isStudying) {
        // Pause
        clearInterval(timerInterval);
        btn.innerText = "Resume Session"; btn.style.background = "var(--accent)";
        state.timer.isStudying = false; if(me) me.status = 'online';
        // Need to save so the exact timeLeft doesn't revert
        saveData();
    } else {
        // Start
        btn.innerText = "Pause Session"; btn.style.background = "#e67e22";
        state.timer.isStudying = true; if(me) me.status = 'studying';
        document.getElementById('duration-picker').classList.add('hidden');
        document.getElementById('timer-display').classList.remove('hidden');

        // Grab task name
        state.timer.currentTask = document.getElementById('task-input').value.trim() || "Focus Session";

        // Timestamp target recalculation ensures background stability
        state.timer.sessionEndTime = Date.now() + (state.timer.timeLeft * 1000);
        saveData(); // Save immediately so background death handles it

        resumeTimer();
    }
    if (document.getElementById('friends-panel').classList.contains('active')) renderFriends();
}

// --- Stats & History Logging ---
function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function logSession(coinsEarned) {
    const today = getTodayString();
    const durationMins = Math.round(state.timer.initialDuration / 60);
    
    // Update Map
    if(!state.stats.activityMap[today]) state.stats.activityMap[today] = 0;
    state.stats.activityMap[today] += durationMins;
    
    // Update History
    state.stats.history.unshift({
        date: today,
        timestamp: Date.now(),
        task: state.timer.currentTask,
        duration: durationMins,
        coins: coinsEarned
    });
    
    // Keep max 50 history items to save localStorage space
    if(state.stats.history.length > 50) state.stats.history.pop();
}

function calculateStreak() {
    let streak = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for(let i=0; i<365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        
        if(state.stats.activityMap[dStr]) {
            streak++;
        } else {
            // Allow 0 for today (haven't studied yet), but if yesterday is missing, break streak
            if (i > 0) break;
        }
    }
    return streak;
}

function renderStats() {
    // Streak
    document.getElementById('streak-count').innerText = calculateStreak();
    
    // Heatmap (Last 28 days -> 4 weeks x 7 days. Mobile friendly)
    const heatmap = document.getElementById('heatmap-container');
    heatmap.innerHTML = '';
    
    const todayDate = new Date();
    todayDate.setHours(0,0,0,0);
    
    // Generate backwards to get past 28 days, then reverse for display
    const days = [];
    for(let i=27; i>=0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        days.push(dStr);
    }
    
    days.forEach(dStr => {
        const mins = state.stats.activityMap[dStr] || 0;
        let level = 0;
        if(mins > 0) level = 1;
        if(mins >= 25) level = 2;
        if(mins >= 60) level = 3;
        if(mins >= 120) level = 4;
        
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.level = level;
        // Optional tooltip could go here
        heatmap.appendChild(cell);
    });
    
    // History
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    if(state.stats.history.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:10px;">No sessions yet.</div>`;
    } else {
        state.stats.history.slice(0, 5).forEach(item => { // Show last 5
            const li = document.createElement('div');
            li.className = 'history-item';
            
            // Format time nicely
            const dObj = new Date(item.timestamp);
            const timeStr = dObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            li.innerHTML = `
                <div>
                    <div class="history-task">${item.task}</div>
                    <div class="history-meta">${item.date} • ${timeStr} • ${item.duration}m</div>
                </div>
                <div class="history-reward">+${item.coins} 🪙</div>
            `;
            list.appendChild(li);
        });
    }
}

// --- Expanded Shop/Items ---
const pixelItems = {
    tophat: { colors: {0:'transparent', 1:'#222', 2:'#e74c3c'}, data: ["0000000000","0001111000","0001111000","0001111000","0002222000","0011111100","0000000000","0000000000","0000000000","0000000000"] },
    crown: { colors: {0:'transparent', 1:'#f1c40f', 2:'#e67e22', 3:'#e74c3c', 4:'#3498db'}, data: ["0000000000","0010010010","0010111010","0011111110","0013141310","0011111110","0022222220","0000000000","0000000000","0000000000"] },
    boba: { colors: {0:'transparent', 1:'#ecf0f1', 2:'#d35400', 3:'#e67e22', 4:'#bdc3c7', 5:'#2c3e50'}, data: ["0000220000","0000200000","0000200000","0014444100","0013333100","0013333100","0015353100","0013535100","0001111000","0000000000"] },
    coffee: { colors: {0:'transparent', 1:'#fff', 2:'#8e44ad', 3:'#34495e', 4:'#bdc3c7'}, data: ["0000404000","0004000000","0000040000","0003333000","0011111100","0012222100","0012222100","0001111000","0000000000","0000000000"] },
    pizza: { colors: {0:'transparent', 1:'#f39c12', 2:'#f1c40f', 3:'#c0392b'}, data: ["0000000000","0011111100","0012322100","0002223000","0003222000","0000230000","0000220000","0000000000","0000000000","0000000000"] },
    bone: { colors: {0:'transparent', 1:'#ecf0f1', 2:'#bdc3c7'}, data: ["0000000000","0011001100","0111111110","0111111110","0011001100","0000000000","0000000000","0000000000","0000000000","0000000000"] },
    graduationCap: { colors: {0:'transparent', 1:'#2c3e50', 2:'#f1c40f', 3:'#e74c3c'}, data: ["0000000000","0111111110","1111111111","0001111020","0001111020","0000000030","0000000030","0000000000","0000000000","0000000000"] },
    headphones: { colors: {0:'transparent', 1:'#34495e', 2:'#e74c3c', 3:'#ecf0f1'}, data: ["0000000000","0011111100","0110000110","1100000011","2200000022","2300000032","2200000022","0000000000","0000000000","0000000000"] },
    matcha: { colors: {0:'transparent', 1:'#ecf0f1', 2:'#2ecc71', 3:'#27ae60', 4:'#bdc3c7'}, data: ["0000220000","0000200000","0000200000","0014444100","0012222100","0013333100","0012323100","0013232100","0001111000","0000000000"] },
    donut: { colors: {0:'transparent', 1:'#e67e22', 2:'#f39c12', 3:'#e74c3c', 4:'#3498db'}, data: ["0000000000","0001111000","0013333100","0134334310","0133113310","0134114310","0013333100","0001111000","0000000000","0000000000"] },
    sweater: { colors: {0:'transparent', 1:'#e74c3c', 2:'#c0392b', 3:'#fff'}, data: ["0000000000","0000000000","0000000000","0000000000","0000000000","0001111100","0011212110","0012121210","0003333300","0000000000"] }
};

const catalog = [
    { id: 'tophat', name: "Top Hat", price: 50, type: "hat", equipClass: "equip-hat" },
    { id: 'crown', name: "Crown", price: 150, type: "hat", equipClass: "equip-hat" },
    { id: 'graduationCap', name: "Grad Cap", price: 200, type: "hat", equipClass: "equip-hat" },
    { id: 'headphones', name: "Headphones", price: 120, type: "hat", equipClass: "equip-hat" },
    { id: 'boba', name: "Boba Tea", price: 80, type: "drink", equipClass: "equip-drink" },
    { id: 'coffee', name: "Coffee", price: 40, type: "drink", equipClass: "equip-drink" },
    { id: 'matcha', name: "Matcha", price: 70, type: "drink", equipClass: "equip-drink" },
    { id: 'pizza', name: "Pizza", price: 60, type: "food", equipClass: "equip-food" },
    { id: 'donut', name: "Donut", price: 45, type: "food", equipClass: "equip-food" },
    { id: 'bone', name: "Treat Bone", price: 30, type: "food", equipClass: "equip-food" },
    { id: 'sweater', name: "Red Sweater", price: 100, type: "outfit", equipClass: "equip-outfit" }
];

function buildPixelGrid(itemId, size = '100%') {
    const item = pixelItems[itemId];
    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid'; wrapper.style.gridTemplateColumns = 'repeat(10, 1fr)';
    wrapper.style.width = size; wrapper.style.height = size; wrapper.style.imageRendering = 'pixelated';
    item.data.forEach(row => { for(let char of row) {
        const cell = document.createElement('div'); cell.style.backgroundColor = item.colors[char]; wrapper.appendChild(cell);
    }});
    return wrapper;
}

function renderShop() {
    const container = document.getElementById('shop-container'); container.innerHTML = '';
    const unowned = catalog.filter(item => !state.ownedItems.includes(item.id));
    if(unowned.length === 0) { container.innerHTML = `<p style="grid-column:span 2; text-align:center;">Shop empty!</p>`; return; }
    unowned.forEach(item => {
        const card = document.createElement('div'); card.classList.add('card');
        const icon = document.createElement('div'); icon.className = 'icon-container'; icon.appendChild(buildPixelGrid(item.id, '40px'));
        card.appendChild(icon);
        card.insertAdjacentHTML('beforeend', `
            <div style="font-weight: bold; font-size: 0.9rem;">${item.name}</div>
            <div class="price-tag">🪙 ${item.price}</div>
            <button class="btn" style="width: 100%; font-size: 0.85rem;" onclick="buyItem('${item.id}')">Buy</button>
        `);
        container.appendChild(card);
    });
}

function renderInventory() {
    const container = document.getElementById('inventory-container'); container.innerHTML = '';
    const owned = catalog.filter(item => state.ownedItems.includes(item.id));
    if(owned.length === 0) { container.innerHTML = `<p style="grid-column:span 2; text-align:center;">Bag empty.</p>`; return; }
    owned.forEach(item => {
        const card = document.createElement('div'); card.classList.add('card');
        const isEquipped = state.equippedItems[item.type] === item.id;
        let btnHtml = isEquipped ? `<button class="btn" style="width: 100%; background: #95a5a6; font-size: 0.85rem;" onclick="unequipItem('${item.type}')">Unequip</button>` : `<button class="btn" style="width: 100%; background: #2ecc71; font-size: 0.85rem;" onclick="equipItem('${item.id}')">Equip</button>`;
        const icon = document.createElement('div'); icon.className = 'icon-container'; icon.appendChild(buildPixelGrid(item.id, '40px'));
        card.appendChild(icon); card.insertAdjacentHTML('beforeend', `<div style="font-weight: bold; font-size: 0.9rem; margin-bottom: 10px;">${item.name}</div>${btnHtml}`);
        container.appendChild(card);
    });
}

function renderFriends() {
    const container = document.getElementById('friends-container'); container.innerHTML = '';
    [...friendsData].sort((a, b) => b.coins - a.coins).forEach((friend, idx) => {
        let statusText = "Offline", statusClass = "status-offline";
        if (friend.status === 'studying') { statusText = "Studying..."; statusClass = "status-studying"; }
        else if (friend.status === 'online') { statusText = "Online"; statusClass = "status-online"; }
        container.insertAdjacentHTML('beforeend', `
            <div class="friend-card ${friend.id === 'me' ? 'is-me' : ''}">
                <div class="rank-number">#${idx + 1}</div>
                <div class="friend-info">
                    <div class="friend-name">${friend.name}</div>
                    <div class="status-container ${statusClass}"><div class="status-dot"></div><div class="status-text">${statusText}</div></div>
                </div>
                <div class="friend-score">🪙 ${friend.coins}</div>
            </div>
        `);
    });
}

function copyFriendCode() {
    navigator.clipboard.writeText("PUG-4X9B").then(() => {
        showToast("Friend Code Copied!");
    });
}

function buyItem(id) {
    const item = catalog.find(i => i.id === id);
    if (state.coins >= item.price) { 
        state.coins -= item.price; 
        state.ownedItems.push(id); 
        updateCoinDisplays(); renderShop(); saveData(); 
        showToast(`Bought ${item.name}!`);
    } 
    else { showToast("Not enough coins!"); }
}

function equipItem(id) { 
    const item = catalog.find(i => i.id === id); 
    state.equippedItems[item.type] = item.id; 
    renderInventory(); renderPugOverlays(); saveData(); 
}

function unequipItem(type) { 
    state.equippedItems[type] = null; 
    renderInventory(); renderPugOverlays(); saveData(); 
}

function renderPugOverlays() {
    const overlay = document.getElementById('shop-overlay'); overlay.innerHTML = ''; 
    Object.values(state.equippedItems).forEach(itemId => {
        if (itemId) {
            const item = catalog.find(i => i.id === itemId);
            const el = document.createElement('div'); el.className = item.equipClass;
            el.appendChild(buildPixelGrid(itemId, '100%')); overlay.appendChild(el);
        }
    });
}

// Initialize App
loadData();
