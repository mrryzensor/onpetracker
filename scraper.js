const puppeteer = require('puppeteer');

async function scrapeONPE() {
  console.log('Iniciando Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    
    // Configurar un User-Agent realista
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 1. Obtener datos de la API de Totales
    console.log('Cargando API de Totales de la ONPE...');
    await page.goto('https://resultadosegundavuelta.onpe.gob.pe/presentacion-backend/resumen-general/totales?idEleccion=10&tipoFiltro=eleccion', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });
    
    const totalesText = await page.evaluate(() => document.body.innerText);
    let totalesJson;
    try {
      totalesJson = JSON.parse(totalesText);
    } catch (e) {
      console.error('Error al parsear JSON de Totales. Respuesta cruda:', totalesText.substring(0, 1000));
      throw new Error('No se pudo parsear el JSON de la API de Totales.');
    }
    
    // 2. Obtener datos de la API de Participantes (candidatos)
    console.log('Cargando API de Participantes de la ONPE...');
    await page.goto('https://resultadosegundavuelta.onpe.gob.pe/presentacion-backend/resumen-general/participantes?idEleccion=10&tipoFiltro=eleccion', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });
    
    const participantesText = await page.evaluate(() => document.body.innerText);
    let participantesJson;
    try {
      participantesJson = JSON.parse(participantesText);
    } catch (e) {
      console.error('Error al parsear JSON de Participantes. Respuesta cruda:', participantesText.substring(0, 1000));
      throw new Error('No se pudo parsear el JSON de la API de Participantes.');
    }
    
    if (!totalesJson.success || !participantesJson.success) {
      throw new Error('La API oficial de la ONPE retornó success: false');
    }
    
    const totales = totalesJson.data;
    const participantes = participantesJson.data;
    
    // Formatear fechaActualizacion (milisegundos) a string legible para conservar la consistencia de "fecha ONPE"
    const date = new Date(totales.fechaActualizacion);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12;
    hours = hours ? hours : 12; // Formato 12 horas
    const formattedHours = String(hours).padStart(2, '0');
    const timestamp_onpe = `${day}/${month}/${year} ${formattedHours}:${minutes}:${seconds} ${ampm}`;
    
    // Identificar candidatos basándonos en Fuerza Popular (código 8 o Keiko) y Juntos por el Perú (código 10 o Roberto)
    const cand1 = participantes.find(p => p.codigoAgrupacionPolitica === 8) || participantes[1];
    const cand2 = participantes.find(p => p.codigoAgrupacionPolitica === 10) || participantes[0];
    
    // Calcular votos nulos (Emitidos - Validos)
    const nulos = totales.totalVotosEmitidos - totales.totalVotosValidos;
    const nulosPct = totales.totalVotosEmitidos > 0 ? parseFloat(((nulos / totales.totalVotosEmitidos) * 100).toFixed(3)) : 0;
    
    const parsedData = {
      timestamp_onpe: timestamp_onpe,
      actas_contabilizadas: totales.contabilizadas,
      actas_contabilizadas_pct: totales.actasContabilizadas,
      actas_procesadas: totales.contabilizadas + totales.enviadasJee,
      actas_procesadas_pct: totales.totalActas > 0 ? parseFloat((((totales.contabilizadas + totales.enviadasJee) / totales.totalActas) * 100).toFixed(3)) : 0,
      candidato1_nombre: cand1.nombreCandidato || 'KEIKO SOFIA FUJIMORI HIGUCHI',
      candidato1_partido: cand1.nombreAgrupacionPolitica || 'FUERZA POPULAR',
      candidato1_votos: cand1.totalVotosValidos,
      candidato1_pct: cand1.porcentajeVotosValidos,
      candidato2_nombre: cand2.nombreCandidato || 'ROBERTO HELBERT SANCHEZ PALOMINO',
      candidato2_partido: cand2.nombreAgrupacionPolitica || 'JUNTOS POR EL PERÚ',
      candidato2_votos: cand2.totalVotosValidos,
      candidato2_pct: cand2.porcentajeVotosValidos,
      votos_nulos: nulos,
      votos_nulos_pct: nulosPct,
      votos_blancos: 0, // No segregados en los totales generales de resumen-general
      votos_blancos_pct: 0
    };
    
    console.log('Datos de ONPE obtenidos y procesados con éxito.');
    return parsedData;
  } catch (error) {
    console.error('Error en el scraping:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = {
  scrapeONPE
};
