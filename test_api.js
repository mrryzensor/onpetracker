async function testApi() {
  const url = 'https://resultadosegundavuelta.onpe.gob.pe/presentacion-backend/resumen-general/totales?idEleccion=10&tipoFiltro=ambito_geografico&idAmbitoGeografico=1';
  console.log(`Intentando fetch directo a: ${url}`);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://resultadosegundavuelta.onpe.gob.pe/main/resumen'
      }
    });
    
    console.log(`Respuesta recibida. Status: ${res.status}`);
    const text = await res.text();
    console.log('--- Comienzo de respuesta ---');
    console.log(text.substring(0, 500));
    console.log('--- Fin de respuesta ---');
  } catch (err) {
    console.error('Error haciendo el fetch:', err.message);
  }
}

testApi();
