import { useState, useEffect } from 'react';
import useWarriorStore from '../store/useWarriorStore';

export default function Scanner() {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [finalStats, setFinalStats] = useState(null);
  const { saveWarrior, warriors } = useWarriorStore();

  const getNetworkData = () => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return null;

    const downlink = conn.downlink || 0;
    const rtt = conn.rtt || 0;
    const effectiveType = conn.effectiveType || 'unknown';
    const type = conn.type || 'unknown';
    const saveData = conn.saveData || false;

    // 基礎ステータス (Jobsによる補正前)
    const baseAtk = Math.max(10, Math.min(50, Math.round(downlink * 5)));
    const baseSpd = rtt > 0 ? Math.max(5, Math.min(30, Math.round(1000 / Math.max(10, rtt)))) : 10;
    
    // DEFの基礎値計算
    let baseDef = 10;
    if (type === 'wifi' || type === 'ethernet') {
      baseDef = 15; // 安定回線
    } else if (type === 'cellular' || effectiveType === '4g' || effectiveType === '3g') {
      baseDef = 5;  // 不安定回線
    }

    const hp = 500;
    const baseCrit = 5;
    const baseEvo = 5;

    return { baseAtk, baseSpd, baseDef, hp, baseCrit, baseEvo, downlink, rtt, effectiveType, type, saveData };
  };

  const calculateFinalStats = (netData, jobName) => {
    let atk = netData.baseAtk;
    let spd = netData.baseSpd;
    let def = netData.baseDef;
    let crit = netData.baseCrit;
    let evasion = netData.baseEvo;
    let synergyMsg = "";

    switch (jobName) {
      case 'ナイト':
        if (def >= 15) {
           atk = Math.round(atk * 1.2);
           def += 20;
           synergyMsg = "【SYNERGY(大環境適合)】: 安定した固定回線により、強固な防壁（シールドバッシュ）を獲得！";
        } else {
           atk = Math.round(atk * 0.8);
           synergyMsg = "【UNMATCH(環境不適合)】: 不安定な回線では重い盾を構えきれず、ステータスがダウンした…";
        }
        break;

      case 'アーチャー':
        // Pingが関係する
        if (spd >= 15) {
           crit = 60; // 低遅延なら高確率クリティカル
           spd = Math.round(spd * 1.3);
           synergyMsg = "【SYNERGY(大環境適合)】: ラグの無い回線により、精密な予測射撃（高会心）を獲得！";
        } else {
           crit = 30; // 逆に高Ping（ラグ）で予測不能なクリティカル
           synergyMsg = "【STABLE(ラグ利用)】: ラグにより矢の軌道が予測不能になり、変則的なクリティカルが発生！";
        }
        break;

      case 'メイジ':
        // ダウンリンク（ATK）特化
        if (atk >= 25) {
           atk = Math.round(atk * 1.5);
           def = Math.round(def * 0.5); // 防御は下がる
           synergyMsg = "【SYNERGY(大環境適合)】: 太い帯域限界まで魔力を込めた超火力（ファイアウォール）を獲得！";
        } else {
           atk = Math.round(atk * 1.2);
           synergyMsg = "【UNMATCH(環境不適合)】: 回線が細く、本来の魔力が発揮できない…";
        }
        break;

      case 'シーフ':
        // スピードと回避特化
        if (spd >= 20 || atk <= 15) {
           spd = Math.round(spd * 1.5);
           evasion = 40;
           synergyMsg = "【SYNERGY(大環境適合)】: パケットの隙間を縫う速度（大回避率）を獲得！";
        } else {
           evasion = 15;
           synergyMsg = "【STABLE(安定適合)】: 可もなく不可もない環境で、手堅く立ち回る。";
        }
        break;
      
      default:
        break;
    }

    return { atk, spd, def, crit, evasion, hp: netData.hp, job: jobName, synergyMsg };
  };

  const handleScan = () => {
    setIsScanning(true);
    setSelectedJob(null);
    setFinalStats(null);
    setTimeout(() => {
      setNetworkInfo(getNetworkData());
      setIsScanning(false);
    }, 500); // Fake delay for cyber effect
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
          <div className="loading" style={{ minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--neon-blue)' }}>[ SYSTEM ] Scanning network protocols...</span>
          </div>
        ) : networkInfo ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px', color: '#fff' }}>
              <div style={{ color: 'var(--neon-blue)', marginBottom: '5px' }}>[ NETWORK BASE STATS CAPTURED ]</div>
              
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
