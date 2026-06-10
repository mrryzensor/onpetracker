require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const API_URL = process.env.API_URL || 'https://onpe.installwin.online';
const API_TOKEN = process.env.API_TOKEN || 'onpe_secret_token_123';
const dbPath = process.env.DB_PATH || path.join(__dirname, 'onpe_data.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos sqlite local:', err);
    process.exit(1);
  }
});

async function runSync() {
  console.log('=== Iniciando sincronización de datos locales al servidor remoto ===');
  console.log(`Base de datos local: ${dbPath}`);
  console.log(`Servidor remoto: ${API_URL}`);

  try {
    // 1. Obtener historial del servidor remoto
    console.log('Obteniendo historial del servidor remoto...');
    const remoteRes = await fetch(`${API_URL}/api/history`);
    if (!remoteRes.ok) {
      throw new Error(`Error al obtener historial remoto: Código ${remoteRes.status}`);
    }
    const remoteHistory = await remoteRes.json();
    console.log(`Servidor remoto tiene ${remoteHistory.length} registros.`);

    // Crear un Set con los onpe_timestamps remotos para búsqueda rápida
    const remoteTimestamps = new Set(remoteHistory.map(r => r.onpe_timestamp).filter(Boolean));

    // 2. Obtener todo el historial local
    console.log('Obteniendo historial local de SQLite...');
    const localRows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM onpe_history ORDER BY id ASC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log(`Base de datos local tiene ${localRows.length} registros.`);

    // 3. Filtrar registros que no están en el remoto
    const missingRows = localRows.filter(row => {
      return !remoteTimestamps.has(row.onpe_timestamp);
    });

    console.log(`Se encontraron ${missingRows.length} registros locales que faltan en el servidor remoto.`);

    if (missingRows.length === 0) {
      console.log('==> ¡Sincronización completa! Todos los registros locales ya están en el servidor remoto.');
      db.close();
      return;
    }

    // 4. Subir registros faltantes uno por uno
    for (let i = 0; i < missingRows.length; i++) {
      const row = missingRows[i];
      const dataToPush = {
        timestamp: row.timestamp,
        timestamp_onpe: row.onpe_timestamp || row.timestamp,
        actas_contabilizadas: row.actas_contabilizadas,
        actas_contabilizadas_pct: row.actas_contabilizadas_pct,
        actas_procesadas: row.actas_procesadas,
        actas_procesadas_pct: row.actas_procesadas_pct,
        candidato1_nombre: row.candidato1_nombre,
        candidato1_partido: row.candidato1_partido || 'FUERZA POPULAR',
        candidato1_votos: row.candidato1_votos,
        candidato1_pct: row.candidato1_pct,
        candidato2_nombre: row.candidato2_nombre,
        candidato2_partido: row.candidato2_partido || 'JUNTOS POR EL PERÚ',
        candidato2_votos: row.candidato2_votos,
        candidato2_pct: row.candidato2_pct,
        votos_nulos: row.votos_nulos || 0,
        votos_nulos_pct: row.votos_nulos_pct || 0,
        votos_blancos: row.votos_blancos || 0,
        votos_blancos_pct: row.votos_blancos_pct || 0
      };

      console.log(`[${i + 1}/${missingRows.length}] Subiendo registro local del ${row.timestamp} (${row.onpe_timestamp})...`);
      
      const pushRes = await fetch(`${API_URL}/api/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`
        },
        body: JSON.stringify(dataToPush)
      });

      if (!pushRes.ok) {
        const errText = await pushRes.text();
        console.error(`Error al subir registro: ${pushRes.status} - ${errText}`);
        // Detener la sincronización ante un error para no dañar el orden cronológico
        throw new Error('Sincronización abortada por error en el envío.');
      }

      const result = await pushRes.json();
      console.log(`   Resultado: ${JSON.stringify(result)}`);
    }

    console.log('==> ¡Sincronización finalizada con éxito!');
  } catch (error) {
    console.error('==> Error en el proceso de sincronización:', error.message);
  } finally {
    db.close();
  }
}

runSync();
