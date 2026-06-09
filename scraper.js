const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Función auxiliar para limpiar números como "8'768,586" o "86,706" a enteros
function parseCleanInt(str) {
  if (!str) return 0;
  // Elimina comillas simples, comas, espacios y texto de votos
  const clean = str.replace(/['\s,votos()]/g, '').trim();
  return parseInt(clean, 10) || 0;
}

// Función auxiliar para limpiar porcentajes como "93.467 %" o "50.036 %" a flotantes
function parseCleanFloat(str) {
  if (!str) return 0;
  const clean = str.replace(/[%'\s,]/g, '').trim();
  return parseFloat(clean) || 0;
}

async function scrapeONPE() {
  console.log('Iniciando Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Capturar logs y errores dentro de la página para depuración
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure() ? req.failure().errorText : ''));
    
    // User Agent realista
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Desactivar caché para evitar traer datos viejos
    await page.setCacheEnabled(false);
    await page.setExtraHTTPHeaders({
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache'
    });
    
    console.log('Cargando la página de la ONPE...');
    await page.goto('https://resultadosegundavuelta.onpe.gob.pe/main/resumen', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Esperar unos segundos para la inyección de Angular
    await new Promise(r => setTimeout(r, 4000));
    
    console.log('Extrayendo datos de la página...');
    
    const rawData = await page.evaluate(() => {
      // 1. Obtener texto de última actualización
      const updatedText = document.querySelector('.actualizado b')?.innerText || '';
      
      // 2. Obtener lista de actas
      const legendItems = Array.from(document.querySelectorAll('ul.leyenda li'));
      
      const contabilizadasLi = legendItems.find(el => el.innerText.includes('Contabilizadas'));
      const contabilizadasVal = contabilizadasLi?.querySelector('b')?.innerText || '';
      
      const paraJeeLi = legendItems.find(el => el.innerText.includes('Para envío al JEE'));
      const paraJeeVal = paraJeeLi?.querySelector('b')?.innerText || '';
      
      const pendientesLi = legendItems.find(el => el.innerText.includes('Pendientes'));
      const pendientesVal = pendientesLi?.querySelector('b')?.innerText || '';
      
      // Obtener el porcentaje de actas contabilizadas
      const pctContabilizadas = document.querySelector('.datos_resumen')?.innerText || '';
      
      // 3. Buscar porcentaje adicional
      const percentDivs = Array.from(document.querySelectorAll('.datos_resumen, .tarjeta-candidato__porcentaje'));
      const pctParaJee = percentDivs.find(el => el.innerText.includes('%') && el.parentElement?.innerText?.includes('Para envío'))?.innerText || '';
      const pctPendientes = percentDivs.find(el => el.innerText.includes('%') && el.parentElement?.innerText?.includes('Pendientes'))?.innerText || '';

      // 4. Buscar candidatos
      const candidateCards = Array.from(document.querySelectorAll('article.tarjeta-candidato'));
      const candidates = candidateCards.map(card => {
        const pct = card.querySelector('.tarjeta-candidato__porcentaje')?.innerText || '';
        const name = card.querySelector('.tarjeta-candidato__nombre')?.innerText || '';
        const party = card.querySelector('.tarjeta-candidato__organizacion')?.innerText || '';
        // Las tarjetas pueden tener la clase d-none-desktop o d-none-movil para el voto, capturamos el primero visible o simplemente el texto general de votos
        const votesEl = card.querySelectorAll('.tarjeta-candidato__votos');
        let votesText = '';
        for (const el of votesEl) {
          if (el.innerText && el.innerText.includes('votos')) {
            votesText = el.innerText;
            break;
          }
        }
        return { pct, name, party, votes: votesText };
      });

      // 5. Total de actas en el texto
      let totalActasText = '';
      const totalActasSearch = Array.from(document.querySelectorAll('*'))
        .find(el => el.innerText && el.innerText.includes('Total de actas:') && el.children.length === 0);
      if (totalActasSearch) {
        totalActasText = totalActasSearch.parentElement?.innerText || '';
      }

      return {
        updatedText,
        contabilizadasVal,
        paraJeeVal,
        pendientesVal,
        pctContabilizadas,
        pctParaJee,
        pctPendientes,
        candidates,
        totalActasText,
        bodyText: document.body.innerText
      };
    });

    console.log('Datos en bruto obtenidos.');
    console.log('--- DEBUG SCRAPER ---');
    console.log('Page Title:', await page.title());
    const bodySnippet = rawData.bodyText ? rawData.bodyText.substring(0, 1000) : 'EMPTY BODY';
    console.log('Body Text Snippet:', bodySnippet);
    console.log('Candidates count extracted:', rawData.candidates ? rawData.candidates.length : 0);
    console.log('---------------------');
    
    // Formatear los datos extraídos
    const parsedData = {
      timestamp_onpe: rawData.updatedText.replace(/ACTUALIZADO AL\s+/i, '').trim(),
      actas_contabilizadas: parseCleanInt(rawData.contabilizadasVal),
      actas_contabilizadas_pct: parseCleanFloat(rawData.pctContabilizadas),
      actas_procesadas: parseCleanInt(rawData.contabilizadasVal) + parseCleanInt(rawData.paraJeeVal), // Procesadas = Contabilizadas + JEE
      actas_procesadas_pct: 0, // Lo calcularemos dinámicamente
      candidato1_nombre: '',
      candidato1_partido: '',
      candidato1_votos: 0,
      candidato1_pct: 0,
      candidato2_nombre: '',
      candidato2_partido: '',
      candidato2_votos: 0,
      candidato2_pct: 0,
      votos_nulos: 0, // No disponibles en el resumen principal
      votos_nulos_pct: 0,
      votos_blancos: 0,
      votos_blancos_pct: 0
    };

    // Procesar los candidatos extraídos y asignarlos de forma consistente
    // Candidato 1 = Keiko Fujimori (Fuerza Popular)
    // Candidato 2 = Roberto Sanchez (Juntos por el Perú)
    if (rawData.candidates && rawData.candidates.length >= 2) {
      const cA = rawData.candidates[0];
      const cB = rawData.candidates[1];
      
      const isAKeiko = cA.name.toUpperCase().includes('FUJIMORI') || cA.party.toUpperCase().includes('FUERZA');
      
      const keiko = isAKeiko ? cA : cB;
      const roberto = isAKeiko ? cB : cA;

      parsedData.candidato1_nombre = keiko.name.trim();
      parsedData.candidato1_partido = keiko.party.trim();
      parsedData.candidato1_votos = parseCleanInt(keiko.votes);
      parsedData.candidato1_pct = parseCleanFloat(keiko.pct);

      parsedData.candidato2_nombre = roberto.name.trim();
      parsedData.candidato2_partido = roberto.party.trim();
      parsedData.candidato2_votos = parseCleanInt(roberto.votes);
      parsedData.candidato2_pct = parseCleanFloat(roberto.pct);
    } else {
      // Fallback por si acaso la estructura fallara, intentamos buscar con expresiones regulares en todo el texto del body
      console.warn('Estructura de tarjetas de candidatos no detectada, aplicando regex fallback...');
      const body = rawData.bodyText;
      
      // Buscar porcentajes y votos de Keiko y Roberto en el texto
      const keikoMatch = body.match(/([\d.]+)\s*%\s*KEIKO SOFIA FUJIMORI[\s\S]*?([\d',]+)\s*votos/i);
      if (keikoMatch) {
        parsedData.candidato1_nombre = 'KEIKO SOFIA FUJIMORI HIGUCHI';
        parsedData.candidato1_partido = 'FUERZA POPULAR';
        parsedData.candidato1_pct = parseCleanFloat(keikoMatch[1]);
        parsedData.candidato1_votos = parseCleanInt(keikoMatch[2]);
      }
      
      const robertoMatch = body.match(/([\d.]+)\s*%\s*ROBERTO HELBERT SANCHEZ[\s\S]*?([\d',]+)\s*votos/i);
      if (robertoMatch) {
        parsedData.candidato2_nombre = 'ROBERTO HELBERT SANCHEZ PALOMINO';
        parsedData.candidato2_partido = 'JUNTOS POR EL PERÚ';
        parsedData.candidato2_pct = parseCleanFloat(robertoMatch[1]);
        parsedData.candidato2_votos = parseCleanInt(robertoMatch[2]);
      }
    }

    // Si no pudimos parsear actas contabilizadas con el selector anterior, intentamos con regex
    if (parsedData.actas_contabilizadas === 0) {
      const actasMatch = rawData.bodyText.match(/Contabilizadas\s*\(?([\d,']+)\)?/i);
      if (actasMatch) {
        parsedData.actas_contabilizadas = parseCleanInt(actasMatch[1]);
      }
      const actasPctMatch = rawData.bodyText.match(/Actas contabilizadas\s*([\d.]+)%/i);
      if (actasPctMatch) {
        parsedData.actas_contabilizadas_pct = parseCleanFloat(actasPctMatch[1]);
      }
    }

    // Calcular actas procesadas en porcentaje
    const totalActasMatch = rawData.bodyText.match(/Total de actas:\s*([\d,']+)/i);
    if (totalActasMatch) {
      const total = parseCleanInt(totalActasMatch[1]);
      if (total > 0) {
        parsedData.actas_procesadas_pct = parseCleanFloat(((parsedData.actas_procesadas / total) * 100).toFixed(3));
      }
    } else {
      // Fallback
      parsedData.actas_procesadas_pct = parsedData.actas_contabilizadas_pct;
    }

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
