require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const db = require('./db');
const { scrapeONPE, parseRawText } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Estado de sincronización para evitar ejecuciones concurrentes
let isSyncing = false;
let lastSyncTime = null;
let lastSyncError = null;

// Función para realizar la sincronización e insertar en BD si hay cambios
async function performSync() {
  if (isSyncing) {
    console.log('Sincronización ya está en curso, saltando...');
    return { success: false, reason: 'Sync already in progress' };
  }
  
  isSyncing = true;
  console.log('Iniciando sincronización programada/manual...');
  
  try {
    const scrapedData = await scrapeONPE();
    const result = await processAndSaveData(scrapedData);
    
    lastSyncTime = new Date();
    lastSyncError = null;
    isSyncing = false;
    return { success: true, saved: result.saved, data: scrapedData };
  } catch (error) {
    console.error('Error durante la sincronización:', error);
    lastSyncError = error.message;
    isSyncing = false;
    throw error;
  }
}

// Procesa y guarda los datos de la ONPE si hay cambios
async function processAndSaveData(scrapedData) {
  // Buscar el último registro guardado
  const latestRecord = await db.getLatestRecord();
  
  // Fusionar si es una actualización parcial
  if (latestRecord) {
    if (scrapedData.type === 'totales') {
      scrapedData.candidato1_nombre = latestRecord.candidato1_nombre;
      scrapedData.candidato1_partido = latestRecord.candidato1_partido;
      scrapedData.candidato1_votos = latestRecord.candidato1_votos;
      scrapedData.candidato1_pct = latestRecord.candidato1_pct;
      scrapedData.candidato2_nombre = latestRecord.candidato2_nombre;
      scrapedData.candidato2_partido = latestRecord.candidato2_partido;
      scrapedData.candidato2_votos = latestRecord.candidato2_votos;
      scrapedData.candidato2_pct = latestRecord.candidato2_pct;
    } else if (scrapedData.type === 'participantes') {
      scrapedData.timestamp_onpe = latestRecord.onpe_timestamp;
      scrapedData.actas_contabilizadas = latestRecord.actas_contabilizadas;
      scrapedData.actas_contabilizadas_pct = latestRecord.actas_contabilizadas_pct;
      scrapedData.actas_procesadas = latestRecord.actas_procesadas;
      scrapedData.actas_procesadas_pct = latestRecord.actas_procesadas_pct;
    }
  } else {
    // Si la DB está vacía, no permitir parciales
    if (scrapedData.type === 'totales' || scrapedData.type === 'participantes') {
      throw new Error('La base de datos está vacía. Debes ingresar un reporte de texto completo la primera vez para registrar ambos candidatos.');
    }
  }

  let hasChanged = false;
  
  if (!latestRecord) {
    console.log('Base de datos vacía, insertando primer registro...');
    hasChanged = true;
  } else {
    // Verificar si los datos clave o el timestamp oficial de la ONPE han cambiado
    const diffCandidato1 = scrapedData.candidato1_votos !== latestRecord.candidato1_votos;
    const diffCandidato2 = scrapedData.candidato2_votos !== latestRecord.candidato2_votos;
    const diffActas = scrapedData.actas_contabilizadas !== latestRecord.actas_contabilizadas;
    const diffTimestamp = scrapedData.timestamp_onpe !== latestRecord.onpe_timestamp;
    
    if (diffCandidato1 || diffCandidato2 || diffActas || diffTimestamp) {
      console.log('¡Se detectaron cambios o un nuevo reporte oficial de la ONPE!');
      hasChanged = true;
    } else {
      console.log('Los datos de la ONPE no presentan cambios respecto al último registro local.');
    }
  }
  
  let id = null;
  if (hasChanged) {
    id = await db.insertRecord(scrapedData);
    console.log(`Nuevo registro guardado con ID: ${id}`);

    // Auto-push to remote server if we are running locally and have a remote URL configured
    const remoteUrl = process.env.API_URL || 'https://onpe.installwin.online';
    const remoteToken = process.env.API_TOKEN || 'onpe_secret_token_123';
    
    // Check if remoteUrl is configured, is not pointing to the local instance itself, and this is a local runner
    if (remoteUrl && !remoteUrl.includes('localhost') && !remoteUrl.includes('127.0.0.1') && process.env.DISABLE_LOCAL_SCRAPER !== 'true') {
      console.log(`[Auto-Push] Enviando nuevo registro al servidor remoto (${remoteUrl})...`);
      
      const dataToPush = {
        timestamp: scrapedData.timestamp || new Date().toISOString(),
        timestamp_onpe: scrapedData.timestamp_onpe,
        actas_contabilizadas: scrapedData.actas_contabilizadas,
        actas_contabilizadas_pct: scrapedData.actas_contabilizadas_pct,
        actas_procesadas: scrapedData.actas_procesadas,
        actas_procesadas_pct: scrapedData.actas_procesadas_pct,
        candidato1_nombre: scrapedData.candidato1_nombre,
        candidato1_partido: scrapedData.candidato1_partido || 'FUERZA POPULAR',
        candidato1_votos: scrapedData.candidato1_votos,
        candidato1_pct: scrapedData.candidato1_pct,
        candidato2_nombre: scrapedData.candidato2_nombre,
        candidato2_partido: scrapedData.candidato2_partido || 'JUNTOS POR EL PERÚ',
        candidato2_votos: scrapedData.candidato2_votos,
        candidato2_pct: scrapedData.candidato2_pct,
        votos_nulos: scrapedData.votos_nulos || 0,
        votos_nulos_pct: scrapedData.votos_nulos_pct || 0,
        votos_blancos: scrapedData.votos_blancos || 0,
        votos_blancos_pct: scrapedData.votos_blancos_pct || 0
      };

      fetch(`${remoteUrl}/api/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${remoteToken}`
        },
        body: JSON.stringify(dataToPush)
      })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          console.log('[Auto-Push] Registro sincronizado en la nube exitosamente.');
        } else {
          console.error('[Auto-Push] Error al sincronizar en la nube:', result.error || result.reason);
        }
      })
      .catch(err => {
        console.error('[Auto-Push] Error de red al sincronizar en la nube:', err.message);
      });
    }
  }
  
  return { saved: hasChanged, id };
}

const DISABLE_LOCAL_SCRAPER = process.env.DISABLE_LOCAL_SCRAPER === 'true';

if (!DISABLE_LOCAL_SCRAPER) {
  // Programar sincronización automática cada 5 minutos
  // (Habilitado por defecto para funcionamiento local)
  console.log('Ejecutando cron local de verificación automática (cada 5 minutos)...');
  cron.schedule('*/5 * * * *', async () => {
    console.log('Cron triggered: Ejecutando verificación periódica...');
    try {
      await performSync();
    } catch (err) {
      console.error('Error en cron sync:', err);
    }
  });
} else {
  console.log('Scraper local de Puppeteer desactivado en el servidor para optimizar recursos y evitar bloqueos en la nube.');
}

// --- RUTA API ---

// Endpoint para procesar y guardar texto plano copiado de la ONPE
app.post('/api/parse-text', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: 'No se recibió ningún texto.' });
  }
  
  try {
    const parsedData = parseRawText(text);
    const result = await processAndSaveData(parsedData);
    lastSyncTime = new Date();
    lastSyncError = null;
    res.json({ success: true, saved: result.saved, id: result.id, data: parsedData });
  } catch (err) {
    console.error('Error al parsear texto manual:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 1. Obtener estado de sincronización
app.get('/api/sync-status', (req, res) => {
  res.json({
    isSyncing,
    lastSyncTime,
    lastSyncError
  });
});

// 2. Forzar sincronización manual (Sincroniza directamente usando el scraper en local)
app.post('/api/sync', async (req, res) => {
  if (DISABLE_LOCAL_SCRAPER) {
    return res.status(400).json({ 
      success: false, 
      error: 'El scraping desde el servidor está desactivado para evitar inestabilidad en la nube. Por favor usa el Marcador ONPE para sincronizar desde tu conexión local.' 
    });
  }
  try {
    const result = await performSync();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint seguro para empujar (push) datos desde el scraper local del usuario
app.post('/api/push', async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.API_TOKEN || 'onpe_secret_token_123';
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization header is missing or invalid' });
  }
  
  const token = authHeader.split(' ')[1];
  if (token !== expectedToken) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid token' });
  }
  
  const scrapedData = req.body;
  if (!scrapedData || !scrapedData.timestamp_onpe) {
    return res.status(400).json({ success: false, error: 'Invalid data format' });
  }
  
  try {
    const result = await processAndSaveData(scrapedData);
    lastSyncTime = new Date();
    lastSyncError = null;
    res.json({ success: true, saved: result.saved, id: result.id });
  } catch (err) {
    console.error('Error al procesar datos empujados:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Obtener el último registro
app.get('/api/latest', async (req, res) => {
  try {
    const record = await db.getLatestRecord();
    if (!record) {
      return res.status(404).json({ message: 'No hay datos guardados aún. Ejecuta una sincronización.' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Obtener todo el historial
app.get('/api/history', async (req, res) => {
  try {
    const history = await db.getHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Función para sincronizar de inicio todo el historial local que falte en la nube
async function syncLocalHistoryToRemote() {
  const remoteUrl = process.env.API_URL || 'https://onpe.installwin.online';
  const remoteToken = process.env.API_TOKEN || 'onpe_secret_token_123';
  
  if (DISABLE_LOCAL_SCRAPER) {
    console.log('[Startup-Sync] Scraper local desactivado. Saltando sincronización de historial a la nube.');
    return;
  }
  
  if (!remoteUrl || remoteUrl.includes('localhost') || remoteUrl.includes('127.0.0.1')) {
    console.log('[Startup-Sync] URL remota no configurada o apunta a localhost. Saltando sincronización.');
    return;
  }
  
  console.log(`[Startup-Sync] Iniciando sincronización de historial local hacia: ${remoteUrl}`);
  try {
    // 1. Obtener historial remoto
    const remoteRes = await fetch(`${remoteUrl}/api/history`);
    if (!remoteRes.ok) {
      console.error(`[Startup-Sync] Error al obtener historial remoto: Código ${remoteRes.status}`);
      return;
    }
    const remoteHistory = await remoteRes.json();
    const remoteTimestamps = new Set(remoteHistory.map(r => r.onpe_timestamp).filter(Boolean));
    console.log(`[Startup-Sync] Servidor remoto tiene ${remoteHistory.length} registros.`);
    
    // 2. Obtener historial local
    const localRows = await db.getHistory();
    console.log(`[Startup-Sync] Base de datos local tiene ${localRows.length} registros.`);
    
    // 3. Filtrar registros que faltan en el remoto
    const missingRows = localRows.filter(row => !remoteTimestamps.has(row.onpe_timestamp));
    console.log(`[Startup-Sync] Se encontraron ${missingRows.length} registros locales que faltan en la nube.`);
    
    if (missingRows.length === 0) {
      console.log('[Startup-Sync] ¡Sincronización completa! Todos los registros ya están en la nube.');
      return;
    }
    
    // 4. Subir registros uno por uno
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
      
      console.log(`[Startup-Sync] [${i + 1}/${missingRows.length}] Subiendo registro local del ${row.timestamp}...`);
      const pushRes = await fetch(`${remoteUrl}/api/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${remoteToken}`
        },
        body: JSON.stringify(dataToPush)
      });
      
      if (!pushRes.ok) {
        const errText = await pushRes.text();
        console.error(`[Startup-Sync] Error al subir registro: ${pushRes.status} - ${errText}`);
        throw new Error('Sincronización abortada por error en el envío.');
      }
    }
    console.log('[Startup-Sync] Sincronización de inicio completada con éxito.');
  } catch (error) {
    console.error('[Startup-Sync] Error en el proceso de sincronización inicial:', error.message);
  }
}

// Iniciar servidor
db.initDatabase()
  .then(() => {
    app.listen(PORT, async () => {
      console.log(`=======================================================`);
      console.log(`Servidor ONPE Tracker ejecutándose en http://localhost:${PORT}`);
      console.log(`=======================================================`);
      
      // Realizar sincronización de historial local al servidor remoto en inicio
      if (!DISABLE_LOCAL_SCRAPER) {
        await syncLocalHistoryToRemote();
        
        // Realizar sincronización inicial del scraper al levantar el servidor
        performSync()
          .then(res => console.log('Sincronización inicial del scraper completada:', res))
          .catch(err => console.error('Error en sincronización inicial del scraper:', err));
      }
    });
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
  });
