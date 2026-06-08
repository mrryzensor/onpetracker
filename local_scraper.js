require('dotenv').config();
const { scrapeONPE } = require('./scraper');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_TOKEN = process.env.API_TOKEN || 'onpe_secret_token_123';
const INTERVAL_MINUTES = parseInt(process.env.SCRAPE_INTERVAL_MINUTES, 10) || 5;

console.log('==================================================');
console.log('ONPE Tracker - Local Scraper Worker');
console.log(`Apuntando a Servidor: ${API_URL}`);
console.log(`Intervalo de verificación: cada ${INTERVAL_MINUTES} minutos`);
console.log('==================================================');

async function runWorker() {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando scraping local de ONPE...`);
  try {
    const scrapedData = await scrapeONPE();
    console.log('Datos extraídos de la ONPE con éxito:', {
      timestamp_onpe: scrapedData.timestamp_onpe,
      actas: `${scrapedData.actas_contabilizadas_pct}% (${scrapedData.actas_contabilizadas})`,
      c1_pct: `${scrapedData.candidato1_pct}%`,
      c2_pct: `${scrapedData.candidato2_pct}%`
    });

    console.log(`Enviando datos al servidor en la nube (${API_URL}/api/push)...`);
    const response = await fetch(`${API_URL}/api/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify(scrapedData)
    });

    console.log(`Respuesta del servidor: Código ${response.status}`);
    const result = await response.json();
    if (result.success) {
      if (result.saved) {
        console.log('==> ¡Sincronización Exitosa! Se detectaron cambios y se insertó un nuevo registro en la base de datos.');
      } else {
        console.log('==> Sincronización Exitosa. Los datos de la ONPE no presentan cambios.');
      }
    } else {
      console.error('==> Error retornado por el servidor:', result.error || result.reason);
    }
  } catch (err) {
    console.error('==> Error en el ciclo del scraper local:', err.message);
  }
  
  console.log(`Esperando ${INTERVAL_MINUTES} minutos para el siguiente ciclo...\n`);
}

// Ejecutar inmediatamente
runWorker();

// Programar ciclos continuos
setInterval(runWorker, INTERVAL_MINUTES * 60 * 1000);
