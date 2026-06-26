// Application State
let customDraws = [];
let allDraws = [];
let exclusions = new Set();
let selectedDraw = null;
let ticketPrice = 2.00;
let prizeFactor = 20.00;
let activeFilter = 'all';
let searchQuery = '';

// Constants for statistics
const PRIME_NUMBERS = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59]);
const FIBONACCI_NUMBERS = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55]);

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadDraws();
    initExclusionsGrid();
    setupEventListeners();
});

// Initialize Theme (Default is Light)
function initTheme() {
    const savedTheme = localStorage.getItem('seninha_theme');
    const themeIcon = document.getElementById('theme-icon');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeIcon) {
            themeIcon.className = 'fa-solid fa-sun';
        }
    } else {
        document.body.classList.remove('dark-theme');
        if (themeIcon) {
            themeIcon.className = 'fa-solid fa-moon';
        }
    }
}

// Load draws from SQLite Database
async function loadDraws() {
    try {
        const res = await fetch('/api/draws');
        if (!res.ok) {
            throw new Error('Erro ao carregar sorteios do banco de dados');
        }
        allDraws = await res.json();
        
        // Default selected draw: the latest draw
        if (allDraws.length > 0) {
            if (selectedDraw) {
                // Keep selected draw if it still exists
                const stillExists = allDraws.find(d => d.draw === selectedDraw.draw);
                if (stillExists) {
                    selectedDraw = stillExists;
                } else {
                    selectedDraw = allDraws[0];
                }
            } else {
                selectedDraw = allDraws[0];
            }
        }
        
        populateDrawSelector();
        updateApp();
    } catch (e) {
        console.error('Erro ao carregar sorteios do SQLite:', e);
        // Fallback or warning
        alert('Não foi possível conectar ao banco SQLite. Certifique-se de que o servidor local está ativo.');
    }
}

// Populate the select dropdown with draws list
function populateDrawSelector() {
    const selector = document.getElementById('select-draw');
    selector.innerHTML = '';
    
    allDraws.forEach(d => {
        const option = document.createElement('option');
        option.value = d.draw;
        option.textContent = `Concurso ${d.draw} (${formatDateString(d.date)})`;
        if (selectedDraw && selectedDraw.draw === d.draw) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

// Initialize the 1-60 grid for exclusions
function initExclusionsGrid() {
    const grid = document.getElementById('exclusion-grid');
    grid.innerHTML = '';
    
    for (let i = 1; i <= 60; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.number = i;
        cell.textContent = String(i).padStart(2, '0');
        
        cell.addEventListener('click', () => toggleExclusion(i));
        grid.appendChild(cell);
    }
}

// Toggle exclusion of a number
function toggleExclusion(num) {
    const cell = document.querySelector(`.grid-cell[data-number="${num}"]`);
    
    if (exclusions.has(num)) {
        exclusions.delete(num);
        cell.classList.remove('excluded');
    } else {
        if (exclusions.size >= 6) {
            // Reached limit of 6
            alert('Você pode excluir no máximo 6 dezenas (Erre 6).');
            return;
        }
        exclusions.add(num);
        cell.classList.add('excluded');
    }
    
    // Update badge count
    document.getElementById('exclusion-count').textContent = `${exclusions.size} / 6`;
    
    // Recalculate everything
    updateApp();
}

// Event Listeners Setup
function setupEventListeners() {
    // Select draw change
    document.getElementById('select-draw').addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        const found = allDraws.find(d => d.draw === val);
        if (found) {
            selectedDraw = found;
            updateApp();
        }
    });
    
    // Input fields for financial calculations
    document.getElementById('ticket-price').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0) {
            ticketPrice = val;
            updateFinancials();
        }
    });
    
    document.getElementById('prize-factor').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0) {
            prizeFactor = val;
            updateFinancials();
        }
    });
    
    // Filters buttons
    const filterButtons = document.querySelectorAll('#filter-points-group .btn-filter');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterButtons.forEach(b => b.classList.remove('active'));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');
            activeFilter = targetBtn.dataset.filter;
            renderGamesTable();
        });
    });
    
    // Search input field
    document.getElementById('search-game-name').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderGamesTable();
    });
    
    // Clear exclusions button
    document.getElementById('btn-clear-exclusions').addEventListener('click', () => {
        exclusions.clear();
        document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('excluded'));
        document.getElementById('exclusion-count').textContent = `0 / 6`;
        updateApp();
    });
    
    // Simular Sorteio button
    document.getElementById('btn-custom-draw').addEventListener('click', () => {
        document.getElementById('modal-custom-draw').showModal();
    });
    
    // Novo Concurso button
    document.getElementById('btn-new-draw').addEventListener('click', () => {
        document.getElementById('modal-new-draw').showModal();
    });
    
    // Export to TXT button
    document.getElementById('btn-export-txt').addEventListener('click', () => {
        exportToTxt();
    });
    
    // Custom draw simulation form submission
    document.querySelector('#modal-custom-draw form').addEventListener('submit', (e) => {
        e.preventDefault();
        const inputs = document.querySelectorAll('.sim-num');
        const nums = [];
        let hasError = false;
        
        inputs.forEach(input => {
            const val = parseInt(input.value, 10);
            if (isNaN(val) || val < 1 || val > 60 || nums.includes(val)) {
                hasError = true;
            } else {
                nums.push(val);
            }
        });
        
        const errorDiv = document.getElementById('sim-error');
        if (hasError) {
            errorDiv.classList.remove('hidden');
        } else {
            errorDiv.classList.add('hidden');
            nums.sort((a, b) => a - b);
            
            // Create a simulated draw
            selectedDraw = {
                draw: 9999, // special ID for simulation
                date: new Date().toISOString().split('T')[0],
                numbers: nums,
                isSimulation: true
            };
            
            // If already in list, replace, else append
            const simIdx = allDraws.findIndex(d => d.draw === 9999);
            if (simIdx !== -1) {
                allDraws[simIdx] = selectedDraw;
            } else {
                allDraws.unshift(selectedDraw); // Put at top
            }
            
            populateDrawSelector();
            document.getElementById('modal-custom-draw').close();
            
            // Clear inputs
            inputs.forEach(input => input.value = '');
            
            updateApp();
        }
    });
    
    // New draw form submission
    document.querySelector('#modal-new-draw form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const drawId = parseInt(document.getElementById('new-draw-id').value, 10);
        const drawDate = document.getElementById('new-draw-date').value;
        const inputs = document.querySelectorAll('.new-num');
        const nums = [];
        let hasError = false;
        
        // Validate draw number
        if (isNaN(drawId) || drawId <= 0) hasError = true;
        
        // Validate date
        if (!drawDate) hasError = true;
        
        inputs.forEach(input => {
            const val = parseInt(input.value, 10);
            if (isNaN(val) || val < 1 || val > 60 || nums.includes(val)) {
                hasError = true;
            } else {
                nums.push(val);
            }
        });
        
        const errorDiv = document.getElementById('new-draw-error');
        if (hasError) {
            errorDiv.classList.remove('hidden');
        } else {
            errorDiv.classList.add('hidden');
            nums.sort((a, b) => a - b);
            
            const newDraw = {
                draw: drawId,
                date: drawDate,
                numbers: nums
            };
            
            try {
                const res = await fetch('/api/draws/custom', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newDraw)
                });
                
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || 'Erro ao salvar no servidor');
                }
                
                // Re-load and rebuild
                await loadDraws();
                
                // Set newly created draw as selected
                selectedDraw = allDraws.find(d => d.draw === drawId);
                populateDrawSelector(); // select the new draw
                
                document.getElementById('modal-new-draw').close();
                
                // Reset form
                document.getElementById('new-draw-id').value = '';
                document.getElementById('new-draw-date').value = '';
                inputs.forEach(input => input.value = '');
                
                updateApp();
            } catch (error) {
                console.error('Erro ao salvar concurso:', error);
                alert('Erro ao salvar concurso no banco SQLite: ' + error.message);
            }
        }
    });

    // Update API button listener
    document.getElementById('btn-update-api').addEventListener('click', async () => {
        const btn = document.getElementById('btn-update-api');
        const icon = document.getElementById('update-icon');
        
        if (btn.disabled) return;
        btn.disabled = true;
        icon.classList.add('spin');
        
        try {
            const res = await fetch('/api/draws/update', { method: 'POST' });
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Erro desconhecido');
            }
            
            alert(data.message);
            await loadDraws();
        } catch (error) {
            console.error('Erro ao atualizar banco:', error);
            alert('Falha na atualização: ' + error.message);
        } finally {
            btn.disabled = false;
            icon.classList.remove('spin');
        }
    });

    // Theme toggle button click listener
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-theme');
            const themeIcon = document.getElementById('theme-icon');
            
            if (isDark) {
                localStorage.setItem('seninha_theme', 'dark');
                if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
            } else {
                localStorage.setItem('seninha_theme', 'light');
                if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
            }
        });
    }
}

// Compute the current 54 numbers pool
function getActivePool() {
    const fullPool = [];
    for (let i = 1; i <= 60; i++) {
        if (!exclusions.has(i)) {
            fullPool.push(i);
        }
    }
    // Take the first 54 numbers and sort them
    const active = fullPool.slice(0, 54).sort((a, b) => a - b);
    return active;
}

// Re-calculate generated games based on active pool
let computedGames = [];
function calculateGames() {
    if (!selectedDraw) return;
    
    const activePool = getActivePool();
    const drawNumbers = new Set(selectedDraw.numbers);
    
    computedGames = WHEEL_GAMES.map(wg => {
        // Map 40 indices (0-53) to activePool values
        const nums = wg.indices.map(idx => activePool[idx]);
        
        // Calculate statistics
        let hits = 0;
        let evens = 0;
        let odds = 0;
        let primes = 0;
        let fibonacci = 0;
        let multiplesOf3 = 0;
        let sum = 0;
        
        nums.forEach(n => {
            sum += n;
            if (drawNumbers.has(n)) hits++;
            if (n % 2 === 0) evens++;
            else odds++;
            if (PRIME_NUMBERS.has(n)) primes++;
            if (FIBONACCI_NUMBERS.has(n)) fibonacci++;
            if (n % 3 === 0) multiplesOf3++;
        });
        
        return {
            name: wg.name,
            numbers: nums,
            hits,
            evens,
            odds,
            primes,
            fibonacci,
            multiplesOf3,
            sum
        };
    });
}

// Main update trigger
function updateApp() {
    calculateGames();
    renderDrawInfo();
    updateFinancials();
    updateFilterCounts();
    renderGamesTable();
}

// Render selected draw details (balls, date)
function renderDrawInfo() {
    if (!selectedDraw) return;
    
    document.getElementById('draw-date-display').textContent = formatDateString(selectedDraw.date);
    
    const ballsContainer = document.getElementById('draw-numbers-container');
    ballsContainer.innerHTML = '';
    
    // Check if drawn numbers are in our active pool of 54
    const activePoolSet = new Set(getActivePool());
    
    selectedDraw.numbers.forEach(num => {
        const ball = document.createElement('div');
        ball.className = 'ball';
        ball.textContent = String(num).padStart(2, '0');
        
        // Highlight if the drawn number is inside the 54 pool!
        if (activePoolSet.has(num)) {
            ball.classList.add('matched');
        }
        ballsContainer.appendChild(ball);
    });
    
    // Draw status info text
    const msgEl = document.getElementById('draw-message');
    if (selectedDraw.isSimulation) {
        msgEl.innerHTML = `<span style="color: var(--warning);"><i class="fa-solid fa-triangle-exclamation"></i> Sorteio Simulado</span>`;
    } else {
        msgEl.textContent = `Resultados oficiais obtidos para o concurso ${selectedDraw.draw}.`;
    }
}

// Update financial values on the dashboard
function updateFinancials() {
    if (computedGames.length === 0) return;
    
    // Spent: 159 * ticketPrice
    const totalSpent = computedGames.length * ticketPrice;
    document.getElementById('total-cost').textContent = formatCurrency(totalSpent);
    
    // Wins: count games with 6 hits
    const wins = computedGames.filter(g => g.hits === 6).length;
    document.getElementById('total-wins').textContent = wins;
    
    // Prize: wins * prizeFactor
    const totalPrize = wins * prizeFactor;
    document.getElementById('total-prize').textContent = formatCurrency(totalPrize);
    
    // Net profit = totalPrize - totalSpent
    const net = totalPrize - totalSpent;
    const profitEl = document.getElementById('net-profit');
    const container = document.getElementById('net-profit-container');
    
    profitEl.textContent = formatCurrency(net);
    
    if (net >= 0) {
        container.className = 'finance-item span-2 border-top highlight-profit profit';
    } else {
        container.className = 'finance-item span-2 border-top highlight-profit loss';
    }
}

// Calculate sizes for the filter counts
function updateFilterCounts() {
    let c6 = 0, c5 = 0, c4 = 0, cLess = 0;
    
    computedGames.forEach(g => {
        if (g.hits === 6) c6++;
        else if (g.hits === 5) c5++;
        else if (g.hits === 4) c4++;
        else cLess++;
    });
    
    document.getElementById('count-6').textContent = c6;
    document.getElementById('count-5').textContent = c5;
    document.getElementById('count-4').textContent = c4;
    document.getElementById('count-less').textContent = cLess;
}

// Get games filtered by search query and hits filter
function getFilteredGames() {
    return computedGames.filter(g => {
        // Filter by points badge
        let matchesPoints = true;
        if (activeFilter === '6') matchesPoints = (g.hits === 6);
        else if (activeFilter === '5') matchesPoints = (g.hits === 5);
        else if (activeFilter === '4') matchesPoints = (g.hits === 4);
        else if (activeFilter === 'less') matchesPoints = (g.hits <= 3);
        
        // Filter by game search name
        let matchesSearch = true;
        if (searchQuery) {
            matchesSearch = g.name.toLowerCase().includes(searchQuery);
        }
        
        return matchesPoints && matchesSearch;
    });
}

// Render games list into tbody
function renderGamesTable() {
    const tbody = document.getElementById('games-tbody');
    tbody.innerHTML = '';
    
    const filtered = getFilteredGames();
    const emptyState = document.getElementById('empty-state');
    
    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }
    
    const drawNumbersSet = selectedDraw ? new Set(selectedDraw.numbers) : new Set();
    
    // Create elements batch
    const fragment = document.createDocumentFragment();
    
    filtered.forEach(g => {
        const tr = document.createElement('tr');
        
        // Game name cell
        const tdName = document.createElement('td');
        tdName.className = 'col-game';
        tdName.textContent = g.name;
        tr.appendChild(tdName);
        
        // Game numbers cell
        const tdNums = document.createElement('td');
        tdNums.className = 'col-numbers';
        const flexDiv = document.createElement('div');
        flexDiv.className = 'table-numbers-flex';
        
        g.numbers.forEach(num => {
            const badge = document.createElement('span');
            badge.className = 'num-badge';
            badge.textContent = String(num).padStart(2, '0');
            if (drawNumbersSet.has(num)) {
                badge.classList.add('hit');
            }
            flexDiv.appendChild(badge);
        });
        tdNums.appendChild(flexDiv);
        tr.appendChild(tdNums);
        
        // Stats: Hits cell
        const tdHits = document.createElement('td');
        tdHits.className = 'col-stat';
        const ptsBadge = document.createElement('span');
        ptsBadge.className = 'pts-badge';
        ptsBadge.textContent = g.hits;
        if (g.hits === 6) ptsBadge.classList.add('pts-6');
        else if (g.hits === 5) ptsBadge.classList.add('pts-5');
        else if (g.hits === 4) ptsBadge.classList.add('pts-4');
        else ptsBadge.classList.add('pts-low');
        tdHits.appendChild(ptsBadge);
        tr.appendChild(tdHits);
        
        // Stats: Even
        const tdEven = document.createElement('td');
        tdEven.className = 'col-stat stat-val';
        tdEven.textContent = g.evens;
        tr.appendChild(tdEven);
        
        // Stats: Odd
        const tdOdd = document.createElement('td');
        tdOdd.className = 'col-stat stat-val';
        tdOdd.textContent = g.odds;
        tr.appendChild(tdOdd);
        
        // Stats: Primes
        const tdPrimes = document.createElement('td');
        tdPrimes.className = 'col-stat stat-val';
        tdPrimes.textContent = g.primes;
        tr.appendChild(tdPrimes);
        
        // Stats: Fibonacci
        const tdFib = document.createElement('td');
        tdFib.className = 'col-stat stat-val';
        tdFib.textContent = g.fibonacci;
        tr.appendChild(tdFib);
        
        // Stats: Multiples of 3
        const tdM3 = document.createElement('td');
        tdM3.className = 'col-stat stat-val';
        tdM3.textContent = g.multiplesOf3;
        tr.appendChild(tdM3);
        
        // Stats: Sum
        const tdSum = document.createElement('td');
        tdSum.className = 'col-stat stat-val';
        tdSum.style.fontWeight = '600';
        tdSum.textContent = g.sum;
        tr.appendChild(tdSum);
        
        fragment.appendChild(tr);
    });
    
    tbody.appendChild(fragment);
}

// Export the currently filtered games into a TXT file
function exportToTxt() {
    const filtered = getFilteredGames();
    
    if (filtered.length === 0) {
        alert('Nenhum jogo visível para exportar.');
        return;
    }
    
    let txtContent = '';
    filtered.forEach(g => {
        // Format each number as 2 digits, space separated
        const line = g.numbers.map(n => String(n).padStart(2, '0')).join(' ');
        txtContent += line + '\r\n';
    });
    
    // Create Blob and trigger download
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const filterSuffix = activeFilter !== 'all' ? `_acertos_${activeFilter}` : '';
    const dateStr = new Date().toISOString().split('T')[0];
    
    link.href = url;
    link.download = `seninha_159_jogos${filterSuffix}_${dateStr}.txt`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Formatting Helper Functions
function formatDateString(dateStr) {
    if (!dateStr) return '--/--/----';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function formatCurrency(val) {
    return 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
