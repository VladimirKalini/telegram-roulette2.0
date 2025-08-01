import { useState, useEffect } from 'react';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import { toNano, beginCell } from 'ton';
import './App.css';

// --- ДОБАВЬТЕ ЭТУ СТРОКУ ВВЕРХУ ФАЙЛА ---
const API_BASE_URL = ''; // Пустая строка - Nginx сам перенаправляет запросы

// Описываем, как выглядит объект "Подарок" с новым полем
interface Gift {
  id: number;
  name: string;
  description: string;
  price_ton: string;
  user_gift_id?: number; // Уникальный ID экземпляра подарка в инвентаре
}

// Тип для текущего вида
type View = 'shop' | 'inventory' | 'roulette';

// Типы для рулетки
interface RoulettePlayer {
  userId: number;
  username: string;
  totalBet: number;
  gifts: Gift[];
  color: string;
  percentage: number;
}

interface RouletteState {
  isActive: boolean;
  players: RoulettePlayer[];
  timeLeft: number;
  isSpinning: boolean;
  winner?: RoulettePlayer;
}

function App() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [myGifts, setMyGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [view, setView] = useState<View>('roulette'); // Начинаем с рулетки
  const [selectedGifts, setSelectedGifts] = useState<Gift[]>([]);
  const [showGiftSelector, setShowGiftSelector] = useState<boolean>(false);
  const [rouletteState, setRouletteState] = useState<RouletteState>({
    isActive: false,
    players: [],
    timeLeft: 0,
    isSpinning: false
  });
  
  // Цвета для игроков
  const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const user = WebApp.initDataUnsafe?.user;
  
  // Отладка состояния кошелька
  useEffect(() => {
    console.log('Wallet state:', wallet);
    console.log('User:', user);
    console.log('TonConnectUI:', tonConnectUI);
  }, [wallet, user, tonConnectUI]);

  // --- Загрузка данных при старте ---
  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      try {
        // Синхронизируем пользователя
        if (user) {
          await fetch(`${API_BASE_URL}/api/users/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, username: user.username }),
          });
        }
        // Загружаем товары магазина
        await fetchShopGifts();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Произошла неизвестная ошибка');
      } finally {
        setLoading(false);
      }
    };
    initialLoad();
  }, [user]);

  // --- Автоматический polling рулетки ---
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (view === 'roulette') {
      // Обновляем состояние рулетки каждые 2 секунды
      interval = setInterval(() => {
        fetchRouletteState();
      }, 2000);
      
      // Начальная загрузка
      fetchRouletteState();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [view]);

  // --- Автоматический запуск рулетки ---
  useEffect(() => {
    if (rouletteState.timeLeft === 0 && rouletteState.isActive && !rouletteState.isSpinning && rouletteState.players.length >= 2) {
      console.log('Автоматический запуск рулетки!');
      spinRoulette();
    }
  }, [rouletteState.timeLeft, rouletteState.isActive, rouletteState.isSpinning]);

  // --- Функции для загрузки данных ---
  const fetchShopGifts = async () => {
    const response = await fetch(`${API_BASE_URL}/api/store/gifts`);
    if (!response.ok) throw new Error('Ошибка загрузки товаров');
    const data: Gift[] = await response.json();
    setGifts(data);
  };

  const fetchMyGifts = async () => {
    if (!user) return;
    setLoading(true);
    setStatusMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/gifts`);
      if (!response.ok) throw new Error('Ошибка загрузки инвентаря');
      const data: Gift[] = await response.json();
      setMyGifts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Произошла неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };
  
  // --- Логика покупки ---
  const handleBuy = async (gift: Gift) => {
    console.log('handleBuy called', { wallet, user, gift });
    
    if (!wallet) {
        setStatusMessage('Необходимо подключить кошелёк!');
        console.log('Opening wallet modal...');
        tonConnectUI.openModal();
        return;
    }
    
    if (!user) {
        setStatusMessage('Ошибка: не удаётся определить пользователя Telegram');
        return;
    }
    
    setStatusMessage(`Покупаем "${gift.name}"...`);
    const memo = `buy-gift-${gift.id}-for-user-${user.id}-${Date.now()}`;
    setDebugInfo(`DEBUG: Мемо: ${memo}, Сумма: ${gift.price_ton} TON, User ID: ${user.id}`);
    console.log('Transaction memo:', memo);
    
    // Пробуем через Telegram WebApp API
    if (WebApp.openInvoice) {
        try {
            const invoiceUrl = `ton://transfer/${"UQA6qcGAwqhOxgX81n-P_RVAIMOkeYoaoDWtAtyWAvOZtuuA"}?amount=${toNano(gift.price_ton)}&text=${encodeURIComponent(memo)}`;
            WebApp.openInvoice(invoiceUrl, (status: string) => {
                console.log('Invoice status:', status);
                if (status === 'paid') {
                    setStatusMessage('Платёж отправлен! Проверяем...');
                    // Проверяем на сервере
                    setTimeout(() => checkPurchase(user.id, gift.id, memo), 3000);
                }
            });
            return;
        } catch (e) {
            console.log('WebApp.openInvoice failed, trying TON Connect');
        }
    }
    
    // Если openInvoice не работает, используем TON Connect
    // Создаём payload с мемо
    const body = beginCell()
      .storeUint(0, 32) // op code для текстового комментария
      .storeStringTail(memo)
      .endCell();
    
    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: "UQA6qcGAwqhOxgX81n-P_RVAIMOkeYoaoDWtAtyWAvOZtuuA",
          amount: toNano(gift.price_ton).toString(),
          payload: body.toBoc().toString('base64'),
        },
      ],
    };
    
    // ТЕСТОВЫЙ РЕЖИМ: покупка без реальных TON
    setStatusMessage('Тестовая покупка - обрабатываем...');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/store/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, giftId: gift.id, transactionMemo: memo }),
      });
      
      const serverResult = await response.json();
      console.log('Server response:', serverResult);
      
      if (response.ok) {
        setStatusMessage(serverResult.message || `🎁 Успех! "${gift.name}" добавлен в ваш инвентарь (тестовый режим)`);
        setDebugInfo(''); // Очищаем DEBUG после покупки
        // Обновляем список товаров в инвентаре
        if (view === 'inventory') {
          await fetchMyGifts();
        }
        // Также обновляем инвентарь для рулетки
        await fetchMyGifts();
      } else {
        throw new Error(serverResult.error || 'Ошибка подтверждения покупки на сервере.');
      }
    } catch (e) {
      console.error('Transaction error:', e);
      setStatusMessage(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`);
    }
  };
  
  // Вспомогательная функция для проверки покупки
  const checkPurchase = async (userId: number, giftId: number, memo: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/store/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, giftId, transactionMemo: memo }),
      });
      
      const result = await response.json();
      if (response.ok) {
        setStatusMessage('Успех! Подарок добавлен в инвентарь.');
      } else {
        setStatusMessage(`Ошибка: ${result.error}`);
      }
    } catch (e) {
      setStatusMessage('Ошибка проверки платежа');
    }
  };

  // --- НОВАЯ ЛОГИКА РУЛЕТКИ ---
  
  // Открыть выбор подарков
  const openGiftSelector = () => {
    setShowGiftSelector(true);
  };
  
  // Выбрать/отменить подарок
  const toggleGiftSelection = (gift: Gift) => {
    const isSelected = selectedGifts.some(g => g.user_gift_id === gift.user_gift_id);
    if (isSelected) {
      setSelectedGifts(selectedGifts.filter(g => g.user_gift_id !== gift.user_gift_id));
    } else {
      setSelectedGifts([...selectedGifts, gift]);
    }
  };
  
  // Поставить выбранные подарки
  const placeBets = async () => {
    console.log('placeBets called with:', selectedGifts);
    setDebugInfo(`DEBUG: Поставка ставки, подарков: ${selectedGifts.length}`);
    
    if (!user || selectedGifts.length === 0) {
      setStatusMessage('Выберите подарки для ставки');
      return;
    }
    
    const totalValue = selectedGifts.reduce((sum, gift) => sum + parseFloat(gift.price_ton), 0);
    setStatusMessage(`Ставим подарки на сумму ${totalValue.toFixed(2)} TON...`);
    
    try {
      console.log('Starting to place bets...');
      setDebugInfo(`DEBUG: Отправляем ставки на сервер...`);
      
      // Отправляем все выбранные подарки
      for (const gift of selectedGifts) {
        console.log('Placing bet for gift:', gift);
        
        const response = await fetch(`${API_BASE_URL}/api/roulette/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, userGiftId: gift.user_gift_id }),
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const result = await response.json();
          console.error('Bet failed:', result);
          setDebugInfo(`DEBUG: Ошибка ставки: ${result.error}`);
          setStatusMessage(`Ошибка: ${result.error}`);
          return; // Прекращаем выполнение
        }
        
        const result = await response.json();
        console.log('Bet successful:', result);
      }
      
      setStatusMessage(`Успех! Поставлено ${selectedGifts.length} подарков на ${totalValue.toFixed(2)} TON`);
      setDebugInfo(`DEBUG: Ставка успешна! Обновляем рулетку...`);
      setSelectedGifts([]);
      setShowGiftSelector(false);
      
      console.log('🎯 Ставки размещены, обновляем данные...');
      
      // Обновляем состояние рулетки
      await fetchRouletteState();
      await fetchMyGifts();
      
      console.log('🎯 Данные обновлены после ставки');
      
    } catch (e) {
      setStatusMessage(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`);
    }
  };
  
  // Получить состояние рулетки
  const fetchRouletteState = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/roulette/state`);
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 RAW Backend data:', JSON.stringify(data, null, 2));
        
        // Используем данные напрямую из backend (поле players, не participants)
        const players = data.players ? data.players.map((p: any) => ({
          userId: parseInt(p.userId),
          username: p.username,
          totalBet: p.totalBet,
          percentage: p.percentage,
          color: p.color || '#FF6B6B' // fallback цвет если нет
        })) : [];
        
        console.log('🔍 Players after mapping:', players.map(p => ({ 
          userId: p.userId, 
          username: p.username, 
          color: p.color,
          percentage: p.percentage 
        })));
        
        console.log('🔍 Processed players:', players);
        
        const newState = {
          isActive: data.status === 'countdown',
          players,
          timeLeft: data.timeLeft || 0,
          isSpinning: data.status === 'spinning',
          winner: data.winner
        };
        
        console.log('🔍 Setting roulette state:', newState);
        setRouletteState(newState);
      } else {
        console.error('❌ Response not ok:', response.status, response.statusText);
      }
    } catch (e) {
      console.error('❌ Ошибка получения состояния рулетки:', e);
    }
  };

  // Запустить рулетку
  const spinRoulette = async () => {
    try {
      setStatusMessage('Крутим рулетку...');
      setRouletteState(prev => ({ ...prev, isSpinning: true }));
      
      const response = await fetch(`${API_BASE_URL}/api/roulette/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Ждем завершения анимации (4 секунды)
        setTimeout(() => {
          setStatusMessage(`🎉 ${result.spinResult}`);
          setRouletteState(prev => ({ 
            ...prev, 
            isSpinning: false, 
            winner: result.winner 
          }));
          
          // Обновляем состояние через 2 секунды
          setTimeout(() => {
            fetchRouletteState();
            fetchMyGifts();
          }, 2000);
        }, 4000); // Увеличили до 4 секунд под новую анимацию
        
      } else {
        const errorResult = await response.json();
        setStatusMessage('Ошибка: ' + errorResult.error);
        setRouletteState(prev => ({ ...prev, isSpinning: false }));
      }
    } catch (e) {
      setStatusMessage('Ошибка запуска рулетки');
      setRouletteState(prev => ({ ...prev, isSpinning: false }));
    }
  };

  // Очистить раунд (для тестирования)
  const resetRound = async () => {
    try {
      setStatusMessage('Очищаем раунд...');
      
      const response = await fetch(`${API_BASE_URL}/api/roulette/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        setStatusMessage('Раунд очищен!');
        
        // Обновляем все данные
        await fetchRouletteState();
        await fetchMyGifts();
      } else {
        const result = await response.json();
        setStatusMessage('Ошибка очистки: ' + result.error);
      }
    } catch (e) {
      setStatusMessage('Ошибка очистки раунда');
    }
  };

  // --- Переключение вида ---
  const changeView = (newView: View) => {
    setError(null);
    setStatusMessage('');
    if (newView === 'inventory' || newView === 'roulette') {
      fetchMyGifts();
    }
    if (newView === 'roulette') {
      fetchRouletteState();
    }
    setView(newView);
  };

  // --- Отображение контента в зависимости от вида ---
  const renderContent = () => {
    if (loading) return <h1>Загрузка...</h1>;
    if (error) return <h1>Ошибка: {error}</h1>;

    switch (view) {
      case 'shop':
        return (
          <div className="gift-list">
            {gifts.map((gift) => (
              <div key={gift.id} className="gift-card">
                <h2>{gift.name}</h2>
                <p>{gift.description}</p>
                <div className="price-tag">{parseFloat(gift.price_ton).toFixed(2)} TON</div>
                <button className="buy-button" onClick={() => handleBuy(gift)}>Купить</button>
              </div>
            ))}
          </div>
        );
      case 'inventory':
        return (
          <div className="gift-list">
            {myGifts.length > 0 ? myGifts.map((gift) => (
              <div key={gift.user_gift_id} className="gift-card inventory-card">
                <h2>{gift.name}</h2>
                <p>{gift.description}</p>
              </div>
            )) : <p>У вас пока нет подарков.</p>}
          </div>
        );
      case 'roulette':
        console.log('🎯 Rendering roulette with state:', { 
          playersCount: rouletteState.players.length, 
          players: rouletteState.players.map(p => ({ username: p.username, color: p.color, percentage: p.percentage }))
        });
        
        return (
          <div style={{position: 'relative'}}>
            <div style={{position: 'relative', width: '350px', height: '350px', margin: '20px auto'}}>
              {/* Указатель - ВСЕГДА НА МЕСТЕ */}
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '0',
                height: '0',
                borderLeft: '15px solid transparent',
                borderRight: '15px solid transparent',
                borderTop: '30px solid #ff0000',
                zIndex: 20
              }}></div>
              
              {/* Рулетка - КРУТИТСЯ */}
              <div className="roulette-wheel" style={{
                width: '350px', 
                height: '350px', 
                border: '8px solid #333', 
                borderRadius: '50%', 
                position: 'relative',
                background: rouletteState.players.length === 0 ? '#f0f0f0' : 'conic-gradient(' + 
                  rouletteState.players.map((p, i) => {
                    const startPercentage = rouletteState.players.slice(0, i).reduce((sum, player) => sum + player.percentage, 0);
                    const endPercentage = startPercentage + p.percentage;
                    return `${p.color} ${startPercentage}% ${endPercentage}%`;
                  }).join(', ') + ')',
                transition: rouletteState.isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                transform: rouletteState.isSpinning ? `rotate(${1800 + Math.random() * 360}deg)` : 'rotate(0deg)'
              }}>
              
              {/* Игроки на рулетке */}
              {rouletteState.players.length > 0 && (
                <div style={{position: 'relative', width: '100%', height: '100%'}}>
                  {rouletteState.players.map((player, index) => {
                    // Вычисляем начальный угол для этого игрока
                    const startAngle = rouletteState.players.slice(0, index).reduce((sum, p) => sum + (p.percentage * 3.6), 0);
                    // Центральный угол зоны игрока
                    const centerAngle = startAngle + (player.percentage * 3.6) / 2;
                    
                    return (
                      <div key={player.userId} style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `rotate(${centerAngle}deg) translateY(-140px) rotate(-${centerAngle}deg)`,
                        transformOrigin: '0 0',
                        color: 'white',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        fontSize: '12px',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                      }}>
                        <div>{player.username}</div>
                        <div>{player.totalBet.toFixed(1)} TON</div>
                        <div>{player.percentage.toFixed(1)}%</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Центральный круг */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '120px',
                height: '120px',
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderRadius: '50%',
                border: '4px solid #333',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                {rouletteState.players.length === 0 ? (
                  <div style={{color: '#666'}}>
                    <div>🎯</div>
                    <div style={{fontSize: '12px', marginTop: '5px'}}>Ожидание игроков</div>
                  </div>
                ) : rouletteState.timeLeft > 0 ? (
                  <div style={{color: '#ff0000'}}>
                    <div style={{fontSize: '32px'}}>{rouletteState.timeLeft}</div>
                    <div style={{fontSize: '10px', marginTop: '5px'}}>секунд до спина</div>
                  </div>
                ) : rouletteState.isSpinning ? (
                  <div style={{color: '#ff8c00'}}>
                    <div style={{fontSize: '18px'}}>🎲</div>
                    <div style={{fontSize: '12px', marginTop: '5px'}}>Крутим...</div>
                  </div>
                ) : rouletteState.winner ? (
                  <div style={{color: '#00aa00'}}>
                    <div style={{fontSize: '16px'}}>🎉</div>
                    <div style={{fontSize: '10px', marginTop: '2px'}}>Победитель:</div>
                    <div style={{fontSize: '12px', marginTop: '2px'}}>{rouletteState.winner.username}</div>
                  </div>
                ) : (
                  <div style={{color: '#333'}}>
                    <div style={{fontSize: '16px'}}>⚡</div>
                    <div style={{fontSize: '11px', marginTop: '5px'}}>Игроков: {rouletteState.players.length}</div>
                    <div style={{fontSize: '10px'}}>Ждем еще...</div>
                  </div>
                )}
              </div>

              </div>
            </div>
            
            <div style={{textAlign: 'center', marginBottom: '20px'}}>
              <button 
                onClick={openGiftSelector}
                disabled={rouletteState.isSpinning}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#4ECDC4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: rouletteState.isSpinning ? 'not-allowed' : 'pointer',
                  opacity: rouletteState.isSpinning ? 0.5 : 1,
                  marginRight: '10px'
                }}
              >
                Выбрать подарки ({selectedGifts.length})
              </button>
              
              <button 
                onClick={resetRound}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#ff4757',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                🔄 Очистить раунд
              </button>
            </div>
            
            {/* Модальное окно выбора подарков */}
            {showGiftSelector && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.8)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '25px',
                  borderRadius: '15px',
                  maxWidth: '500px',
                  maxHeight: '70vh',
                  overflow: 'auto',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                  border: '1px solid #e0e0e0'
                }}>
                  <h3 style={{color: '#333', textAlign: 'center', marginBottom: '20px', fontSize: '18px'}}>Выберите подарки для ставки</h3>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    marginBottom: '20px'
                  }}>
                    {myGifts.length > 0 ? myGifts.map((gift) => {
                      const isSelected = selectedGifts.some(g => g.user_gift_id === gift.user_gift_id);
                      return (
                        <div 
                          key={gift.user_gift_id} 
                          onClick={() => toggleGiftSelection(gift)}
                          style={{
                            cursor: 'pointer',
                            border: isSelected ? '2px solid #4ECDC4' : '2px solid #ddd',
                            backgroundColor: isSelected ? '#e8f8f7' : 'white',
                            borderRadius: '8px',
                            padding: '12px',
                            textAlign: 'center',
                            transition: 'all 0.2s ease',
                            position: 'relative'
                          }}
                        >
                          <h4 style={{color: '#333', fontSize: '14px', margin: '0 0 8px 0'}}>{gift.name}</h4>
                          <div style={{color: '#666', fontSize: '12px', fontWeight: 'bold'}}>{parseFloat(gift.price_ton).toFixed(2)} TON</div>
                          {isSelected && (
                            <div style={{
                              position: 'absolute',
                              top: '5px',
                              right: '5px',
                              color: '#4ECDC4',
                              fontSize: '16px',
                              fontWeight: 'bold'
                            }}>✓</div>
                          )}
                        </div>
                      );
                    }) : <p style={{color: '#666', textAlign: 'center'}}>У вас нет подарков для ставки.</p>}
                  </div>
                  
                  <div style={{textAlign: 'center', borderTop: '1px solid #e0e0e0', paddingTop: '15px'}}>
                    {selectedGifts.length > 0 && (
                      <div style={{
                        backgroundColor: '#e8f5e8',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        marginBottom: '15px',
                        color: '#333',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        Общая стоимость: {selectedGifts.reduce((sum, gift) => sum + parseFloat(gift.price_ton), 0).toFixed(2)} TON
                      </div>
                    )}
                    
                    <button 
                      onClick={placeBets}
                      disabled={selectedGifts.length === 0}
                      style={{
                        padding: '12px 24px',
                        fontSize: '16px',
                        backgroundColor: selectedGifts.length > 0 ? '#4ECDC4' : '#ccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: selectedGifts.length > 0 ? 'pointer' : 'not-allowed',
                        marginRight: '10px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      🎲 Поставить ({selectedGifts.length})
                    </button>
                    
                    <button 
                      onClick={() => setShowGiftSelector(false)}
                      style={{
                        padding: '12px 24px',
                        fontSize: '16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      ✖ Отмена
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>{view === 'shop' ? 'Магазин' : view === 'inventory' ? 'Инвентарь' : 'Рулетка'}</h1>
        <div>
          <div style={{backgroundColor: '#ffeb3b', padding: '5px', borderRadius: '3px', fontSize: '12px', marginBottom: '10px', color: '#000'}}>
            📝 ТЕСТОВЫЙ РЕЖИМ - бесплатные покупки
          </div>
          <TonConnectButton />
          <div style={{fontSize: '12px', marginTop: '5px'}}>
            Кошелёк: {wallet ? `Подключён (${wallet.account.address.slice(0,6)}...)` : 'Не подключён'}
          </div>
        </div>
      </header>
      
      <nav className="navigation">
        <button onClick={() => changeView('roulette')} className={view === 'roulette' ? 'active' : ''}>Рулетка</button>
        <button onClick={() => changeView('shop')} className={view === 'shop' ? 'active' : ''}>Магазин</button>
        <button onClick={() => changeView('inventory')} className={view === 'inventory' ? 'active' : ''}>Инвентарь</button>
      </nav>

      {statusMessage && <div className="status-message">{statusMessage}</div>}
      {debugInfo && <div style={{background: '#f0f0f0', padding: '10px', fontSize: '12px', marginBottom: '10px', color: '#000'}}>{debugInfo}</div>}
      
      {renderContent()}
    </div>
  );
}

export default App;
