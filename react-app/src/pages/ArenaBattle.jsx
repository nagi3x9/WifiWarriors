import { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '../firebase';
import useAuthStore from '../store/useAuthStore';

export default function ArenaBattle({ battleId, onSurrender }) {
  const { playerId } = useAuthStore();
  const [battleState, setBattleState] = useState(null);
  
  useEffect(() => {
    const battleRef = ref(database, `battles/${battleId}`);
    const unsubscribe = onValue(battleRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        // 初回ロード時、HPやターンの初期化が行われていなければ行う（ホスト側：player1が担当）
        if (data.status === 'ready' && data.player1.id === playerId) {
          initializeBattle(data);
        } else {
          setBattleState(data);
        }
      }
    });

    return () => unsubscribe();
  }, [battleId, playerId]);

  const initializeBattle = async (data) => {
    // どちらが先攻かSPDで判定
    const p1Spd = data.player1.warrior.spd;
    const p2Spd = data.player2.warrior.spd;
    const firstTurn = p1Spd >= p2Spd ? 'player1' : 'player2';

    const updates = {
      status: 'playing',
      currentTurn: firstTurn,
      turnCount: 1,
      logs: [{ text: `バトル開始！ ${firstTurn === 'player1' ? 'あなた' : '相手'}のターンから始まります。`, timestamp: Date.now() }],
      'player1/currentHp': data.player1.warrior.hp,
      'player2/currentHp': data.player2.warrior.hp,
      'player1/maxHp': data.player1.warrior.hp,
      'player2/maxHp': data.player2.warrior.hp
    };

    await update(ref(database, `battles/${battleId}`), updates);
  };

  if (!battleState || battleState.status === 'ready') {
    return (
      <div className="status-grid" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading" style={{ color: 'var(--neon-blue)' }}>PREPARING BATTLE FIELD...</div>
      </div>
    );
  }

  // 自分と相手のロールを特定
  const myRole = battleState.player1.id === playerId ? 'player1' : 'player2';
  const opponentRole = myRole === 'player1' ? 'player2' : 'player1';

  const myData = battleState[myRole];
  const oppData = battleState[opponentRole];
  
  const isMyTurn = battleState.currentTurn === myRole;
  const isFinished = battleState.status === 'finished';

  const addLog = (text) => {
    const logs = battleState.logs || [];
    return [...logs, { text, timestamp: Date.now() }];
  };

  const handleAction = async (actionType) => {
    if (!isMyTurn || isFinished) return;

    let newOppHp = oppData.currentHp;
    let text = "";
    
    // ダメージ計算の基礎
    let finalDamage = 0;
    
    const isCrit = Math.random() * 100 < myData.warrior.crit;
    const isEvade = Math.random() * 100 < oppData.warrior.evasion;

    if (actionType === 'ATTACK') {
      if (isEvade) {
         text = `【MISS】 ${myData.warrior.job} の攻撃！...しかし ${oppData.warrior.job} はすばやく回避した！`;
      } else {
        let baseDmg = Math.max(1, myData.warrior.atk - oppData.warrior.def);
        if (isCrit) {
          baseDmg = Math.round(baseDmg * 2);
          text = `【CRITICAL!!】 ${myData.warrior.job} の痛恨の一撃！ ${baseDmg} のダメージ！`;
        } else {
          text = `${myData.warrior.job} の攻撃！ ${baseDmg} のダメージ！`;
        }
        finalDamage = baseDmg;
      }
    } else if (actionType === 'DEFEND') {
      text = `${myData.warrior.job} は防御の構えをとった。（※次ターン実装予定：被ダメージ半減など）`;
      // 今回はプロトタイプとしてダメージ0ターンスキップ
    }

    newOppHp = Math.max(0, newOppHp - finalDamage);

    let nextStatus = 'playing';
    if (newOppHp === 0) {
      nextStatus = 'finished';
      text += ` ＞＞ ${oppData.warrior.job} は力尽きた！`;
    }

    const updates = {
      [`${opponentRole}/currentHp`]: newOppHp,
      currentTurn: opponentRole,
      turnCount: battleState.turnCount + 1,
      logs: addLog(text),
      status: nextStatus
    };
    
    // 決着がついた場合
    if (nextStatus === 'finished') {
       updates.winner = myRole;
       updates.logs = [...updates.logs, { text: `勝負あり！ 勝者: ${myData.warrior.job} !!`, timestamp: Date.now() + 1}];
    }

    await update(ref(database, `battles/${battleId}`), updates);
  };

  return (
    <div className="status-panel" style={{ borderColor: isMyTurn ? 'var(--neon-blue)' : '#555' }}>
      <div className="panel-header" style={{ borderBottomColor: isMyTurn ? 'var(--neon-blue)' : '#555' }}>
        <h2 style={{ color: isMyTurn ? 'var(--neon-blue)' : '#fff' }}>
          {isFinished ? 'BATTLE FINISHED' : isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
        </h2>
        <div className="scanline"></div>
      </div>

      <div className="status-grid" style={{ padding: '0 10px' }}>
        {/* HP Bar Area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'flex-end' }}>
          
          {/* My Stats */}
          <div style={{ flex: 1, paddingRight: '10px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--neon-blue)' }}>YOU: {myData.warrior.job}</div>
            <div style={{ fontSize: '1.2rem', color: myData.currentHp > 30 ? 'var(--neon-blue)' : '#ff3333' }}>
              HP: {myData.currentHp} / {myData.maxHp}
            </div>
            {/* Simple HP Bar */}
            <div style={{ width: '100%', height: '10px', background: '#333', border: '1px solid #555', marginTop: '5px' }}>
               <div style={{ width: `${(myData.currentHp / myData.maxHp) * 100}%`, height: '100%', background: myData.currentHp > 30 ? 'var(--neon-blue)' : '#ff3333', transition: 'width 0.3s' }}></div>
            </div>
          </div>

          <div style={{ padding: '0 15px', color: '#ff3333', fontWeight: 'bold', fontSize: '1.5rem' }}>VS</div>

          {/* Opponent Stats */}
          <div style={{ flex: 1, paddingLeft: '10px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: '#ff3333' }}>OPP: {oppData.warrior.job}</div>
            <div style={{ fontSize: '1.2rem', color: '#ff3333' }}>
              HP: {oppData.currentHp} / {oppData.maxHp}
            </div>
            {/* Simple HP Bar */}
            <div style={{ width: '100%', height: '10px', background: '#333', border: '1px solid #555', marginTop: '5px', display: 'flex', justifyContent: 'flex-end' }}>
               <div style={{ width: `${(oppData.currentHp / oppData.maxHp) * 100}%`, height: '100%', background: '#ff3333', transition: 'width 0.3s' }}></div>
            </div>
          </div>

        </div>

        {/* Console / Log Area */}
        <div style={{ 
          height: '150px', 
          background: 'rgba(0,0,0,0.5)', 
          border: '1px solid #555', 
          padding: '10px', 
          overflowY: 'auto', 
          marginBottom: '20px',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          display: 'flex',
          flexDirection: 'column-reverse' // 最新のログが下に来るようにするハック
        }}>
          {battleState.logs && [...battleState.logs].reverse().map((log, i) => (
             <div key={i} style={{ marginBottom: '5px', color: log.text.includes('勝敗') || log.text.includes('勝者') ? 'var(--neon-blue)' : '#ccc' }}>
               <span style={{ color: '#555' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.text}
             </div>
          ))}
        </div>

        {/* Command Menu */}
        {!isFinished ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button 
              className="cyber-btn" 
              onClick={() => handleAction('ATTACK')}
              disabled={!isMyTurn}
              style={{ borderColor: isMyTurn ? '#ff3333' : '#333', color: isMyTurn ? '#ff3333' : '#555' }}
            >
              [ ATTACK (攻撃) ]
            </button>
            <button 
              className="cyber-btn" 
              onClick={() => handleAction('DEFEND')}
              disabled={!isMyTurn}
              style={{ borderColor: isMyTurn ? 'var(--neon-blue)' : '#333', color: isMyTurn ? 'var(--neon-blue)' : '#555' }}
            >
              [ DEFEND (防御) ]
            </button>
            <button 
              className="cyber-btn" 
              onClick={() => handleAction('SKILL')}
              disabled={!isMyTurn}
              style={{ gridColumn: '1 / -1', borderColor: isMyTurn ? 'var(--neon-yellow)' : '#333', color: isMyTurn ? 'var(--neon-yellow)' : '#555' }}
            >
              [ NETWORK SKILL (未実装) ]
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', color: battleState.winner === myRole ? 'var(--neon-blue)' : '#ff3333', marginBottom: '20px' }}>
              {battleState.winner === myRole ? 'YOU WIN!!' : 'YOU LOSE...'}
            </div>
            <button className="cyber-btn" onClick={onSurrender}>
              EXIT BATTLE (アリーナへ戻る)
            </button>
          </div>
        )}
        
        {/* SURRENDER BUTTON (if not finished) */}
        {!isFinished && (
           <button 
             className="cyber-btn" 
             onClick={onSurrender}
             style={{ marginTop: '20px', borderColor: '#555', color: '#888', padding: '5px' }}
           >
             SURRENDER (降参して戻る)
           </button>
        )}
      </div>
    </div>
  );
}
