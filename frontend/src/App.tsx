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
    
    console.log('Sending transaction:', transaction);
    try {
      const result = await tonConnectUI.sendTransaction(transaction);
      console.log('Transaction result:', result);
      
      setStatusMessage('Транзакция отправлена! Проверяем на сервере...');
      
      // Ждём 5 секунд, чтобы транзакция попала в блокчейн
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const response = await fetch(`${API_BASE_URL}/api/store/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, giftId: gift.id, transactionMemo: memo }),
      });
      
      const serverResult = await response.json();
      console.log('Server response:', serverResult);
      
      if (response.ok) {
        setStatusMessage(`Успех! "${gift.name}" добавлен в ваш инвентарь.`);
        // Обновляем список товаров в инвентаре
        if (view === 'inventory') {
          await fetchMyGifts();
        }
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
    if (!user || selectedGifts.length === 0) {
      setStatusMessage('Выберите подарки для ставки');
      return;
    }
    
    const totalValue = selectedGifts.reduce((sum, gift) => sum + parseFloat(gift.price_ton), 0);
    setStatusMessage(`Ставим подарки на сумму ${totalValue.toFixed(2)} TON...`);
    
    try {
      // Отправляем все выбранные подарки
      for (const gift of selectedGifts) {
        const response = await fetch(`${API_BASE_URL}/api/roulette/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, userGiftId: gift.user_gift_id }),
        });
        
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Ошибка при размещении ставки');
        }
      }
      
      setStatusMessage(`Ставка принята! Поставлено ${selectedGifts.length} подарков на ${totalValue.toFixed(2)} TON`);
      setSelectedGifts([]);
      setShowGiftSelector(false);
      
      // Обновляем состояние рулетки
      await fetchRouletteState();
      await fetchMyGifts();
      
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
        // Обработка данных рулетки
        console.log('Roulette state:', data);
      }
    } catch (e) {
      console.error('Ошибка получения состояния рулетки:', e);
    }
  };

  // --- Переключение вида ---
  const changeView = (newView: View) => {
    setError(null);
    setStatusMessage('');
    if (newView === 'inventory' || newView === 'roulette') {
      fetchMyGifts();
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
        return (
          <div style={{position: 'relative'}}>
            <div className="roulette-wheel" style={{
              width: '300px', 
              height: '300px', 
              border: '5px solid #333', 
              borderRadius: '50%', 
              margin: '20px auto',
              background: rouletteState.players.length === 0 ? '#f0f0f0' : 'conic-gradient(' + 
                rouletteState.players.map((p, i) => 
                  `${p.color} ${i === 0 ? 0 : rouletteState.players.slice(0, i).reduce((sum, player) => sum + player.percentage, 0)}% ${rouletteState.players.slice(0, i + 1).reduce((sum, player) => sum + player.percentage, 0)}%`
                ).join(', ') + ')'
            }}>
              {rouletteState.players.length === 0 ? (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666'}}>
                  Ожидание игроков...
                </div>
              ) : (
                <div style={{position: 'relative', width: '100%', height: '100%'}}>
                  {rouletteState.players.map((player, index) => (
                    <div key={player.userId} style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: `rotate(${rouletteState.players.slice(0, index).reduce((sum, p) => sum + p.percentage, 0) + player.percentage / 2}deg) translateY(-120px)`,
                      transformOrigin: '0 0',
                      color: 'white',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      fontSize: '12px'
                    }}>
                      <div>{player.username}</div>
                      <div>{player.totalBet.toFixed(1)} TON</div>
                    </div>
                  ))}
                  {rouletteState.timeLeft > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#ff0000'
                    }}>
                      {rouletteState.timeLeft}
                    </div>
                  )}
                </div>
              )}
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
                  opacity: rouletteState.isSpinning ? 0.5 : 1
                }}
              >
                Выбрать подарки ({selectedGifts.length})
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
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '10px',
                  maxWidth: '90%',
                  maxHeight: '80%',
                  overflow: 'auto'
                }}>
                  <h3>Выберите подарки для ставки</h3>
                  
                  <div className="gift-list">
                    {myGifts.length > 0 ? myGifts.map((gift) => {
                      const isSelected = selectedGifts.some(g => g.user_gift_id === gift.user_gift_id);
                      return (
                        <div 
                          key={gift.user_gift_id} 
                          className={`gift-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleGiftSelection(gift)}
                          style={{
                            cursor: 'pointer',
                            border: isSelected ? '3px solid #4ECDC4' : '1px solid #ddd',
                            backgroundColor: isSelected ? '#e8f8f7' : 'white'
                          }}
                        >
                          <h2>{gift.name}</h2>
                          <div className="price-tag">{parseFloat(gift.price_ton).toFixed(2)} TON</div>
                          {isSelected && <div style={{color: '#4ECDC4', fontWeight: 'bold'}}>✓ Выбрано</div>}
                        </div>
                      );
                    }) : <p>У вас нет подарков для ставки.</p>}
                  </div>
                  
                  <div style={{marginTop: '20px', textAlign: 'center'}}>
                    {selectedGifts.length > 0 && (
                      <div style={{marginBottom: '10px'}}>
                        Общая стоимость: {selectedGifts.reduce((sum, gift) => sum + parseFloat(gift.price_ton), 0).toFixed(2)} TON
                      </div>
                    )}
                    
                    <button 
                      onClick={placeBets}
                      disabled={selectedGifts.length === 0}
                      style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: selectedGifts.length > 0 ? '#4ECDC4' : '#ccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: selectedGifts.length > 0 ? 'pointer' : 'not-allowed',
                        marginRight: '10px'
                      }}
                    >
                      Поставить ({selectedGifts.length})
                    </button>
                    
                    <button 
                      onClick={() => setShowGiftSelector(false)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: '#ff6b6b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Отмена
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
