document.addEventListener('DOMContentLoaded', () => {
    const statusGrid = document.getElementById('status-grid');
    const rawData = document.getElementById('raw-data');
    const refreshBtn = document.getElementById('refresh-btn');

    function updateStatus() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (!conn) {
            statusGrid.innerHTML = '<div class="error-msg">ERROR: このブラウザは Network Information API をサポートしていません。</div>';
            return;
        }

        // 値の取得
        const downlink = conn.downlink || 0; // Mbps
        const rtt = conn.rtt || 0; // ms
        const effectiveType = conn.effectiveType || 'unknown';
        const type = conn.type || 'unknown';
        const saveData = conn.saveData || false;

        // --- ステータス計算 ---
        
        // ATK = downlink * 10
        const atk = Math.round(downlink * 10);
        
        // SPD = 1000 / rtt (0割りを防ぐ)
        let spd = 0;
        if (rtt > 0) {
            spd = Math.round(1000 / rtt);
        } else {
            spd = 999; // 測定不能なほど速い場合
        }

        // 職業・属性 (Job / Element)
        let job = '❓不明な放浪者';
        if (type === 'wifi' || effectiveType === 'wifi') {
            job = '💎光の魔術師 (WiFi)';
        } else if (effectiveType === '4g') {
            job = '⚡物理騎士 (4G)';
        } else if (effectiveType === '3g') {
            job = '🔥炎の戦士 (3G)';
        } else if (effectiveType === '2g' || effectiveType === 'slow-2g') {
            job = '🐌泥の歩兵 (2G)';
        } else if (type === 'ethernet') {
            job = '🔗鋼鉄の重騎士 (有線)';
        }

        // 構え (Stance)
        const stance = saveData ? '🛡️防御重視 (SaveData: ON)' : '⚔️攻撃重視 (SaveData: OFF)';

        // UIレンダリング
        statusGrid.innerHTML = `
            <div class="status-row atk">
                <span class="status-label">ATK (攻撃力)</span>
                <span class="status-value">${atk} <span style="font-size:0.8rem; color:#888;">(${downlink} Mbps)</span></span>
            </div>
            <div class="status-row spd">
                <span class="status-label">SPD (素早さ)</span>
                <span class="status-value">${spd} <span style="font-size:0.8rem; color:#888;">(RTT: ${rtt}ms)</span></span>
            </div>
            <div class="status-row job">
                <span class="status-label">JOB (職業)</span>
                <span class="status-value">${job}</span>
            </div>
            <div class="status-row stance">
                <span class="status-label">STANCE (構え)</span>
                <span class="status-value">${stance}</span>
            </div>
        `;

        // 生データの表示（デバッグ・把握用）
        rawData.innerHTML = `[Raw Data] downlink: ${downlink}, rtt: ${rtt}, effectiveType: "${effectiveType}", type: "${type}", saveData: ${saveData}`;
    }

    // 初回実行
    updateStatus();

    // 再スキャンボタンのアニメーションと更新
    refreshBtn.addEventListener('click', () => {
        statusGrid.innerHTML = '<div class="loading">Analyzing Network...</div>';
        setTimeout(updateStatus, 500); // 演出のための意図的なディレイ
    });

    // 回線状況が変わった時に自動更新（対応ブラウザのみ）
    if (navigator.connection) {
        navigator.connection.addEventListener('change', updateStatus);
    }
});
