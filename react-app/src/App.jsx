import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Scanner from './pages/Scanner';
import Roster from './pages/Roster';
import Arena from './pages/Arena';
import CRTOverlay from './components/CRTOverlay';
import './style.css';

function App() {
  return (
    <Router>
      <CRTOverlay />
      <div className="container">
        <header>
          <h1 className="glitch" data-text="WifiWarriors">WifiWarriors</h1>
          <p className="subtitle">{">>>"} CONNECTION ESTABLISHED {"<<<"}</p>
          
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
