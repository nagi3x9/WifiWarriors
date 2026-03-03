import { useState, useEffect } from 'react';
import { ref, set, onValue, remove, get } from 'firebase/database';
import { database } from '../firebase';
import useWarriorStore from '../store/useWarriorStore';
import useAuthStore from '../store/useAuthStore';
import ArenaBattle from './ArenaBattle';

export default function Arena() {
  const { warriors } = useWarriorStore();
  const { playerId, playerName } = useAuthStore();
  
  const [selectedWarriorId, setSelectedWarriorId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [battleId, setBattleId] = useState(null);

  const selectedWarrior = warriors.find(w => w.id === selectedWarriorId);

  // コンポーネントのアンマウント時やキャンセル時にリスナーを解除するための変数
  useEffect(() => {
    return () => {
      // 画面を離れるときはロビーから自分を消す
      if (isSearching) {
        remove(ref(database, `lobby/${playerId}`));
      }
    };
  }, [isSearching, playerId]);

  // マッチメイキング処理
  const handleSearchOpponent = async () => {
    if (!selectedWarrior) return;
    setIsSearching(true);
    setMatchFound(false);

    const lobbyRef = ref(database, 'lobby');
    
    // 現在ロビーにいる人を取得
    const snapshot = await get(lobbyRef);
    if (snapshot.exists()) {
      const playersInLobby = snapshot.val();
      
      // タイムスタンプが20秒以内の、自分以外で待機している人を探す（古いゴーストデータを除外）
      const now = Date.now();
      const opponentId = Object.keys(playersInLobby).find(id => {
        const p = playersInLobby[id];
        const isRecent = (now - p.timestamp) < 20000; 
        return id !== playerId && isRecent && !p.matchFound;
      });
      
      if (opponentId) {
        // ========== 自分が相手を見つけた側 ==========
        const opponentData = playersInLobby[opponentId];
        
        // 1. バトルルーム（対戦用の場所）を作成する
        const battleId = `battle_${playerId}_${opponentId}`;
        await set(ref(database, `battles/${battleId}`), {
          player1: { id: playerId, name: playerName, warrior: selectedWarrior },
          player2: { id: opponentId, name: opponentData.name || 'UNKNOWN', warrior: opponentData.warrior },
          status: 'ready',
          timestamp: Date.now()
        });

        // 2. 相手のロビー情報に「対戦相手が見つかったよ」とバトルIDを書き込む
        await set(ref(database, `lobby/${opponentId}/matchFound`), {
          battleId: battleId,
          opponentName: playerName,
          opponentWarrior: selectedWarrior
        });

        // 自分の画面を更新
        setBattleId(battleId);
        setOpponent({ warrior: opponentData.warrior });
        setMatchFound(true);
        setIsSearching(false);
        return;
      }
    }

    // ========== 自分がロビーで待つ側 ==========
    const myLobbyRef = ref(database, `lobby/${playerId}`);
    await set(myLobbyRef, {
      id: playerId,
      name: playerName,
      warrior: selectedWarrior,
      timestamp: Date.now()
    });

    // 誰かが自分を見つけて、matchFound を書き込んでくれるのを待つ
    const unsubscribe = onValue(myLobbyRef, (snap) => {
      if (snap.exists()) {
        const myData = snap.val();
        if (myData.matchFound) {
          // 誰かが自分を見つけてくれた！
          setBattleId(myData.matchFound.battleId);
          setOpponent({ name: myData.matchFound.opponentName || 'UNKNOWN', warrior: myData.matchFound.opponentWarrior });
          setMatchFound(true);
          setIsSearching(false);
          
          // ロビーから自分を消す
          remove(myLobbyRef);
          
          // イベントリスナーを解除
          unsubscribe();
        }
      }
    });

    // タイムアウト処理 (15秒見つからなければキャンセル)
    setTimeout(() => {
      if (isSearching && !matchFound) {
        remove(myLobbyRef);
        setIsSearching(false);
        alert('対戦相手が見つかりませんでした。再度お試しください。');
        unsubscribe();
      }
    }, 15000);
  };

  const handleCancel = async () => {
    setIsSearching(false);
    await remove(ref(database, `lobby/${playerId}`));
    setMatchFound(false);
  };

  // --- 以下UIレンダリング部分は変更なし ---
  if (warriors.length === 0) {
    return (
      <div className="status-panel" style={{ borderColor: '#ff3333' }}>
        <div className="panel-header" style={{ borderBottomColor: '#ff3333' }}>
          <h2 style={{ color: '#ff3333' }}>BATTLE ARENA</h2>
          <div className="scanline"></div>
        </div>
        <div className="status-grid" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading" style={{ color: '#ff3333', textAlign: 'center' }}>
            NO WARRIORS AVAILABLE FOR BATTLE.<br/><br/>
            <span style={{ fontSize: '1rem', color: '#888' }}>
              スキャン画面で戦士を記録してから<br/>アリーナにお越しください。
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (matchFound && battleId) {
    return (
      <ArenaBattle 
        battleId={battleId} 
        onSurrender={() => {
          setMatchFound(false);
          setBattleId(null);
          setOpponent(null);
        }} 
      />
    );
  }

  return (
    <div className="status-panel" style={{ borderColor: '#ff3333' }}>
      <div className="panel-header" style={{ borderBottomColor: '#ff3333' }}>
        <h2 style={{ color: '#ff3333' }}>BATTLE ARENA</h2>
        <div className="scanline"></div>
      </div>
      
      {!isSearching && !matchFound ? (
        <div className="status-grid">
          <p style={{ textAlign: 'center', color: '#fff', marginBottom: '15px' }}>
            【 参戦する戦士を選べ 】
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {warriors.map((warrior) => (
              <div 
                key={warrior.id} 
                onClick={() => setSelectedWarriorId(warrior.id)}
                style={{ 
                  border: `2px solid ${selectedWarriorId === warrior.id ? '#ff3333' : 'var(--neon-blue)'}`, 
                  padding: '10px', 
                  background: selectedWarriorId === warrior.id ? 'rgba(255, 51, 51, 0.1)' : 'rgba(0, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ color: selectedWarriorId === warrior.id ? '#ff3333' : 'var(--neon-yellow)', fontSize: '1.2rem', marginBottom: '5px' }}>
                  {selectedWarriorId === warrior.id && '▶ '}{warrior.job}
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#ccc', flexWrap: 'wrap' }}>
                  <span>ATK: {warrior.atk}</span>|
                  <span>SPD: {warrior.spd}</span>|
                  <span>DEF: {warrior.def}</span>|
                  <span>EVA(回避): {warrior.evasion}%</span>|
                  <span>CRT(会心): {warrior.crit}%</span>
                </div>
                {selectedWarriorId === warrior.id && warrior.synergyMsg && (
                   <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '5px', fontStyle: 'italic' }}>
                     {warrior.synergyMsg}
                   </div>
                )}
              </div>
            ))}
          </div>

          <button 
            className="cyber-btn"
            style={{ 
              marginTop: '20px', 
              borderColor: selectedWarrior ? '#ff3333' : '#555',
              color: selectedWarrior ? '#ff3333' : '#555',
              cursor: selectedWarrior ? 'pointer' : 'not-allowed'
            }}
            disabled={!selectedWarrior}
            onClick={handleSearchOpponent}
          >
            {selectedWarrior ? 'SEARCH OPPONENT (対戦相手を探す)' : 'SELECT A WARRIOR (戦士を選択)'}
          </button>
        </div>
      ) : isSearching ? (
        <div className="status-grid" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading" style={{ color: '#ff3333', textAlign: 'center', marginBottom: '30px' }}>
            SEARCHING FOR OPPONENTS...<br/><br/>
            <span style={{ fontSize: '1.2rem', color: 'var(--neon-yellow)' }}>
              ({selectedWarrior.job}) 世界のどこかの戦士を待っています...
            </span>
          </div>
          <button 
            className="cyber-btn" 
            onClick={handleCancel}
            style={{ width: 'auto', padding: '10px 30px' }}
          >
            CANCEL (キャンセル)
          </button>
        </div>
      ) : null}
    </div>
  );
}
