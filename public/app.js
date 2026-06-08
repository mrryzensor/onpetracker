let chartInstance = null;

// Analizar fechas de SQLite y tratarlas como UTC si no tienen indicador de zona
function parseSQLiteDate(timestampStr) {
  if (!timestampStr) return new Date();
  if (typeof timestampStr === 'string' && !timestampStr.includes('Z') && !timestampStr.includes('T')) {
    return new Date(timestampStr.replace(' ', 'T') + 'Z');
  }
  return new Date(timestampStr);
}

// Formatear números con separador de miles
function formatNumber(num) {
  return new Intl.NumberFormat('es-PE').format(num);
}

// Inicializar y cargar datos
document.addEventListener('DOMContentLoaded', () => {
  loadLatest();
  loadHistory();
  setupSyncButton();
  
  // Actualizar estado de sincronización cada 10 segundos
  setInterval(checkSyncStatus, 10000);
  
  // Auto-actualizar los datos y las gráficas en el cliente cada 30 segundos
  setInterval(() => {
    loadLatest();
    loadHistory();
  }, 30000);
});

// Obtener estado de sincronización en curso
async function checkSyncStatus() {
  try {
    const res = await fetch('/api/sync-status');
    const status = await res.json();
    updateSyncUI(status);
  } catch (err) {
    console.error('Error al chequear estado de sync:', err);
  }
}

function updateSyncUI(status) {
  const indicator = document.getElementById('sync-status-indicator');
  const statusText = document.getElementById('sync-status-text');
  const lastSyncTimeVal = document.getElementById('last-sync-time-val');
  const btnSync = document.getElementById('btn-sync');

  if (status.isSyncing) {
    indicator.className = 'status-indicator syncing';
    statusText.innerText = 'Sincronizando...';
    btnSync.disabled = true;
    btnSync.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Sincronizando...';
  } else {
    btnSync.disabled = false;
    btnSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Sincronizar Ahora';
    
    if (status.lastSyncError) {
      indicator.className = 'status-indicator error';
      statusText.innerText = 'Error';
    } else {
      indicator.className = 'status-indicator success';
      statusText.innerText = 'Conectado';
    }
  }

  if (status.lastSyncTime) {
    const date = new Date(status.lastSyncTime);
    lastSyncTimeVal.innerText = date.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// Configurar el botón de sincronización manual
function setupSyncButton() {
  const btnSync = document.getElementById('btn-sync');
  btnSync.addEventListener('click', async () => {
    try {
      updateSyncUI({ isSyncing: true });
      const res = await fetch('/api/sync', { method: 'POST' });
      const result = await res.json();
      
      if (result.success) {
        if (result.saved) {
          console.log('¡Se detectaron y registraron nuevos cambios de la ONPE!');
        } else {
          console.log('No hay cambios nuevos en la ONPE.');
        }
        // Recargar datos
        await loadLatest();
        await loadHistory();
      } else {
        alert('Error al sincronizar: ' + (result.error || 'Intenta de nuevo'));
      }
    } catch (err) {
      console.error(err);
      alert('Error en la petición de sincronización.');
    } finally {
      checkSyncStatus();
    }
  });
}

// Cargar la última actualización de ONPE y rellenar widgets
async function loadLatest() {
  try {
    const res = await fetch('/api/latest');
    if (res.status === 404) {
      document.getElementById('onpe-timestamp-val').innerText = 'Sin datos';
      return;
    }
    
    const data = await res.json();
    
    // Rellenar timestamp de ONPE
    document.getElementById('onpe-timestamp-val').innerText = `ONPE: ${data.timestamp_onpe || 'Actualizando...'}`;
    
    // Rellenar actas
    document.getElementById('actas-contabilizadas-val').innerText = formatNumber(data.actas_contabilizadas);
    document.getElementById('actas-contabilizadas-pct-val').innerText = `${data.actas_contabilizadas_pct.toFixed(3)} %`;
    
    // Barra de progreso de actas
    const progressBar = document.getElementById('actas-progress-bar');
    progressBar.style.width = `${data.actas_contabilizadas_pct}%`;
    
    // Detalle de actas
    // Estimación o valores nulos/pendientes si están guardados
    document.getElementById('actas-jee-val').innerText = formatNumber(Math.round(data.actas_contabilizadas * 0.017)); // estimación si no está directo
    document.getElementById('actas-jee-pct-val').innerText = `${(100 - data.actas_contabilizadas_pct).toFixed(3)} %`;
    
    // Candidato 1 (Keiko)
    document.getElementById('c1-name').innerText = data.candidato1_nombre || 'KEIKO SOFIA FUJIMORI';
    document.getElementById('c1-party').innerText = data.candidato1_partido || 'FUERZA POPULAR';
    document.getElementById('c1-votes').innerText = `${formatNumber(data.candidato1_votos)} votos`;
    document.getElementById('c1-pct').innerText = `${data.candidato1_pct.toFixed(3)} %`;
    document.getElementById('th-c1').innerText = data.candidato1_nombre ? data.candidato1_nombre.split(' ')[0] : 'Candidato A';

    // Candidato 2 (Roberto)
    document.getElementById('c2-name').innerText = data.candidato2_nombre || 'ROBERTO HELBERT SANCHEZ';
    document.getElementById('c2-party').innerText = data.candidato2_partido || 'JUNTOS POR EL PERÚ';
    document.getElementById('c2-votes').innerText = `${formatNumber(data.candidato2_votos)} votos`;
    document.getElementById('c2-pct').innerText = `${data.candidato2_pct.toFixed(3)} %`;
    document.getElementById('th-c2').innerText = data.candidato2_nombre ? data.candidato2_nombre.split(' ')[0] : 'Candidato B';

    // Calcular la diferencia / Brecha
    const diff = data.candidato1_votos - data.candidato2_votos;
    const diffAbs = Math.abs(diff);
    
    let leadName = '';
    let leadParty = '';
    if (diff > 0) {
      leadName = data.candidato1_nombre ? data.candidato1_nombre.split(' ')[0] : 'Keiko';
      leadParty = data.candidato1_partido;
      document.getElementById('gap-difference-val').innerText = `+${formatNumber(diffAbs)} votos (Keiko)`;
      
      document.getElementById('gap-leader-left').innerText = `Keiko lidera por ${formatNumber(diffAbs)} votos`;
      document.getElementById('gap-leader-right').innerText = '';
    } else if (diff < 0) {
      leadName = data.candidato2_nombre ? data.candidato2_nombre.split(' ')[0] : 'Roberto';
      leadParty = data.candidato2_partido;
      document.getElementById('gap-difference-val').innerText = `+${formatNumber(diffAbs)} votos (Roberto)`;
      
      document.getElementById('gap-leader-left').innerText = '';
      document.getElementById('gap-leader-right').innerText = `Roberto lidera por ${formatNumber(diffAbs)} votos`;
    } else {
      document.getElementById('gap-difference-val').innerText = `Empate absoluto (0 votos)`;
      document.getElementById('gap-leader-left').innerText = '';
      document.getElementById('gap-leader-right').innerText = '';
    }

    // Mover el indicador de brecha visualmente
    // Mapeamos el porcentaje (de 48.5% a 51.5%) a la escala de la barra (de 5% a 95%) para hacerlo visible
    const indicator = document.getElementById('gap-indicator');
    const c1Pct = data.candidato1_pct;
    
    // Zoom visual: restamos 50, escalamos y centramos
    // Ej: 50.036% -> diff de +0.036. Con factor de escala 300, 0.036 * 300 = +10.8%. Posición = 50 + 10.8 = 60.8%
    let visualPercent = 50 + (c1Pct - 50) * 150;
    // Acotar
    visualPercent = Math.max(5, Math.min(95, visualPercent));
    indicator.style.left = `${visualPercent}%`;

  } catch (err) {
    console.error('Error al cargar datos del último registro:', err);
  }
}

// Cargar historial y dibujar la tabla e iniciar el gráfico
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    
    if (history.length === 0) return;
    
    // Rellenar tabla
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';
    
    history.forEach(row => {
      const tr = document.createElement('tr');
      
      const dateObj = parseSQLiteDate(row.timestamp);
      const localTime = dateObj.toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: true });
      const onpeTime = row.onpe_timestamp || (dateObj.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) + ' ' + dateObj.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false }));
      
      const diff = row.candidato1_votos - row.candidato2_votos;
      const diffAbs = Math.abs(diff);
      
      let winnerBadge = '';
      if (diff > 0) {
        winnerBadge = `<span class="badge badge-c1">${row.candidato1_nombre ? row.candidato1_nombre.split(' ')[0] : 'Candidato A'}</span>`;
      } else if (diff < 0) {
        winnerBadge = `<span class="badge badge-c2">${row.candidato2_nombre ? row.candidato2_nombre.split(' ')[0] : 'Candidato B'}</span>`;
      } else {
        winnerBadge = `<span class="badge">Empate</span>`;
      }
      
      tr.innerHTML = `
        <td>${localTime}</td>
        <td>${onpeTime}</td>
        <td><strong>${row.actas_contabilizadas_pct.toFixed(3)}%</strong> (${formatNumber(row.actas_contabilizadas)})</td>
        <td style="color: var(--color-c1); font-weight:600;">${row.candidato1_pct.toFixed(3)}% <span style="font-size:0.75rem; color:var(--text-muted)">(${formatNumber(row.candidato1_votos)})</span></td>
        <td style="color: var(--color-c2); font-weight:600;">${row.candidato2_pct.toFixed(3)}% <span style="font-size:0.75rem; color:var(--text-muted)">(${formatNumber(row.candidato2_votos)})</span></td>
        <td><strong>${formatNumber(diffAbs)}</strong></td>
        <td>${winnerBadge}</td>
      `;
      tbody.prepend(tr);
    });

    // Renderizar o actualizar gráfico de Chart.js
    renderChart(history);
    
    // Calcular y renderizar proyecciones
    updateProjection(history);

  } catch (err) {
    console.error('Error al cargar historial:', err);
  }
}

// Renderizar gráfico interactivo de la diferencia de votos
function renderChart(history) {
  const ctx = document.getElementById('historyChart').getContext('2d');
  
  // Etiquetas del eje X (timestamps de registro local formateados)
  const labels = history.map(row => {
    const d = parseSQLiteDate(row.timestamp);
    return d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) + ' ' + d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
  });

  // Datos del eje Y: Diferencia de votos (Keiko - Roberto)
  // Si es positivo Keiko va ganando, si es negativo Roberto va ganando
  const dataValues = history.map(row => row.candidato1_votos - row.candidato2_votos);
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Diferencia de Votos (Keiko vs Roberto)',
        data: dataValues,
        borderColor: '#a855f7', // Purpura elegante
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4, // Curva suave
        pointBackgroundColor: '#fff',
        pointBorderColor: '#a855f7',
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#a855f7',
        pointHoverBorderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // Ocultamos la leyenda para simplificar
        },
        tooltip: {
          backgroundColor: '#151824',
          titleColor: '#8b949e',
          bodyColor: '#fff',
          borderColor: '#252a3d',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              if (val > 0) {
                return `Lidera Keiko por: ${formatNumber(val)} votos`;
              } else if (val < 0) {
                return `Lidera Roberto por: ${formatNumber(Math.abs(val))} votos`;
              } else {
                return 'Empate absoluto';
              }
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: '#8b949e',
            font: {
              family: 'Poppins',
              size: 10
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: '#8b949e',
            font: {
              family: 'Poppins',
              size: 10
            },
            callback: function(value) {
              if (value > 0) return `+${formatNumber(value)} (K)`;
              if (value < 0) return `+${formatNumber(Math.abs(value))} (R)`;
              return '0';
            }
          }
        }
      }
    }
  });
}

let projectionChartInstance = null;

function updateProjection(history) {
  const tieTimeEl = document.getElementById('proj-tie-time');
  const tiePctEl = document.getElementById('proj-tie-pct');
  const finalDiffEl = document.getElementById('proj-final-diff');
  const finalWinnerEl = document.getElementById('proj-final-winner');
  const finalPctsEl = document.getElementById('proj-final-pcts');
  
  if (history.length < 2) {
    tieTimeEl.innerText = 'Faltan datos';
    tiePctEl.innerText = 'Sincroniza cuando haya actualizaciones';
    finalDiffEl.innerText = 'Faltan datos';
    finalWinnerEl.innerText = 'Se necesitan al menos 2 registros diferentes';
    finalPctsEl.innerText = '-';
    return;
  }
  
  // Filtrar registros duplicados de actas para evitar división por cero en regresión
  const uniquePoints = [];
  const seenPct = new Set();
  for (let i = 0; i < history.length; i++) {
    const pct = history[i].actas_contabilizadas_pct;
    if (!seenPct.has(pct)) {
      seenPct.add(pct);
      uniquePoints.push({
        x: pct,
        y: history[i].candidato1_votos - history[i].candidato2_votos,
        c1Pct: history[i].candidato1_pct,
        c2Pct: history[i].candidato2_pct,
        time: parseSQLiteDate(history[i].timestamp).getTime()
      });
    }
  }
  
  if (uniquePoints.length < 2) {
    tieTimeEl.innerText = 'Faltan datos';
    tiePctEl.innerText = 'Se necesitan actas con % distintos';
    finalDiffEl.innerText = 'Faltan datos';
    finalWinnerEl.innerText = 'Espera a que la ONPE actualice los votos';
    finalPctsEl.innerText = '-';
    return;
  }
  
  // Regresión lineal: y = m * x + c
  // x = porcentaje de actas, y = diferencia de votos
  let n = uniquePoints.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  let sumTime = 0, sumXTime = 0; // Para proyectar el tiempo
  
  let sumC1Pct = 0, sumXC1Pct = 0;
  let sumC2Pct = 0, sumXC2Pct = 0;
  
  for (let i = 0; i < n; i++) {
    const p = uniquePoints[i];
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumTime += p.time;
    sumXTime += p.x * p.time;
    
    sumC1Pct += p.c1Pct;
    sumXC1Pct += p.x * p.c1Pct;
    sumC2Pct += p.c2Pct;
    sumXC2Pct += p.x * p.c2Pct;
  }
  
  const denominator = (n * sumXX - sumX * sumX);
  if (denominator === 0) {
    return;
  }
  
  const m = (n * sumXY - sumX * sumY) / denominator;
  const c = (sumY - m * sumX) / n;
  
  const m1 = (n * sumXC1Pct - sumX * sumC1Pct) / denominator;
  const c1_int = (sumC1Pct - m1 * sumX) / n;
  
  const m2 = (n * sumXC2Pct - sumX * sumC2Pct) / denominator;
  const c2_int = (sumC2Pct - m2 * sumX) / n;
  
  // Regresión lineal para el tiempo: time = m_time * x + c_time
  const m_time = (n * sumXTime - sumX * sumTime) / denominator;
  const c_time = (sumTime - m_time * sumX) / n;
  
  // 1. Calcular punto de empate (y = 0)
  // 0 = m * x + c => x = -c / m
  let tiePct = -c / m;
  const currentPct = history[history.length - 1].actas_contabilizadas_pct;
  
  // 2. Calcular diferencia final al 100% de actas
  const finalDiff = m * 100 + c;
  const finalDiffAbs = Math.abs(finalDiff);
  
  // Proyectar porcentajes individuales al 100% de actas
  let projC1Pct = m1 * 100 + c1_int;
  let projC2Pct = m2 * 100 + c2_int;
  
  // Normalizar para que sumen 100% (evitando pequeñas desviaciones de la regresión)
  const sumProj = projC1Pct + projC2Pct;
  if (sumProj > 0) {
    projC1Pct = (projC1Pct / sumProj) * 100;
    projC2Pct = (projC2Pct / sumProj) * 100;
  }
  
  // Rellenar diferencia final y ganador proyectado
  finalDiffEl.innerText = `${formatNumber(Math.round(finalDiffAbs))} votos`;
  finalPctsEl.innerHTML = `Keiko: <span style="color: var(--color-c1); font-weight:700;">${projC1Pct.toFixed(3)}%</span> | Roberto: <span style="color: var(--color-c2); font-weight:700;">${projC2Pct.toFixed(3)}%</span>`;
  
  if (finalDiff > 0) {
    finalWinnerEl.innerText = `Ventaja para Keiko (proyectado)`;
    finalWinnerEl.className = 'metric-percentage pct-c1';
  } else if (finalDiff < 0) {
    finalWinnerEl.innerText = `Ventaja para Roberto (proyectado)`;
    finalWinnerEl.className = 'metric-percentage pct-c2';
  } else {
    finalWinnerEl.innerText = 'Empate absoluto proyectado';
    finalWinnerEl.className = 'metric-percentage';
  }

  // Analizar punto de empate
  if (m === 0) {
    tieTimeEl.innerText = 'Sin cambios';
    tiePctEl.innerText = 'La brecha es constante';
  } else if (tiePct > currentPct && tiePct <= 100) {
    // El empate ocurre en el futuro de la contabilización (entre el % actual y el 100%)
    tiePctEl.innerText = `al ${tiePct.toFixed(3)} % de las actas`;
    
    // Proyectar hora
    const projectedTimeMs = m_time * tiePct + c_time;
    const projectedDate = new Date(projectedTimeMs);
    const timeStr = projectedDate.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    tieTimeEl.innerText = timeStr;
  } else if (tiePct <= currentPct && tiePct >= 0) {
    tieTimeEl.innerText = 'Ya ocurrió / Cruzado';
    tiePctEl.innerText = `Cruzó en ${tiePct.toFixed(3)} % de actas`;
  } else {
    if (m > 0 && (history[history.length-1].candidato1_votos - history[history.length-1].candidato2_votos) > 0) {
      tieTimeEl.innerText = 'No se proyecta empate';
      tiePctEl.innerText = 'La brecha a favor de Keiko se está ampliando';
    } else if (m < 0 && (history[history.length-1].candidato1_votos - history[history.length-1].candidato2_votos) < 0) {
      tieTimeEl.innerText = 'No se proyecta empate';
      tiePctEl.innerText = 'La brecha a favor de Roberto se está ampliando';
    } else {
      tieTimeEl.innerText = 'No se proyecta empate';
      tiePctEl.innerText = 'Tendencias divergentes';
    }
  }
  
  // Renderizar gráfico de proyección
  renderProjectionChart(history, m, c, currentPct);
}

function renderProjectionChart(history, m, c, currentPct) {
  const ctx = document.getElementById('projectionChart').getContext('2d');
  
  // Calcular regresión para Keiko (Candidato 1)
  const uniquePoints = [];
  const seenPct = new Set();
  for (let i = 0; i < history.length; i++) {
    const pct = history[i].actas_contabilizadas_pct;
    if (!seenPct.has(pct)) {
      seenPct.add(pct);
      uniquePoints.push({
        x: pct,
        y1: history[i].candidato1_pct,
        y2: history[i].candidato2_pct
      });
    }
  }
  
  if (uniquePoints.length < 2) return;
  
  // Regresión lineal para Keiko: y1 = m1 * x + c1
  // Regresión lineal para Roberto: y2 = m2 * x + c2
  const n = uniquePoints.length;
  let sumX = 0, sumY1 = 0, sumY2 = 0, sumXY1 = 0, sumXY2 = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    const p = uniquePoints[i];
    sumX += p.x;
    sumY1 += p.y1;
    sumY2 += p.y2;
    sumXY1 += p.x * p.y1;
    sumXY2 += p.x * p.y2;
    sumXX += p.x * p.x;
  }
  
  const denominator = (n * sumXX - sumX * sumX);
  if (denominator === 0) return;
  
  const m1 = (n * sumXY1 - sumX * sumY1) / denominator;
  const c1 = (sumY1 - m1 * sumX) / n;
  
  const m2 = (n * sumXY2 - sumX * sumY2) / denominator;
  const c2 = (sumY2 - m2 * sumX) / n;
  
  // Punto de quiebre (cruce)
  // m1 * x + c1 = m2 * x + c2 => x = (c2 - c1) / (m1 - m2)
  let tiePct = null;
  if (Math.abs(m1 - m2) > 0.00001) {
    tiePct = (c2 - c1) / (m1 - m2);
  }
  
  // Generar datos reales para graficar (como objetos {x, y})
  const actualK = [];
  const actualR = [];
  history.forEach(row => {
    actualK.push({ x: row.actas_contabilizadas_pct, y: row.candidato1_pct });
    actualR.push({ x: row.actas_contabilizadas_pct, y: row.candidato2_pct });
  });
  
  // Generar datos proyectados (desde el actualPct hasta 100%)
  const projK = [];
  const projR = [];
  
  // Empezar en el último punto real para continuidad
  if (actualK.length > 0) {
    projK.push({ x: currentPct, y: actualK[actualK.length - 1].y });
    projR.push({ x: currentPct, y: actualR[actualR.length - 1].y });
  }
  
  // Agregar puntos intermedios y el 100%
  const startPct = Math.ceil(currentPct);
  for (let pct = startPct; pct <= 100; pct++) {
    let y1 = m1 * pct + c1;
    let y2 = m2 * pct + c2;
    // Normalizar
    const total = y1 + y2;
    if (total > 0) {
      y1 = (y1 / total) * 100;
      y2 = (y2 / total) * 100;
    }
    projK.push({ x: pct, y: y1 });
    projR.push({ x: pct, y: y2 });
  }
  
  // Dataset para el Punto de Quiebre (si está en el rango visible futuro)
  const breakPointData = [];
  if (tiePct !== null && tiePct > currentPct && tiePct <= 100) {
    breakPointData.push({ x: tiePct, y: 50.00 });
  }

  // Nombre de los candidatos para las etiquetas
  const name1 = history[0].candidato1_nombre ? history[0].candidato1_nombre.split(' ')[0] : 'Keiko';
  const name2 = history[0].candidato2_nombre ? history[0].candidato2_nombre.split(' ')[0] : 'Roberto';
  
  if (projectionChartInstance) {
    projectionChartInstance.destroy();
  }
  
  // Determinar el rango mínimo de X para hacer zoom
  const xMin = Math.max(0, Math.floor(Math.min(...history.map(r => r.actas_contabilizadas_pct)) - 2));
  
  projectionChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: `${name1} (Real)`,
          data: actualK,
          borderColor: '#ea580c', // Naranja Keiko
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#ea580c',
          tension: 0.2,
          fill: false
        },
        {
          label: `${name1} (Proyección)`,
          data: projK,
          borderColor: '#ea580c',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.1,
          fill: false
        },
        {
          label: `${name2} (Real)`,
          data: actualR,
          borderColor: '#0e9f6e', // Verde Roberto
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#0e9f6e',
          tension: 0.2,
          fill: false
        },
        {
          label: `${name2} (Proyección)`,
          data: projR,
          borderColor: '#0e9f6e',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.1,
          fill: false
        },
        {
          label: 'Punto de Quiebre',
          data: breakPointData,
          borderColor: '#a855f7', // Púrpura llamativo para el cruce
          backgroundColor: '#a855f7',
          pointRadius: 8,
          pointHoverRadius: 10,
          pointStyle: 'rectRounded',
          showLine: false,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#8b949e',
            font: { family: 'Poppins', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: '#151824',
          titleColor: '#8b949e',
          bodyColor: '#fff',
          borderColor: '#252a3d',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: function(context) {
              const xVal = context[0].parsed.x;
              return `Actas Contabilizadas: ${xVal.toFixed(3)}%`;
            },
            label: function(context) {
              const datasetLabel = context.dataset.label;
              const yVal = context.parsed.y;
              if (datasetLabel === 'Punto de Quiebre') {
                return `Cruce estimado al: ${context.parsed.x.toFixed(3)}% (Ambos: 50.00%)`;
              }
              return `${datasetLabel}: ${yVal.toFixed(3)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: xMin,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: '#8b949e',
            font: { family: 'Poppins', size: 10 },
            callback: function(value) {
              return `${value}%`;
            }
          },
          title: {
            display: true,
            text: '% de Actas Contabilizadas',
            color: '#8b949e',
            font: { family: 'Poppins', size: 11 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: '#8b949e',
            font: { family: 'Poppins', size: 10 },
            callback: function(value) {
              return `${value}%`;
            }
          },
          title: {
            display: true,
            text: '% de Votos Válidos',
            color: '#8b949e',
            font: { family: 'Poppins', size: 11 }
          }
        }
      }
    }
  });
}

// Forzar redibujado y redimensionamiento en tiempo real de los gráficos cuando cambia la ventana
window.addEventListener('resize', () => {
  if (chartInstance) {
    chartInstance.resize();
  }
  if (projectionChartInstance) {
    projectionChartInstance.resize();
  }
});
