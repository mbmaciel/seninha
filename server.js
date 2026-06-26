const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'seninha.db');
const INITIAL_DRAWS_PATH = path.join(__dirname, 'initial_draws.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static frontend files from current directory

// Ensure the database directory exists (needed for Render persistent disk)
const dbDir = path.dirname(DB_PATH);
console.log(`[DB] Caminho do banco: ${DB_PATH}`);
console.log(`[DB] Diretório do banco: ${dbDir}`);

try {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`[DB] Diretório criado: ${dbDir}`);
    }
    // Test write permissions
    const testFile = path.join(dbDir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`[DB] Permissão de escrita confirmada em: ${dbDir}`);
} catch (fsErr) {
    console.error(`[DB] ERRO DE SISTEMA DE ARQUIVOS: ${fsErr.message}`);
    console.error(`[DB] Stack: ${fsErr.stack}`);
}

// Initialize Database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco SQLite:', err.message);
        console.error('Código do erro:', err.code);
        console.error('Stack:', err.stack);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Create draws table
        db.run(`
            CREATE TABLE IF NOT EXISTS draws (
                draw INTEGER PRIMARY KEY,
                date TEXT,
                n1 INTEGER,
                n2 INTEGER,
                n3 INTEGER,
                n4 INTEGER,
                n5 INTEGER,
                n6 INTEGER,
                is_custom INTEGER DEFAULT 0
            )
        `, (err) => {
            if (err) {
                console.error('Erro ao criar tabela:', err);
                return;
            }
            
            // Check if table is empty to seed it
            db.get("SELECT COUNT(*) as count FROM draws", (err, row) => {
                if (err) {
                    console.error('Erro ao verificar quantidade de registros:', err);
                    return;
                }
                
                if (row.count === 0) {
                    console.log('Banco de dados vazio. Semeando dados históricos iniciais...');
                    seedDatabase();
                } else {
                    console.log(`Banco de dados pronto com ${row.count} concursos.`);
                }
            });
        });
    });
}

// Seed SQLite with initial draws JSON
function seedDatabase() {
    if (!fs.existsSync(INITIAL_DRAWS_PATH)) {
        console.error(`Erro: Arquivo inicial ${INITIAL_DRAWS_PATH} não encontrado.`);
        return;
    }
    
    try {
        const raw = fs.readFileSync(INITIAL_DRAWS_PATH, 'utf8');
        const initialDraws = JSON.parse(raw);
        
        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO draws (draw, date, n1, n2, n3, n4, n5, n6, is_custom)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            `);
            
            initialDraws.forEach(d => {
                stmt.run(d.draw, d.date, d.numbers[0], d.numbers[1], d.numbers[2], d.numbers[3], d.numbers[4], d.numbers[5]);
            });
            
            stmt.finalize((err) => {
                if (err) {
                    console.error('Erro ao finalizar seeding:', err);
                } else {
                    console.log(`Sucesso: ${initialDraws.length} concursos semeados no banco SQLite.`);
                }
            });
        });
    } catch (e) {
        console.error('Erro ao processar arquivo initial_draws.json:', e);
    }
}

// Helper to convert date format from DD/MM/YYYY to YYYY-MM-DD
function convertDate(dateStr) {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

// API: Get all draws
app.get('/api/draws', (req, res) => {
    db.all("SELECT * FROM draws ORDER BY draw DESC", [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erro ao buscar concursos no banco' });
        }
        
        const formatted = rows.map(r => ({
            draw: r.draw,
            date: r.date,
            numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
            isCustom: r.is_custom === 1
        }));
        
        res.json(formatted);
    });
});

// API: Insert a custom draw manually
app.post('/api/draws/custom', (req, res) => {
    const { draw, date, numbers } = req.body;
    
    if (!draw || !date || !numbers || numbers.length !== 6) {
        return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    
    db.run(
        `INSERT OR REPLACE INTO draws (draw, date, n1, n2, n3, n4, n5, n6, is_custom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [draw, date, numbers[0], numbers[1], numbers[2], numbers[3], numbers[4], numbers[5]],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Erro ao salvar concurso personalizado' });
            }
            res.json({ success: true, message: `Concurso ${draw} cadastrado com sucesso.` });
        }
    );
});

// API: Update data from Loterias Caixa Heroku API
app.post('/api/draws/update', async (req, res) => {
    console.log('Recebida requisição de atualização. Consultando API externa...');
    
    try {
        const response = await fetch('https://loteriascaixa-api.herokuapp.com/api/megasena', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP da API externa: ${response.status}`);
        }
        
        const externalDraws = await response.json();
        console.log(`Recebidos ${externalDraws.length} concursos da API externa. Atualizando banco local...`);
        
        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO draws (draw, date, n1, n2, n3, n4, n5, n6, is_custom)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            `);
            
            let insertedCount = 0;
            
            externalDraws.forEach(ed => {
                const drawNum = ed.concurso;
                const formattedDate = convertDate(ed.data);
                const numbers = ed.dezenas.map(d => parseInt(d, 10));
                
                stmt.run(drawNum, formattedDate, numbers[0], numbers[1], numbers[2], numbers[3], numbers[4], numbers[5], function(err) {
                    if (!err && this.changes > 0) {
                        insertedCount++;
                    }
                });
            });
            
            stmt.finalize((err) => {
                if (err) {
                    console.error('Erro ao finalizar transação de atualização:', err);
                    return res.status(500).json({ error: 'Erro ao atualizar banco de dados' });
                }
                
                console.log('Atualização do banco concluída.');
                
                // Fetch the updated list of draws to return to client
                db.all("SELECT * FROM draws ORDER BY draw DESC", [], (err, rows) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Erro ao ler dados após atualização' });
                    }
                    
                    const formatted = rows.map(r => ({
                        draw: r.draw,
                        date: r.date,
                        numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
                        isCustom: r.is_custom === 1
                    }));
                    
                    res.json({
                        success: true,
                        message: 'Sincronização concluída com sucesso.',
                        draws: formatted
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('Erro na sincronização de dados:', error);
        res.status(500).json({ error: 'A API externa de loterias está instável ou offline no momento. Tente novamente mais tarde.' });
    }
});

// Close database on shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Erro ao fechar banco SQLite:', err);
        } else {
            console.log('Banco de dados SQLite fechado.');
        }
        process.exit(0);
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\nServidor ativo em http://localhost:${PORT}`);
});
