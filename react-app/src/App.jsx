import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Scanner from './pages/Scanner';
import Roster from './pages/Roster';
import Arena from './pages/Arena';
import CRTOverlay from './components/CRTOverlay';
import useAuthStore from './store/useAuthStore';
import './style.css';

function App() {
  const { playerName, setPlayerName } = useAuthStore();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(playerName);

  const handleNameSave = () => {
    if (tempName.trim()) {
      setPlayerName(tempName.trim().substring(0, 10)); // max 10 chars
    } else {
      setTempName(playerName);
    }
    setIsEditingName(false);
  };

  return (
    <Router>
      <CRTOverlay />
      <div className="container">
        <header>
          <h1 className="glitch" data-text="WifiWarriors">WifiWarriors</h1>
          <p className="subtitle">{">>>"} CONNECTION ESTABLISHED {"<<<"}</p>
          
          {/* Player Name Section */}
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <span style={{ color: 'var(--neon-blue)', marginRight: '10px' }}>PLAYER_NAME:</span>
            {isEditingName ? (
              <input 
                type="text" 
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                autoFocus
                maxLength={10}
                style={{
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid var(--neon-blue)',
                  color: 'var(--neon-yellow)',
                  fontFamily: 'var(--font-main)',
                  padding: '5px',
                  width: '150px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
            ) : (
              <span 
                onClick={() => { setIsEditingName(true); setTempName(playerName); }}
                style={{ 
                  color: 'var(--neon-yellow)', 
                  cursor: 'pointer', 
                  borderBottom: '1px dashed var(--neon-yellow)',
                  padding: '0 5px'
                }}
                title="Click to edit name"
              >
                {playerName}
              </span>
            )}
          </div>

          <nav className="main-nav">
            <Link to="/" className="nav-link">SCANNER</Link>
            <Link to="/roster" className="nav-link">ROSTER</Link>
            <Link to="/arena" className="nav-link">ARENA</Link>
          </nav>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Scanner />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/arena" element={<Arena />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
