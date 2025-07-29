import { useState, useEffect } from 'react';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import { toNano } from 'ton';
import './App.css';

// Описываем, как выглядит объект "Подарок"
interface Gift {
  id: number;
  name: string;
  description: string;
  price_ton: string;
}

function App() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string>('');

  // Получаем доступ к кошельку и UI компонентам TON Connect
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  // --- 1. Загрузка товаров с бэкенда ---
  useEffect(() => {
    const fetchGifts = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/store/gifts');
        if (!response.ok) throw new Error('Ошибка сети или сервера при загрузке товаров');
        const data: Gift[] = await response.json();
        setGifts(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Произошла неизвестная ошибка');
      } finally {
        setLoading(false);
      }
    };
    fetchGifts();
  }, []);

  // --- 2. Синхронизация пользователя Telegram с бэкендом ---
  useEffect(() => {
    // Эта функция выполнится, как только SDK Telegram будет готов
    if (WebApp.initDataUnsafe?.user) {
      const { id, username } = WebApp.initDataUnsafe.user;
      fetch('http://localhost:3000/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, username }),
      });
    }
  }, []);

  // --- 3. Логика покупки ---
  const handleBuy = async (gift: Gift) => {
    if (!wallet) {
      setPurchaseStatus('Пожалуйста, сначала подключите кошелек.');
      tonConnectUI.openModal(); // Открываем модальное окно для подключения
      return;
    }
    if (!WebApp.initDataUnsafe?.user) {
      setPurchaseStatus('Не удалось получить данные пользователя Telegram.');
      return;
    }

    setPurchaseStatus(`Покупаем "${gift.name}"...`);

    // Генерируем уникальный комментарий для транзакции
    const memo = `buy-gift-${gift.id}-for-user-${WebApp.initDataUnsafe.user.id}-${Date.now()}`;

    // Формируем транзакцию
    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600, // 10 минут
      messages: [
        {
          address: "UQA6qcGAwqhOxgX81n-P_RVAIMOkeYoaoDWtAtyWAvOZtuuA", // Адрес кошелька вашего проекта
          amount: toNano(gift.price_ton).toString(), // Конвертируем цену в наноTON
          payload: memo, // Наш уникальный комментарий
        },
      ],
    };

    try {
      // Отправляем транзакцию через кошелек пользователя
      await tonConnectUI.sendTransaction(transaction);
      setPurchaseStatus('Транзакция отправлена! Проверяем на сервере...');

      // Отправляем запрос на наш бэкенд для проверки
      const response = await fetch('http://localhost:3000/api/store/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: WebApp.initDataUnsafe.user.id,
          giftId: gift.id,
          transactionMemo: memo,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setPurchaseStatus(`Успех! "${gift.name}" добавлен в ваш инвентарь.`);
      } else {
        throw new Error(result.error || 'Ошибка подтверждения покупки на сервере.');
      }
    } catch (e) {
      setPurchaseStatus(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`);
    }
  };

  // --- 4. Рендеринг компонента ---
  if (loading) return <div className="container"><h1>Загрузка товаров...</h1></div>;
  if (error) return <div className="container"><h1>Ошибка: {error}</h1></div>;

  return (
    <div className="container">
      <header className="header">
        <h1>Магазин Подарков</h1>
        <TonConnectButton />
      </header>
      
      {purchaseStatus && <div className="status-message">{purchaseStatus}</div>}

      <div className="gift-list">
        {gifts.map((gift) => (
          <div key={gift.id} className="gift-card">
            <h2>{gift.name}</h2>
            <p>{gift.description}</p>
            <div className="price-tag">{parseFloat(gift.price_ton).toFixed(2)} TON</div>
            <button className="buy-button" onClick={() => handleBuy(gift)}>
              Купить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
