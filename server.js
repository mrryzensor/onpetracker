const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const db = require('./db');
const { scrapeONPE } = require('./scraper');

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
  }
  
  return { saved: hasChanged, id };
}

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

// --- RUTA API ---

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

// Iniciar servidor
db.initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`Servidor ONPE Tracker ejecutándose en http://localhost:${PORT}`);
      console.log(`=======================================================`);
      
      // Realizar sincronización inicial al levantar el servidor
      performSync()
        .then(res => console.log('Sincronización inicial completada:', res))
        .catch(err => console.error('Error en sincronización inicial:', err));
    });
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
  });
