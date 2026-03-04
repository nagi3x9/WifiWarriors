import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="status-panel">
      <div className="panel-header">
        <h2>SELECT OPERATION MODE</h2>
        <div className="scanline"></div>
      </div>
      <div className="status-grid" style={{ display: 'flex', flexDirection: 'column', gap: '30px', padding: '30px', textAlign: 'center' }}>
        
        <div style={{ cursor: 'pointer' }} onClick={() => alert('SOLO MODEは現在開発中です！今後のアップデート（乞うご期待）をお待ちください！')}>
          <div className="cyber-btn" style={{ height: 'auto', padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.6 }}>
            <h3 style={{ color: 'var(--neon-blue)', margin: '0 0 10px 0', fontSize: '1.8rem', letterSpacing: '2px' }}>[ SOLO MODE ]</h3>
            <span style={{ fontSize: '1rem', color: '#ddd' }}>様々なWi-Fiを巡り、最強の戦士を保存せよ</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--neon-yellow)', marginTop: '10px' }}>▶ 現在開発中 (COMING SOON)</span>
          </div>
        </div>
        
        <Link to="/arena" style={{ textDecoration: 'none' }}>
          <div className="cyber-btn" style={{ height: 'auto', padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderColor: '#ff3333', boxShadow: '0 0 10px rgba(255, 51, 51, 0.2)' }}>
            <h3 style={{ color: '#ff3333', margin: '0 0 10px 0', fontSize: '1.8rem', letterSpacing: '2px' }}>[ ARENA MODE ]</h3>
            <span style={{ fontSize: '1rem', color: '#ddd' }}>"現在の環境"で、見知らぬ戦士と死闘を行え</span>
            {/* <span style={{ fontSize: '0.8rem', color: '#ff8888', marginTop: '10px' }}>▶ 強制スキャン・即時オンライン対戦 (育成持ち込み不可)</span> */}
          </div>
        </Link>
        
      </div>
    </div>
  );
}
