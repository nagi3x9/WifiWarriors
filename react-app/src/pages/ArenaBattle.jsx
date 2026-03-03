import { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '../firebase';
import useAuthStore from '../store/useAuthStore';

export default function ArenaBattle({ battleId, onSurrender }) {
  const { playerId } = useAuthStore();
  const [battleState, setBattleState] = useState(null);
  
  // ダメージ時のシェイクアニメーション用ステート
  const [myShake, setMyShake] = useState(false);
  const [oppShake, setOppShake] = useState(false);
  const [prevMyHp, setPrevMyHp] = useState(null);
  const [prevOppHp, setPrevOppHp] = useState(null);
  
  // 自分と相手のロールを特定 (フック内で安全に使うためにメモ化または変数として外だし)
  const myRole = battleState?.player1?.id === playerId ? 'player1' : 'player2';
  const opponentRole = myRole === 'player1' ? 'player2' : 'player1';

  const myData = battleState ? battleState[myRole] : null;
  const oppData = battleState ? battleState[opponentRole] : null;

  // HPの変化をフックしてシェイクアニメーションを発動 (条件分岐前に配置)
  useEffect(() => {
    if (!myData) return;
    if (prevMyHp !== null && myData.currentHp < prevMyHp) {
      setMyShake(true);
      setTimeout(() => setMyShake(false), 500);
    }
    setPrevMyHp(myData.currentHp);
  }, [myData?.currentHp]);

  useEffect(() => {
    if (!oppData) return;
    if (prevOppHp !== null && oppData.currentHp < prevOppHp) {
      setOppShake(true);
      setTimeout(() => setOppShake(false), 500);
    }
    setPrevOppHp(oppData.currentHp);
  }, [oppData?.currentHp]);

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

    // タイムアウトチェック用（相手が放置/切断した場合）
    const timeoutChecker = setInterval(() => {
      setBattleState(current => {
        if (!current || current.status !== 'playing') return current;
        
        const isMyTurnRightNow = current.currentTurn === (current?.player1?.id === playerId ? 'player1' : 'player2');
        if (!isMyTurnRightNow && current.lastActionTime) {
          const timeSinceLastAction = Date.now() - current.lastActionTime;
          // 30秒以上経過していたら
          if (timeSinceLastAction > 30000) {
            update(battleRef, {
              status: 'finished',
              winner: current?.player1?.id === playerId ? 'player1' : 'player2',
              logs: [...(current.logs || []), { text: '相手の応答が途絶えました！ あなたの不戦勝です。', timestamp: Date.now() }]
            });
          }
        }
        return current;
      });
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(timeoutChecker);
    };
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
      lastActionTime: Date.now(),
      logs: [{ text: `バトル開始！ ${data[firstTurn].warrior.job} のターンから始まります。`, timestamp: Date.now() }],
      'player1/currentHp': data.player1.warrior.hp,
      'player2/currentHp': data.player2.warrior.hp,
      'player1/maxHp': data.player1.warrior.hp,
      'player2/maxHp': data.player2.warrior.hp,
      'player1/isDefending': false,
      'player2/isDefending': false,
      'player1/skillUsed': false,
      'player2/skillUsed': false,
      'player1/isDodging': false,
      'player2/isDodging': false
    };

    await update(ref(database, `battles/${battleId}`), updates);
  };

  // 1. Loading if still preparing
  if (!battleState || battleState.status === 'ready') {
    return (
      <div className="status-grid" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading" style={{ color: 'var(--neon-blue)' }}>PREPARING BATTLE FIELD...</div>
      </div>
    );
  }

  // 2. Prevent crash if data is incomplete from Firebase sync
  if (!myData || !oppData || !myData.warrior || !oppData.warrior) {
     return (
       <div className="status-grid" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
         <div className="loading" style={{ color: 'var(--neon-yellow)' }}>SYNCING CONNECTION...</div>
         <div style={{ color: '#888', marginTop: '10px', fontSize: '0.8rem' }}>Waiting for both player data...</div>
       </div>
     );
  }
  
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
    let finalDamage = 0;
    
    // Firebaseに送る更新データ
    const updates = {};
    
    if (actionType === 'NORMAL_ATTACK') {
      const isEvade = oppData.isDodging || (Math.random() * 100 < oppData.warrior.evasion);
      if (isEvade) {
         text = `【MISS】 ${myData.warrior.job} の通常攻撃！...しかし ${oppData.warrior.job} はすばやく回避した！`;
      } else {
        let baseDmg = Math.max(1, myData.warrior.atk - oppData.warrior.def);
        let critText = "";

        // クリティカル判定
        if (Math.random() * 100 < myData.warrior.crit) {
          baseDmg = Math.round(baseDmg * 1.5); // 1.5倍ダメージ
          critText = "【CRITICAL!!】 痛恨の一撃！ ";
        }

        // 相手が防御している場合、ダメージを半減
        if (oppData.isDefending) {
          baseDmg = Math.max(1, Math.round(baseDmg * 0.5));
          text = `${myData.warrior.job} の通常攻撃！ ${critText}...しかし ${oppData.warrior.job} は防御している！ ${baseDmg} のダメージ！`;
        } else {
          text = `${critText}${myData.warrior.job} の通常攻撃！ ${baseDmg} のダメージ！`;
        }
        finalDamage = baseDmg;
      }
      
      // 攻撃したので自分の防御・回避状態は解除
      updates[`${myRole}/isDefending`] = false;
      updates[`${myRole}/isDodging`] = false;

    } else if (actionType === 'FAST_ATTACK') {
      let baseDmg = Math.max(1, Math.round(myData.warrior.atk * 0.5) - oppData.warrior.def);
      let spdBonus = Math.floor(myData.warrior.spd * 0.2); // SPDの20%を追加ダメージ
      let totalBase = baseDmg + spdBonus;
      
      let critText = "";
      if (Math.random() * 100 < myData.warrior.crit) {
        totalBase = Math.round(totalBase * 1.5);
        critText = "【CRITICAL!!】 ";
      }

      if (oppData.isDefending) {
        totalBase = Math.max(1, Math.round(totalBase * 0.5));
        text = `【FAST】${myData.warrior.job} の牽制攻撃！ 相手の回避を封じた！ ${critText}...しかし防御された！ ${totalBase} ダメージ！`;
      } else {
        text = `【FAST】${myData.warrior.job} の素早い牽制攻撃！ 相手の回避を封じた！ ${critText}${totalBase} のダメージ！`;
      }
      finalDamage = totalBase;

      updates[`${myRole}/isDefending`] = false;
      updates[`${myRole}/isDodging`] = false;

    } else if (actionType === 'HEAVY_ATTACK') {
      const isHit = Math.random() * 100 < 70; // 命中率70%
      const isEvade = oppData.isDodging || (Math.random() * 100 < oppData.warrior.evasion);
      
      if (!isHit || isEvade) {
         text = `【MISS】 ${myData.warrior.job} は渾身の強攻撃を放った！...しかし大振りすぎて外れてしまった！`;
      } else {
        let baseDmg = Math.max(1, Math.round(myData.warrior.atk * 1.5) - oppData.warrior.def);
        let critText = "";
        
        // クリティカル率2倍
        if (Math.random() * 100 < (myData.warrior.crit * 2)) {
          baseDmg = Math.round(baseDmg * 1.5);
          critText = "【SUPER CRITICAL!!】 致命的な痛恨の一撃！！ ";
        }

        if (oppData.isDefending) {
          baseDmg = Math.max(1, Math.round(baseDmg * 0.5));
          text = `【HEAVY】${myData.warrior.job} の強攻撃！ ${critText}...しかし ${oppData.warrior.job} は防御で耐えた！ ${baseDmg} のダメージ！`;
        } else {
          text = `【HEAVY】${critText}${myData.warrior.job} の大振りな一撃が直撃！ ${baseDmg} のダメージ！`;
        }
        finalDamage = baseDmg;
      }
      
      updates[`${myRole}/isDefending`] = false;
      updates[`${myRole}/isDodging`] = false;

    } else if (actionType === 'DEFEND') {
      text = `${myData.warrior.job} は防御の構えをとった。（次ターンの被ダメージ半減）`;
      updates[`${myRole}/isDefending`] = true;
      updates[`${myRole}/isDodging`] = false;
      
    } else if (actionType === 'SKILL') {
      if (myData.skillUsed) return;
      
      updates[`${myRole}/skillUsed`] = true;
      updates[`${myRole}/isDefending`] = false;
      updates[`${myRole}/isDodging`] = false;
      
      const job = myData.warrior.job;
      let baseDmg = 0;

      // 共通の防御半減ロジックを関数化
      const applyDefense = (dmg) => oppData.isDefending ? Math.max(1, Math.round(dmg * 0.5)) : dmg;

      switch(job) {
        case 'ナイト':
          // 防御力依存のダメージ＋次ターン防御
          baseDmg = Math.max(1, myData.warrior.def - Math.round(oppData.warrior.def * 0.5));
          finalDamage = applyDefense(baseDmg);
          updates[`${myRole}/isDefending`] = true;
          text = `【SKILL】${job} の「シールドバッシュ」！ 鉄壁の盾で ${finalDamage} のダメージを与え、そのまま防御態勢をとった！`;
          break;

        case 'アーチャー':
          // 相手の防御を無視＋確定クリティカル（ただし使用後自分のSPDとEVAが次ターン機能しなくなるペナルティは行動順側で処理が難しいので割愛か簡易化）
          baseDmg = myData.warrior.atk * 2; 
          finalDamage = applyDefense(baseDmg);
          updates[`${myRole}/isDodging`] = false; 
          text = `【SKILL】${job} の「精密狙撃」！ 必殺の矢が急所を貫き ${finalDamage} のダメージ！`;
          break;

        case 'メイジ':
          // 相手の防御を半減計算
          baseDmg = Math.max(1, Math.round(myData.warrior.atk * 1.5) - Math.round(oppData.warrior.def * 0.5));
          finalDamage = applyDefense(baseDmg);
          text = `【SKILL】${job} の「ファイアウォール」！ 相手の装甲を焼き尽くし ${finalDamage} のダメージ！`;
          break;

        case 'シーフ':
          // 中ダメージ＋次ターン絶対回避
          baseDmg = Math.max(1, Math.round(myData.warrior.atk * 0.8) - oppData.warrior.def);
          finalDamage = applyDefense(baseDmg);
          updates[`${myRole}/isDodging`] = true;
          text = `【SKILL】${job} の「ステルス行動」！ ${finalDamage} ダメージを与えつつ、暗闇に完全に身を潜めた！（次ターン攻撃を絶対回避）`;
          break;
          
        default:
          text = `【SKILL】${job} は特殊スキルを使用した！...しかし何も起きなかった。`;
          break;
      }
    }

    newOppHp = Math.max(0, newOppHp - finalDamage);

    let nextStatus = 'playing';
    if (newOppHp === 0) {
      nextStatus = 'finished';
      text += ` ＞＞ ${oppData.warrior.job} は力尽きた！`;
    }

    // 共通のステータス更新
    Object.assign(updates, {
      [`${opponentRole}/currentHp`]: newOppHp,
      currentTurn: opponentRole,
      turnCount: battleState.turnCount + 1,
      lastActionTime: Date.now(),
      status: nextStatus
    });
    
    // ログを追加
    const newLogs = addLog(text);

    // 決着がついた場合
    if (nextStatus === 'finished') {
       updates.winner = myRole;
       newLogs.push({ text: `勝負あり！ 勝者: ${myData.warrior.job} !!`, timestamp: Date.now() + 1 });
    }

    updates.logs = newLogs;

    await update(ref(database, `battles/${battleId}`), updates);
  };

  // Helper function to map job names to custom avatar images
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
    <div className="status-panel" style={{ borderColor: isMyTurn ? 'var(--neon-blue)' : '#555' }}>
      <div className="panel-header" style={{ borderBottomColor: isMyTurn ? 'var(--neon-blue)' : '#555' }}>
        <h2 style={{ color: isMyTurn ? 'var(--neon-blue)' : '#fff' }}>
          {isFinished ? 'BATTLE FINISHED' : isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
        </h2>
        <div className="scanline"></div>
      </div>

      <div className="status-grid" style={{ padding: '0 10px' }}>
        {/* 動的に注入するCSS (アニメーション用) */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes damageShake {
            0% { transform: translate(1px, 1px) rotate(0deg); }
            10% { transform: translate(-1px, -2px) rotate(-1deg); }
            20% { transform: translate(-3px, 0px) rotate(1deg); }
            30% { transform: translate(3px, 2px) rotate(0deg); }
            40% { transform: translate(1px, -1px) rotate(1deg); }
            50% { transform: translate(-1px, 2px) rotate(-1deg); }
            60% { transform: translate(-3px, 1px) rotate(0deg); }
            70% { transform: translate(3px, 1px) rotate(-1deg); }
            80% { transform: translate(-1px, -1px) rotate(1deg); }
            90% { transform: translate(1px, 2px) rotate(0deg); }
            100% { transform: translate(1px, -2px) rotate(-1deg); }
          }
          .shake-anim {
            animation: damageShake 0.4s;
            animation-iteration-count: 1;
          }
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
            image-rendering: pixelated; /* ドット絵感を強調 */
          }
        `}} />

        {/* Avatar & HP Bar Area */}
        <div className="battle-layout" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'flex-end' }}>
          
          {/* My Stats & Avatar */}
          <div className={`battle-player ${myShake ? "shake-anim" : ""}`} style={{ flex: 1, paddingRight: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
              {getAvatarImage(myData.warrior.job) && (
                 <img src={getAvatarImage(myData.warrior.job)} className="avatar-float" alt={myData.warrior.job} style={{ transform: 'scaleX(1)' }} />
              )}
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--neon-blue)' }}>{myData.name || 'YOU'}: {myData.warrior.job}</div>
                <div style={{ fontSize: '1.2rem', color: myData.currentHp > 30 ? 'var(--neon-blue)' : '#ff3333' }}>
                  HP: {myData.currentHp} / {myData.maxHp}
                </div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.8rem', marginBottom: '5px' }}>
              {myData.isDefending && <span style={{ marginRight: '10px', color: 'var(--neon-yellow)' }}>[🛡️DEFENDING]</span>}
              {myData.isDodging && <span style={{ marginRight: '10px', color: 'var(--neon-magenta)' }}>[💨DODGE]</span>}
            </div>
            {/* Simple HP Bar */}
            <div style={{ width: '100%', height: '10px', background: '#333', border: '1px solid #555' }}>
               <div style={{ width: `${(myData.currentHp / myData.maxHp) * 100}%`, height: '100%', background: myData.currentHp > 30 ? 'var(--neon-blue)' : '#ff3333', transition: 'width 0.3s' }}></div>
            </div>
          </div>

          <div className="battle-vs" style={{ padding: '0 15px', color: '#ff3333', fontWeight: 'bold', fontSize: '1.5rem', alignSelf: 'center' }}>VS</div>

          {/* Opponent Stats & Avatar */}
          <div className={`battle-player opp ${oppShake ? "shake-anim" : ""}`} style={{ flex: 1, paddingLeft: '10px', textAlign: 'right' }}>
            <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
              {getAvatarImage(oppData.warrior.job) && (
                 <img src={getAvatarImage(oppData.warrior.job)} className="avatar-float" alt={oppData.warrior.job} style={{ transform: 'scaleX(-1)' }} />
              )}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#ff3333' }}>{oppData.name || 'OPP'}: {oppData.warrior.job}</div>
                <div style={{ fontSize: '1.2rem', color: '#ff3333' }}>
                  HP: {oppData.currentHp} / {oppData.maxHp}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', marginBottom: '5px' }}>
              {oppData.isDefending && <span style={{ marginLeft: '10px', color: 'var(--neon-yellow)' }}>[🛡️DEFENDING]</span>}
              {oppData.isDodging && <span style={{ marginLeft: '10px', color: 'var(--neon-magenta)' }}>[💨DODGE]</span>}
            </div>
            {/* Simple HP Bar */}
            <div style={{ width: '100%', height: '10px', background: '#333', border: '1px solid #555', display: 'flex', justifyContent: 'flex-end' }}>
               <div style={{ width: `${(oppData.currentHp / oppData.maxHp) * 100}%`, height: '100%', background: '#ff3333', transition: 'width 0.3s' }}></div>
            </div>
          </div>

        </div>

        {/* Command Menu */}
        {!isFinished ? (
          <div className="action-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button 
              className="cyber-btn" 
              onClick={() => handleAction('NORMAL_ATTACK')}
              disabled={!isMyTurn}
              style={{ borderColor: isMyTurn ? '#ff3333' : '#333', color: isMyTurn ? '#ff3333' : '#555' }}
            >
              [ NORMAL (通常攻撃) ]
            </button>
            <button 
              className="cyber-btn" 
              onClick={() => handleAction('FAST_ATTACK')}
              disabled={!isMyTurn}
              style={{ borderColor: isMyTurn ? '#ffaa00' : '#333', color: isMyTurn ? '#ffaa00' : '#555' }}
            >
              [ FAST (牽制必中) ]
            </button>
            <button 
              className="cyber-btn" 
              onClick={() => handleAction('HEAVY_ATTACK')}
              disabled={!isMyTurn}
              style={{ borderColor: isMyTurn ? '#ff0055' : '#333', color: isMyTurn ? '#ff0055' : '#555' }}
            >
              [ HEAVY (強攻撃) ]
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
              disabled={!isMyTurn || myData.skillUsed}
              style={{ 
                gridColumn: '1 / -1', 
                borderColor: !myData.skillUsed && isMyTurn ? 'var(--neon-yellow)' : '#333', 
                color: !myData.skillUsed && isMyTurn ? 'var(--neon-yellow)' : '#555',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              [ UNIQUE SKILL (1回限定) ]
              {myData.skillUsed && <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'rgba(255,0,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center'}}>USED</div>}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', color: battleState.winner === myRole ? 'var(--neon-blue)' : '#ff3333', marginBottom: '20px' }}>
              {battleState.winner === myRole ? 'VICTORY!!' : 'DEFEAT...'}
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

        {/* Console / Log Area */}
        <div style={{ 
          height: '150px', 
          background: 'rgba(0,0,0,0.5)', 
          border: '1px solid #555', 
          padding: '10px', 
          overflowY: 'auto', 
          marginTop: '20px',
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
      </div>
    </div>
  );
}
