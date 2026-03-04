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
        // 純粋な ATK - DEF (ただし最低1保証)。クリティカル時は完全防御無視で大ダメージ！
        let baseDmg = Math.max(1, myData.warrior.atk - oppData.warrior.def);
        let critText = "";

        // クリティカル判定 (防御力無視)
        if (Math.random() * 100 < myData.warrior.crit) {
          baseDmg = Math.round(myData.warrior.atk * 1.5); // 防御力を計算外にする
          critText = "【CRITICAL!!】 相手の装甲を貫く痛恨の一撃！ ";
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
      // FAST: 基礎攻撃力は半分になるが、高いSPDがあればそれを固定ダメージとして上乗せできる
      let baseDmg = Math.max(1, Math.round(myData.warrior.atk * 0.5) - oppData.warrior.def);
      let spdBonus = Math.floor(myData.warrior.spd * 0.8); // 速度特化職なら大きな固定ダメージ源に
      let totalBase = baseDmg + spdBonus;
      
      let critText = "";
      // クリティカル判定 (防御無視)
      if (Math.random() * 100 < myData.warrior.crit) {
        totalBase = Math.round(myData.warrior.atk * 0.8) + spdBonus; 
        critText = "【CRITICAL!!】 急所を突いた！ ";
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
        // HEAVY: ATKそのものを2倍にしてから防御を引くため、硬い相手も強引に突破できる
        let baseDmg = Math.max(1, Math.round(myData.warrior.atk * 2.0) - oppData.warrior.def);
        let critText = "";
        
        // クリティカル率2倍。クリティカル時はさらに威力が跳ね上がる（防御無視）
        if (Math.random() * 100 < (myData.warrior.crit * 2)) {
          baseDmg = Math.round(myData.warrior.atk * 2.5);
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
          // ナイトはATKが低いため、自身の高いDEFを武器にして殴る
          baseDmg = Math.max(1, Math.round(myData.warrior.def * 1.8) - oppData.warrior.def);
          finalDamage = applyDefense(baseDmg);
          updates[`${myRole}/isDefending`] = true;
          text = `【SKILL】${job} の「シールドバッシュ」！ 自身の重装甲を武器に ${finalDamage} の強烈なダメージを与え、防御態勢をとった！`;
          break;

        case 'アーチャー':
          // 完全な防御無視攻撃（シーフなど回避持ちには当たるが、硬いナイトを一撃で抜く切り札）
          baseDmg = Math.round(myData.warrior.atk * 1.5); 
          finalDamage = applyDefense(baseDmg);
          updates[`${myRole}/isDodging`] = false; 
          text = `【SKILL】${job} の「精密狙撃」！ 相手の装甲の隙間を貫き ${finalDamage} の確実なダメージ！`;
          break;

        case 'メイジ':
          // ATKが2倍になっているため、さらに威力倍率をかけて圧倒的なパワーで押し潰す
          baseDmg = Math.max(1, Math.round(myData.warrior.atk * 2.5) - oppData.warrior.def);
          finalDamage = applyDefense(baseDmg);
          text = `【SKILL】${job} の「ファイアウォール」！ 圧倒的な魔力で ${finalDamage} の甚大なダメージ！`;
          break;

        case 'シーフ':
          // 確定でダメージを与えつつ、回避態勢に移行
          baseDmg = Math.max(1, Math.round(myData.warrior.atk * 1.2) - oppData.warrior.def);
          finalDamage = applyDefense(baseDmg);
          updates[`${myRole}/isDodging`] = true;
          text = `【SKILL】${job} の「ステルス行動」！ 俊敏な一撃で ${finalDamage} ダメージを与え、暗闇に身を潜めた！（次ターン攻撃を絶対回避）`;
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
    // import.meta.env.BASE_URL is usually '/' for local root, or '/WifiWarriors/' for GitHub Pages
    const base = import.meta.env.BASE_URL || '/';
    // Ensure no double slashes if base has a trailing slash
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

    switch (job) {
      case 'ナイト': return `${cleanBase}/avatars/knight.png`;
      case 'アーチャー': return `${cleanBase}/avatars/archer.png`;
      case 'メイジ': return `${cleanBase}/avatars/mage.png`;
      case 'シーフ': return `${cleanBase}/avatars/thief.png`;
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
            <button className="cyber-btn" onClick={() => {
              // Delete the battle from DB when exiting finished battle
              if (battleState.winner === myRole) {
                // Only the winner cleans up to avoid race conditions
                // update(ref(database, `battles/${battleId}`), { status: 'closed' });
              }
              onSurrender();
            }}>
              EXIT BATTLE (アリーナへ戻る)
            </button>
          </div>
        )}
        
        {/* SURRENDER BUTTON (if not finished) */}
        {!isFinished && (
           <button 
             className="cyber-btn" 
             onClick={async () => {
               // Firebaseに降参を通知
               await update(ref(database, `battles/${battleId}`), {
                 status: 'finished',
                 winner: opponentRole,
                 logs: [...(battleState.logs || []), { text: `${myData.warrior.job} は逃げ出した！ 相手の勝利！`, timestamp: Date.now() }]
               });
               onSurrender();
             }}
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
