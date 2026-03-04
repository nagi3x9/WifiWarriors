import { useState, useEffect } from 'react';
import { ref, set, onValue, remove, get } from 'firebase/database';
import { database } from '../firebase';
import useAuthStore from '../store/useAuthStore';
import ArenaBattle from './ArenaBattle';
import Scanner from './Scanner';

export default function Arena() {
  const { playerId, playerName } = useAuthStore();
  
  const [arenaWarrior, setArenaWarrior] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [battleId, setBattleId] = useState(null);

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
  const handleSearchOpponent = async (warriorToUse) => {
    if (!warriorToUse) return;
    setArenaWarrior(warriorToUse);
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
          player1: { id: playerId, name: playerName, warrior: warriorToUse },
          player2: { id: opponentId, name: opponentData.name || 'UNKNOWN', warrior: opponentData.warrior },
          status: 'ready',
          timestamp: Date.now()
        });

        // 2. 相手のロビー情報に「対戦相手が見つかったよ」とバトルIDを書き込む
        await set(ref(database, `lobby/${opponentId}/matchFound`), {
          battleId: battleId,
          opponentName: playerName,
          opponentWarrior: warriorToUse
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
      warrior: warriorToUse,
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
        setArenaWarrior(null); // Return to scanner
        alert('対戦相手が見つかりませんでした。再度スキャンして立ち向かってください。');
        unsubscribe();
      }
    }, 15000);
  };

  const handleCancel = async () => {
    setIsSearching(false);
    await remove(ref(database, `lobby/${playerId}`));
    setMatchFound(false);
    setArenaWarrior(null);
  };

  if (matchFound && battleId) {
    return (
      <ArenaBattle 
        battleId={battleId} 
        onSurrender={() => {
          setMatchFound(false);
          setBattleId(null);
          setOpponent(null);
          setArenaWarrior(null);
        }} 
      />
    );
  }

  return (
    <div className="status-panel" style={{ borderColor: '#ff3333' }}>
      <div className="panel-header" style={{ borderBottomColor: '#ff3333' }}>
        <h2 style={{ color: '#ff3333' }}>BATTLE ARENA: INSTANT MATCH</h2>
        <div className="scanline"></div>
      </div>
      
      {!isSearching && !matchFound && !arenaWarrior ? (
        <div style={{ padding: '10px 0' }}>
          <p style={{ textAlign: 'center', color: '#ff3333', marginBottom: '15px' }}>
            [ ! ] アリーナ専用モード：現在の回線環境で戦使をスキャンします
          </p>
          <Scanner mode="arena" onArenaProceed={(warrior) => handleSearchOpponent(warrior)} />
        </div>
      ) : isSearching && arenaWarrior ? (
        <div className="status-grid" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading" style={{ color: '#ff3333', textAlign: 'center', marginBottom: '30px' }}>
            SEARCHING FOR OPPONENTS...<br/><br/>
            <span style={{ fontSize: '1.2rem', color: 'var(--neon-yellow)' }}>
              ({arenaWarrior.job}) 世界のどこかの戦士を待っています...
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
