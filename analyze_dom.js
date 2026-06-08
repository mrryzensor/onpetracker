const fs = require('fs');
const puppeteer = require('puppeteer');

async function analyze() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Cargar el archivo local onpe_dom.html
  const htmlContent = fs.readFileSync('onpe_dom.html', 'utf8');
  await page.setContent(htmlContent);
  
  // Buscar candidatos, porcentajes y votos
  const data = await page.evaluate(() => {
    // Buscar actas
    // Busquemos textos que contengan '%'
    const elements = Array.from(document.querySelectorAll('*'));
    
    // Buscar actas contabilizadas y procesadas
    let actasContabilizadas = '';
    let actasProcesadas = '';
    
    // Vamos a buscar elementos específicos
    // Por ejemplo, los nombres de los candidatos
    const candidates = [];
    const imgs = document.querySelectorAll('img');
    
    // Busquemos las tarjetas de candidatos. En el HTML de ONPE, suelen estar en divs con cierta estructura.
    // Busquemos elementos con texto "votos"
    const votoElements = elements.filter(el => el.innerText && el.innerText.includes('votos') && el.children.length === 0);
    const votesDetails = votoElements.map(el => {
      return {
        text: el.innerText,
        parentText: el.parentElement ? el.parentElement.innerText.substring(0, 100) : ''
      };
    });
    
    // Busquemos las actas
    const actasText = elements.filter(el => el.innerText && el.innerText.includes('Actas') && el.children.length === 0).map(el => el.innerText);

    return {
      votesDetails,
      actasText,
      allText: document.body.innerText.split('\n').filter(t => t.trim() !== '')
    };
  });
  
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

analyze();
