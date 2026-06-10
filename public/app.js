// Preload candidate face images for canvas drawing and tooltip display
const imgKeiko = new Image();
imgKeiko.src = 'https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/10001088.png';
imgKeiko.onload = () => {
  if (window.projectionChartInstance) window.projectionChartInstance.update();
};
const imgRoberto = new Image();
imgRoberto.src = 'https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/16002918.png';
imgRoberto.onload = () => {
  if (window.projectionChartInstance) window.projectionChartInstance.update();
};

let chartInstance = null;

// Helper for custom HTML tooltip in Chart.js displaying candidate faces
function getCustomHtmlTooltip(context) {
  let tooltipEl = document.getElementById('chartjs-tooltip');

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'chartjs-tooltip';
    tooltipEl.style.background = '#151824';
    tooltipEl.style.border = '1px solid #252a3d';
    tooltipEl.style.borderRadius = '8px';
    tooltipEl.style.color = '#fff';
    tooltipEl.style.opacity = 0;
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.transition = 'all 0.15s ease';
    tooltipEl.style.padding = '10px';
    tooltipEl.style.zIndex = '10000';
    tooltipEl.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    document.body.appendChild(tooltipEl);
  }

  const tooltipModel = context.tooltip;
  if (tooltipModel.opacity === 0) {
    tooltipEl.style.opacity = 0;
    return;
  }

  if (tooltipModel.body) {
    const titleLines = tooltipModel.title || [];
    const bodyLines = tooltipModel.body.map(bodyItem => bodyItem.lines);

    let innerHtml = '<div style="font-family: Poppins; font-size: 13px;">';

    titleLines.forEach(title => {
      innerHtml += `<div style="font-weight: bold; margin-bottom: 6px; color: #8b949e; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">${title}</div>`;
    });

    bodyLines.forEach(body => {
      const text = body[0];
      let imgHtml = '';
      
      const isKeiko = text.toUpperCase().includes('KEIKO') || text.startsWith('K ') || text.includes('(K)') || text.includes('K:') || text.includes('KEIKO:') || text.includes('KEIKO FUJIMORI');
      const isRoberto = text.toUpperCase().includes('ROBERTO') || text.startsWith('JP ') || text.includes('(R)') || text.includes('R:') || text.includes('JP:') || text.includes('ROBERTO SÁNCHEZ') || text.includes('ROBERTO SANCHEZ');
      
      if (isKeiko) {
        imgHtml = '<img src="https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/10001088.png" style="width: 55px; height: 68px; object-fit: contain; margin-right: 10px; vertical-align: middle; background: #fff; border-radius: 4px; border: 1.5px solid #ff6c00;">';
      } else if (isRoberto) {
        imgHtml = '<img src="https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/16002918.png" style="width: 55px; height: 68px; object-fit: contain; margin-right: 10px; vertical-align: middle; background: #fff; border-radius: 4px; border: 1.5px solid #00c2a0;">';
      }

      innerHtml += `<div style="display: flex; align-items: center; margin-top: 6px;">${imgHtml}<span>${text}</span></div>`;
    });

    innerHtml += '</div>';
    tooltipEl.innerHTML = innerHtml;
  }

  const position = context.chart.canvas.getBoundingClientRect();
  tooltipEl.style.opacity = 1;
  
  const tooltipWidth = tooltipEl.offsetWidth || 180;
  let leftPos = window.pageXOffset + position.left + tooltipModel.caretX;
  
  // Si la burbuja se sale por el lado derecho de la pantalla, moverla a la izquierda del cursor
  if (leftPos + tooltipWidth > window.innerWidth - 20) {
    leftPos = window.pageXOffset + position.left + tooltipModel.caretX - tooltipWidth - 20;
    if (leftPos < 10) leftPos = 10; // Evitar que se desborde por la izquierda
  }
  
  tooltipEl.style.left = leftPos + 'px';
  tooltipEl.style.top = window.pageYOffset + position.top + tooltipModel.caretY - 10 + 'px';
}

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
  setupThemeToggle();
  loadLatest();
  loadHistory();
  setupSyncButton();
  setupManualPaste();
  
  // Actualizar estado de sincronización cada 10 segundos
  setInterval(checkSyncStatus, 10000);
  
  // Auto-actualizar los datos y las gráficas en el cliente cada 30 segundos
  setInterval(() => {
    loadLatest();
    loadHistory();
  }, 30000);

  // Manejador del panel colapsable del desglose de Lima (JEE)
  const btnToggle = document.getElementById('btn-toggle-lima-breakdown');
  const btnClose = document.getElementById('btn-close-lima-breakdown');
  const panel = document.getElementById('lima-breakdown-panel');
  
  if (btnToggle && btnClose && panel) {
    btnToggle.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      if (!panel.classList.contains('collapsed')) {
        setTimeout(() => {
          panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
      }
    });
    btnClose.addEventListener('click', () => {
      panel.classList.add('collapsed');
    });
  }
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
    
    const c1Name = data.candidato1_nombre || 'KEIKO SOFIA FUJIMORI';
    const c1Party = data.candidato1_partido || 'FUERZA POPULAR';
    const c1Votes = data.candidato1_votos;
    const c1Pct = data.candidato1_pct;
    const c1Photo = 'https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/10001088.png';

    const c2Name = data.candidato2_nombre || 'ROBERTO HELBERT SANCHEZ';
    const c2Party = data.candidato2_partido || 'JUNTOS POR EL PERÚ';
    const c2Votes = data.candidato2_votos;
    const c2Pct = data.candidato2_pct;
    const c2Photo = 'https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/16002918.png';

    // Mantener cabeceras de tabla fijas por candidato (Columna 1: Keiko, Columna 2: Roberto)
    document.getElementById('th-c1').innerText = c1Name ? c1Name.split(' ')[0] : 'Keiko';
    document.getElementById('th-c2').innerText = c2Name ? c2Name.split(' ')[0] : 'Roberto';

    // Asignar el líder a la izquierda (Card 1) y el segundo a la derecha (Card 2)
    const isC1Leading = c1Votes >= c2Votes;

    const leftName = isC1Leading ? c1Name : c2Name;
    const leftParty = isC1Leading ? c1Party : c2Party;
    const leftVotes = isC1Leading ? c1Votes : c2Votes;
    const leftPct = isC1Leading ? c1Pct : c2Pct;
    const leftPhoto = isC1Leading ? c1Photo : c2Photo;
    const leftClass = isC1Leading ? 'candidate-pct-badge pct-c1' : 'candidate-pct-badge pct-c2';

    const rightName = isC1Leading ? c2Name : c1Name;
    const rightParty = isC1Leading ? c2Party : c1Party;
    const rightVotes = isC1Leading ? c2Votes : c1Votes;
    const rightPct = isC1Leading ? c2Pct : c1Pct;
    const rightPhoto = isC1Leading ? c2Photo : c1Photo;
    const rightClass = isC1Leading ? 'candidate-pct-badge pct-c2' : 'candidate-pct-badge pct-c1';

    // Rellenar UI izquierda
    document.getElementById('c1-photo').src = leftPhoto;
    document.getElementById('c1-photo').alt = leftName;
    document.getElementById('c1-name').innerText = leftName;
    document.getElementById('c1-party').innerText = leftParty;
    document.getElementById('c1-votes').innerText = `${formatNumber(leftVotes)} votos`;
    
    const c1PctBadge = document.getElementById('c1-pct');
    c1PctBadge.className = leftClass;
    c1PctBadge.innerText = `${leftPct.toFixed(3)} %`;

    // Rellenar UI derecha
    document.getElementById('c2-photo').src = rightPhoto;
    document.getElementById('c2-photo').alt = rightName;
    document.getElementById('c2-name').innerText = rightName;
    document.getElementById('c2-party').innerText = rightParty;
    document.getElementById('c2-votes').innerText = `${formatNumber(rightVotes)} votos`;
    
    const c2PctBadge = document.getElementById('c2-pct');
    c2PctBadge.className = rightClass;
    c2PctBadge.innerText = `${rightPct.toFixed(3)} %`;

    // Cambiar dinámicamente los bordes de las tarjetas de los candidatos
    const c1Left = document.querySelector('#c1-row .candidate-left');
    const c1Right = document.querySelector('#c1-row .candidate-right');
    const c2Left = document.querySelector('#c2-row .candidate-left');
    const c2Right = document.querySelector('#c2-row .candidate-right');

    if (isC1Leading) {
      // Keiko (C1) está a la izquierda (Card 1), Roberto (C2) a la derecha (Card 2)
      if (c1Left) c1Left.style.borderLeftColor = 'var(--color-c1)';
      if (c1Right) c1Right.style.borderRightColor = 'var(--color-c1)';
      if (c2Left) c2Left.style.borderLeftColor = 'var(--color-c2)';
      if (c2Right) c2Right.style.borderRightColor = 'var(--color-c2)';
    } else {
      // Roberto (C2) está a la izquierda (Card 1), Keiko (C1) a la derecha (Card 2)
      if (c1Left) c1Left.style.borderLeftColor = 'var(--color-c2)';
      if (c1Right) c1Right.style.borderRightColor = 'var(--color-c2)';
      if (c2Left) c2Left.style.borderLeftColor = 'var(--color-c1)';
      if (c2Right) c2Right.style.borderRightColor = 'var(--color-c1)';
    }

    // Calcular la diferencia / Brecha
    const diff = data.candidato1_votos - data.candidato2_votos;
    const diffAbs = Math.abs(diff);
    
    // Actualizar rostro del líder en el Umbral de Irreversibilidad
    const leaderFaceContainer = document.getElementById('victory-leader-face-container');
    const leaderFaceImg = document.getElementById('victory-leader-face');
    if (leaderFaceContainer && leaderFaceImg) {
      leaderFaceContainer.style.display = 'flex';
      leaderFaceImg.src = isC1Leading ? c1Photo : c2Photo;
      leaderFaceImg.style.borderColor = isC1Leading ? 'var(--color-c1)' : 'var(--color-c2)';
    }
    
    let leadName = '';
    let leadParty = '';
    const gapBar = document.querySelector('.gap-visual-bar');
    
    if (isC1Leading) {
      // Keiko (C1) lidera -> Color C1 (Naranja) a la izquierda en la barra
      gapBar.style.background = 'linear-gradient(90deg, var(--color-c1) 0%, var(--color-c1) 45%, #2a2d3d 45%, #2a2d3d 55%, var(--color-c2) 55%, var(--color-c2) 100%)';
    } else {
      // Roberto (C2) lidera -> Color C2 (Teal) a la izquierda en la barra
      gapBar.style.background = 'linear-gradient(90deg, var(--color-c2) 0%, var(--color-c2) 45%, #2a2d3d 45%, #2a2d3d 55%, var(--color-c1) 55%, var(--color-c1) 100%)';
    }

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
      
      document.getElementById('gap-leader-left').innerText = `Roberto lidera por ${formatNumber(diffAbs)} votos`;
      document.getElementById('gap-leader-right').innerText = '';
    } else {
      document.getElementById('gap-difference-val').innerText = `Empate absoluto (0 votos)`;
      document.getElementById('gap-leader-left').innerText = '';
      document.getElementById('gap-leader-right').innerText = '';
    }

    // Mover el indicador de brecha visualmente
    // El líder siempre está a la izquierda (0% a 50%)
    const indicator = document.getElementById('gap-indicator');
    const leadPct = Math.max(c1Pct, c2Pct);
    
    // Si están empatados (50%), el indicador se sitúa al medio (50%).
    // Conforme suba el porcentaje del líder, se desplaza hacia la izquierda (hacia el 5%)
    let visualPercent = 50 - (leadPct - 50) * 150;
    visualPercent = Math.max(5, Math.min(95, visualPercent));
    indicator.style.left = `${visualPercent}%`;

    // --- Cálculo del Umbral de Irreversibilidad Matemática ---
    const totalValidVotes = c1Votes + c2Votes;
    const pctContabilizadas = data.actas_contabilizadas_pct;
    let estTotalValidVotes = 0;
    let remainingVotes = 0;

    if (pctContabilizadas > 0) {
      estTotalValidVotes = totalValidVotes / (pctContabilizadas / 100);
      remainingVotes = Math.max(0, Math.round(estTotalValidVotes - totalValidVotes));
    }

    let progressPct = 0;
    if (remainingVotes > 0) {
      progressPct = Math.min(100, (diffAbs / remainingVotes) * 100);
    } else {
      progressPct = 100;
    }

    const isIrreversible = diffAbs > remainingVotes;
    const is100Percent = pctContabilizadas >= 100;

    // Determinar nombres
    let leaderName = '';
    let trailerName = '';
    if (diff > 0) {
      leaderName = c1Name ? c1Name.split(' ')[0] : 'Keiko';
      trailerName = c2Name ? c2Name.split(' ')[0] : 'Roberto';
    } else if (diff < 0) {
      leaderName = c2Name ? c2Name.split(' ')[0] : 'Roberto';
      trailerName = c1Name ? c1Name.split(' ')[0] : 'Keiko';
    } else {
      leaderName = 'Ninguno';
      trailerName = 'Ninguno';
    }

    const victoryCard = document.getElementById('victory-status-card');
    const badgeEl = document.getElementById('victory-status-badge');
    const explanationEl = document.getElementById('victory-explanation-text');

    document.getElementById('victory-current-gap').innerText = formatNumber(diffAbs);
    document.getElementById('victory-remaining-votes').innerText = formatNumber(remainingVotes);
    document.getElementById('victory-progress-pct-text').innerText = `${progressPct.toFixed(1)}%`;
    document.getElementById('victory-progress-bar').style.width = `${progressPct}%`;

    if (isIrreversible || is100Percent) {
      if (diffAbs > 0) {
        badgeEl.innerText = 'Victoria Confirmada';
        badgeEl.className = 'status-badge confirmed';
        explanationEl.innerHTML = `La diferencia de <strong>${formatNumber(diffAbs)}</strong> votos supera los <strong>${formatNumber(remainingVotes)}</strong> votos estimados por escrutar. ¡Es matemáticamente imposible que ${trailerName} supere a ${leaderName}!`;
        victoryCard.classList.add('victory-confirmed-glow');
      } else {
        badgeEl.innerText = 'Empate Confirmado';
        badgeEl.className = 'status-badge confirmed';
        explanationEl.innerHTML = `El escrutinio ha concluido y ambos candidatos tienen exactamente la misma cantidad de votos.`;
        victoryCard.classList.add('victory-confirmed-glow');
      }
    } else {
      badgeEl.innerText = 'Matemáticamente Abierto';
      badgeEl.className = 'status-badge open';
      victoryCard.classList.remove('victory-confirmed-glow');
      
      if (diffAbs > 0) {
        const votesToVictory = Math.max(0, Math.ceil((remainingVotes - diffAbs) / 2));
        const pctOfRemaining = remainingVotes > 0 ? (votesToVictory / remainingVotes) * 100 : 0;
        
        // Calcular a qué porcentaje de actas contabilizadas se lograría
        const leadPctVal = Math.max(c1Pct, c2Pct);
        const pctVictoryActas = leadPctVal > 50 ? (50 / leadPctVal * 100) : 100;
        
        let actasText = '';
        if (pctVictoryActas < 100) {
          actasText = ` Se estima que alcanzará la victoria matemática al <strong>${pctVictoryActas.toFixed(3)}%</strong> de actas contabilizadas (al ritmo actual de votación).`;
        } else {
          actasText = ` Al ritmo actual, la victoria se definirá en el tramo final del escrutinio (100% de actas).`;
        }

        explanationEl.innerHTML = `La diferencia actual es de <strong>${formatNumber(diffAbs)}</strong> votos. Quedan aproximadamente <strong>${formatNumber(remainingVotes)}</strong> votos por escrutar. A ${leaderName} le bastan <strong>${formatNumber(votesToVictory)}</strong> votos más (<strong>${pctOfRemaining.toFixed(2)}%</strong> de los votos restantes) para asegurar la victoria.${actasText}`;
      } else {
        explanationEl.innerHTML = `Ambos candidatos se encuentran empatados. Quedan aproximadamente <strong>${formatNumber(remainingVotes)}</strong> votos por escrutar.`;
      }
    }

    // --- Render/update Victory Horizontal Stacked Bar Chart ---
    const victoryChartCtx = document.getElementById('victoryChart').getContext('2d');
    
    const pctC1_total = estTotalValidVotes > 0 ? (c1Votes / estTotalValidVotes * 100) : 0;
    const pctC2_total = estTotalValidVotes > 0 ? (c2Votes / estTotalValidVotes * 100) : 0;
    const pctRemaining = estTotalValidVotes > 0 ? (remainingVotes / estTotalValidVotes * 100) : 0;
    
    const labelC1 = c1Name ? c1Name.split(' ')[0] : 'Keiko';
    const labelC2 = c2Name ? c2Name.split(' ')[0] : 'Roberto';
    
    const themeCols = getChartThemeColors();
    const isLight = isLightTheme();

    if (window.victoryChartInstance) {
      window.victoryChartInstance.destroy();
    }
    
    // Custom plugin to draw vertical line at 50% majority threshold
    const majorityLinePlugin = {
      id: 'majorityLine',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        ctx.save();
        const xPixel = x.getPixelForValue(50);
        ctx.strokeStyle = isLight ? '#0f2b5c' : '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.shadowColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(xPixel, top);
        ctx.lineTo(xPixel, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = isLight ? '#0f2b5c' : '#ffffff';
        ctx.font = 'bold 10px Poppins';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 2;
        ctx.fillText('50% (Meta)', xPixel, top - 4);
        ctx.restore();
      }
    };

    window.victoryChartInstance = new Chart(victoryChartCtx, {
      type: 'bar',
      data: {
        labels: ['Votos Válidos Totales'],
        datasets: [
          {
            label: labelC1,
            data: [pctC1_total],
            backgroundColor: '#ff6c00', // Keiko (Fuerza Popular) - Naranja
            barPercentage: 0.5
          },
          {
            label: 'Por Escrutar',
            data: [pctRemaining],
            backgroundColor: '#eab308', // Amarillo brillante
            barPercentage: 0.5
          },
          {
            label: labelC2,
            data: [pctC2_total],
            backgroundColor: '#00c2a0', // Roberto (Juntos por el Perú) - Teal
            barPercentage: 0.5
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            min: 0,
            max: 100,
            grid: {
              color: themeCols.gridColor,
              borderColor: themeCols.borderColor
            },
            ticks: {
              color: themeCols.textColor,
              font: {
                family: 'Poppins',
                size: 10
              },
              callback: function(value) {
                return value + '%';
              }
            }
          },
          y: {
            stacked: true,
            display: false
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: themeCols.legendColor,
              boxWidth: 10,
              padding: 10,
              font: {
                family: 'Poppins',
                size: 9
              }
            }
          },
          tooltip: {
            enabled: false,
            external: getCustomHtmlTooltip
          }
        }
      },
      plugins: [majorityLinePlugin]
    });

    // --- Cálculo y Proyección del Impacto Regional de Actas Pendientes ---
    // 1. Pesos Electorales Estimados (Total de votos válidos estimados por región en base a padrón real)
    const weightExt = 0.021; // El voto extranjero representa ~2.1% de los votos válidos
    const weightLim = 0.320; // Lima representa ~32.0%
    const weightLor = 0.025; // Loreto ~2.5%
    const weightCus = 0.038; // Cusco ~3.8%
    const weightAya = 0.018; // Ayacucho ~1.8%
    const weightAma = 0.011; // Amazonas ~1.1%
    const weightOtr = 1.0 - (weightExt + weightLim + weightLor + weightCus + weightAya + weightAma);

    // 2. Porcentaje de avance de actas por región (Estimación de rezago del voto extranjero)
    const pctNat = data.actas_contabilizadas_pct;
    let pctProgressExt = 0;
    if (pctNat > 50) {
      pctProgressExt = Math.min(100, (pctNat - 50) * 2);
    }
    // Avance estimado para regiones nacionales
    const pctProgressNat = Math.min(100, pctNat + (weightExt * (pctNat - pctProgressExt) / (1 - weightExt)));

    // 3. Votos restantes estimados por región
    const remExt = Math.max(0, Math.round(estTotalValidVotes * weightExt * (1 - pctProgressExt / 100)));
    const remLim = Math.max(0, Math.round(estTotalValidVotes * weightLim * (1 - pctProgressNat / 100)));
    const remLor = Math.max(0, Math.round(estTotalValidVotes * weightLor * (1 - pctProgressNat / 100)));
    const remCus = Math.max(0, Math.round(estTotalValidVotes * weightCus * (1 - pctProgressNat / 100)));
    const remAya = Math.max(0, Math.round(estTotalValidVotes * weightAya * (1 - pctProgressNat / 100)));
    const remAma = Math.max(0, Math.round(estTotalValidVotes * weightAma * (1 - pctProgressNat / 100)));
    
    const sumKeyRegions = remExt + remLim + remLor + remCus + remAya + remAma;
    const remOtr = Math.max(0, remainingVotes - sumKeyRegions);

    // 4. Márgenes históricos base de diferencia de votos
    const baseMarginExt = 0.2556; // Keiko +25.56%
    const baseMarginLim = 0.2700; // Keiko +27.00%
    const baseMarginLor = 0.0982; // Keiko +9.82%
    const baseMarginCus = -0.6140; // Roberto +61.40%
    const baseMarginAya = -0.4264; // Roberto +42.64%
    const baseMarginAma = -0.3046; // Roberto +30.46%
    
    // 5. Ajuste en tiempo real basado en la diferencia nacional
    // Desviación del promedio nacional (Margen actual de Keiko, positivo si Keiko lidera)
    const nationalDiffPct = (c1Pct - c2Pct) / 100;
    
    // Ajustar márgenes agregando la desviación nacional observada
    const adjMarginExt = baseMarginExt + nationalDiffPct;
    const adjMarginLim = baseMarginLim + nationalDiffPct;
    const adjMarginLor = baseMarginLor + nationalDiffPct;
    const adjMarginCus = baseMarginCus + nationalDiffPct;
    const adjMarginAya = baseMarginAya + nationalDiffPct;
    const adjMarginAma = baseMarginAma + nationalDiffPct;

    // Convertir márgenes ajustados a porcentajes de votación por candidato
    const getPcts = (margin) => {
      const pK = Math.max(0, Math.min(1, (1 + margin) / 2));
      const pR = 1 - pK;
      return { pK, pR };
    };

    const extPcts = getPcts(adjMarginExt);
    const limPcts = getPcts(adjMarginLim);
    const lorPcts = getPcts(adjMarginLor);
    const cusPcts = getPcts(adjMarginCus);
    const ayaPcts = getPcts(adjMarginAya);
    const amaPcts = getPcts(adjMarginAma);
    
    // Otros: distribuido según el promedio nacional en tiempo real
    const otrPcts = { pK: c1Pct / 100, pR: c2Pct / 100 };

    // 6. Distribución de votos por región
    const extK = Math.round(remExt * extPcts.pK);
    const extR = remExt - extK;
    const extNetK = Math.max(0, extK - extR);

    // --- Desglose de Actas JEE de Lima por Provincia y Distrito ---
    const totalActasJEE = Math.round(remLim / 235);
    const locations = [
      // Distritos de Lima Metropolitana (suman peso 0.90 de Lima departamento)
      { name: 'Lima Met. - San Juan de Lurigancho', weight: 0.90 * 0.12, baseMargin: 0.0800, isDistrict: true },
      { name: 'Lima Met. - San Martín de Porres', weight: 0.90 * 0.08, baseMargin: 0.1200, isDistrict: true },
      { name: 'Lima Met. - Ate', weight: 0.90 * 0.07, baseMargin: 0.1000, isDistrict: true },
      { name: 'Lima Met. - Comas', weight: 0.90 * 0.06, baseMargin: 0.0800, isDistrict: true },
      { name: 'Lima Met. - Villa María del Triunfo', weight: 0.90 * 0.05, baseMargin: 0.0500, isDistrict: true },
      { name: 'Lima Met. - Villa El Salvador', weight: 0.90 * 0.05, baseMargin: -0.0600, isDistrict: true },
      { name: 'Lima Met. - Santiago de Surco', weight: 0.90 * 0.05, baseMargin: 0.4500, isDistrict: true },
      { name: 'Lima Met. - Residenciales (Surco/Miraflores/Molina/Borja)*', weight: 0.90 * 0.12, baseMargin: 0.6000, isDistrict: true },
      { name: 'Lima Met. - Chorrillos', weight: 0.90 * 0.04, baseMargin: 0.1500, isDistrict: true },
      { name: 'Lima Met. - Carabayllo', weight: 0.90 * 0.04, baseMargin: 0.0600, isDistrict: true },
      { name: 'Lima Met. - Puente Piedra', weight: 0.90 * 0.04, baseMargin: 0.0800, isDistrict: true },
      { name: 'Lima Met. - Cercado de Lima', weight: 0.90 * 0.04, baseMargin: 0.1500, isDistrict: true },
      { name: 'Lima Met. - Otros Distritos', weight: 0.90 * 0.24, baseMargin: 0.2500, isDistrict: true },
      
      // Otras Provincias del Departamento de Lima (suman peso 0.10)
      { name: 'Prov. Cañete', weight: 0.03, baseMargin: 0.0800, isDistrict: false },
      { name: 'Prov. Huaura', weight: 0.03, baseMargin: 0.0200, isDistrict: false },
      { name: 'Prov. Huaral', weight: 0.02, baseMargin: -0.0200, isDistrict: false },
      { name: 'Prov. Huarochirí', weight: 0.02, baseMargin: -0.1600, isDistrict: false }
    ];

    let breakdownHTML = '';
    let accumulatedLimK = 0;
    let accumulatedLimR = 0;

    locations.forEach(loc => {
      const pActas = Math.round(totalActasJEE * loc.weight);
      const pVotes = Math.round(remLim * loc.weight);
      
      const pAdjMargin = loc.baseMargin + nationalDiffPct;
      const pK = Math.max(0, Math.min(1, (1 + pAdjMargin) / 2));
      const pR = 1 - pK;
      
      const pK_votes = Math.round(pVotes * pK);
      const pR_votes = pVotes - pK_votes;
      const pDiff = pK_votes - pR_votes;

      // Acumular los votos calculados provincia/distrito para consolidar el total de Lima
      accumulatedLimK += pK_votes;
      accumulatedLimR += pR_votes;
      
      let impactText = '';
      if (pDiff > 0) {
        impactText = `<span class="c1-text">+${formatNumber(pDiff)} (Keiko)</span>`;
      } else if (pDiff < 0) {
        impactText = `<span class="c2-text">+${formatNumber(Math.abs(pDiff))} (Roberto)</span>`;
      } else {
        impactText = '0';
      }

      breakdownHTML += `
        <tr>
          <td><strong>${loc.name}</strong></td>
          <td>${formatNumber(pActas)}</td>
          <td>${formatNumber(pVotes)}</td>
          <td>
            <span class="c1-text">${(pK*100).toFixed(1)}%</span> / 
            <span class="c2-text">${(pR*100).toFixed(1)}%</span>
          </td>
          <td>${formatNumber(pK_votes)}</td>
          <td>${formatNumber(pR_votes)}</td>
          <td><strong>${impactText}</strong></td>
        </tr>
      `;
    });
    const tableBody = document.getElementById('lima-breakdown-body');
    if (tableBody) {
      tableBody.innerHTML = breakdownHTML;
    }

    // El impacto neto y votos proyectados para Lima se determinan sumando exactamente sus distritos y provincias
    const limK = accumulatedLimK;
    const limR = accumulatedLimR;
    const limNetK = Math.max(0, limK - limR);

    const lorK = Math.round(remLor * lorPcts.pK);
    const lorR = remLor - lorK;
    const lorNetK = Math.max(0, lorK - lorR);

    const cusR = Math.round(remCus * cusPcts.pR);
    const cusK = remCus - cusR;
    const cusNetR = Math.max(0, cusR - cusK);

    const ayaR = Math.round(remAya * ayaPcts.pR);
    const ayaK = remAya - ayaR;
    const ayaNetR = Math.max(0, ayaR - ayaK);

    const amaR = Math.round(remAma * amaPcts.pR);
    const amaK = remAma - amaR;
    const amaNetR = Math.max(0, amaR - amaK);

    const otrK = Math.round(remOtr * otrPcts.pK);
    const otrR = remOtr - otrK;

    // Totales estimados pendientes
    const totPendingK = extK + limK + lorK + cusK + ayaK + amaK + otrK;
    const totPendingR = extR + limR + lorR + cusR + ayaR + amaR + otrR;
    const netPendingDiff = totPendingK - totPendingR;

    // Proyección Final al 100% de actas
    const finalVotesK = c1Votes + totPendingK;
    const finalVotesR = c2Votes + totPendingR;
    const finalTotal = finalVotesK + finalVotesR;
    const finalPctK = finalTotal > 0 ? (finalVotesK / finalTotal * 100) : 0;
    const finalPctR = finalTotal > 0 ? (finalVotesR / finalTotal * 100) : 0;

    // Guardar proyección regional en objeto global para sincerar la tarjeta y gráfica de regresión
    window.geographicalProjection = {
      finalVotesK,
      finalVotesR,
      finalPctK,
      finalPctR,
      totPendingK,
      totPendingR,
      netPendingDiff
    };

    // Actualizar sección del desglose de ámbitos (Extranjero y Perú Pendientes)
    const totalExtValidVotes = estTotalValidVotes * weightExt;
    const scrutinizedExt = totalExtValidVotes * (pctProgressExt / 100);
    const extK_current = scrutinizedExt * extPcts.pK;
    const extR_current = scrutinizedExt * extPcts.pR;
    
    const remPeru = Math.max(0, remainingVotes - remExt);
    const pendingPeruK = Math.max(0, totPendingK - extK);
    const pendingPeruR = Math.max(0, totPendingR - extR);
    const pctPendingPeruK = (pendingPeruK / (pendingPeruK + pendingPeruR || 1)) * 100;
    const pctPendingPeruR = 100 - pctPendingPeruK;

    const extBadgeEl = document.getElementById('ext-progress-badge');
    const extVotesKEl = document.getElementById('ext-votes-k');
    const extVotesREl = document.getElementById('ext-votes-r');
    const peruBadgeEl = document.getElementById('peru-pending-progress-badge');
    const peruVotesKEl = document.getElementById('peru-pending-votes-k');
    const peruVotesREl = document.getElementById('peru-pending-votes-r');

    if (extBadgeEl) extBadgeEl.innerText = `${pctProgressExt.toFixed(1)}% escrutado`;
    if (extVotesKEl) extVotesKEl.innerText = `${formatNumber(Math.round(extK_current))} votos (${(extPcts.pK * 100).toFixed(2)}%)`;
    if (extVotesREl) extVotesREl.innerText = `${formatNumber(Math.round(extR_current))} votos (${(extPcts.pR * 100).toFixed(2)}%)`;

    if (peruBadgeEl) peruBadgeEl.innerText = `${formatNumber(remPeru)} votos restantes`;
    if (peruVotesKEl) peruVotesKEl.innerText = `${formatNumber(pendingPeruK)} votos (${pctPendingPeruK.toFixed(2)}%)`;
    if (peruVotesREl) peruVotesREl.innerText = `${formatNumber(pendingPeruR)} votos (${pctPendingPeruR.toFixed(2)}%)`;

    // Asignar al DOM - Bloque 1: ¿Qué falta contar?
    document.getElementById('reg-pending-votes-val').innerText = formatNumber(remainingVotes);
    const pctRemainingTotal = estTotalValidVotes > 0 ? (remainingVotes / estTotalValidVotes * 100) : 0;
    document.getElementById('reg-pending-pct-val').innerText = `${pctRemainingTotal.toFixed(1)}%`;
    document.getElementById('reg-pending-ext-val').innerText = `${formatNumber(remExt)} votos`;
    document.getElementById('reg-pending-lim-val').innerText = `${formatNumber(remLim)} votos`;
    document.getElementById('reg-pending-lor-val').innerText = `${formatNumber(remLor)} votos`;

    // Bloque 2: Impacto neto por región (Barras)
    document.getElementById('reg-impact-ext-k').innerText = `+${formatNumber(extNetK)}`;
    document.getElementById('reg-impact-lim-k').innerText = `+${formatNumber(limNetK)}`;
    document.getElementById('reg-impact-lor-k').innerText = `+${formatNumber(lorNetK)}`;
    document.getElementById('reg-impact-cus-r').innerText = `+${formatNumber(cusNetR)}`;
    document.getElementById('reg-impact-aya-r').innerText = `+${formatNumber(ayaNetR)}`;
    document.getElementById('reg-impact-ama-r').innerText = `+${formatNumber(amaNetR)}`;

    // Ancho proporcional de barras de impacto
    const maxImpact = Math.max(1, extNetK, limNetK, lorNetK, cusNetR, ayaNetR, amaNetR);
    document.getElementById('reg-bar-ext-k').style.width = `${(extNetK / maxImpact * 100).toFixed(1)}%`;
    document.getElementById('reg-bar-lim-k').style.width = `${(limNetK / maxImpact * 100).toFixed(1)}%`;
    document.getElementById('reg-bar-lor-k').style.width = `${(lorNetK / maxImpact * 100).toFixed(1)}%`;
    document.getElementById('reg-bar-cus-r').style.width = `${(cusNetR / maxImpact * 100).toFixed(1)}%`;
    document.getElementById('reg-bar-aya-r').style.width = `${(ayaNetR / maxImpact * 100).toFixed(1)}%`;
    document.getElementById('reg-bar-ama-r').style.width = `${(amaNetR / maxImpact * 100).toFixed(1)}%`;

    // Asignar los desgloses de porcentajes y votos por candidato (Sincerado para Lima)
    const pctLimK_calc = limK / (limK + limR || 1) * 100;
    const pctLimR_calc = 100 - pctLimK_calc;

    document.getElementById('reg-details-ext-k').innerHTML = `<span>Keiko: <strong>${(extPcts.pK*100).toFixed(1)}%</strong> (${formatNumber(extK)})</span> <span>Roberto: <strong>${(extPcts.pR*100).toFixed(1)}%</strong> (${formatNumber(extR)})</span>`;
    document.getElementById('reg-details-lim-k').innerHTML = `<span>Keiko: <strong>${pctLimK_calc.toFixed(1)}%</strong> (${formatNumber(limK)})</span> <span>Roberto: <strong>${pctLimR_calc.toFixed(1)}%</strong> (${formatNumber(limR)})</span>`;
    document.getElementById('reg-details-lor-k').innerHTML = `<span>Keiko: <strong>${(lorPcts.pK*100).toFixed(1)}%</strong> (${formatNumber(lorK)})</span> <span>Roberto: <strong>${(lorPcts.pR*100).toFixed(1)}%</strong> (${formatNumber(lorR)})</span>`;
    document.getElementById('reg-details-cus-r').innerHTML = `<span>Keiko: <strong>${(cusPcts.pK*100).toFixed(1)}%</strong> (${formatNumber(cusK)})</span> <span>Roberto: <strong>${(cusPcts.pR*100).toFixed(1)}%</strong> (${formatNumber(cusR)})</span>`;
    document.getElementById('reg-details-aya-r').innerHTML = `<span>Keiko: <strong>${(ayaPcts.pK*100).toFixed(1)}%</strong> (${formatNumber(ayaK)})</span> <span>Roberto: <strong>${(ayaPcts.pR*100).toFixed(1)}%</strong> (${formatNumber(ayaR)})</span>`;
    document.getElementById('reg-details-ama-r').innerHTML = `<span>Keiko: <strong>${(amaPcts.pK*100).toFixed(1)}%</strong> (${formatNumber(amaK)})</span> <span>Roberto: <strong>${(amaPcts.pR*100).toFixed(1)}%</strong> (${formatNumber(amaR)})</span>`;

    // Bloque 3: Balance y Proyección Final
    document.getElementById('reg-balance-k').innerText = `+${formatNumber(totPendingK)}`;
    document.getElementById('reg-balance-r').innerText = `+${formatNumber(totPendingR)}`;
    
    const balanceNetValEl = document.getElementById('reg-balance-net');
    const balanceWinnerBadge = document.getElementById('reg-balance-winner');
    
    if (netPendingDiff > 0) {
      balanceNetValEl.innerText = `+${formatNumber(Math.abs(netPendingDiff))} (Keiko)`;
      balanceWinnerBadge.innerText = 'Keiko lidera pendientes';
      balanceWinnerBadge.className = 'balance-winner-badge k-win';
    } else if (netPendingDiff < 0) {
      balanceNetValEl.innerText = `+${formatNumber(Math.abs(netPendingDiff))} (Roberto)`;
      balanceWinnerBadge.innerText = 'Roberto lidera pendientes';
      balanceWinnerBadge.className = 'balance-winner-badge r-win';
    } else {
      balanceNetValEl.innerText = 'Empate neto';
      balanceWinnerBadge.innerText = 'Empate en pendientes';
      balanceWinnerBadge.className = 'balance-winner-badge';
    }

    document.getElementById('reg-final-votes-k').innerText = `${formatNumber(finalVotesK)} votos`;
    document.getElementById('reg-final-pct-k').innerText = `${finalPctK.toFixed(2)}%`;
    document.getElementById('reg-final-votes-r').innerText = `${formatNumber(finalVotesR)} votos`;
    document.getElementById('reg-final-pct-r').innerText = `${finalPctR.toFixed(2)}%`;

    const finalDiffVal = Math.abs(finalVotesK - finalVotesR);
    const finalDiffWinner = finalVotesK > finalVotesR ? 'Keiko Fujimori' : 'Roberto Sánchez';
    const finalDiffClass = finalVotesK > finalVotesR ? 'c1-text' : 'c2-text';
    document.getElementById('reg-final-diff-val').innerHTML = `Diferencia Proyectada: <strong class="${finalDiffClass}">+${formatNumber(finalDiffVal)} votos</strong> a favor de ${finalDiffWinner}`;

    // Resumen de texto en footer
    const currentLeaderName = diff > 0 ? 'Keiko' : 'Roberto';
    const pendingLeaderName = netPendingDiff > 0 ? 'Keiko Fujimori' : 'Roberto Sánchez';
    const finalWinnerName = finalVotesK > finalVotesR ? 'Keiko Fujimori' : 'Roberto Sánchez';
    const finalLeadMargin = Math.abs(finalVotesK - finalVotesR);

    document.getElementById('reg-summary-text').innerHTML = `Aunque hoy <strong>${currentLeaderName}</strong> lidera por <strong>${formatNumber(diffAbs)}</strong> votos, las actas pendientes —especialmente del extranjero, Lima y Loreto— proyectan una ventaja neta de <strong>${formatNumber(Math.abs(netPendingDiff))}</strong> votos para <strong>${pendingLeaderName}</strong>. Esto resultaría en una ventaja final para <strong>${finalWinnerName}</strong> de aproximadamente <strong>${formatNumber(finalLeadMargin)}</strong> votos (<strong>${(finalLeadMargin / finalTotal * 100).toFixed(2)}%</strong> del total) al 100% de actas escrutadas.`;

  } catch (err) {
    console.error('Error al cargar datos del último registro:', err);
  }
}

// Cargar historial y dibujar la tabla e iniciar el gráfico
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    
    window.lastHistoryData = history;
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
      
      const tooltipKeikoHtml = `
        <span class="tooltip-content" style="min-width: 140px; text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
            <img src="https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/10001088.png" style="width: 65px; height: 81px; object-fit: contain; background: #fff; border-radius: 6px; border: 1.5px solid #ff6c00;">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <span style="font-weight: bold; color: #ff6c00; font-size: 0.85rem;">KEIKO</span>
              <span style="color: #fff; font-size: 0.9rem; font-weight: 600;">${row.candidato1_pct.toFixed(3)}%</span>
              <span style="color: var(--text-muted); font-size: 0.75rem;">${formatNumber(row.candidato1_votos)} votos</span>
            </div>
          </div>
        </span>
      `;

      const tooltipRobertoHtml = `
        <span class="tooltip-content" style="min-width: 140px; text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
            <img src="https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/16002918.png" style="width: 65px; height: 81px; object-fit: contain; background: #fff; border-radius: 6px; border: 1.5px solid #00c2a0;">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <span style="font-weight: bold; color: #00c2a0; font-size: 0.85rem;">ROBERTO</span>
              <span style="color: #fff; font-size: 0.9rem; font-weight: 600;">${row.candidato2_pct.toFixed(3)}%</span>
              <span style="color: var(--text-muted); font-size: 0.75rem;">${formatNumber(row.candidato2_votos)} votos</span>
            </div>
          </div>
        </span>
      `;

      let winnerBadge = '';
      if (diff > 0) {
        winnerBadge = `
          <span class="badge badge-c1 tooltip-trigger">
            ${row.candidato1_nombre ? row.candidato1_nombre.split(' ')[0] : 'Keiko'}
            ${tooltipKeikoHtml}
          </span>`;
      } else if (diff < 0) {
        winnerBadge = `
          <span class="badge badge-c2 tooltip-trigger">
            ${row.candidato2_nombre ? row.candidato2_nombre.split(' ')[0] : 'Roberto'}
            ${tooltipRobertoHtml}
          </span>`;
      } else {
        winnerBadge = `<span class="badge">Empate</span>`;
      }
      
      tr.innerHTML = `
        <td>${localTime}</td>
        <td>${onpeTime}</td>
        <td><strong>${row.actas_contabilizadas_pct.toFixed(3)}%</strong> (${formatNumber(row.actas_contabilizadas)})</td>
        <td class="tooltip-trigger" style="color: var(--color-c1); font-weight:600;">
          ${row.candidato1_pct.toFixed(3)}% <span style="font-size:0.75rem; color:var(--text-muted)">(${formatNumber(row.candidato1_votos)})</span>
          ${tooltipKeikoHtml}
        </td>
        <td class="tooltip-trigger" style="color: var(--color-c2); font-weight:600;">
          ${row.candidato2_pct.toFixed(3)}% <span style="font-size:0.75rem; color:var(--text-muted)">(${formatNumber(row.candidato2_votos)})</span>
          ${tooltipRobertoHtml}
        </td>
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
  const themeCols = getChartThemeColors();
  
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
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false // Ocultamos la leyenda para simplificar
        },
        tooltip: {
          enabled: false,
          external: getCustomHtmlTooltip
        }
      },
      scales: {
        x: {
          grid: {
            color: themeCols.gridColor,
            borderColor: themeCols.borderColor
          },
          ticks: {
            color: themeCols.textColor,
            font: {
              family: 'Poppins',
              size: 12
            }
          }
        },
        y: {
          grid: {
            color: themeCols.gridColor,
            borderColor: themeCols.borderColor
          },
          ticks: {
            color: themeCols.textColor,
            font: {
              family: 'Poppins',
              size: 12
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
  let finalDiff = m * 100 + c;
  let projC1Pct = m1 * 100 + c1_int;
  let projC2Pct = m2 * 100 + c2_int;
  
  // Sincerar con la proyección geográfica (regional)
  if (window.geographicalProjection) {
    projC1Pct = window.geographicalProjection.finalPctK;
    projC2Pct = window.geographicalProjection.finalPctR;
    finalDiff = window.geographicalProjection.finalVotesK - window.geographicalProjection.finalVotesR;
  } else {
    // Normalizar para que sumen 100%
    const sumProj = projC1Pct + projC2Pct;
    if (sumProj > 0) {
      projC1Pct = (projC1Pct / sumProj) * 100;
      projC2Pct = (projC2Pct / sumProj) * 100;
    }
  }
  
  const finalDiffAbs = Math.abs(finalDiff);
  
  // Rellenar diferencia final y ganador proyectado
  finalDiffEl.innerText = `${formatNumber(Math.round(finalDiffAbs))} votos`;
  finalPctsEl.innerHTML = `Keiko: <span style="color: var(--color-c1); font-weight:700;">${projC1Pct.toFixed(3)}%</span> | Roberto: <span style="color: var(--color-c2); font-weight:700;">${projC2Pct.toFixed(3)}%</span>`;
  
  const projLeaderFaceContainer = document.getElementById('projection-leader-face-container');
  const projLeaderFaceImg = document.getElementById('projection-leader-face');
  
  if (finalDiff > 0) {
    finalWinnerEl.innerText = `Ventaja para Keiko (proyectado)`;
    finalWinnerEl.className = 'metric-percentage pct-c1';
    if (projLeaderFaceContainer && projLeaderFaceImg) {
      projLeaderFaceContainer.style.display = 'flex';
      projLeaderFaceImg.src = 'https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/10001088.png';
      projLeaderFaceImg.style.borderColor = 'var(--color-c1)';
    }
  } else if (finalDiff < 0) {
    finalWinnerEl.innerText = `Ventaja para Roberto (proyectado)`;
    finalWinnerEl.className = 'metric-percentage pct-c2';
    if (projLeaderFaceContainer && projLeaderFaceImg) {
      projLeaderFaceContainer.style.display = 'flex';
      projLeaderFaceImg.src = 'https://resultadosegundavuelta.onpe.gob.pe/assets/img-reales/candidatos/16002918.png';
      projLeaderFaceImg.style.borderColor = 'var(--color-c2)';
    }
  } else {
    finalWinnerEl.innerText = 'Empate absoluto proyectado';
    finalWinnerEl.className = 'metric-percentage';
    if (projLeaderFaceContainer) {
      projLeaderFaceContainer.style.display = 'none';
    }
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
  const themeCols = getChartThemeColors();
  
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
  
  
  
  // Generar datos reales para graficar (como objetos {x, y})
  const actualK = [];
  const actualR = [];
  history.forEach(row => {
    actualK.push({ x: row.actas_contabilizadas_pct, y: row.candidato1_pct });
    actualR.push({ x: row.actas_contabilizadas_pct, y: row.candidato2_pct });
  });

  const startValK = actualK.length > 0 ? actualK[actualK.length - 1].y : currentPct;
  const startValR = actualR.length > 0 ? actualR[actualR.length - 1].y : 100 - currentPct;
  
  let endValK = m1 * 100 + c1;
  let endValR = m2 * 100 + c2;
  
  if (window.geographicalProjection) {
    endValK = window.geographicalProjection.finalPctK;
    endValR = window.geographicalProjection.finalPctR;
  } else {
    const totalEnd = endValK + endValR;
    if (totalEnd > 0) {
      endValK = (endValK / totalEnd) * 100;
      endValR = (endValR / totalEnd) * 100;
    }
  }

  // Si cruza por 50% entre el porcentaje actual y el 100%
  let tiePct = null;
  const diffStart = startValK - startValR;
  const diffEnd = endValK - endValR;
  if (diffStart * diffEnd < 0) {
    if (Math.abs(endValK - startValK) > 0.00001) {
      const factor = (50 - startValK) / (endValK - startValK);
      tiePct = currentPct + factor * (100 - currentPct);
    }
  }
  
  // Generar datos proyectados (desde el actualPct hasta 100%)
  const projK = [];
  const projR = [];
  
  // Empezar en el último punto real para continuidad
  projK.push({ x: currentPct, y: startValK });
  projR.push({ x: currentPct, y: startValR });
  
  // Agregar puntos intermedios interpolando linealmente
  const startPct = Math.ceil(currentPct);
  const pctRange = 100 - currentPct;
  for (let pct = startPct; pct <= 100; pct++) {
    let y1, y2;
    if (pctRange > 0) {
      const factor = (pct - currentPct) / pctRange;
      y1 = startValK + factor * (endValK - startValK);
      y2 = startValR + factor * (endValR - startValR);
    } else {
      y1 = endValK;
      y2 = endValR;
    }
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
  
  // Definición del plugin para dibujar globos de texto personalizados en canvas
  const customBalloonsPlugin = {
    id: 'customBalloons',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { top, bottom }, scales: { x, y } } = chart;
      ctx.save();
      const isMobile = window.innerWidth < 768;

      // Auxiliar: Dibujar rectángulos con bordes redondeados
      function roundRect(ctx, rx, ry, w, h, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + w - radius, ry);
        ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + radius);
        ctx.lineTo(rx + w, ry + h - radius);
        ctx.quadraticCurveTo(rx + w, ry + h, rx + w - radius, ry + h);
        ctx.lineTo(rx + radius, ry + h);
        ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
      }

      // Auxiliar: Dibujar pequeñas etiquetas de porcentaje junto a los puntos con miniatura del rostro
      function drawTextBadgeWithFace(ctx, bx, by, text, color, img, alignLeft = false) {
        ctx.font = 'bold 13px Poppins';
        const textWidth = ctx.measureText(text).width;
        const imgSize = 20; // Tamaño de la miniatura
        const padding = 6;
        const w = textWidth + imgSize + padding * 3;
        const h = 26;
        let startX = alignLeft ? bx : bx - w / 2;
        // Limitar coordenadas de la etiqueta dentro del área de la gráfica
        startX = Math.max(chart.chartArea.left + 5, Math.min(chart.chartArea.right - w - 5, startX));
        
        ctx.fillStyle = color;
        roundRect(ctx, startX, by - h/2, w, h, 5, true, false);
        
        // Dibujar rostro circular si la imagen está cargada
        if (img && img.complete && img.naturalWidth !== 0) {
          ctx.save();
          ctx.beginPath();
          const imgX = startX + padding;
          const imgY = by - imgSize / 2;
          ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
          ctx.restore();
        }
        
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(text, startX + padding * 2 + imgSize, by + 5.5);
      }

      // 1. DIBUJAR LÍNEA VERTICAL Y GLOBO PARA "ACTUAL"
      const actualXPixel = x.getPixelForValue(currentPct);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'; // Celeste semitransparente
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(actualXPixel, top);
      ctx.lineTo(actualXPixel, bottom);
      ctx.stroke();
      ctx.setLineDash([]); // Resetear patrón
      
      if (!isMobile) {
        // Globo "ACTUAL" arriba (dibujado adentro de la gráfica)
        ctx.fillStyle = '#0284c7';
        const actW = 140;
        const actH = 55;
        const actY = top + 15;
        
        // Limitar el globo dentro de la gráfica
        let actLeft = actualXPixel - actW / 2;
        actLeft = Math.max(chart.chartArea.left + 5, Math.min(chart.chartArea.right - actW - 5, actLeft));
        const actCenterX = actLeft + actW / 2;
        
        roundRect(ctx, actLeft, actY, actW, actH, 6, true, false);
        
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px Poppins';
        ctx.fillText('ACTUAL', actCenterX, actY + 15);
        ctx.font = 'bold 16px Poppins';
        ctx.fillText(`${currentPct.toFixed(3)}%`, actCenterX, actY + 33);
        ctx.font = 'normal 9.5px Poppins';
        ctx.fillText('actas contabilizadas', actCenterX, actY + 47);
      }

      // 2. DIBUJAR LÍNEA VERTICAL Y GLOBO PARA "PROYECCIÓN FINAL"
      const finalXPixel = x.getPixelForValue(100);
      ctx.strokeStyle = 'rgba(14, 159, 110, 0.45)'; // Verde semitransparente
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(finalXPixel, top);
      ctx.lineTo(finalXPixel, bottom);
      ctx.stroke();
      ctx.setLineDash([]); // Reset
      
      if (!isMobile) {
        // Globo "PROYECCIÓN FINAL" abajo (dibujado adentro de la gráfica)
        ctx.fillStyle = '#1e3a8a';
        const projW = 140;
        const projH = 55;
        const projY = bottom - 70;
        
        // Limitar el globo dentro de la gráfica
        let projLeft = finalXPixel - projW / 2;
        projLeft = Math.max(chart.chartArea.left + 5, Math.min(chart.chartArea.right - projW - 5, projLeft));
        const projCenterX = projLeft + projW / 2;
        
        roundRect(ctx, projLeft, projY, projW, projH, 6, true, false);
        
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px Poppins';
        ctx.fillText('PROYECCIÓN FINAL', projCenterX, projY + 15);
        ctx.font = 'bold 16px Poppins';
        ctx.fillText('100%', projCenterX, projY + 33);
        ctx.font = 'normal 9.5px Poppins';
        ctx.fillText('actas contabilizadas', projCenterX, projY + 47);
      }

      // 3. DIBUJAR GLOBO DEL PUNTO DE QUIEBRE
      if (!isMobile && tiePct !== null && tiePct > currentPct && tiePct <= 100) {
        const breakX = x.getPixelForValue(tiePct);
        const breakY = y.getPixelForValue(50.00);
        const isLight = document.body.classList.contains('light-theme');
        
        // Dibujar línea vertical de punto de quiebre
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(breakX, top);
        ctx.lineTo(breakX, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = isLight ? '#ffffff' : '#151824'; // Fondo adaptativo
        ctx.strokeStyle = '#a855f7'; // Borde púrpura
        ctx.lineWidth = 1.5;
        
        const txt1 = 'PUNTO DE QUIEBRE';
        const txt2 = `Cruce estimado: ${tiePct.toFixed(2)}%`;
        const txt3 = 'Ambos: 50.00%';
        
        ctx.font = 'bold 10px Poppins';
        const w1 = ctx.measureText(txt1).width;
        ctx.font = 'normal 10px Poppins';
        const w2 = ctx.measureText(txt2).width;
        const w3 = ctx.measureText(txt3).width;
        const width = Math.max(w1, w2, w3) + 16;
        const height = 52;
        
        let rectX = breakX - width / 2;
        rectX = Math.max(chart.chartArea.left + 5, Math.min(chart.chartArea.right - width - 5, rectX));
        const breakCenterX = rectX + width / 2;
        const rectY = top + 10; // Posición fija en la parte superior del gráfico
        
        roundRect(ctx, rectX, rectY, width, height, 6, true, true);
        
        // Flechita apuntadora
        ctx.beginPath();
        ctx.moveTo(breakX - 6, rectY + height);
        ctx.lineTo(breakX, rectY + height + 6);
        ctx.lineTo(breakX + 6, rectY + height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Dibujar textos dentro del globo
        ctx.fillStyle = isLight ? '#0f2b5c' : '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 10px Poppins';
        ctx.fillText(txt1, breakCenterX, rectY + 15);
        ctx.font = 'normal 9.5px Poppins';
        ctx.fillText(txt2, breakCenterX, rectY + 30);
        ctx.fillText(txt3, breakCenterX, rectY + 44);
      }

      // 4. DIBUJAR VALORES EN LOS PUNTOS ACTUALES
      if (!isMobile && actualK.length > 0 && actualR.length > 0) {
        const ptK = actualK[actualK.length - 1];
        const ptR = actualR[actualR.length - 1];
        
        const pixelXK = x.getPixelForValue(ptK.x);
        const pixelYK = y.getPixelForValue(ptK.y);
        const pixelXR = x.getPixelForValue(ptR.x);
        const pixelYR = y.getPixelForValue(ptR.y);
        
        const isKGreaterActual = ptK.y >= ptR.y;
        const offsetKActual = isKGreaterActual ? -14 : 14;
        const offsetRActual = isKGreaterActual ? 14 : -14;
        
        // Keiko actual (arriba/abajo dinámicamente)
        drawTextBadgeWithFace(ctx, pixelXK - 50, pixelYK + offsetKActual, `K ${ptK.y.toFixed(3)}%`, '#ea580c', imgKeiko);
        // Roberto actual (arriba/abajo dinámicamente)
        drawTextBadgeWithFace(ctx, pixelXR - 50, pixelYR + offsetRActual, `JP ${ptR.y.toFixed(3)}%`, '#0e9f6e', imgRoberto);
      }

      // 5. DIBUJAR VALORES AL FINAL DE LA PROYECCIÓN (100%)
      if (!isMobile && projK.length > 0 && projR.length > 0) {
        const ptK = projK[projK.length - 1];
        const ptR = projR[projR.length - 1];
        
        const pixelXK = x.getPixelForValue(ptK.x);
        const pixelYK = y.getPixelForValue(ptK.y);
        const pixelXR = x.getPixelForValue(ptR.x);
        const pixelYR = y.getPixelForValue(ptR.y);
        
        const isKGreaterProj = ptK.y >= ptR.y;
        const offsetKProj = isKGreaterProj ? -14 : 14;
        const offsetRProj = isKGreaterProj ? 14 : -14;
        
        // Keiko final
        drawTextBadgeWithFace(ctx, pixelXK - 50, pixelYK + offsetKProj, `K ${ptK.y.toFixed(2)}%`, '#ea580c', imgKeiko);
        // Roberto final
        drawTextBadgeWithFace(ctx, pixelXR - 50, pixelYR + offsetRProj, `JP ${ptR.y.toFixed(2)}%`, '#0e9f6e', imgRoberto);
      }

      ctx.restore();
    }
  };

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
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
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
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
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
          pointRadius: 7,
          pointHoverRadius: 9,
          pointStyle: 'circle',
          showLine: false,
          fill: false
        }
      ]
    },
    plugins: [customBalloonsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      layout: {
        padding: {
          top: 38,
          right: 32 // espacio para que las etiquetas finales del 100% no se salgan
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: themeCols.textColor,
            font: { family: 'Poppins', size: 11 }
          }
        },
        tooltip: {
          enabled: false,
          external: getCustomHtmlTooltip
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 93.5,
          max: 100,
          grid: {
            color: themeCols.gridColor,
            borderColor: themeCols.borderColor
          },
          ticks: {
            color: themeCols.textColor,
            font: { family: 'Poppins', size: 12 },
            callback: function(value) {
              return `${value}%`;
            }
          },
          title: {
            display: true,
            text: '% de Actas Contabilizadas',
            color: themeCols.textColor,
            font: { family: 'Poppins', size: 13 }
          }
        },
        y: {
          min: 45,
          max: 55,
          grid: {
            color: themeCols.gridColor,
            borderColor: themeCols.borderColor
          },
          ticks: {
            color: themeCols.textColor,
            font: { family: 'Poppins', size: 12 },
            callback: function(value) {
              return `${value}%`;
            }
          },
          title: {
            display: true,
            text: '% de Votos Válidos',
            color: themeCols.textColor,
            font: { family: 'Poppins', size: 13 }
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


// Configurar el modal de reporte manual (pegar texto)
function setupManualPaste() {
  const btnOpen = document.getElementById('btn-manual-paste');
  const btnClose = document.getElementById('btn-close-modal');
  const modal = document.getElementById('paste-modal');
  const textarea = document.getElementById('paste-textarea');
  const btnProcess = document.getElementById('btn-process-paste');

  if (!btnOpen || !modal) return;

  btnOpen.addEventListener('click', () => {
    textarea.value = '';
    modal.classList.remove('hidden');
    textarea.focus();
  });

  const closeModal = () => {
    modal.classList.add('hidden');
  };

  btnClose.addEventListener('click', closeModal);

  // Cerrar al hacer clic fuera del contenido del modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  btnProcess.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      alert('Por favor pega el texto copiado de la ONPE.');
      return;
    }

    try {
      btnProcess.disabled = true;
      btnProcess.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

      const res = await fetch('/api/parse-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });

      const result = await res.json();
      if (result.success) {
        alert(result.saved ? '¡Reporte procesado e ingresado con éxito!' : 'Reporte procesado. No hay cambios nuevos en comparación con el último registro.');
        closeModal();
        await loadLatest();
        await loadHistory();
      } else {
        alert('Error al procesar: ' + (result.error || 'Verifica el formato del texto'));
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al procesar el reporte manual.');
    } finally {
      btnProcess.disabled = false;
      btnProcess.innerHTML = '<i class="fa-solid fa-bolt"></i> Procesar Reporte';
    }
  });
}

// Helper to check if light theme is active
function isLightTheme() {
  return document.body.classList.contains('light-theme');
}

// Helper to get theme-dependent colors for Chart.js
function getChartThemeColors() {
  const light = isLightTheme();
  return {
    gridColor: light ? 'rgba(15, 43, 92, 0.08)' : 'rgba(255, 255, 255, 0.05)',
    borderColor: light ? 'rgba(15, 43, 92, 0.15)' : 'rgba(255, 255, 255, 0.1)',
    textColor: light ? '#0f2b5c' : '#8b949e',
    legendColor: light ? '#0f2b5c' : '#fff'
  };
}

// Setup Theme Toggle Button
function setupThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  
  // Load saved theme (default to light if not set)
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.remove('light-theme');
    btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
  } else {
    document.body.classList.add('light-theme');
    btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }
  
  btn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    
    if (isLight) {
      btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
    
    // Redraw charts if we have cached history data
    if (window.lastHistoryData) {
      renderChart(window.lastHistoryData);
      updateProjection(window.lastHistoryData);
    }
  });
}

