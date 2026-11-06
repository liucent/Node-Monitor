const AUTH_KEY = "node_monitor_token";
const countryCache = {};
const speedHistory = {}; 
const chartExpandedState = {}; 
let pollingTimer = null;

async function getFlagHtml(ip) {
    if (!ip || ip === 'N/A') return '';
    if (countryCache[ip] !== undefined) return countryCache[ip];

    try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await res.json();
        if (data && data.country_code) {
            const code = data.country_code.toLowerCase();
            const flagHtml = `<img src="https://flagcdn.com/24x18/${code}.png" alt="${data.country_code}" class="inline-block w-4 h-3 rounded-[2px] shadow-sm shrink-0" title="${data.country_name || ''}">`;
            countryCache[ip] = flagHtml;
            return flagHtml;
        }
    } catch (e) {
        // 静默失败
    }
    countryCache[ip] = '';
    return '';
}

function checkAuth() {
    const token = localStorage.getItem(AUTH_KEY);
    if (!token) {
        document.getElementById('loginModal').classList.remove('hidden');
        return false;
    }
    return token;
}

async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('loginError');
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem(AUTH_KEY, data.token);
            document.getElementById('loginModal').classList.add('hidden');
            errorEl.classList.add('hidden');
            startPolling();
        } else {
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        errorEl.classList.remove('hidden');
    }
}

function logout() {
    if (pollingTimer) clearInterval(pollingTimer);
    localStorage.removeItem(AUTH_KEY);
    location.reload();
}

function startPolling() {
    fetchNodes();
    if (!pollingTimer) {
        pollingTimer = setInterval(fetchNodes, 3000);
    }
}

function toggleSpeedChart(nodeId) {
    chartExpandedState[nodeId] = !chartExpandedState[nodeId];
    fetchNodes();
}

function handleChartHover(evt, nodeId, maxPoints = 20) {
    const historyData = speedHistory[nodeId];
    if (!historyData || !historyData.up || historyData.up.length === 0) return;

    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const xOffset = clientX - rect.left;

    const width = 280;
    const height = 90;
    const padding = 10;

    const len = historyData.up.length;
    const step = (width - padding * 2) / Math.max(1, maxPoints - 1);

    let index = Math.round((xOffset - padding) / step);
    if (index < 0) index = 0;
    if (index >= len) index = len - 1;

    const upVal = historyData.up[index] || 0;
    const downVal = historyData.down[index] || 0;
    const maxVal = Math.max(1, ...historyData.up, ...historyData.down);

    const x = padding + index * step;
    const yUp = height - padding - (upVal / maxVal) * (height - padding * 2);
    const yDown = height - padding - (downVal / maxVal) * (height - padding * 2);

    const guideLine = document.getElementById(`guide-line-${nodeId}`);
    const dotUp = document.getElementById(`dot-up-${nodeId}`);
    const dotDown = document.getElementById(`dot-down-${nodeId}`);
    const tooltip = document.getElementById(`tooltip-${nodeId}`);
    const tooltipText = document.getElementById(`tooltip-text-${nodeId}`);

    if (guideLine && dotUp && dotDown && tooltip && tooltipText) {
        guideLine.setAttribute('x1', x);
        guideLine.setAttribute('x2', x);
        guideLine.classList.remove('hidden');

        dotUp.setAttribute('cx', x);
        dotUp.setAttribute('cy', yUp);
        dotUp.classList.remove('hidden');

        dotDown.setAttribute('cx', x);
        dotDown.setAttribute('cy', yDown);
        dotDown.classList.remove('hidden');

        tooltipText.innerHTML = `↑ ${upVal.toFixed(2)} MB/s &nbsp; ↓ ${downVal.toFixed(2)} MB/s`;
        tooltip.classList.remove('hidden');
    }
}

function handleChartLeave(nodeId) {
    const guideLine = document.getElementById(`guide-line-${nodeId}`);
    const dotUp = document.getElementById(`dot-up-${nodeId}`);
    const dotDown = document.getElementById(`dot-down-${nodeId}`);
    const tooltip = document.getElementById(`tooltip-${nodeId}`);

    if (guideLine) guideLine.classList.add('hidden');
    if (dotUp) dotUp.classList.add('hidden');
    if (dotDown) dotDown.classList.add('hidden');
    if (tooltip) tooltip.classList.add('hidden');
}

function generateSvgChart(nodeId, historyData, maxPoints = 20) {
    const upArr = historyData.up || [];
    const downArr = historyData.down || [];
    
    const width = 280;
    const height = 90;
    const padding = 10;

    if (upArr.length === 0) return '';

    const maxVal = Math.max(1, ...upArr, ...downArr);

    const getPoints = (arr) => {
        const step = (width - padding * 2) / Math.max(1, maxPoints - 1);
        return arr.map((val, idx) => {
            const x = padding + idx * step;
            const y = height - padding - (val / maxVal) * (height - padding * 2);
            return `${x},${y}`;
        });
    };

    const upPoints = getPoints(upArr);
    const downPoints = getPoints(downArr);

    const upPath = upPoints.length > 1 ? `M ${upPoints.join(' L ')}` : '';
    const downPath = downPoints.length > 1 ? `M ${downPoints.join(' L ')}` : '';

    return `
        <div class="relative w-full">
            <div id="tooltip-${nodeId}" class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-[#1f2937] text-[10px] font-mono px-2 py-0.5 rounded text-slate-200 shadow-md hidden pointer-events-none whitespace-nowrap z-10">
                <span id="tooltip-text-${nodeId}"></span>
            </div>

            <svg viewBox="0 0 ${width} ${height}" class="w-full h-24 overflow-visible cursor-crosshair"
                onmousemove="handleChartHover(event, '${nodeId}')"
                ontouchmove="handleChartHover(event, '${nodeId}')"
                onmouseleave="handleChartLeave('${nodeId}')"
                ontouchend="handleChartLeave('${nodeId}')">
                <line x1="${padding}" y1="${height/4}" x2="${width-padding}" y2="${height/4}" stroke="#1f2937" stroke-dasharray="2 2" stroke-width="1" />
                <line x1="${padding}" y1="${height/2}" x2="${width-padding}" y2="${height/2}" stroke="#1f2937" stroke-dasharray="2 2" stroke-width="1" />
                <line x1="${padding}" y1="${height*3/4}" x2="${width-padding}" y2="${height*3/4}" stroke="#1f2937" stroke-dasharray="2 2" stroke-width="1" />

                ${upPath ? `<path d="${upPath}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
                ${downPath ? `<path d="${downPath}" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

                <line id="guide-line-${nodeId}" x1="0" y1="${padding}" x2="0" y2="${height-padding}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2 2" class="hidden" />

                <circle id="dot-up-${nodeId}" r="3.5" fill="#10b981" stroke="#0b0f19" stroke-width="1.5" class="hidden" />
                <circle id="dot-down-${nodeId}" r="3.5" fill="#06b6d4" stroke="#0b0f19" stroke-width="1.5" class="hidden" />
            </svg>
        </div>
    `;
}

async function fetchNodes() {
    const token = checkAuth();
    if (!token) return;

    try {
        const res = await fetch('/api/nodes', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.status === 401) {
            logout();
            return;
        }

        let nodes = await res.json();
        
        if (nodes && nodes.length > 0) {
            nodes.sort((a, b) => {
                if (typeof a.id === 'number' && typeof b.id === 'number') {
                    return a.id - b.id;
                }
                return String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' });
            });

            const maxHistoryLen = 20;
            nodes.forEach(node => {
                const isOnline = node.uptime && node.uptime.toLowerCase() !== 'offline';
                const up = isOnline && node.netUpSpeed ? node.netUpSpeed : 0;
                const down = isOnline && node.netDownSpeed ? node.netDownSpeed : 0;

                if (!speedHistory[node.id]) {
                    speedHistory[node.id] = { up: [], down: [] };
                }
                
                speedHistory[node.id].up.push(up);
                speedHistory[node.id].down.push(down);

                if (speedHistory[node.id].up.length > maxHistoryLen) {
                    speedHistory[node.id].up.shift();
                    speedHistory[node.id].down.shift();
                }
            });

            await Promise.all(nodes.map(async (node) => {
                const targetIp = (node.ipv4 && node.ipv4 !== 'N/A') ? node.ipv4 : node.ipv6;
                node.flagHtml = await getFlagHtml(targetIp);
            }));
        }

        renderNodes(nodes);
    } catch (err) {
        console.error("Failed to fetch nodes:", err);
    }
}

function renderNodes(nodes) {
    const grid = document.getElementById('nodesGrid');
    if (!nodes || nodes.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-500 py-12">No active nodes reporting. Please deploy agents.</div>`;
        return;
    }

    grid.innerHTML = nodes.map(node => {
        const isOnline = node.uptime && node.uptime.toLowerCase() !== 'offline';

        const isV4Active = isOnline && Boolean(node.v4Status);
        const isV6Active = isOnline && (node.v6Status !== null && Boolean(node.v6Status));

        const cpuPercent = isOnline ? (node.cpuUsage ? node.cpuUsage.toFixed(1) : '0.0') : '0.0';
        const ramPercent = (isOnline && node.ramTotal > 0) ? ((node.ramUsed / node.ramTotal) * 100).toFixed(1) : 0;
        const diskPercent = (isOnline && node.diskTotal > 0) ? ((node.diskUsed / node.diskTotal) * 100).toFixed(1) : 0;

        const v4Badge = isV4Active
            ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>IPv4</span>`
            : `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>IPv4</span>`;

        const v6Badge = node.v6Status === null 
            ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-500 border border-slate-700 flex items-center gap-1 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-slate-600"></span>IPv6</span>`
            : isV6Active
                ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>IPv6</span>`
                : `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>IPv6</span>`;

        const cardOpacityClass = isOnline ? '' : 'opacity-60 grayscale-[30%]';
        const isExpanded = Boolean(chartExpandedState[node.id]);
        const svgChartHtml = generateSvgChart(node.id, speedHistory[node.id] || { up: [], down: [] });

        return `
            <div class="bg-[#111827] border border-[#1f2937] rounded-xl p-5 shadow-lg space-y-4 transition-all ${cardOpacityClass}">
                <div class="flex justify-between items-center h-7">
                    <h3 class="font-semibold text-lg text-white flex items-center gap-2 leading-none">
                        <svg class="w-4 h-4 ${isOnline ? 'text-emerald-400' : 'text-slate-500'} shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/></svg>
                        <span>${node.name}</span>
                    </h3>
                    <div class="flex items-center gap-1.5">
                        <span class="inline-flex items-center shrink-0 mr-0.5">${node.flagHtml || ''}</span>
                        ${v4Badge}${v6Badge}
                    </div>
                </div>

                <div class="bg-[#0b0f19]/60 border border-[#1f2937]/70 rounded-lg p-3 space-y-2 text-xs font-mono text-slate-300">
                    <div class="grid grid-cols-2 gap-2 pb-2 border-b border-[#1f2937]/50">
                        <div class="flex items-center gap-1.5 truncate">
                            <span class="text-slate-400 flex items-center gap-1 shrink-0">
                                <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                                v4:
                            </span>
                            <span class="truncate">${node.ipv4 || 'N/A'}</span>
                        </div>
                        <div class="flex items-center gap-1.5 truncate">
                            <span class="text-slate-400 flex items-center gap-1 shrink-0">
                                <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5a2.5 2.5 0 002.5-2.5V7a2 2 0 00-2-2h-1.5A2.5 2.5 0 0113 2.5V2"/></svg>
                                v6:
                            </span>
                            <span class="truncate" title="${node.ipv6 || 'N/A'}">${node.ipv6 || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 pt-0.5">
                        <div class="flex items-center gap-1.5 truncate">
                            <span class="text-slate-400 flex items-center gap-1 shrink-0">
                                <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                Uptime:
                            </span>
                            <span class="truncate">${node.uptime || 'Offline'}</span>
                        </div>
                        <div class="flex items-center gap-1.5 truncate">
                            <span class="text-slate-400 flex items-center gap-1 shrink-0">
                                <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"/></svg>
                                Load:
                            </span>
                            <span class="truncate">${isOnline && node.load ? node.load.join(', ') : '0, 0, 0'}</span>
                        </div>
                    </div>
                </div>

                <div class="bg-[#0b0f19]/60 border border-[#1f2937]/70 rounded-lg p-3 space-y-3 text-xs">
                    <div>
                        <div class="flex justify-between items-center text-slate-300 mb-1.5">
                            <span class="font-medium flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                                CPU Usage
                            </span>
                            <span class="font-mono">${node.cpuCores || 1} Cores (${cpuPercent}%)</span>
                        </div>
                        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div class="${isOnline ? 'bg-emerald-500' : 'bg-slate-600'} h-1.5 rounded-full" style="width: ${cpuPercent}%"></div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between items-center text-slate-300 mb-1.5">
                            <span class="font-medium flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                RAM Usage
                            </span>
                            <span class="font-mono">${isOnline ? (node.ramUsed ? node.ramUsed.toFixed(1) : '0') : 0} / ${node.ramTotal ? node.ramTotal.toFixed(1) : '0'} GB (${ramPercent}%)</span>
                        </div>
                        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div class="${isOnline ? 'bg-blue-500' : 'bg-slate-600'} h-1.5 rounded-full" style="width: ${ramPercent}%"></div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between items-center text-slate-300 mb-1.5">
                            <span class="font-medium flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>
                                Disk Usage
                            </span>
                            <span class="font-mono">${isOnline ? (node.diskUsed ? node.diskUsed.toFixed(1) : '0') : 0} / ${node.diskTotal ? node.diskTotal.toFixed(1) : '0'} GB (${diskPercent}%)</span>
                        </div>
                        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div class="${isOnline ? 'bg-indigo-500' : 'bg-slate-600'} h-1.5 rounded-full" style="width: ${diskPercent}%"></div>
                        </div>
                    </div>
                </div>

                <div class="bg-[#0b0f19]/60 border border-[#1f2937]/70 rounded-lg p-2.5 text-xs cursor-pointer hover:border-amber-500/40 transition-colors" onclick="toggleSpeedChart('${node.id}')" title="Toggle speed history chart">
                    <div class="flex justify-between items-center text-slate-400 text-[11px] font-medium mb-2">
                        <span class="flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            Real-time Speed
                        </span>
                        <span class="text-amber-400">
                            ${isExpanded 
                                ? '<svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>' 
                                : '<svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>'
                            }
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-2 mb-1">
                        <div class="bg-emerald-500/10 border border-emerald-500/20 rounded p-2 flex items-center justify-between">
                            <span class="text-emerald-400 text-[11px] flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                                Up
                            </span>
                            <span class="font-mono font-medium text-emerald-400">${isOnline && node.netUpSpeed ? node.netUpSpeed.toFixed(2) : '0.00'} MB/s</span>
                        </div>
                        <div class="bg-cyan-500/10 border border-cyan-500/20 rounded p-2 flex items-center justify-between">
                            <span class="text-cyan-400 text-[11px] flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                                Down
                            </span>
                            <span class="font-mono font-medium text-cyan-400">${isOnline && node.netDownSpeed ? node.netDownSpeed.toFixed(2) : '0.00'} MB/s</span>
                        </div>
                    </div>

                    <div class="transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-36 opacity-100 mt-3 pt-2 border-t border-[#1f2937]/60' : 'max-h-0 opacity-0'}" onclick="event.stopPropagation()">
                        <div class="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                            <span class="flex items-center gap-2"><span class="w-2 h-0.5 bg-emerald-500 inline-block"></span> Up</span>
                            <span class="flex items-center gap-2"><span class="w-2 h-0.5 bg-cyan-500 inline-block"></span> Down</span>
                        </div>
                        ${svgChartHtml}
                    </div>
                </div>

                <div class="flex justify-between text-xs text-slate-400 pt-2 border-t border-[#1f2937]/60">
                    <span class="flex items-center gap-1">
                        <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/></svg>
                        Sent: <strong class="text-slate-200 font-mono ml-0.5">${node.totalSent ? node.totalSent.toFixed(1) : '0.0'} GB</strong>
                    </span>
                    <span class="flex items-center gap-1">
                        <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/></svg>
                        Received: <strong class="text-slate-200 font-mono ml-0.5">${node.totalRecv ? node.totalRecv.toFixed(1) : '0.0'} GB</strong>
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

if (checkAuth()) {
    startPolling();
}