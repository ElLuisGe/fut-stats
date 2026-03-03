const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const setupDatabase = require('./database');

// IMPORTANTE: Definir app ANTES de usarla
const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configurar EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

console.log('✅ Servidor iniciando...');
console.log('📁 Buscando vistas en:', path.join(__dirname, 'views'));

// Variable global para la base de datos
let db;

// Middleware para conectar DB
app.use(async (req, res, next) => {
    try {
        if (!db) {
            db = await setupDatabase();
        }
        next();
    } catch (error) {
        console.error('❌ Error conectando a DB:', error);
        res.status(500).send('Error de conexión a la base de datos');
    }
});

// ============================================
// RUTAS PRINCIPALES
// ============================================

// Página principal
app.get('/', async (req, res) => {
    try {
        console.log('➡️ Cargando página principal');
        
        const equipos = await db.all('SELECT * FROM equipos ORDER BY nombre') || [];
        
        const ultimosPartidos = await db.all(`
            SELECT p.*, el.nombre as local, ev.nombre as visitante 
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            ORDER BY p.fecha DESC LIMIT 5
        `) || [];
        
        const statsGenerales = await db.get(`
            SELECT 
                COUNT(*) as total_partidos,
                COALESCE(SUM(goles_local + goles_visitante), 0) as total_goles,
                COALESCE(AVG(goles_local + goles_visitante), 0) as promedio_goles
            FROM partidos
        `) || { total_partidos: 0, total_goles: 0, promedio_goles: 0 };

        res.render('index', { 
            equipos: equipos, 
            ultimosPartidos: ultimosPartidos, 
            statsGenerales: statsGenerales 
        });
    } catch (error) {
        console.error('❌ Error en ruta principal:', error);
        res.status(500).send('Error: ' + error.message);
    }
});

// Equipos
app.get('/equipos', async (req, res) => {
    try {
        const equipos = await db.all(`
            SELECT e.*,
                COUNT(DISTINCT p.id) as partidos_jugados,
                SUM(CASE 
                    WHEN (p.equipo_local_id = e.id AND p.goles_local > p.goles_visitante) OR
                         (p.equipo_visitante_id = e.id AND p.goles_visitante > p.goles_local) THEN 1 
                    ELSE 0 
                END) as partidos_ganados,
                COALESCE(SUM(CASE WHEN p.equipo_local_id = e.id THEN p.goles_local ELSE p.goles_visitante END), 0) as goles_favor,
                COALESCE(SUM(CASE WHEN p.equipo_local_id = e.id THEN p.goles_visitante ELSE p.goles_local END), 0) as goles_contra
            FROM equipos e
            LEFT JOIN partidos p ON e.id = p.equipo_local_id OR e.id = p.equipo_visitante_id
            GROUP BY e.id
            ORDER BY e.nombre
        `) || [];
        
        res.render('equipos', { equipos: equipos });
    } catch (error) {
        console.error('❌ Error en equipos:', error);
        res.status(500).send('Error al cargar equipos: ' + error.message);
    }
});

// Jugadores
app.get('/jugadores', async (req, res) => {
    try {
        const jugadores = await db.all(`
            SELECT j.*, e.nombre as equipo_nombre, e.color as equipo_color,
                COUNT(DISTINCT ej.partido_id) as partidos_jugados,
                COALESCE(SUM(ej.goles), 0) as total_goles,
                COALESCE(SUM(ej.asistencias), 0) as total_asistencias,
                COALESCE(SUM(ej.amarillas), 0) as total_amarillas,
                COALESCE(SUM(ej.rojas), 0) as total_rojas
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_jugador ej ON j.id = ej.jugador_id
            GROUP BY j.id
            ORDER BY total_goles DESC
        `) || [];
        
        const equipos = await db.all('SELECT * FROM equipos ORDER BY nombre') || [];
        
        res.render('jugadores', { jugadores: jugadores, equipos: equipos });
    } catch (error) {
        console.error('❌ Error en jugadores:', error);
        res.status(500).send('Error al cargar jugadores: ' + error.message);
    }
});

// Partidos
app.get('/partidos', async (req, res) => {
    try {
        const partidos = await db.all(`
            SELECT p.*, 
                el.nombre as local_nombre, el.color as local_color,
                ev.nombre as visitante_nombre, ev.color as visitante_color
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            ORDER BY p.fecha DESC
        `) || [];
        
        const equipos = await db.all('SELECT * FROM equipos ORDER BY nombre') || [];
        
        res.render('partidos', { partidos: partidos, equipos: equipos });
    } catch (error) {
        console.error('❌ Error en partidos:', error);
        res.status(500).send('Error al cargar partidos: ' + error.message);
    }
});

// Estadísticas
app.get('/estadisticas', async (req, res) => {
    try {
        console.log('➡️ Cargando estadísticas');
        
        const tablaPosiciones = await db.all(`
            SELECT 
                e.id,
                e.nombre,
                e.color,
                COUNT(DISTINCT p.id) as pj,
                SUM(CASE 
                    WHEN (p.equipo_local_id = e.id AND p.goles_local > p.goles_visitante) OR
                         (p.equipo_visitante_id = e.id AND p.goles_visitante > p.goles_local) THEN 1 
                    ELSE 0 
                END) as pg,
                SUM(CASE 
                    WHEN (p.equipo_local_id = e.id AND p.goles_local = p.goles_visitante) OR
                         (p.equipo_visitante_id = e.id AND p.goles_visitante = p.goles_local) THEN 1 
                    ELSE 0 
                END) as pe,
                SUM(CASE 
                    WHEN (p.equipo_local_id = e.id AND p.goles_local < p.goles_visitante) OR
                         (p.equipo_visitante_id = e.id AND p.goles_visitante < p.goles_local) THEN 1 
                    ELSE 0 
                END) as pp,
                SUM(CASE 
                    WHEN p.equipo_local_id = e.id THEN p.goles_local 
                    ELSE p.goles_visitante 
                END) as gf,
                SUM(CASE 
                    WHEN p.equipo_local_id = e.id THEN p.goles_visitante 
                    ELSE p.goles_local 
                END) as gc,
                SUM(CASE 
                    WHEN p.equipo_local_id = e.id THEN p.goles_local - p.goles_visitante
                    ELSE p.goles_visitante - p.goles_local
                END) as dif,
                (SUM(CASE 
                    WHEN (p.equipo_local_id = e.id AND p.goles_local > p.goles_visitante) OR
                         (p.equipo_visitante_id = e.id AND p.goles_visitante > p.goles_local) THEN 3
                    WHEN p.goles_local = p.goles_visitante THEN 1
                    ELSE 0
                END)) as puntos
            FROM equipos e
            LEFT JOIN partidos p ON e.id = p.equipo_local_id OR e.id = p.equipo_visitante_id
            GROUP BY e.id
            ORDER BY puntos DESC, dif DESC, gf DESC
        `) || [];
        
        const goleadores = await db.all(`
            SELECT 
                j.id,
                j.nombre,
                e.nombre as equipo_nombre,
                e.color as equipo_color,
                COALESCE(SUM(ej.goles), 0) as goles,
                COUNT(DISTINCT ej.partido_id) as partidos
            FROM jugadores j
            JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_jugador ej ON j.id = ej.jugador_id
            GROUP BY j.id
            HAVING goles > 0
            ORDER BY goles DESC
            LIMIT 10
        `) || [];
        
        const asistentes = await db.all(`
            SELECT 
                j.id,
                j.nombre,
                e.nombre as equipo_nombre,
                e.color as equipo_color,
                COALESCE(SUM(ej.asistencias), 0) as asistencias
            FROM jugadores j
            JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_jugador ej ON j.id = ej.jugador_id
            GROUP BY j.id
            HAVING asistencias > 0
            ORDER BY asistencias DESC
            LIMIT 10
        `) || [];
        
        res.render('estadisticas', { 
            tablaPosiciones: tablaPosiciones, 
            goleadores: goleadores, 
            asistentes: asistentes 
        });
    } catch (error) {
        console.error('❌ Error en estadísticas:', error);
        res.status(500).send('Error al cargar estadísticas: ' + error.message);
    }
});

// ============================================
// API EQUIPOS
// ============================================

app.post('/api/equipos', async (req, res) => {
    try {
        const { nombre, color, estadio } = req.body;
        if (!nombre) {
            return res.status(400).json({ success: false, message: 'El nombre es requerido' });
        }
        await db.run(
            'INSERT INTO equipos (nombre, color, estadio) VALUES (?, ?, ?)',
            [nombre, color || '#10b981', estadio || '']
        );
        res.json({ success: true, message: 'Equipo agregado correctamente' });
    } catch (error) {
        console.error('❌ Error al agregar equipo:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/equipos/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM equipos WHERE id = ?', req.params.id);
        res.json({ success: true, message: 'Equipo eliminado correctamente' });
    } catch (error) {
        console.error('❌ Error al eliminar equipo:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// API JUGADORES
// ============================================

app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;
        if (!nombre || !equipo_id) {
            return res.status(400).json({ success: false, message: 'Nombre y equipo son requeridos' });
        }
        await db.run(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES (?, ?, ?, ?)',
            [nombre, equipo_id, posicion || '', numero || 0]
        );
        res.json({ success: true, message: 'Jugador agregado correctamente' });
    } catch (error) {
        console.error('❌ Error al agregar jugador:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, equipo_id, posicion, numero } = req.body;
        
        await db.run(
            'UPDATE jugadores SET nombre = ?, equipo_id = ?, posicion = ?, numero = ? WHERE id = ?',
            [nombre, equipo_id, posicion, numero, id]
        );
        
        res.json({ success: true, message: 'Jugador actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar jugador:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/jugadores/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM jugadores WHERE id = ?', req.params.id);
        res.json({ success: true, message: 'Jugador eliminado correctamente' });
    } catch (error) {
        console.error('❌ Error al eliminar jugador:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/jugadores/:id', async (req, res) => {
    try {
        const jugador = await db.get(`
            SELECT j.*, e.nombre as equipo_nombre 
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE j.id = ?
        `, req.params.id);
        
        res.json(jugador);
    } catch (error) {
        console.error('Error al obtener jugador:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// API PARTIDOS
// ============================================

app.post('/api/partidos', async (req, res) => {
    try {
        const { equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, fecha, jornada } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id) {
            return res.status(400).json({ success: false, message: 'Los equipos son requeridos' });
        }

        const result = await db.run(
            'INSERT INTO partidos (equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, fecha, jornada) VALUES (?, ?, ?, ?, ?, ?)',
            [equipo_local_id, equipo_visitante_id, goles_local || 0, goles_visitante || 0, fecha || new Date().toISOString().split('T')[0], jornada || 1]
        );
        
        res.json({ success: true, message: 'Partido agregado correctamente', id: result.lastID });
    } catch (error) {
        console.error('❌ Error al agregar partido:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// API EVENTOS
// ============================================

app.post('/api/eventos', async (req, res) => {
    try {
        const { jugador_id, partido_id, tipo, minuto } = req.body;
        
        // Insertar evento
        const result = await db.run(
            'INSERT INTO eventos_partido (jugador_id, partido_id, tipo, minuto) VALUES (?, ?, ?, ?)',
            [jugador_id, partido_id, tipo, minuto || 0]
        );
        
        // Actualizar estadísticas del jugador
        await db.run(`
            INSERT INTO estadisticas_jugador (jugador_id, partido_id, goles, asistencias, amarillas, rojas)
            VALUES (?, ?, 
                CASE WHEN ? = 'gol' THEN 1 ELSE 0 END,
                CASE WHEN ? = 'asistencia' THEN 1 ELSE 0 END,
                CASE WHEN ? = 'amarilla' THEN 1 ELSE 0 END,
                CASE WHEN ? = 'roja' THEN 1 ELSE 0 END
            )
        `, [jugador_id, partido_id, tipo, tipo, tipo, tipo]);
        
        res.json({ success: true, message: 'Evento registrado correctamente' });
    } catch (error) {
        console.error('Error al registrar evento:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// API EXPORTAR/IMPORTAR
// ============================================

app.get('/api/exportar', async (req, res) => {
    try {
        const fs = require('fs');
        const dbPath = path.join(__dirname, 'database', 'futbol.db');
        const backupPath = path.join(__dirname, 'database', `backup_${Date.now()}.db`);
        
        fs.copyFileSync(dbPath, backupPath);
        
        res.download(backupPath, 'futbol_backup.db', (err) => {
            if (err) console.error('Error al descargar:', err);
            setTimeout(() => {
                try {
                    if (fs.existsSync(backupPath)) {
                        fs.unlinkSync(backupPath);
                    }
                } catch (e) {
                    console.error('Error al eliminar backup:', e);
                }
            }, 5000);
        });
    } catch (error) {
        console.error('❌ Error al exportar:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/importar', upload.single('database'), async (req, res) => {
    try {
        const fs = require('fs');
        const { file } = req;
        
        if (!file) {
            return res.status(400).json({ success: false, message: 'No se seleccionó ningún archivo' });
        }

        // Respaldar base de datos actual
        const dbPath = path.join(__dirname, 'database', 'futbol.db');
        const backupPath = path.join(__dirname, 'database', `backup_auto_${Date.now()}.db`);
        
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, backupPath);
        }

        // Cerrar conexión actual a la base de datos
        if (db) {
            await db.close();
        }

        // Copiar el archivo subido
        fs.copyFileSync(file.path, dbPath);
        
        // Reabrir conexión
        db = await setupDatabase();
        
        // Limpiar archivo temporal
        fs.unlinkSync(file.path);
        
        res.json({ success: true, message: 'Base de datos importada correctamente' });
    } catch (error) {
        console.error('Error al importar:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Abre tu navegador y ve a http://localhost:${PORT}`);
    console.log(`📁 Vistas cargadas desde: ${path.join(__dirname, 'views')}`);
});