import { useState, useEffect } from 'react';
import useWarriorStore from '../store/useWarriorStore';

export default function Scanner({ mode = 'solo', onArenaProceed }) {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [finalStats, setFinalStats] = useState(null);
  const { saveWarrior, warriors } = useWarriorStore();

  const measureRealNetworkStats = async () => {
    let downlink = 0;
    let rtt = 0;
    let type = 'unknown';

    try {
      // Cross-origin safe way to measure Ping and Download using Image loading
      const pingStart = performance.now();
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // Continue even if image is 404, we just need network RTT
        img.src = `https://www.google.com/favicon.ico?cacheBuster=${Date.now()}`;
      });
      const pingEnd = performance.now();
      rtt = Math.round(pingEnd - pingStart);

      // Measure Download Speed using a larger known payload (Wikipedia logo ~100KB as fallback instead of 1MB to ensure stability)
      const dlSize = 100000; // ~100KB payload
      const dlStart = performance.now();
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = `https://upload.wikimedia.org/wikipedia/commons/5/5f/Windows_logo_-_2012.svg?cacheBuster=${Date.now()}`;
      });
      const dlEnd = performance.now();

      const durationInSeconds = (dlEnd - dlStart) / 1000;
      const bitsLoaded = dlSize * 8;
      const speedBps = bitsLoaded / Math.max(0.1, durationInSeconds); // bps
      downlink = parseFloat((speedBps / (1024 * 1024)).toFixed(1)); // Mbps
      type = 'measured';

    } catch (err) {
      console.error("Speed test failed:", err);
      // Fallback if fetch fails (e.g. offline or blocked)
      downlink = parseFloat((Math.random() * 10 + 2).toFixed(1));
      rtt = Math.floor(Math.random() * 80 + 20);
      type = 'pseudo';
    }

    // 基礎ステータス (Jobsによる補正前)
    const baseAtk = Math.max(10, Math.min(50, Math.round(downlink * 5)));
    const baseSpd = rtt > 0 ? Math.max(5, Math.min(30, Math.round(1000 / Math.max(10, rtt)))) : 10;
    
    // DEFの基礎値計算: ダウンロード速度が遅いほど防御力が高い（最大30, 最小5）
    // ATKと反比例するように調整。10Mbpsで最低の5、理論値0Mbpsで最高の30。
    let baseDef = Math.max(5, Math.min(30, Math.round(30 - (downlink * 2.5))));
    const hp = 150; // Adjusted from 500 for faster battle pacing
    const baseCrit = 5;
    const baseEvo = 5;

    return { baseAtk, baseSpd, baseDef, hp, baseCrit, baseEvo, downlink, rtt, effectiveType: type, type, saveData: false, isFallback: type === 'pseudo' };
  };

  const calculateFinalStats = (netData, jobName) => {
    let atk = netData.baseAtk;
    let spd = netData.baseSpd;
    let def = netData.baseDef;
    let crit = netData.baseCrit;
    let evasion = netData.baseEvo;
    let hp = netData.hp;
    let synergyMsg = "";

    switch (jobName) {
      case 'ナイト':
        hp = Math.round(hp * 1.4);    // HP +40%
        def = Math.round(def * 2.0);   // DEF +100%
        atk = Math.max(1, Math.round(atk * 0.6)); // ATK -40%
        spd = Math.max(1, Math.round(spd * 0.8)); // SPD -20%
        synergyMsg = "【重装甲】 攻撃と速度を大きく犠牲にし、強固な硬さを手に入れた！";
        break;

      case 'アーチャー':
        crit += 50;                    // 会心率 +50%
        spd = Math.round(spd * 1.3);   // SPD +30%
        def = Math.max(1, Math.round(def * 0.6)); // DEF -40%
        synergyMsg = "【狙撃手】 防御を捨て、先制クリティカルにすべてを懸ける！";
        break;

      case 'メイジ':
        atk = Math.round(atk * 1.6);   // ATK +60%
        def = Math.max(1, Math.round(def * 0.3)); // DEF -70%
        spd = Math.max(1, Math.round(spd * 0.7)); // SPD -30%
        synergyMsg = "【超火力】 速さと装甲を削り、一撃必殺の魔力を引き出した！";
        break;

      case 'シーフ':
        spd = Math.round(spd * 1.8);   // SPD +80%
        evasion += 40;                 // 回避率 +40%
        atk = Math.max(1, Math.round(atk * 0.6)); // ATK -40%
        synergyMsg = "【スピードスター】 力のすべてをスピードに回し、絶対回避に特化！";
        break;
      
      default:
        break;
    }

    return { atk, spd, def, crit, evasion, hp, job: jobName, synergyMsg };
  };

  const [scanStatusMsg, setScanStatusMsg] = useState('');

  const handleScan = async () => {
    setIsScanning(true);
    setSelectedJob(null);
    setFinalStats(null);
    setScanStatusMsg('Measuring Ping (RTT)...');
    
    const result = await measureRealNetworkStats();
    
    setScanStatusMsg('Analyzing Download Speed...');
    // Add a tiny delay so the user can read the message (game feel)
    setTimeout(() => {
      setNetworkInfo(result);
      setIsScanning(false);
      setScanStatusMsg('');
    }, 800);
  };

  useEffect(() => {
    handleScan();
  }, []);

  const handleSelectJob = (jobName) => {
    setSelectedJob(jobName);
    const stats = calculateFinalStats(networkInfo, jobName);
    setFinalStats(stats);
  };

  const handleSave = () => {
    if (!networkInfo || !finalStats) return;
    
    // 保存データ形式に合わせてオブジェクトを構築
    const warriorToSave = {
      ...networkInfo,
      ...finalStats,
      stance: networkInfo.saveData ? '🛡️防御重視 (SaveData: ON)' : '⚔️攻撃重視 (SaveData: OFF)'
    };

    const result = saveWarrior(warriorToSave);
    if (!result.success) {
      alert(result.message);
    } else {
      alert(`記録完了！現在のロースター: ${warriors.length + 1} / 3`);
      handleScan(); // 続けてスキャンできるようにリセット
    }
  };

  return (
    <div className="status-panel">
      <div className="panel-header">
        <h2>NETWORK SCANNER</h2>
        <div className="scanline"></div>
      </div>

      <div className="status-grid">
        {isScanning ? (
          <div className="loading" style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--neon-blue)', marginBottom: '10px' }}>[ SYSTEM ] Executing active speed test...</span>
            <span style={{ color: 'var(--neon-yellow)' }}>{scanStatusMsg}</span>
          </div>
        ) : networkInfo ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px', color: '#fff' }}>
              <div style={{ color: networkInfo.isFallback ? 'var(--neon-yellow)' : 'var(--neon-blue)', marginBottom: '5px' }}>
                {networkInfo.isFallback ? '[ SPEED TEST FAILED - PSEUDO STATS GENERATED ]' : '[ REAL NETWORK STATS CAPTURED ]'}
              </div>
              {networkInfo.isFallback && (
                <div style={{ fontSize: '0.75rem', color: '#ffaa00', marginBottom: '10px' }}>
                  ※通信制限やエラーにより実測できなかったため、仮想データを生成しました。
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ border: '1px solid #ff3333', padding: '5px 10px' }}><span style={{fontSize:'0.7rem', color:'#ff3333'}}>ATK:</span> {networkInfo.baseAtk}</div>
                <div style={{ border: '1px solid #33ff33', padding: '5px 10px' }}><span style={{fontSize:'0.7rem', color:'#33ff33'}}>SPD:</span> {networkInfo.baseSpd}</div>
                <div style={{ border: '1px solid #33ccff', padding: '5px 10px' }}><span style={{fontSize:'0.7rem', color:'#33ccff'}}>DEF:</span> {networkInfo.baseDef}</div>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#888' }}>
                RAW: Type={networkInfo.effectiveType} | Downlink={networkInfo.downlink}Mbps | RTT={networkInfo.rtt}ms
              </div>
            </div>

            {!selectedJob ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--neon-yellow)', marginBottom: '15px' }}>
                  ＞＞＞ この素体にインストールする職業を選択せよ ＜＜＜
                </p>
                <div className="action-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '400px', margin: '0 auto' }}>
                  <button className="cyber-btn" style={{ padding: '10px 5px', fontSize: '0.9rem' }} onClick={() => handleSelectJob('ナイト')}>ナイト</button>
                  <button className="cyber-btn" style={{ padding: '10px 5px', fontSize: '0.9rem' }} onClick={() => handleSelectJob('アーチャー')}>アーチャー</button>
                  <button className="cyber-btn" style={{ padding: '10px 5px', fontSize: '0.9rem' }} onClick={() => handleSelectJob('メイジ')}>メイジ</button>
                  <button className="cyber-btn" style={{ padding: '10px 5px', fontSize: '0.9rem' }} onClick={() => handleSelectJob('シーフ')}>シーフ</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ textAlign: 'center', color: 'var(--neon-magenta)', marginBottom: '15px' }}>
                  ＞＞＞ インストール完了：{selectedJob} ＜＜＜
                </p>
                
                <div style={{ padding: '10px', border: '1px dashed var(--neon-blue)', marginBottom: '15px', color: '#fff', fontSize: '0.9rem' }}>
                  {finalStats.synergyMsg}
                </div>

                <div className="status-row atk">
                  <span className="status-label">HP (体力)</span>
                  <span className="status-value">{finalStats.hp}</span>
                </div>
                <div className="status-row atk">
                  <span className="status-label">ATK (攻撃力)</span>
                  <span className="status-value">{finalStats.atk}</span>
                </div>
                <div className="status-row spd">
                  <span className="status-label">SPD (素早さ)</span>
                  <span className="status-value">{finalStats.spd}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">DEF (防御)</span>
                  <span className="status-value">{finalStats.def}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">EVA (回避率)</span>
                  <span className="status-value">{finalStats.evasion}%</span>
                </div>
                <div className="status-row">
                  <span className="status-label">CRT (会心率)</span>
                  <span className="status-value">{finalStats.crit}%</span>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={() => setSelectedJob(null)} className="cyber-btn" style={{ flex: 1, borderColor: '#555', color: '#aaa' }}>
                    選び直す
                  </button>
                  {mode === 'solo' ? (
                    <button 
                      onClick={handleSave} 
                      className="cyber-btn" 
                      style={{ 
                        flex: 2,
                        borderColor: 'var(--neon-blue)', 
                        color: 'var(--neon-blue)',
                        opacity: warriors.length >= 3 ? 0.5 : 1,
                        cursor: warriors.length >= 3 ? 'not-allowed' : 'pointer'
                      }}
                      disabled={warriors.length >= 3}
                    >
                      {warriors.length >= 3 ? 'ROSTER FULL (MAX 3)' : 'SAVE WARRIOR (記録)'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        const warrior = { ...networkInfo, ...finalStats, id: 'arena_warrior_' + Date.now() };
                        if (onArenaProceed) onArenaProceed(warrior);
                      }} 
                      className="cyber-btn" 
                      style={{ 
                        flex: 2,
                        borderColor: '#ff3333', 
                        color: '#ff3333'
                      }}
                    >
                      ENTER MATCHMAKING (直通アリーナへ)
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="error-msg">ERROR: Network Information API is not supported on this browser.</div>
        )}
      </div>

      {!isScanning && !selectedJob && (
        <button onClick={handleScan} className="cyber-btn" style={{ marginTop: '20px', borderColor: '#555', color: '#aaa' }}>
          RE-SCAN CONNECTION (再計測)
        </button>
      )}
    </div>
  );
}
