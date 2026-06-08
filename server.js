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
    
    // Buscar el último registro guardado
    const latestRecord = await db.getLatestRecord();
    
    let hasChanged = false;
    
    if (!latestRecord) {
      console.log('Base de datos vacía, insertando primer registro...');
      hasChanged = true;
    } else {
      // Verificar si los datos clave han cambiado (votos o actas contabilizadas)
      const diffCandidato1 = scrapedData.candidato1_votos !== latestRecord.candidato1_votos;
      const diffCandidato2 = scrapedData.candidato2_votos !== latestRecord.candidato2_votos;
      const diffActas = scrapedData.actas_contabilizadas !== latestRecord.actas_contabilizadas;
      
      if (diffCandidato1 || diffCandidato2 || diffActas) {
        console.log('¡Se detectaron cambios en los datos de la ONPE!');
        hasChanged = true;
      } else {
        console.log('Los datos de la ONPE no presentan cambios respecto al último registro local.');
      }
    }
    
    if (hasChanged) {
      const id = await db.insertRecord(scrapedData);
      console.log(`Nuevo registro guardado con ID: ${id}`);
    }
    
    lastSyncTime = new Date();
    lastSyncError = null;
    isSyncing = false;
    return { success: true, saved: hasChanged, data: scrapedData };
  } catch (error) {
    console.error('Error durante la sincronización:', error);
    lastSyncError = error.message;
    isSyncing = false;
    throw error;
  }
}

// Programar sincronización automática cada 5 minutos
// (* /5 * * * * en node-cron es '*/5 * * * *')
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

// 2. Forzar sincronización manual
app.post('/api/sync', async (req, res) => {
  try {
    const result = await performSync();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
      
      // Ejecutar una sincronización inicial al levantar el servidor
      performSync()
        .then(res => console.log('Sincronización inicial completada:', res))
        .catch(err => console.error('Error en sincronización inicial:', err));
    });
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
  });
