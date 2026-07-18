
    if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(e=>{}); }); }


    let room = '榕樹下';
    const queryString = window.location.search.substring(1);
    if (queryString) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('room')) { room = decodeURIComponent(urlParams.get('room')); } 
      else { room = decodeURIComponent(queryString.split('&')[0].split('=')[0]); }
    }
    document.getElementById('room-title').textContent = "" + room;
    document.getElementById('modal-room-name').textContent = room;

    let myId = sessionStorage.getItem('xq_id');
    if (!myId) { myId = Math.random().toString(36).substr(2, 9); sessionStorage.setItem('xq_id', myId); }
    
    const AI_ID = "BOT_" + myId;
    let isAiMode = false; let aiRole = null; let isAiThinking = false; let lastSurrenderedBoard = null; 

    let hasSelectedRoleLocal = sessionStorage.getItem('xq_role_selected_' + room);
    let gameState = null; let myRole = null; let selectedCell = null; 
    let isSyncing = false; 
    let lastActionTime = Date.now(); 

    // ==========================================
    // 🌟 覆盤系統 (Review System) 變數
    // ==========================================
    let isReplaying = false;
    let isReplayPaused = false;
    let replayInterval = null;
    let replayStep = 0;
    let replaySteps = [];
    let replayBoard = null;

    const piecesText = { 'k':'將', 'a':'士', 'e':'象', 'h':'馬', 'r':'車', 'c':'砲', 'p':'卒', 'K':'帥', 'A':'仕', 'E':'相', 'H':'傌', 'R':'俥', 'C':'炮', 'P':'兵' };

    function getMoveNotation(p, r1, c1, r2, c2) {
      if (!p) return ""; 
      let color = (p === p.toLowerCase()) ? 'b' : 'r';
      let colorStr = color === 'b' ? '黑' : '紅';
      let pName = piecesText[p];
      let startCol = color === 'r' ? (9 - c1) : (c1 + 1);
      
      let dir = '';
      if (r1 === r2) dir = '平';
      else if (color === 'r') dir = r2 < r1 ? '進' : '退';
      else dir = r2 > r1 ? '進' : '退';
      
      let endVal = '';
      let pType = p.toLowerCase();
      if (dir === '平') endVal = color === 'r' ? (9 - c2) : (c2 + 1);
      else {
        if (['r', 'c', 'p', 'k'].includes(pType)) endVal = Math.abs(r1 - r2); 
        else endVal = color === 'r' ? (9 - c2) : (c2 + 1); 
      }
      return `${colorStr}${pName}${startCol}${dir}${endVal}`;
    }

    function showRoleModal() { document.getElementById('role-modal').style.display = 'flex'; document.getElementById('close-modal-btn').style.display = 'block'; if (gameState) updateUI(gameState); }
    function closeRoleModal() { document.getElementById('role-modal').style.display = 'none'; }

    let infoHistory = []; let lastText = "";
    function updateInformation(text) {
      if (text !== lastText) {
        infoHistory.unshift(text); 
        if (infoHistory.length > 100) infoHistory.pop(); 
        document.getElementById('info').innerHTML = infoHistory.join('<br>');
        lastText = text;
      }
    }

    function drawSVGBoard() {
      let getX = c => (c + 0.5) * (100 / 9) + '%'; let getY = r => (r + 0.5) * (100 / 10) + '%';
      let svg = `<svg width="100%" height="100%" overflow="visible">`; const stroke = `stroke="#333" stroke-width="1.5"`;
      for (let c = 0; c < 9; c++) {
        if (c === 0 || c === 8) { svg += `<line x1="${getX(c)}" y1="${getY(0)}" x2="${getX(c)}" y2="${getY(9)}" ${stroke} />`; } 
        else { svg += `<line x1="${getX(c)}" y1="${getY(0)}" x2="${getX(c)}" y2="${getY(4)}" ${stroke} />`; svg += `<line x1="${getX(c)}" y1="${getY(5)}" x2="${getX(c)}" y2="${getY(9)}" ${stroke} />`; }
      }
      for (let r = 0; r < 10; r++) { svg += `<line x1="${getX(0)}" y1="${getY(r)}" x2="${getX(8)}" y2="${getY(r)}" ${stroke} />`; }
      svg += `<line x1="${getX(3)}" y1="${getY(0)}" x2="${getX(5)}" y2="${getY(2)}" ${stroke} />`; svg += `<line x1="${getX(5)}" y1="${getY(0)}" x2="${getX(3)}" y2="${getY(2)}" ${stroke} />`;
      svg += `<line x1="${getX(3)}" y1="${getY(7)}" x2="${getX(5)}" y2="${getY(9)}" ${stroke} />`; svg += `<line x1="${getX(5)}" y1="${getY(7)}" x2="${getX(3)}" y2="${getY(9)}" ${stroke} />`;
      svg += `<text x="27.7%" y="50.5%" font-size="clamp(18px, 5vw, 26px)" font-weight="bold" fill="#333" text-anchor="middle" dominant-baseline="central">楚</text>`;
      svg += `<text x="38.8%" y="50.5%" font-size="clamp(18px, 5vw, 26px)" font-weight="bold" fill="#333" text-anchor="middle" dominant-baseline="central">河</text>`;
      svg += `<text x="61.1%" y="50.5%" font-size="clamp(18px, 5vw, 26px)" font-weight="bold" fill="#333" text-anchor="middle" dominant-baseline="central">漢</text>`;
      svg += `<text x="72.2%" y="50.5%" font-size="clamp(18px, 5vw, 26px)" font-weight="bold" fill="#333" text-anchor="middle" dominant-baseline="central">界</text>`;

      for (let c = 0; c < 9; c++) {
        let topNum = c + 1; let bottomNum = 9 - c;
        svg += `<text x="${getX(c)}" y="-3%" font-size="clamp(12px, 2.5vw, 15px)" font-weight="bold" fill="#555" text-anchor="middle" dominant-baseline="central">${topNum}</text>`;
        svg += `<text x="${getX(c)}" y="103%" font-size="clamp(12px, 2.5vw, 15px)" font-weight="bold" fill="#555" text-anchor="middle" dominant-baseline="central">${bottomNum}</text>`;
      }
      svg += `</svg>`; document.getElementById('board-svg-layer').innerHTML = svg;
    } drawSVGBoard();


    async function init() { 
      let storedAiRole = sessionStorage.getItem('xq_ai_mode_' + room);
      if (storedAiRole) { isAiMode = true; aiRole = storedAiRole; }
      let data = await updateChess('join', { playerId: myId }); 
      if (data) onJoined(data); 
      setInterval(pollState, 1500);   
    }


    // 🌟 若在覆盤中，背景會偷偷更新狀態但不干擾畫面
    async function pollState() { 
      if (isSyncing) return; 
      let fetchActionTime = lastActionTime; 
      let data = await updateChess('get'); 
      if (isSyncing || fetchActionTime !== lastActionTime) return; 
      if (data && data.state) {
        if (isReplaying) {
           gameState = data.state; 
        } else {
           updateUI(data.state); 
        }
      }
    }

    async function requestRole(role) {
      document.getElementById('role-modal').style.display = 'none';
      isSyncing = true; 
      if (isAiMode) { updateInformation("正在清理電腦玩家..."); await updateChess('closeThisRoomForNewBeginner', { targetRoom: room }); }
      isAiMode = false; sessionStorage.removeItem('xq_ai_mode_' + room); 
      
      let data = await updateChess('takeRole', { playerId: myId, role: role });
      if (data && data.success) {
        myRole = data.role; sessionStorage.setItem('xq_role_selected_' + room, 'true'); hasSelectedRoleLocal = 'true'; updateRoleBadge(); 
        updateInformation(`成功切換身分：${role === 'b' ? '黑方' : (role === 'r' ? '紅方' : '觀戰者')}`);
        updateUI(data.state);
      } else { 
        updateInformation("選擇失敗，該座位可能已被搶先！"); 
        if (data && data.state) { updateUI(data.state); showRoleModal(); } 
      }
      isSyncing = false; lastActionTime = Date.now(); 
    }

    async function startAiGame(humanRole, difficulty) {
      document.getElementById('role-modal').style.display = 'none';
      updateInformation(`正在準備單機模式 (${difficulty === 'hard' ? '高級' : '簡單'})...`);
      isSyncing = true; 
      await updateChess('closeThisRoomForNewBeginner', { targetRoom: room });

      let botRole = humanRole === 'r' ? 'b' : 'r';
      isAiMode = true; aiRole = botRole;
      sessionStorage.setItem('xq_ai_mode_' + room, botRole);
      sessionStorage.setItem('xq_ai_level_' + room, difficulty); 
      
      let data = await updateChess('takeRole', { playerId: myId, role: humanRole });
      if (data && data.success) {
        myRole = data.role; sessionStorage.setItem('xq_role_selected_' + room, 'true'); hasSelectedRoleLocal = 'true'; updateRoleBadge(); 
        let aiData = await updateChess('takeRole', { playerId: AI_ID, role: botRole });
        if (aiData && aiData.state) updateUI(aiData.state); else updateUI(data.state);
      }
      isSyncing = false; lastActionTime = Date.now();
    }

    async function requestRestart(actionType) {
      if (myRole === 'spectator') return;
      if (actionType === 'request') { if (!confirm("向對方發送重新開局請求？")) return; updateInformation("已發出重新開局請求..."); } 
      else if (actionType === 'agree') { if (!confirm("確定要同意重新開局嗎？棋盤將立即清空。")) return; updateInformation("已同意重新開局..."); } 
      else if (actionType === 'reject') { updateInformation("已拒絕重新開局..."); } 
      else if (actionType === 'cancel') { updateInformation("已取消重新開局請求..."); }
      
      isSyncing = true; lastActionTime = Date.now();
      let data = await updateChess('restart', { playerId: myId, restartAction: actionType }); 
      if (data && data.state) updateUI(data.state); 
      isSyncing = false;
    }

    async function requestUndo(actionType) {
      if (myRole === 'spectator') return;
      if (actionType === 'request') {
        if (!gameState || !gameState.history || gameState.history.length === 0) { updateInformation("目前沒有可以悔的棋！"); return; }
        if (!confirm("向對方發送悔棋請求？")) return;
        updateInformation("已發出悔棋請求...");
      } else if (actionType === 'agree') {
        if (!confirm("確定要同意對方悔棋嗎？")) return; updateInformation("已同意悔棋...");
      } else if (actionType === 'reject') { updateInformation("已拒絕悔棋..."); } 
      else if (actionType === 'cancel') { updateInformation("已取消悔棋請求..."); }
      
      isSyncing = true; lastActionTime = Date.now();
      let data = await updateChess('undo', { playerId: myId, undoAction: actionType }); 
      if (data && data.state) updateUI(data.state); 
      isSyncing = false;
    }

    function onJoined(data) {
      myRole = data.role || 'spectator'; 
      updateUI(data.state);
      if (myRole === 'b' || myRole === 'r') { hasSelectedRoleLocal = 'true'; sessionStorage.setItem('xq_role_selected_' + room, 'true'); } 
      else { myRole = 'spectator'; }
      updateRoleBadge();
    }

    function updateRoleBadge() {
      let roleText = myRole === 'b' ? '黑方' : myRole === 'r' ? '紅方' : '觀戰者';
      if (isAiMode) { let levelText = sessionStorage.getItem('xq_ai_level_' + room) === 'hard' ? '高級' : '簡單'; roleText += ` (單機-${levelText})`; }
      let badge = document.getElementById('role-info'); badge.textContent = "你是：" + roleText; badge.className = "role-badge " + (myRole === 'spectator' ? '' : 'role-' + myRole);
    }

    let riClickCnt = 0;
    let riTimer = null; // 用來儲存計時器

    document.getElementById('role-info').onclick = function() {
        // 1. 每點一次，就清除上一個計時器，重新開始計時
        if (riTimer) {
            clearTimeout(riTimer);
        }

        // 2. 增加點擊次數
        riClickCnt++;

        // 3. 判斷是否達成連點目標（例如連點 3 下）
        if (riClickCnt === 3) {
            riClickCnt = 0; // 成功後重置
            const targetRoom = typeof room !== 'undefined' ? room : "";
            window.location.href = "./lobby.html?" + targetRoom;
        } else {
            // 4. 如果還沒點滿，設定一個「限時」，例如 1000 毫秒 (1秒)
            // 超過 1 秒沒點下一點，次數就會歸零
            riTimer = setTimeout(() => {
                console.log('連點中斷，次數重置');
                riClickCnt = 0;
            }, 3000); 
        }
    };

    function updateUI(state) {
      let oldState = gameState; let boardChanged = false;
      
      if (oldState) {
        boardChanged = JSON.stringify(oldState.board) !== JSON.stringify(state.board);
        if (boardChanged) selectedCell = null; 
        
        let isUndo = false; let isRestart = false;
        let oldHistoryLen = oldState.history ? oldState.history.length : 0;
        let newHistoryLen = state.history ? state.history.length : 0;

        if (newHistoryLen === 0 && oldHistoryLen > 0) isRestart = true;
        else if (newHistoryLen < oldHistoryLen) isUndo = true;

        if (oldState.restartRequest !== state.restartRequest && state.restartRequest) {
           if (state.restartRequest !== myRole) updateInformation(state.restartRequest === 'b' ? "黑方發起重新開局請求！" : "紅方發起重新開局請求！");
        }
        if (oldState.undoRequest !== state.undoRequest && state.undoRequest) {
           if (state.undoRequest !== myRole) updateInformation(state.undoRequest === 'b' ? "黑方發起悔棋請求！" : "紅方發起悔棋請求！");
        }
        if (oldState.status !== state.status && state.status === 'check') updateInformation("將軍！");
        
        if (boardChanged) {
            if (isRestart) updateInformation("🆕 已重新開局");
            else if (isUndo) updateInformation("↩ 已悔棋");
            else if (state.lastMove) {
                let m = state.lastMove; let p = state.board[m.r2][m.c2];
                if (p) { let notation = getMoveNotation(p, m.r1, m.c1, m.r2, m.c2); updateInformation(`${notation}`); }
            }
        }
      }

      gameState = state;
      
      if (!isAiThinking && document.getElementById('info').innerHTML.indexOf('電腦無棋可走') === -1) {
        let bPlayer = state.players.b ? String(state.players.b) : ""; let rPlayer = state.players.r ? String(state.players.r) : "";
        if (bPlayer === "" && rPlayer === "") updateInformation("沒有人在執棋");
        else if (bPlayer === "" || rPlayer === "") updateInformation("等待對手加入...");
        else { let turnMsg = state.turn === 'b' ? "輪到：黑方" : "輪到：紅方"; updateInformation(turnMsg); }
      }

      if ((myRole === 'b' && state.players.b !== myId) || (myRole === 'r' && state.players.r !== myId)) {
        updateInformation("系統已將您移出對戰座位！"); myRole = 'spectator'; sessionStorage.removeItem('xq_role_selected_' + room); hasSelectedRoleLocal = null; updateRoleBadge(); return;
      }

      if (isAiMode && state.players[aiRole] !== null && state.players[aiRole] !== AI_ID) { isAiMode = false; sessionStorage.removeItem('xq_ai_mode_' + room); updateRoleBadge(); }

      if (isAiMode && myRole !== 'spectator') {
        let currentBoardStr = JSON.stringify(state.board);
        if (state.turn === aiRole && (state.status === 'playing' || state.status === 'check') && !isAiThinking) {
          if (currentBoardStr !== lastSurrenderedBoard) { isAiThinking = true; setTimeout(makeAIMove, 50); } 
          else { updateInformation("對局結束：電腦無棋可走"); }
        }
        if (state.restartRequest === myRole) { updateChess('restart', { playerId: AI_ID, restartAction: 'agree' }); }
        if (state.undoRequest === myRole) { updateChess('undo', { playerId: AI_ID, undoAction: 'agree' }); }
      }

      let modal = document.getElementById('role-modal');
      if (modal.style.display === 'flex') {
        let btnB = document.getElementById('btn-role-b'); let btnR = document.getElementById('btn-role-r');
        if (state.players.b && state.players.b !== myId) { btnB.disabled = true; btnB.textContent = "(已被選)"; } else { btnB.disabled = false; btnB.textContent = "執黑棋"; }
        if (state.players.r && state.players.r !== myId) { btnR.disabled = true; btnR.textContent = "(已被選)"; } else { btnR.disabled = false; btnR.textContent = "執紅棋"; }

        let bPlayer = state.players.b ? String(state.players.b) : ""; let rPlayer = state.players.r ? String(state.players.r) : "";
        let isOtherHumanPlaying = (bPlayer !== "" && bPlayer !== myId && !bPlayer.startsWith('BOT_')) || (rPlayer !== "" && rPlayer !== myId && !rPlayer.startsWith('BOT_'));
        let aiMenuSection = document.getElementById('ai-menu-section');
        if (aiMenuSection) { if (isOtherHumanPlaying) aiMenuSection.style.display = 'none'; else aiMenuSection.style.display = 'block'; }
      }

      let restartBtn = document.getElementById('restart-btn'); let rejectBtn = document.getElementById('reject-btn');
      let undoBtn = document.getElementById('undo-btn'); let rejectUndoBtn = document.getElementById('reject-undo-btn');
      
      let replayBtn = document.getElementById('btn-replay'); 
      let stopReplayBtn = document.getElementById('btn-replay-stop'); 
      
      let reqAlert = document.getElementById('req-alert');
      let canUndo = (state.history && state.history.length > 0);

      if (myRole === 'b' || myRole === 'r') { 
        restartBtn.style.display = 'inline-block'; 
        if (state.restartRequest === myRole) { restartBtn.textContent = "❌ 等待..."; restartBtn.style.backgroundColor = "#9e9e9e"; restartBtn.onclick = () => requestRestart('cancel'); rejectBtn.style.display = 'none'; } 
        else if (state.restartRequest && state.restartRequest !== myRole) { restartBtn.textContent = "✅ 同意重開"; restartBtn.style.backgroundColor = "#E91E63"; restartBtn.onclick = () => requestRestart('agree'); rejectBtn.style.display = 'inline-block'; } 
        else { restartBtn.textContent = "🆕 重開"; restartBtn.style.backgroundColor = "#4CAF50"; restartBtn.onclick = () => requestRestart('request'); rejectBtn.style.display = 'none'; }

        if (state.undoRequest === myRole) { undoBtn.style.display = 'inline-block'; undoBtn.textContent = "❌ 等待..."; undoBtn.style.backgroundColor = "#9e9e9e"; undoBtn.onclick = () => requestUndo('cancel'); rejectUndoBtn.style.display = 'none'; } 
        else if (state.undoRequest && state.undoRequest !== myRole) { undoBtn.style.display = 'inline-block'; undoBtn.textContent = "✅ 同意悔棋"; undoBtn.style.backgroundColor = "#E91E63"; undoBtn.onclick = () => requestUndo('agree'); rejectUndoBtn.style.display = 'inline-block'; } 
        else { undoBtn.style.display = canUndo ? 'inline-block' : 'none'; undoBtn.textContent = "↩ 悔棋"; undoBtn.style.backgroundColor = "#ff9800"; undoBtn.onclick = () => requestUndo('request'); rejectUndoBtn.style.display = 'none'; }
      } else { 
        restartBtn.style.display = 'none'; rejectBtn.style.display = 'none'; undoBtn.style.display = 'none'; rejectUndoBtn.style.display = 'none';
      }

      // 🌟 控制觀棋者的覆盤按鈕顯示
      if (myRole === 'spectator' && canUndo) {
          if (!isReplaying) replayBtn.style.display = 'inline-block';
      } else {
          replayBtn.style.display = 'none';
          if (stopReplayBtn) stopReplayBtn.style.display = 'none';
          if (isReplaying) stopReplay(); // 若中途被選成玩家，強制結束覆盤
      }

      let reqMsg = "";
      if (state.restartRequest && state.restartRequest !== myRole && myRole !== 'spectator') reqMsg = "對方請求重新開局！";
      else if (state.restartRequest && myRole === 'spectator') reqMsg = (state.restartRequest === 'b' ? '黑方' : '紅方') + " 發起了重開請求...";
      else if (state.undoRequest && state.undoRequest !== myRole && myRole !== 'spectator') reqMsg = "對方請求悔棋！";
      else if (state.undoRequest && myRole === 'spectator') reqMsg = (state.undoRequest === 'b' ? '黑方' : '紅方') + " 發起了悔棋請求...";

      if (reqMsg) { reqAlert.style.display = 'block'; reqAlert.textContent = reqMsg; } else { reqAlert.style.display = 'none'; }

      let checkMsg = document.getElementById('check-msg');
      if (state.status === 'check') { checkMsg.style.display = 'block'; checkMsg.textContent = state.checkMsg + " 將軍！"; } else { checkMsg.style.display = 'none'; }
      
      // 🌟 若不在覆盤模式，才正常渲染即時棋盤
      if (!isReplaying) renderBoard();
    }

    function renderBoard() {
      const grid = document.getElementById('board-grid'); grid.innerHTML = ''; let isFlipped = (myRole === 'b'); 
      for (let displayR = 0; displayR < 10; displayR++) {
        for (let displayC = 0; displayC < 9; displayC++) {
          let r = isFlipped ? 9 - displayR : displayR; let c = isFlipped ? 8 - displayC : displayC;
          let cellDiv = document.createElement('div'); cellDiv.className = 'cell'; cellDiv.dataset.r = r; cellDiv.dataset.c = c; cellDiv.onclick = () => handleCellClick(r, c);
          
          if (gameState.lastMove && gameState.lastMove.r1 === r && gameState.lastMove.c1 === c) cellDiv.classList.add('last-move-origin');

          let p = gameState.board[r][c];
          if (p) {
            let pieceDiv = document.createElement('div'); pieceDiv.className = 'piece ' + (p === p.toLowerCase() ? 'black' : 'red');
            if (selectedCell && selectedCell.r === r && selectedCell.c === c) pieceDiv.classList.add('selected');
            if (gameState.lastMove && gameState.lastMove.r2 === r && gameState.lastMove.c2 === c) pieceDiv.classList.add('last-moved');
            pieceDiv.textContent = piecesText[p]; cellDiv.appendChild(pieceDiv);
          }
          if (selectedCell && isMoveLegal(gameState.board, selectedCell.r, selectedCell.c, r, c)) {
             if (!leavesKingInCheck(gameState.board, selectedCell.r, selectedCell.c, r, c, gameState.turn)) cellDiv.classList.add('valid-move');
          }
          grid.appendChild(cellDiv);
        }
      }
    }

    // ==========================================
    // 🌟 觀戰模式：覆盤系統 (Review System)
    // ==========================================
    function getInitialBoardLocal() {
      return [
        ['r','h','e','a','k','a','e','h','r'],['','','','','','','','',''],['','c','','','','','','c',''],['p','','p','','p','','p','','p'],['','','','','','','','',''],
        ['','','','','','','','',''],['P','','P','','P','','P','','P'],['','C','','','','','','C',''],['','','','','','','','',''],['R','H','E','A','K','A','E','H','R']
      ];
    }

    function startReplay() {
      if (!gameState || !gameState.history || gameState.history.length === 0) {
        updateInformation("沒有歷史紀錄可以覆盤！"); return;
      }
      if (isReplaying) return;
      
      isReplaying = true;
      isReplayPaused = false;
      replayStep = 0;
      replaySteps = gameState.history;

      // 🌟 核心修改 3：讓覆盤能抓到正確的起點
      if (gameState.initialBoard) {
        console.log('getinitialBoard',gameState.initialBoard )
        replayBoard = JSON.parse(JSON.stringify(gameState.initialBoard));
      } else {
        replayBoard = getInitialBoardLocal();
      }
      
      let replayBtn = document.getElementById('btn-replay');
      replayBtn.style.backgroundColor = "#FF9800"; 
      replayBtn.textContent = "⏸️ 暫停";
      replayBtn.onclick = toggleReplayPlayPause;
      
      let stopBtn = document.getElementById('btn-replay-stop');
      stopBtn.style.display = 'inline-block'; 
      
      updateInformation("開始覆盤...");
      renderCustomBoard(replayBoard, null); 
      
      runReplayInterval();
    }

    function toggleReplayPlayPause() {
      let replayBtn = document.getElementById('btn-replay');
      if (isReplayPaused) {
        isReplayPaused = false;
        replayBtn.style.backgroundColor = "#FF9800";
        replayBtn.textContent = "⏸️ 暫停";
        updateInformation("繼續覆盤...");
        runReplayInterval();
      } else {
        isReplayPaused = true;
        clearInterval(replayInterval);
        replayBtn.style.backgroundColor = "#4CAF50";
        replayBtn.textContent = "▶️ 繼續";
        updateInformation("覆盤已暫停。");
      }
    }

    function runReplayInterval() {
      clearInterval(replayInterval);
      replayInterval = setInterval(() => {
        if (replayStep >= replaySteps.length) {
          clearInterval(replayInterval);
          isReplayPaused = true; 
          document.getElementById('btn-replay').style.display = 'none'; 
          updateInformation("覆盤結束，請按「結束」返回即時戰況。");
          return;
        }
        
        let move = replaySteps[replayStep];
        let p = replayBoard[move.r1][move.c1];
        replayBoard[move.r2][move.c2] = p;
        replayBoard[move.r1][move.c1] = '';
        
        let notation = getMoveNotation(p, move.r1, move.c1, move.r2, move.c2);
        updateInformation(`覆盤 [${replayStep + 1}/${replaySteps.length}]: ${notation}`);
        
        renderCustomBoard(replayBoard, move);
        replayStep++;
      }, 3000); // 3 秒走一步
    }

    function stopReplay() {
      if (!isReplaying) return;
      isReplaying = false;
      isReplayPaused = false;
      clearInterval(replayInterval);
      
      let replayBtn = document.getElementById('btn-replay');
      replayBtn.style.backgroundColor = "#9C27B0";
      replayBtn.textContent = "▶️ 覆盤";
      replayBtn.onclick = startReplay;
      
      let stopBtn = document.getElementById('btn-replay-stop');
      stopBtn.style.display = 'none';
      
      updateInformation("已結束覆盤，返回即時盤面。");
      updateUI(gameState); 
    }

    function renderCustomBoard(customBoard, lastMoveMarker) {
      const grid = document.getElementById('board-grid'); grid.innerHTML = ''; 
      let isFlipped = (myRole === 'b'); 
      for (let displayR = 0; displayR < 10; displayR++) {
        for (let displayC = 0; displayC < 9; displayC++) {
          let r = isFlipped ? 9 - displayR : displayR; let c = isFlipped ? 8 - displayC : displayC;
          let cellDiv = document.createElement('div'); cellDiv.className = 'cell'; 
          
          if (lastMoveMarker && lastMoveMarker.r1 === r && lastMoveMarker.c1 === c) cellDiv.classList.add('last-move-origin');

          let p = customBoard[r][c];
          if (p) {
            let pieceDiv = document.createElement('div'); pieceDiv.className = 'piece ' + (p === p.toLowerCase() ? 'black' : 'red');
            if (lastMoveMarker && lastMoveMarker.r2 === r && lastMoveMarker.c2 === c) pieceDiv.classList.add('last-moved');
            pieceDiv.textContent = piecesText[p]; cellDiv.appendChild(pieceDiv);
          }
          grid.appendChild(cellDiv);
        }
      }
    }
    // ==========================================

    function handleCellClick(r, c) {
      if (myRole === 'spectator' || gameState.turn !== myRole || isAiThinking) return;
      let clickedPiece = gameState.board[r][c]; let isMyPiece = clickedPiece && (myRole === 'b' ? clickedPiece === clickedPiece.toLowerCase() : clickedPiece === clickedPiece.toUpperCase());
      if (selectedCell) {
        if (selectedCell.r === r && selectedCell.c === c) selectedCell = null; else if (isMyPiece) selectedCell = { r: r, c: c }; 
        else { 
          if (isMoveLegal(gameState.board, selectedCell.r, selectedCell.c, r, c)) { 
            if (!leavesKingInCheck(gameState.board, selectedCell.r, selectedCell.c, r, c, myRole)) commitMove(selectedCell.r, selectedCell.c, r, c); 
            else updateInformation("不能送將！");
          } 
        }
      } else { if (isMyPiece) selectedCell = { r: r, c: c }; } renderBoard();
    }

    let syncQueue = []; let isProcessingQueue = false;
    async function processSyncQueue() {
      if (isProcessingQueue) return; isProcessingQueue = true; isSyncing = true;
      while (syncQueue.length > 0) {
        let stateToSync = syncQueue[syncQueue.length - 1]; syncQueue = []; 
        try { await updateChess('move', { state: stateToSync }); } catch(e) {}
      }
      isProcessingQueue = false; isSyncing = false;
    }

    // 🌟 【極致壓縮版】 commitMove
    function commitMove(r1, c1, r2, c2) {
      lastActionTime = Date.now(); 
      let nextState = JSON.parse(JSON.stringify(gameState));
      if (!nextState.history) nextState.history = []; 
      
      // 不存盤面，只存移動座標與被吃掉的棋子
      nextState.history.push({ 
          r1: r1, c1: c1, r2: r2, c2: c2,
          eaten: nextState.board[r2][c2],
          oldTurn: gameState.turn,
          oldStatus: gameState.status,
          oldCheckMsg: gameState.checkMsg,
          oldLastMove: gameState.lastMove ? Object.assign({}, gameState.lastMove) : null
      }); 
      
      // 極致壓縮後容量極小，保留 500 步都沒問題
      if (nextState.history.length > 500) nextState.history.shift(); 
      
      nextState.board[r2][c2] = nextState.board[r1][c1]; 
      nextState.board[r1][c1] = '';
      
      let nextTurn = gameState.turn === 'b' ? 'r' : 'b'; 
      let checkAlert = ''; let status = 'playing';
      if (isKingAttacked(nextState.board, nextTurn)) { status = 'check'; checkAlert = nextTurn === 'b' ? '黑方' : '紅方'; }
      
      nextState.turn = nextTurn; nextState.status = status; nextState.checkMsg = checkAlert; 
      nextState.restartRequest = null; nextState.undoRequest = null; 
      nextState.lastMove = { r1: r1, c1: c1, r2: r2, c2: c2 };
      
      selectedCell = null; 
      updateUI(nextState); 
      syncQueue.push(gameState);
      processSyncQueue();
    }

    const PIECE_VALUES = { 'k':100000, 'r':1000, 'c':550, 'h':500, 'e':250, 'a':250, 'p':100, 'K':100000, 'R':1000, 'C':550, 'H':500, 'E':250, 'A':250, 'P':100 };

    function evaluateBoard(board, aiColor) {
      let score = 0;
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          let p = board[r][c];
          if (p) {
            let isBlack = (p === p.toLowerCase()); let forwardR = isBlack ? r : 9 - r; let absC = Math.abs(c - 4); let val = PIECE_VALUES[p]; let pType = p.toLowerCase();
            if (pType === 'p') { if (forwardR > 4) val += 80 + forwardR * 15 + (4 - absC) * 15; else val += forwardR * 5; } 
            else if (pType === 'h') { val += (4 - absC) * 12 + forwardR * 8; if (c === 0 || c === 8) val -= 40; if (forwardR === 9) val -= 30; } 
            else if (pType === 'c') { val += (4 - absC) * 8; if (forwardR > 4) val += 20; if (forwardR === 0) val += 15; } 
            else if (pType === 'r') {
              if (forwardR > 0) val += 25; if (c === 4) val += 20; if (forwardR === 8 || forwardR === 9) val += 30; 
              let openFile = true; for(let scanR=0; scanR<10; scanR++) { if(board[scanR][c] && board[scanR][c].toLowerCase() === 'p') openFile = false; }
              if(openFile) val += 30;
            }
            if (getColor(p) === aiColor) score += val; else score -= val;
          }
        }
      }
      let aiOppColor = aiColor === 'b' ? 'r' : 'b';
      if (isKingAttacked(board, aiColor)) score -= 150;
      if (isKingAttacked(board, aiOppColor)) score += 150;
      return score;
    }

    function getAllLegalMovesList(board, color) {
      let moves = [];
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          if (getColor(board[r][c]) === color) {
            for (let tr = 0; tr < 10; tr++) {
              for (let tc = 0; tc < 9; tc++) {
                if (isMoveLegal(board, r, c, tr, tc) && !leavesKingInCheck(board, r, c, tr, tc, color)) {
                  let p = board[r][c]; let target = board[tr][tc]; let moveScore = 0;
                  if (target !== '') moveScore = PIECE_VALUES[target] * 10 - PIECE_VALUES[p];
                  else moveScore = ((color === 'b') ? tr - r : r - tr) + (4 - Math.abs(tc - 4));
                  moves.push({ r1: r, c1: c, r2: tr, c2: tc, score: moveScore });
                }
              }
            }
          }
        }
      }
      moves.sort((a, b) => b.score - a.score); return moves;
    }

    function quiesce(board, alpha, beta, isMaximizing, aiColor, qDepth) {
      let currentColor = isMaximizing ? aiColor : (aiColor === 'b' ? 'r' : 'b'); let inCheck = isKingAttacked(board, currentColor); let stand_pat = evaluateBoard(board, aiColor);
      if (!inCheck) { if (isMaximizing) { if (stand_pat >= beta) return beta; alpha = Math.max(alpha, stand_pat); } else { if (stand_pat <= alpha) return alpha; beta = Math.min(beta, stand_pat); } }
      if (qDepth > 3) return stand_pat;
      let moves = getAllLegalMovesList(board, currentColor);
      if (inCheck && moves.length === 0) return isMaximizing ? -99999 - qDepth : 99999 + qDepth;
      if (!inCheck) moves = moves.filter(m => board[m.r2][m.c2] !== ''); 
      let bestScore = stand_pat; if (inCheck) bestScore = isMaximizing ? -Infinity : Infinity;
      for (let move of moves) {
          let p = board[move.r1][move.c1]; let target = board[move.r2][move.c2]; board[move.r2][move.c2] = p; board[move.r1][move.c1] = '';
          let score = quiesce(board, alpha, beta, !isMaximizing, aiColor, qDepth + 1);
          board[move.r1][move.c1] = p; board[move.r2][move.c2] = target;
          if (isMaximizing) { bestScore = Math.max(bestScore, score); alpha = Math.max(alpha, score); if (beta <= alpha) break; } 
          else { bestScore = Math.min(bestScore, score); beta = Math.min(beta, score); if (beta <= alpha) break; }
      }
      return bestScore;
    }

    function minimax(board, depth, alpha, beta, isMaximizing, aiColor) {
      if (depth === 0) return quiesce(board, alpha, beta, isMaximizing, aiColor, 0);
      let currentColor = isMaximizing ? aiColor : (aiColor === 'b' ? 'r' : 'b'); let moves = getAllLegalMovesList(board, currentColor);
      if (moves.length === 0) return isMaximizing ? -99999 - depth : 99999 + depth;
      if (isMaximizing) {
        let maxEval = -Infinity;
        for (let move of moves) {
          let p = board[move.r1][move.c1]; let target = board[move.r2][move.c2]; board[move.r2][move.c2] = p; board[move.r1][move.c1] = '';
          let ev = minimax(board, depth - 1, alpha, beta, false, aiColor);
          board[move.r1][move.c1] = p; board[move.r2][move.c2] = target; 
          maxEval = Math.max(maxEval, ev); alpha = Math.max(alpha, ev); if (beta <= alpha) break; 
        } return maxEval;
      } else {
        let minEval = Infinity;
        for (let move of moves) {
          let p = board[move.r1][move.c1]; let target = board[move.r2][move.c2]; board[move.r2][move.c2] = p; board[move.r1][move.c1] = '';
          let ev = minimax(board, depth - 1, alpha, beta, true, aiColor);
          board[move.r1][move.c1] = p; board[move.r2][move.c2] = target; 
          minEval = Math.min(minEval, ev); beta = Math.min(beta, ev); if (beta <= alpha) break; 
        } return minEval;
      }
    }

    async function makeAIMove() {
      try {
        await new Promise(r => setTimeout(r, 100)); 
        if (!isAiMode || gameState.turn !== aiRole || (gameState.status !== 'playing' && gameState.status !== 'check')) return;

        let aiLevel = sessionStorage.getItem('xq_ai_level_' + room) || 'easy'; let validMoves = getAllLegalMovesList(gameState.board, aiRole);
        if (validMoves.length === 0) {
          let currentBoardStr = JSON.stringify(gameState.board);
          if (lastSurrenderedBoard !== currentBoardStr) { lastSurrenderedBoard = currentBoardStr; updateInformation("對局結束：電腦無棋可走"); } return;
        }

        let totalPieces = 0; for (let r=0; r<10; r++) for (let c=0; c<9; c++) if (gameState.board[r][c] !== '') totalPieces++;
        let isCurrentlyInCheck = isKingAttacked(gameState.board, aiRole); let turnCount = gameState.history ? gameState.history.length : 0;

        /*if (turnCount <= 4 && !isCurrentlyInCheck) { 
          let openings = [];
          if (aiRole === 'b') openings = [ {r1:2, c1:1, r2:2, c2:4}, {r1:2, c1:7, r2:2, c2:4}, {r1:0, c1:1, r2:2, c2:2}, {r1:0, c1:7, r2:2, c2:6}, {r1:0, c1:2, r2:2, c2:4}, {r1:0, c1:6, r2:2, c2:4}, {r1:3, c1:2, r2:4, c2:2}, {r1:3, c1:6, r2:4, c2:6} ];
          else openings = [ {r1:7, c1:1, r2:7, c2:4}, {r1:7, c1:7, r2:7, c2:4}, {r1:9, c1:1, r2:7, c2:2}, {r1:9, c1:7, r2:7, c2:6}, {r1:9, c1:2, r2:7, c2:4}, {r1:9, c1:6, r2:7, c2:4}, {r1:6, c1:2, r2:5, c2:2}, {r1:6, c1:6, r2:5, c2:6} ];
          
          let legalOpenings = openings.filter(m => isMoveLegal(gameState.board, m.r1, m.c1, m.r2, m.c2) && !leavesKingInCheck(gameState.board, m.r1, m.c1, m.r2, m.c2, aiRole));
          if (legalOpenings.length > 0) { let bestMove = legalOpenings[Math.floor(Math.random() * legalOpenings.length)]; commitMove(bestMove.r1, bestMove.c1, bestMove.r2, bestMove.c2); return; }
        }*/

        // 🌟 修正：只有在滿盤 (總棋子數接近32) 時才使用開局庫，且必須檢查棋子是不是自己的！
        if (turnCount <= 4 && !isCurrentlyInCheck && totalPieces >= 30) { 
          let openings = [];
          if (aiRole === 'b') openings = [ {r1:2, c1:1, r2:2, c2:4}, {r1:2, c1:7, r2:2, c2:4}, {r1:0, c1:1, r2:2, c2:2}, {r1:0, c1:7, r2:2, c2:6}, {r1:0, c1:2, r2:2, c2:4}, {r1:0, c1:6, r2:2, c2:4}, {r1:3, c1:2, r2:4, c2:2}, {r1:3, c1:6, r2:4, c2:6} ];
          else openings = [ {r1:7, c1:1, r2:7, c2:4}, {r1:7, c1:7, r2:7, c2:4}, {r1:9, c1:1, r2:7, c2:2}, {r1:9, c1:7, r2:7, c2:6}, {r1:9, c1:2, r2:7, c2:4}, {r1:9, c1:6, r2:7, c2:4}, {r1:6, c1:2, r2:5, c2:2}, {r1:6, c1:6, r2:5, c2:6} ];
          
          let legalOpenings = openings.filter(m => 
            getColor(gameState.board[m.r1][m.c1]) === aiRole && // 👈 關鍵修正：確保要動的棋子是 AI 自己的顏色
            isMoveLegal(gameState.board, m.r1, m.c1, m.r2, m.c2) && 
            !leavesKingInCheck(gameState.board, m.r1, m.c1, m.r2, m.c2, aiRole)
          );
          if (legalOpenings.length > 0) { let bestMove = legalOpenings[Math.floor(Math.random() * legalOpenings.length)]; commitMove(bestMove.r1, bestMove.c1, bestMove.r2, bestMove.c2); return; }
        }

        let bestVal = -Infinity;
        let searchDepth = 2; if (aiLevel === 'hard') { searchDepth = totalPieces <= 16 ? 5 : 4; }
        let candidateMoves = [];

        let lastMyMove = null;
        if (gameState.history) {
            for (let i = gameState.history.length - 1; i >= 0; i--) {
                if (gameState.history[i].oldTurn === aiRole) { lastMyMove = gameState.history[i]; break; }
            }
        }

        for (let move of validMoves) {
          let p = gameState.board[move.r1][move.c1]; let target = gameState.board[move.r2][move.c2];
          gameState.board[move.r2][move.c2] = p; gameState.board[move.r1][move.c1] = '';
          let moveVal = minimax(gameState.board, searchDepth - 1, -Infinity, Infinity, false, aiRole);
          gameState.board[move.r1][move.c1] = p; gameState.board[move.r2][move.c2] = target; 

          if (lastMyMove && move.r1 === lastMyMove.r2 && move.c1 === lastMyMove.c2 && move.r2 === lastMyMove.r1 && move.c2 === lastMyMove.c1) {
              moveVal -= 50000;
          }

          if (aiLevel === 'easy') moveVal += (Math.random() * 100 - 50); 
          else moveVal += Math.random() * 2; 

          if (moveVal > bestVal) { bestVal = moveVal; candidateMoves = [move]; } 
          else if (moveVal === bestVal) { candidateMoves.push(move); }
          await new Promise(r => setTimeout(r, 0));
        }

        let bestMove = candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
        commitMove(bestMove.r1, bestMove.c1, bestMove.r2, bestMove.c2); 

      } finally { isAiThinking = false; }
    }
    Update_GAS();
    function getColor(p) { return p === '' ? '' : (p === p.toLowerCase() ? 'b' : 'r'); }
    function isMoveLegal(board, r1, c1, r2, c2) {
      let p = board[r1][c1]; let target = board[r2][c2]; if (p === '') return false; if (target !== '' && getColor(p) === getColor(target)) return false; 
      let dr = r2 - r1; let dc = c2 - c1; let adr = Math.abs(dr), adc = Math.abs(dc); let pType = p.toLowerCase(), color = getColor(p);
      switch (pType) {
        case 'p': if (color === 'b') return (dr === 1 && dc === 0) || (r1 >= 5 && dr === 0 && adc === 1); else return (dr === -1 && dc === 0) || (r1 <= 4 && dr === 0 && adc === 1);
        case 'r': if (adr > 0 && adc > 0) return false; return countPiecesBetween(board, r1, c1, r2, c2) === 0;
        case 'h': if (adr === 2 && adc === 1) return board[r1 + dr/2][c1] === ''; if (adr === 1 && adc === 2) return board[r1][c1 + dc/2] === ''; return false;
        case 'e': if (adr !== 2 || adc !== 2) return false; if (color === 'b' && r2 > 4) return false; if (color === 'r' && r2 < 5) return false; return board[r1 + dr/2][c1 + dc/2] === ''; 
        case 'a': if (adr !== 1 || adc !== 1) return false; if (c2 < 3 || c2 > 5) return false; if (color === 'b' && r2 > 2) return false; if (color === 'r' && r2 < 7) return false; return true;
        case 'k': if (adr + adc !== 1) return false; if (c2 < 3 || c2 > 5) return false; if (color === 'b' && r2 > 2) return false; if (color === 'r' && r2 < 7) return false; return true;
        case 'c': if (adr > 0 && adc > 0) return false; let between = countPiecesBetween(board, r1, c1, r2, c2); if (target === '') return between === 0; else return between === 1; 
      } return false;
    }
    function countPiecesBetween(board, r1, c1, r2, c2) { let count = 0; if (r1 === r2) { let minC = Math.min(c1, c2), maxC = Math.max(c1, c2); for (let c = minC + 1; c < maxC; c++) if (board[r1][c] !== '') count++; } else { let minR = Math.min(r1, r2), maxR = Math.max(r1, r2); for (let r = minR + 1; r < maxR; r++) if (board[r][c1] !== '') count++; } return count; }
    function isKingAttacked(board, kingColor) { let kr = -1, kc = -1, targetKing = kingColor === 'b' ? 'k' : 'K'; for (let r=0; r<10; r++) { for (let c=0; c<9; c++) { if (board[r][c] === targetKing) { kr = r; kc = c; break; } } if (kr !== -1) break; } if (kr === -1) return true; let oppColor = kingColor === 'b' ? 'r' : 'b'; for (let r=0; r<10; r++) { for (let c=0; c<9; c++) { if (getColor(board[r][c]) === oppColor) { if (isMoveLegal(board, r, c, kr, kc)) return true; } } } return false; }
    function leavesKingInCheck(board, r1, c1, r2, c2, color) { 
      let p = board[r1][c1]; let target = board[r2][c2]; board[r2][c2] = p; board[r1][c1] = ''; 
      let inCheck = isKingAttacked(board, color); let bkR=-1, bkC=-1, rkR=-1, rkC=-1; 
      if (!inCheck) {
        for (let r=0; r<10; r++) { for (let c=0; c<9; c++) { if (board[r][c] === 'k') { bkR = r; bkC = c; } if (board[r][c] === 'K') { rkR = r; rkC = c; } } } 
        if (bkC === rkC && bkC !== -1) { if (countPiecesBetween(board, bkR, bkC, rkR, rkC) === 0) inCheck = true; } 
      }
      board[r1][c1] = p; board[r2][c2] = target; return inCheck; 
    }
    
    window.onload = init;



    window['closeRoleModal']=closeRoleModal;
    window['requestRole']=requestRole;
    window['startAiGame']=startAiGame;
    window['showRoleModal']=showRoleModal;
    window['startReplay']=startReplay;
    window['stopReplay']=stopReplay;
    window['requestRestart']=requestRestart;
    window['requestUndo']=requestUndo;
    
    