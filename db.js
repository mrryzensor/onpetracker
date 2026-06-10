const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'onpe_data.db');

// Asegurar que el directorio contenedor exista
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos sqlite:', err);
  } else {
    console.log(`Conectado a la base de datos SQLite en: ${dbPath}`);
  }
});

// Inicializar base de datos
function initDatabase() {
  return new Promise((resolve, reject) => {
    const query = `
      CREATE TABLE IF NOT EXISTS onpe_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        onpe_timestamp TEXT,
        actas_contabilizadas INTEGER,
        actas_contabilizadas_pct REAL,
        actas_procesadas INTEGER,
        actas_procesadas_pct REAL,
        candidato1_nombre TEXT,
        candidato1_votos INTEGER,
        candidato1_pct REAL,
        candidato2_nombre TEXT,
        candidato2_votos INTEGER,
        candidato2_pct REAL,
        votos_nulos INTEGER,
        votos_nulos_pct REAL,
        votos_blancos INTEGER,
        votos_blancos_pct REAL
      )
    `;
    db.run(query, (err) => {
      if (err) {
        console.error('Error al crear la tabla:', err);
        reject(err);
      } else {
        // Ejecutar alter table seguro por si la base de datos ya existía sin la columna
        db.run("ALTER TABLE onpe_history ADD COLUMN onpe_timestamp TEXT", (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.warn('Alerta al alterar tabla para agregar onpe_timestamp:', alterErr.message);
          }
          console.log('Tabla onpe_history inicializada con columna onpe_timestamp.');
          resolve();
        });
      }
    });
  });
}

// Obtener el último registro insertado
function getLatestRecord() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM onpe_history ORDER BY id DESC LIMIT 1', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Insertar un nuevo registro de la ONPE
function insertRecord(data) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO onpe_history (
        timestamp,
        onpe_timestamp,
        actas_contabilizadas, actas_contabilizadas_pct,
        actas_procesadas, actas_procesadas_pct,
        candidato1_nombre, candidato1_votos, candidato1_pct,
        candidato2_nombre, candidato2_votos, candidato2_pct,
        votos_nulos, votos_nulos_pct,
        votos_blancos, votos_blancos_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
      data.timestamp || new Date().toISOString(),
      data.timestamp_onpe,
      data.actas_contabilizadas,
      data.actas_contabilizadas_pct,
      data.actas_procesadas,
      data.actas_procesadas_pct,
      data.candidato1_nombre,
      data.candidato1_votos,
      data.candidato1_pct,
      data.candidato2_nombre,
      data.candidato2_votos,
      data.candidato2_pct,
      data.votos_nulos,
      data.votos_nulos_pct,
      data.votos_blancos,
      data.votos_blancos_pct
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

// Obtener todo el historial
function getHistory() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM onpe_history ORDER BY timestamp ASC', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  initDatabase,
  getLatestRecord,
  insertRecord,
  getHistory
};
