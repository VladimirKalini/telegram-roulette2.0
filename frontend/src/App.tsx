import { useState, useEffect } from 'react';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import { toNano } from 'ton';
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

function App() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [myGifts, setMyGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [view, setView] = useState<View>('roulette'); // Начинаем с рулетки

  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const user = WebApp.initDataUnsafe?.user;

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
    if (!wallet || !user) {
        setStatusMessage('Подключите кошелек и перезапустите приложение');
        if(!wallet) tonConnectUI.openModal();
        return;
    }
    setStatusMessage(`Покупаем "${gift.name}"...`);
    const memo = `buy-gift-${gift.id}-for-user-${user.id}-${Date.now()}`;
    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: "UQA6qcGAwqhOxgX81n-P_RVAIMOkeYoaoDWtAtyWAvOZtuuA",
          amount: toNano(gift.price_ton).toString(),
          payload: memo,
        },
      ],
    };
    try {
      await tonConnectUI.sendTransaction(transaction);
      setStatusMessage('Транзакция отправлена! Проверяем на сервере...');
      const response = await fetch(`${API_BASE_URL}/api/store/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, giftId: gift.id, transactionMemo: memo }),
      });
      const result = await response.json();
      if (response.ok) {
        setStatusMessage(`Успех! "${gift.name}" добавлен в ваш инвентарь.`);
      } else {
        throw new Error(result.error || 'Ошибка подтверждения покупки на сервере.');
      }
    } catch (e) {
      setStatusMessage(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`);
    }
  };

  // --- НОВАЯ ЛОГИКА: Сделать ставку ---
  const handlePlaceBet = async (userGift: Gift) => {
    if (!user || !userGift.user_gift_id) {
        setStatusMessage('Не удалось определить пользователя или подарок.');
        return;
    }
    setStatusMessage(`Ставим "${userGift.name}"...`);
    try {
        const response = await fetch(`${API_BASE_URL}/api/roulette/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, userGiftId: userGift.user_gift_id }),
        });
        const result = await response.json();
        if (response.ok) {
            setStatusMessage(`Ставка принята! Ваш "${userGift.name}" в игре.`);
            // Обновляем инвентарь, чтобы убрать поставленный подарок
            fetchMyGifts(); 
        } else {
            throw new Error(result.error || 'Ошибка на сервере при размещении ставки.');
        }
    } catch (e) {
        setStatusMessage(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`);
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
          <div>
            <div className="roulette-wheel">
                {/* Здесь будет сама рулетка */}
                <p>Круг рулетки</p>
            </div>
            <h3>Ваши предметы для ставки:</h3>
            <div className="gift-list">
                {myGifts.length > 0 ? myGifts.map((gift) => (
                <div key={gift.user_gift_id} className="gift-card bet-card" onClick={() => handlePlaceBet(gift)}>
                    <h2>{gift.name}</h2>
                    <div className="price-tag">{parseFloat(gift.price_ton).toFixed(2)} TON</div>
                </div>
                )) : <p>У вас нет предметов для ставки. Купите их в магазине.</p>}
            </div>
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
        <TonConnectButton />
      </header>
      
      <nav className="navigation">
        <button onClick={() => changeView('roulette')} className={view === 'roulette' ? 'active' : ''}>Рулетка</button>
        <button onClick={() => changeView('shop')} className={view === 'shop' ? 'active' : ''}>Магазин</button>
        <button onClick={() => changeView('inventory')} className={view === 'inventory' ? 'active' : ''}>Инвентарь</button>
      </nav>

      {statusMessage && <div className="status-message">{statusMessage}</div>}
      
      {renderContent()}
    </div>
  );
}

export default App;
