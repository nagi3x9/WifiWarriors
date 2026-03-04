import useWarriorStore from '../store/useWarriorStore';
import { Link } from 'react-router-dom';

export default function Roster() {
  const { warriors, deleteWarrior } = useWarriorStore();

  const getAvatarImage = (job) => {
    switch (job) {
      case 'ナイト': return '/avatars/knight.png';
      case 'アーチャー': return '/avatars/archer.png';
      case 'メイジ': return '/avatars/mage.png';
      case 'シーフ': return '/avatars/thief.png';
      default: return null;
    }
  };

  return (
    <div className="status-panel">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes floatAnim {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
          100% { transform: translateY(0px); }
        }
        .avatar-float {
          animation: floatAnim 2s infinite ease-in-out;
          height: 64px;
          width: auto;
          max-width: 80px;
          object-fit: contain;
          image-rendering: pixelated;
        }
      `}} />
      <div className="panel-header" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <h2>WARRIOR ROSTER ({warriors.length}/3)</h2>
          {warriors.length < 3 && (
            <Link to="/scanner" className="cyber-btn" style={{ padding: '5px 10px', fontSize: '0.9rem', margin: 0, textDecoration: 'none' }}>+ NEW SCAN</Link>
          )}
        </div>
        <div className="scanline" style={{ marginTop: '10px' }}></div>
      </div>
      
      <div className="status-grid" style={{ minHeight: '300px' }}>
        {warriors.length === 0 ? (
          <div className="loading" style={{ color: 'var(--neon-yellow)', display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              NO WARRIORS SAVED YET.<br/><br/>
              <span style={{ fontSize: '1rem', color: '#888' }}>スキャン画面から現在の回線を記録してください。</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {warriors.map((warrior, index) => (
              <div key={warrior.id} style={{ 
                border: '2px solid var(--neon-blue)', 
                padding: '15px', 
                background: 'rgba(0, 255, 255, 0.05)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {getAvatarImage(warrior.job) && (
                      <img src={getAvatarImage(warrior.job)} className="avatar-float" alt={warrior.job} />
                    )}
                    <h3 style={{ color: 'var(--neon-yellow)', fontSize: '1.2rem', margin: 0 }}>
                      No.{index + 1} {warrior.job}
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#888' }}>
                    {new Date(warrior.capturedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 30%', border: '1px solid #ff3333', padding: '5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#ff3333' }}>ATK</div>
                    <div style={{ fontSize: '1.2rem', color: '#ff3333' }}>{warrior.atk}</div>
                  </div>
                  <div style={{ flex: '1 1 30%', border: '1px solid #33ff33', padding: '5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#33ff33' }}>SPD</div>
                    <div style={{ fontSize: '1.2rem', color: '#33ff33' }}>{warrior.spd}</div>
                  </div>
                  <div style={{ flex: '1 1 30%', border: '1px solid #33ccff', padding: '5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#33ccff' }}>DEF</div>
                    <div style={{ fontSize: '1.2rem', color: '#33ccff' }}>{warrior.def}</div>
                  </div>
                  <div style={{ flex: '1 1 45%', border: '1px solid #ffff33', padding: '5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#ffff33' }}>EVA(回避)</div>
                    <div style={{ fontSize: '1.2rem', color: '#ffff33' }}>{warrior.evasion}%</div>
                  </div>
                  <div style={{ flex: '1 1 45%', border: '1px solid #ff33ff', padding: '5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#ff33ff' }}>CRT(会心)</div>
                    <div style={{ fontSize: '1.2rem', color: '#ff33ff' }}>{warrior.crit}%</div>
                  </div>
                </div>

                {warrior.synergyMsg && (
                  <div style={{ fontSize: '0.8rem', color: '#ccc', marginBottom: '15px', fontStyle: 'italic' }}>
                    {warrior.synergyMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => alert('ソロモードのNPCバトル機能は現在開発中です！今後のアップデートをお待ちください。')}
                    className="cyber-btn" 
                    style={{ marginTop: 0, padding: '8px', fontSize: '1rem', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)', flex: 2 }}
                  >
                    SOLO BATTLE (NPC戦 - WIP)
                  </button>
                  <button 
                    onClick={() => deleteWarrior(warrior.id)}
                    className="cyber-btn" 
                    style={{ marginTop: 0, padding: '8px', fontSize: '1rem', borderColor: '#555', color: '#888', flex: 1 }}
                  >
                    DELETE (削除)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
