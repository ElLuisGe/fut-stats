const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

// Asegurar que la carpeta database existe
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

async function setupDatabase() {
    try {
        const db = await open({
            filename: path.join(dbDir, 'futbol.db'),
            driver: sqlite3.Database
        });

        console.log('Conectado a la base de datos SQLite');

        // Crear tablas
        await db.exec(`
            CREATE TABLE IF NOT EXISTS equipos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT UNIQUE NOT NULL,
                color TEXT DEFAULT '#10b981',
                estadio TEXT,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS jugadores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                equipo_id INTEGER,
                posicion TEXT,
                numero INTEGER,
                fecha_nacimiento DATE,
                FOREIGN KEY (equipo_id) REFERENCES equipos (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS partidos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipo_local_id INTEGER,
                equipo_visitante_id INTEGER,
                goles_local INTEGER DEFAULT 0,
                goles_visitante INTEGER DEFAULT 0,
                fecha DATE DEFAULT CURRENT_DATE,
                jornada INTEGER,
                observaciones TEXT,
                FOREIGN KEY (equipo_local_id) REFERENCES equipos (id),
                FOREIGN KEY (equipo_visitante_id) REFERENCES equipos (id)
            );

            CREATE TABLE IF NOT EXISTS eventos_partido (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partido_id INTEGER,
                jugador_id INTEGER,
                tipo TEXT CHECK(tipo IN ('gol', 'asistencia', 'amarilla', 'roja', 'cambio')),
                minuto INTEGER,
                observaciones TEXT,
                FOREIGN KEY (partido_id) REFERENCES partidos (id) ON DELETE CASCADE,
                FOREIGN KEY (jugador_id) REFERENCES jugadores (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS estadisticas_jugador (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jugador_id INTEGER,
                partido_id INTEGER,
                goles INTEGER DEFAULT 0,
                asistencias INTEGER DEFAULT 0,
                amarillas INTEGER DEFAULT 0,
                rojas INTEGER DEFAULT 0,
                minutos_jugados INTEGER DEFAULT 0,
                FOREIGN KEY (jugador_id) REFERENCES jugadores (id) ON DELETE CASCADE,
                FOREIGN KEY (partido_id) REFERENCES partidos (id) ON DELETE CASCADE
            );
        `);

        console.log('Tablas creadas/verificadas correctamente');
        
        // Insertar datos de ejemplo si la tabla está vacía
        const equiposCount = await db.get('SELECT COUNT(*) as count FROM equipos');
        if (equiposCount.count === 0) {
            await db.run(
                'INSERT INTO equipos (nombre, color, estadio) VALUES (?, ?, ?)',
                ['Real Madrid', '#ffffff', 'Santiago Bernabéu']
            );
            await db.run(
                'INSERT INTO equipos (nombre, color, estadio) VALUES (?, ?, ?)',
                ['Barcelona', '#a50044', 'Camp Nou']
            );
            console.log('Datos de ejemplo insertados');
        }

        return db;
    } catch (error) {
        console.error('Error al configurar la base de datos:', error);
        throw error;
    }
}

module.exports = setupDatabase;